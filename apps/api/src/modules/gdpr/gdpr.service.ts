import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { StorageService } from "../../infrastructure/storage.service.js";

@Injectable()
export class GdprService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  async latestExport(userId: string) {
    const record = await this.prisma.client.dataExport.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { storageObject: true },
    });
    if (!record?.storageObject || record.status !== "completed") return record;
    return {
      ...record,
      downloadUrl: await this.storage.signedUrl(record.storageObject.path),
    };
  }

  async requestExport(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.prisma.client.dataExport.findFirst({
      where: {
        userId,
        createdAt: { gte: today },
        status: { in: ["queued", "running", "completed"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const job = await this.prisma.client.jobRecord.findFirst({
        where: {
          userId,
          queue: QUEUES.gdprExport,
          payload: { path: ["exportId"], equals: existing.id },
        },
        orderBy: { createdAt: "desc" },
      });
      if (job?.status === "failed") {
        await this.prisma.client.dataExport.update({
          where: { id: existing.id },
          data: { status: "failed" },
        });
      } else {
        return { export: existing, job };
      }
    }
    const record = await this.prisma.client.dataExport.create({
      data: { userId },
    });
    const job = await this.queue.enqueue({
      queue: QUEUES.gdprExport,
      userId,
      idempotencyKey: `gdpr-export:${record.id}`,
      payload: { exportId: record.id, userId },
    });
    return { export: record, job };
  }

  async requestDeletion(userId: string) {
    const executeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const request = await this.prisma.client.$transaction(async (tx: any) => {
      await tx.deletionRequest.updateMany({
        where: { userId, status: "scheduled" },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      await tx.profile.update({
        where: { id: userId },
        data: { status: "deletion_pending", deletionRequestedAt: new Date() },
      });
      return tx.deletionRequest.create({
        data: { userId, executeAt },
      });
    });
    const job = await this.queue.enqueue({
      queue: QUEUES.gdprDelete,
      userId,
      idempotencyKey: `gdpr-delete:${request.id}`,
      runAfter: executeAt,
      payload: { deletionRequestId: request.id, userId, executeAt },
    });
    return { request, job };
  }

  async cancelDeletion(userId: string) {
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.deletionRequest.updateMany({
        where: { userId, status: "scheduled" },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      return tx.profile.update({
        where: { id: userId },
        data: { status: "active", deletionRequestedAt: null },
      });
    });
  }
}
