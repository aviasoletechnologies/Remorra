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
    const policy = await this.prisma.client.retentionPolicy.findUnique({
      where: { id: "deletion-grace" },
    });
    const graceDays = policy?.enabled && policy.retentionDays !== null ? policy.retentionDays : 30;
    const executeAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
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

  async purgeUserData(userId: string) {
    const ownedProjects = await this.prisma.client.project.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const memberships = await this.prisma.client.projectMembership.findMany({
      where: { userId },
      select: { projectId: true },
    });
    const projectIds = Array.from(
      new Set([
        ...ownedProjects.map((p: any) => p.id),
        ...memberships.map((m: any) => m.projectId),
      ])
    );

    return this.prisma.client.$transaction(async (tx: any) => {
      // 1. Delete Job Records (cascades to attempts, outbox, and streams)
      const deletedJobs = await tx.jobRecord.deleteMany({
        where: {
          OR: [
            { userId },
            { projectId: { in: projectIds } },
          ],
        },
      });

      // 2. Delete Job Stream Events (that might not be tied to JobRecords, though usually they are)
      const deletedStreams = await tx.jobStreamEvent.deleteMany({
        where: {
          OR: [
            { userId },
            { projectId: { in: projectIds } },
          ],
        },
      });

      // 3. Delete Conversations (cascades to messages, extracts, runs, ledger)
      const deletedConversations = await tx.conversation.deleteMany({
        where: {
          projectId: { in: projectIds },
        },
      });

      // 4. Delete Idempotency records
      const deletedIdempotency = await tx.idempotencyRecord.deleteMany({
        where: { userId },
      });

      // 5. Delete AI Invocations
      const deletedInvocations = await tx.aiInvocation.deleteMany({
        where: {
          OR: [
            { userId },
            { projectId: { in: projectIds } },
          ],
        },
      });

      // 6. Delete Token Usage
      const deletedTokenUsage = await tx.tokenUsage.deleteMany({
        where: {
          OR: [
            { userId },
            { projectId: { in: projectIds } },
          ],
        },
      });

      return {
        success: true,
        purged: {
          conversations: deletedConversations.count,
          jobs: deletedJobs.count,
          streamEvents: deletedStreams.count,
          idempotencyKeys: deletedIdempotency.count,
          aiInvocations: deletedInvocations.count,
          tokenUsage: deletedTokenUsage.count,
        },
      };
    });
  }

  async cancelSubscription(userId: string, body: any) {
    if (!body || typeof body.reason !== "string" || !body.reason.trim()) {
      throw new Error("Reason is required to cancel your subscription.");
    }
    const reason = body.reason.trim();
    const profile = await this.prisma.client.profile.findUniqueOrThrow({
      where: { id: userId },
    });

    const durationDays = Math.max(0, Math.floor((Date.now() - profile.createdAt.getTime()) / (24 * 60 * 60 * 1000)));

    const result = await this.prisma.client.$transaction(async (tx: any) => {
      const cancellation = await tx.cancellation.create({
        data: {
          userId,
          reason,
          subscriberDuration: durationDays,
          tierAtCancellation: profile.tier,
        },
      });
      const updatedProfile = await tx.profile.update({
        where: { id: userId },
        data: { tier: "free" },
      });
      return { cancellation, profile: updatedProfile };
    });
    return result;
  }
}
