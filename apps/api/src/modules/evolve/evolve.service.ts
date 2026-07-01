import { BadRequestException, Injectable } from "@nestjs/common";
import {
  createEvolveSessionSchema,
  updateEvolveSessionStatusSchema,
  sendEvolveMessageSchema,
} from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { forbidden, notFound } from "../../shared/http-errors.js";
import { ContextAutomationService } from "../../shared/context-automation.service.js";

const ENTITY_DELEGATES = new Set(["Goal", "Epic", "Story", "Persona", "RaidItem"]);

@Injectable()
export class EvolveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
    private readonly contextAutomation: ContextAutomationService,
  ) {}

  async createSession(projectId: string, userId: string, body: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = createEvolveSessionSchema.parse(body);

    return this.prisma.client.evolveSession.create({
      data: {
        projectId,
        launchedFrom: data.launchedFrom,
        topic: data.topic ?? null,
        conversation: {
          create: {
            projectId,
            kind: "evolve",
            retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { conversation: true },
    });
  }

  async listSessions(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.evolveSession.findMany({
      where: { projectId, status: { in: ["draft", "completed"] } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async updateStatus(
    projectId: string,
    sessionId: string,
    userId: string,
    body: unknown,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const { status } = updateEvolveSessionStatusSchema.parse(body);

    const session = await this.prisma.client.evolveSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.projectId !== projectId) {
      notFound("EvolveSession", sessionId);
    }
    if (session!.status === "completed") {
      forbidden("This Evolve session is already completed and is read-only.");
    }

    return this.prisma.client.evolveSession.update({
      where: { id: sessionId },
      data: {
        status,
        completedAt: status === "completed" ? new Date() : session!.completedAt,
      },
    });
  }

  private async requireSession(projectId: string, sessionId: string) {
    const session = await this.prisma.client.evolveSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.projectId !== projectId) notFound("EvolveSession", sessionId);
    return session!;
  }

  async sendMessage(projectId: string, sessionId: string, userId: string, body: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const session = await this.requireSession(projectId, sessionId);
    if (session.status === "completed") {
      forbidden("This Evolve session is already completed and is read-only.");
    }
    if (session.status === "draft") {
      await this.prisma.client.evolveSession.update({
        where: { id: sessionId },
        data: { status: "active" },
      });
    }
    const { content } = sendEvolveMessageSchema.parse(body);

    const savedMsg = await this.prisma.client.conversationMessage.create({
      data: {
        conversationId: session.conversationId,
        actorId: userId,
        role: "user",
        content,
      },
    });

    const job = await this.queue.enqueue({
      queue: QUEUES.evolveMessage,
      projectId,
      userId,
      payload: {
        conversationId: session.conversationId,
        evolveSessionId: sessionId,
        content,
      },
    });

    return { job, message: savedMsg };
  }

  async listMessages(projectId: string, sessionId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const session = await this.requireSession(projectId, sessionId);
    return this.prisma.client.conversationMessage.findMany({
      where: { conversationId: session.conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async listActions(projectId: string, sessionId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    await this.requireSession(projectId, sessionId);
    return this.prisma.client.evolveAction.findMany({
      where: { evolveSessionId: sessionId },
      orderBy: { createdAt: "desc" },
      include: { impactItems: true },
    });
  }

  async decideImpactItem(
    projectId: string,
    actionId: string,
    itemId: string,
    userId: string,
    body: { decision?: "confirmed" | "rejected" },
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const action = await this.prisma.client.evolveAction.findUnique({ where: { id: actionId } });
    if (!action || action.projectId !== projectId) notFound("EvolveAction", actionId);
    if (action!.entityType === "Goal") {
      await this.access.require(projectId, userId, ["founder"]);
    }
    const item = await this.prisma.client.evolveImpactItem.findUnique({ where: { id: itemId } });
    if (!item || item.evolveActionId !== actionId) notFound("EvolveImpactItem", itemId);
    if (body.decision !== "confirmed" && body.decision !== "rejected") {
      throw new BadRequestException("decision must be 'confirmed' or 'rejected'.");
    }
    return this.prisma.client.evolveImpactItem.update({
      where: { id: itemId },
      data: { status: body.decision },
    });
  }

  // RemoraDocument §7 Screening Engine step 6 — "Approved changes applied
  // atomically". Goal actions require every impact item to be reviewed first
  // (no silent no-decision items) and are Founder-only; other entities apply
  // directly with no cascade to review.
  async approveAction(projectId: string, actionId: string, userId: string) {
    const action = await this.prisma.client.evolveAction.findUnique({
      where: { id: actionId },
      include: { impactItems: true },
    });
    if (!action || action.projectId !== projectId) notFound("EvolveAction", actionId);
    if (action!.status !== "pending") {
      throw new BadRequestException(`This action has already been ${action!.status}.`);
    }

    await this.access.require(projectId, userId, action!.entityType === "Goal" ? ["founder"] : ["founder", "team"]);

    if (action!.requiresScreening) {
      const undecided = action!.impactItems.filter((item: any) => item.status === "pending");
      if (undecided.length > 0) {
        throw new BadRequestException(
          `Resolve all ${undecided.length} pending impact item(s) before approving this Goal change.`,
        );
      }
    }

    const { before, after } = await this.applyEntityChange(
      projectId,
      action!.entityType,
      action!.entityId,
      action!.actionType,
      action!.proposedChange as Record<string, unknown>,
    );

    const confirmedItems = action!.impactItems.filter((item: any) => item.status === "confirmed" && item.suggestedChange);
    for (const item of confirmedItems) {
      if (!item.affectedEntityId) continue;
      await this.applyEntityChange(
        projectId,
        item.affectedEntityType,
        item.affectedEntityId,
        "update",
        item.suggestedChange as Record<string, unknown>,
      );
    }

    const updated = await this.prisma.client.evolveAction.update({
      where: { id: actionId },
      data: { status: "confirmed", decidedAt: new Date(), decidedByUserId: userId },
    });

    if (action!.actionType === "create") {
      await this.contextAutomation.runLayer1AutoCapture(projectId).catch(() => undefined);
    }

    await this.logAudit(
      projectId,
      userId,
      `${action!.entityType.toLowerCase()}.${action!.actionType}`,
      action!.entityType,
      after?.id ?? action!.entityId ?? actionId,
      before,
      after,
    );

    return updated;
  }

  // Doc: "Rejections are not saved anywhere" — delete rather than mark rejected.
  async rejectAction(projectId: string, actionId: string, userId: string) {
    const action = await this.prisma.client.evolveAction.findUnique({ where: { id: actionId } });
    if (!action || action.projectId !== projectId) notFound("EvolveAction", actionId);
    if (action!.status !== "pending") {
      throw new BadRequestException(`This action has already been ${action!.status}.`);
    }
    await this.access.require(projectId, userId, action!.entityType === "Goal" ? ["founder"] : ["founder", "team"]);
    await this.prisma.client.evolveAction.delete({ where: { id: actionId } });
    return { id: actionId, deleted: true };
  }

  async listContextProposals(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.contextProposal.findMany({
      where: { projectId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  async approveContextProposal(projectId: string, proposalId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const proposal = await this.prisma.client.contextProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.projectId !== projectId) notFound("ContextProposal", proposalId);
    if (proposal!.status !== "pending") {
      throw new BadRequestException(`This proposal has already been ${proposal!.status}.`);
    }

    const project = await this.prisma.client.project.findUniqueOrThrow({ where: { id: projectId } });
    const existing = typeof project.context === "string" ? project.context : "";
    const nextContext = existing ? `${existing}\n${proposal!.proposedText}` : proposal!.proposedText;

    const after = await this.prisma.client.project.update({
      where: { id: projectId },
      data: { context: nextContext, version: { increment: 1 } },
    });

    const updated = await this.prisma.client.contextProposal.update({
      where: { id: proposalId },
      data: { status: "confirmed", decidedAt: new Date(), decidedByUserId: userId },
    });

    await this.logAudit(projectId, userId, "project.context.update", "Project", projectId, { context: existing }, { context: after.context });

    return updated;
  }

  // Doc: "Rejections are not saved anywhere."
  async rejectContextProposal(projectId: string, proposalId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const proposal = await this.prisma.client.contextProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.projectId !== projectId) notFound("ContextProposal", proposalId);
    if (proposal!.status !== "pending") {
      throw new BadRequestException(`This proposal has already been ${proposal!.status}.`);
    }
    await this.prisma.client.contextProposal.delete({ where: { id: proposalId } });
    return { id: proposalId, deleted: true };
  }

  private async applyEntityChange(
    projectId: string,
    entityType: string,
    entityId: string | null,
    actionType: string,
    data: Record<string, unknown>,
  ): Promise<{ before: any; after: any }> {
    if (!ENTITY_DELEGATES.has(entityType)) {
      throw new BadRequestException(`Unsupported entity type for Evolve actions: ${entityType}`);
    }
    const delegateName = entityType.charAt(0).toLowerCase() + entityType.slice(1);
    const delegate = (this.prisma.client as any)[delegateName];

    let before: any = null;
    let after: any;
    if (actionType === "create") {
      after = await delegate.create({ data: { ...data, projectId } });
    } else if (actionType === "update") {
      if (!entityId) throw new BadRequestException("An update action requires an entityId.");
      before = await delegate.findUnique({ where: { id: entityId } });
      if (!before) notFound(entityType, entityId);
      after = await delegate.update({ where: { id: entityId }, data });
    } else if (actionType === "delete") {
      if (!entityId) throw new BadRequestException("A delete action requires an entityId.");
      before = await delegate.findUnique({ where: { id: entityId } });
      if (!before) notFound(entityType, entityId);
      after = await delegate.delete({ where: { id: entityId } });
    } else {
      throw new BadRequestException(`Unknown action type: ${actionType}`);
    }
    return { before, after };
  }

  private async logAudit(
    projectId: string,
    actorId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.client.auditEvent.create({
      data: {
        projectId,
        actorId,
        eventType,
        entityType,
        entityId,
        before: before ?? undefined,
        after: after ?? undefined,
        metadata: {},
      },
    });
  }
}
