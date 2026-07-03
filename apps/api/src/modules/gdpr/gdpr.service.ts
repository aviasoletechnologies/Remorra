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

      // 3. Delete Conversations (cascades to messages, extracts, runs, ledger,
      // and — since EvolveSession.conversation is onDelete: Cascade — also
      // cascades away EvolveSession, EvolveAction, EvolveImpactItem, and
      // ContextProposal for free)
      const deletedConversations = await tx.conversation.deleteMany({
        where: {
          projectId: { in: projectIds },
        },
      });

      // 4. Delete Goals (cascades to Epic, Story, and the PersonaStory join
      // table). Must run before BuildPhase, since Story references
      // BuildPhase and needs to be gone first.
      const deletedGoals = await tx.goal.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 5. Delete Personas (cascades to PainPoint)
      const deletedPersonas = await tx.persona.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 6. Delete RAID items
      const deletedRaidItems = await tx.raidItem.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 7. Delete Build Phases (cascades to BuildPack, BuildSyncUpload) — run
      // after Goal deletion so no Story rows still reference them.
      const deletedBuildPhases = await tx.buildPhase.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 8. Delete Health Scores (cascades to HealthScoreComponent)
      const deletedHealthScores = await tx.healthScore.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 9. Delete Audit Events
      const deletedAuditEvents = await tx.auditEvent.deleteMany({
        where: { projectId: { in: projectIds } },
      });

      // 10. Delete Idempotency records
      const deletedIdempotency = await tx.idempotencyRecord.deleteMany({
        where: { userId },
      });

      // 11. Delete AI Invocations
      const deletedInvocations = await tx.aiInvocation.deleteMany({
        where: {
          OR: [
            { userId },
            { projectId: { in: projectIds } },
          ],
        },
      });

      // 12. Delete Token Usage
      const deletedTokenUsage = await tx.tokenUsage.deleteMany({
        where: {
          OR: [
            { userId },
            { projectId: { in: projectIds } },
          ],
        },
      });

      // 13. Reset each project's DRIVE phase back to discover — with every
      // entity gone, leaving it at whatever phase it was in would show e.g.
      // "Evolve" with zero Goals/Stories, an inconsistent state.
      await tx.project.updateMany({
        where: { id: { in: projectIds } },
        data: { phase: "discover" },
      });

      return {
        success: true,
        purged: {
          conversations: deletedConversations.count,
          jobs: deletedJobs.count,
          streamEvents: deletedStreams.count,
          goals: deletedGoals.count,
          personas: deletedPersonas.count,
          raidItems: deletedRaidItems.count,
          buildPhases: deletedBuildPhases.count,
          healthScores: deletedHealthScores.count,
          auditEvents: deletedAuditEvents.count,
          idempotencyKeys: deletedIdempotency.count,
          aiInvocations: deletedInvocations.count,
          tokenUsage: deletedTokenUsage.count,
        },
      };
    });
  }
}
