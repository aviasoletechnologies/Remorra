import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async get(id: string, userId: string) {
    return this.prisma.client.jobRecord.findFirstOrThrow({
      where: {
        id,
        OR: [{ userId }, { project: { memberships: { some: { userId } } } }],
      },
      include: { attemptsLog: true },
    });
  }

  async retry(id: string, userId: string) {
    const job = await this.get(id, userId);
    if (job.status !== "failed") {
      throw new BadRequestException("Only failed jobs can be retried.");
    }
    return this.queue.enqueue({
      queue: job.queue as (typeof QUEUES)[keyof typeof QUEUES],
      projectId: job.projectId ?? undefined,
      userId,
      payload: job.payload as Record<string, unknown>,
    });
  }

  async recent(userId: string) {
    return this.prisma.client.jobRecord.findMany({
      where: { userId, updatedAt: { gte: new Date(Date.now() - 60_000) } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
  }

  async getStreamEvents(id: string, userId: string, after: number, limit = 100) {
    await this.get(id, userId);
    return this.prisma.client.jobStreamEvent.findMany({
      where: {
        jobId: id,
        sequence: { gt: after },
      },
      orderBy: { sequence: "asc" },
      take: limit,
    });
  }
}
