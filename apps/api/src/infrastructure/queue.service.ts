import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { PrismaService } from "./prisma.service.js";

export const QUEUES = {
  aiConversation: "ai.conversation",
  aiExtract: "ai.extract",
  aiReport: "ai.report",
  documentRender: "document.render",
  gdprExport: "gdpr.export",
  gdprDelete: "gdpr.delete",
  retentionCleanup: "retention.cleanup",
  storageExpire: "storage.expire",
  buildPackGenerate: "build-pack.generate",
  buildSyncIngest: "build-sync.ingest",
  buildSyncExport: "build-sync.export",
  healthScoreCalculate: "health-score.calculate",
  evolveMessage: "evolve.message",
  contextReview: "context.review",
} as const;

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly boss: PgBoss;

  constructor(private readonly prisma: PrismaService) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required.");
    this.boss = new PgBoss({
      connectionString: databaseUrl,
      max: Number(process.env.PG_BOSS_POOL_MAX ?? 2),
    });
  }

  async onModuleInit() {
    await this.boss.start();
    for (const queue of Object.values(QUEUES)) {
      await this.boss.createQueue(queue);
    }
    await this.flushOutbox();
  }

  async onModuleDestroy() {
    await this.boss.stop({ graceful: true });
  }

  async enqueue(input: {
    queue: (typeof QUEUES)[keyof typeof QUEUES];
    payload: Record<string, unknown>;
    projectId?: string;
    userId?: string;
    idempotencyKey?: string;
    runAfter?: Date;
  }) {
    if (input.idempotencyKey && input.userId) {
      const existing = await this.findIdempotentJob(
        input.userId,
        input.idempotencyKey,
        input.queue,
      );
      if (existing) return existing;
    }
    const jobPayload = {
      ...input.payload,
      projectId: input.projectId,
      userId: input.userId,
    };
    let record;
    try {
      record = await this.prisma.client.$transaction(async (tx: any) => {
        const job = await tx.jobRecord.create({
          data: {
            queue: input.queue,
            payload: input.payload,
            projectId: input.projectId,
            userId: input.userId,
            runAfter: input.runAfter ?? new Date(),
          },
        });
        await tx.outboxEvent.create({
          data: {
            jobRecordId: job.id,
            topic: input.queue,
            payload: {
              ...jobPayload,
              jobRecordId: job.id,
              idempotencyKey: input.idempotencyKey,
              runAfter: input.runAfter?.toISOString(),
            },
          },
        });
        if (input.idempotencyKey && input.userId) {
          await tx.idempotencyRecord.create({
            data: {
              userId: input.userId,
              key: input.idempotencyKey,
              operation: input.queue,
              response: { jobRecordId: job.id },
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }
        return job;
      });
    } catch (error) {
      if (input.idempotencyKey && input.userId) {
        const existing = await this.findIdempotentJob(
          input.userId,
          input.idempotencyKey,
          input.queue,
        );
        if (existing) return existing;
      }
      throw error;
    }
    await this.dispatch(record.id);
    return this.prisma.client.jobRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
  }

  private async findIdempotentJob(
    userId: string,
    key: string,
    operation: string,
  ) {
    const record = await this.prisma.client.idempotencyRecord.findUnique({
      where: { userId_key_operation: { userId, key, operation } },
    });
    if (!record || record.expiresAt <= new Date()) return null;
    const response = record.response as { jobRecordId?: string } | null;
    return response?.jobRecordId
      ? this.prisma.client.jobRecord.findUnique({
          where: { id: response.jobRecordId },
        })
      : null;
  }

  async flushOutbox() {
    const pending = await this.prisma.client.outboxEvent.findMany({
      where: { dispatchedAt: null },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const event of pending) {
      await this.dispatch(event.jobRecordId);
    }
  }

  private async dispatch(jobRecordId: string) {
    const event = await this.prisma.client.outboxEvent.findUniqueOrThrow({
      where: { jobRecordId },
    });
    if (event.dispatchedAt) return;
    const payload = event.payload as Record<string, unknown>;
    const runAfter =
      typeof payload.runAfter === "string" ? new Date(payload.runAfter) : null;
    const options = {
      singletonKey:
        typeof payload.idempotencyKey === "string"
          ? payload.idempotencyKey
          : undefined,
      retryLimit: 4,
      retryBackoff: true,
      expireInMinutes: 15,
    };
    try {
      const bossJobId =
        runAfter && runAfter > new Date()
          ? await this.boss.sendAfter(event.topic, payload, options, runAfter)
          : await this.boss.send(event.topic, payload, options);
      await this.prisma.client.$transaction([
        this.prisma.client.jobRecord.update({
          where: { id: jobRecordId },
          data: { bossJobId: bossJobId ?? undefined },
        }),
        this.prisma.client.outboxEvent.update({
          where: { id: event.id },
          data: { dispatchedAt: new Date(), attempts: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      await this.prisma.client.outboxEvent.update({
        where: { id: event.id },
        data: { attempts: { increment: 1 } },
      });
      throw error;
    }
  }
}
