import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Actor } from "../../shared/request-context.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  requireAdmin(actor: Actor) {
    if (!["admin", "support"].includes(actor.platformRole)) {
      throw new ForbiddenException("Platform administrator access is required.");
    }
  }

  async metrics(actor: Actor) {
    this.requireAdmin(actor);
    const [users, projects, failedJobs, tokens, reports] = await Promise.all([
      this.prisma.client.profile.count(),
      this.prisma.client.project.count(),
      this.prisma.client.jobRecord.count({ where: { status: "failed" } }),
      this.prisma.client.tokenUsage.aggregate({
        _sum: { inputTokens: true, outputTokens: true, costMinor: true },
      }),
      this.prisma.client.reportGeneration.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);
    return { users, projects, failedJobs, tokens: tokens._sum, reports };
  }

  users(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.profile.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  skills(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.skill.findMany({
      include: { versions: { orderBy: { version: "desc" } } },
    });
  }

  async activateSkill(actor: Actor, skillId: string, versionId: string) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.skillVersion.updateMany({
        where: { skillId },
        data: { active: false },
      });
      const version = await tx.skillVersion.update({
        where: { id: versionId },
        data: { active: true },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "skill.version.activated",
          targetType: "skill_version",
          targetId: versionId,
          metadata: { skillId, version: version.version },
        },
      });
      return version;
    });
  }

  async createSkillVersion(
    actor: Actor,
    skillId: string,
    body: Record<string, unknown>,
  ) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const current = await tx.skillVersion.findFirstOrThrow({
        where: { skillId },
        orderBy: { version: "desc" },
      });
      const version = await tx.skillVersion.create({
        data: {
          skillId,
          version: current.version + 1,
          active: false,
          modelTier: String(body.modelTier ?? current.modelTier),
          systemPrompt: String(body.systemPrompt ?? current.systemPrompt),
          contextRequirements: body.contextRequirements ?? current.contextRequirements,
          outputSchema: body.outputSchema ?? current.outputSchema,
          constraints: body.constraints ?? current.constraints,
          examples: body.examples ?? current.examples,
          retryPolicy: body.retryPolicy ?? current.retryPolicy,
          tokenCeiling: Number(body.tokenCeiling ?? current.tokenCeiling),
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "skill.version.created",
          targetType: "skill_version",
          targetId: version.id,
          metadata: { skillId, version: version.version },
        },
      });
      return version;
    });
  }

  mappings(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.skillEventMapping.findMany({
      where: { active: true },
      include: { skill: true },
      orderBy: { eventType: "asc" },
    });
  }

  async setMapping(actor: Actor, eventType: string, skillId: string) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.skill.findUniqueOrThrow({ where: { id: skillId } });
      await tx.skillEventMapping.updateMany({
        where: { eventType },
        data: { active: false },
      });
      const mapping = await tx.skillEventMapping.upsert({
        where: { eventType_skillId: { eventType, skillId } },
        create: { eventType, skillId, active: true },
        update: { active: true },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "skill.mapping.changed",
          targetType: "skill_event_mapping",
          targetId: mapping.id,
          metadata: { eventType, skillId },
        },
      });
      return mapping;
    });
  }

  jobs(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.jobRecord.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { attemptsLog: true },
    });
  }

  async retryJob(actor: Actor, id: string) {
    this.requireAdmin(actor);
    const job = await this.prisma.client.jobRecord.findUniqueOrThrow({
      where: { id },
    });
    if (job.status !== "failed") {
      throw new ForbiddenException("Only failed jobs can be retried.");
    }
    const retried = await this.queue.enqueue({
      queue: job.queue as (typeof QUEUES)[keyof typeof QUEUES],
      projectId: job.projectId ?? undefined,
      userId: job.userId ?? actor.userId,
      payload: job.payload as Record<string, unknown>,
    });
    await this.prisma.client.platformAuditEvent.create({
      data: {
        actorId: actor.userId,
        eventType: "job.retry.requested",
        targetType: "job_record",
        targetId: id,
        metadata: { retriedJobId: retried.id, queue: job.queue },
      },
    });
    return retried;
  }

  retention(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.retentionPolicy.findMany({
      orderBy: { id: "asc" },
    });
  }

  async updateRetention(
    actor: Actor,
    id: string,
    body: { retentionDays?: number | null; enabled?: boolean },
  ) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const policy = await tx.retentionPolicy.update({
        where: { id },
        data: {
          ...(body.retentionDays !== undefined ? { retentionDays: body.retentionDays } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "retention.policy.changed",
          targetType: "retention_policy",
          targetId: id,
          metadata: body,
        },
      });
      return policy;
    });
  }

  async updatePlatformRole(
    actor: Actor,
    id: string,
    platformRole: "user" | "admin" | "support",
  ) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const profile = await tx.profile.update({
        where: { id },
        data: { platformRole },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "user.platform_role.changed",
          targetType: "profile",
          targetId: id,
          metadata: { platformRole },
        },
      });
      return profile;
    });
  }

  async createKnowledgeVersion(
    actor: Actor,
    id: string,
    body: { markdown: string; activate?: boolean },
  ) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const latest = await tx.knowledgeBaseVersion.findFirst({
        where: { knowledgeBaseId: id },
        orderBy: { version: "desc" },
      });
      if (body.activate) {
        await tx.knowledgeBaseVersion.updateMany({
          where: { knowledgeBaseId: id },
          data: { active: false },
        });
      }
      const version = await tx.knowledgeBaseVersion.create({
        data: {
          knowledgeBaseId: id,
          version: (latest?.version ?? 0) + 1,
          markdown: body.markdown,
          active: Boolean(body.activate),
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "knowledge.version.created",
          targetType: "knowledge_base_version",
          targetId: version.id,
          metadata: { knowledgeBaseId: id, version: version.version },
        },
      });
      return version;
    });
  }

  reports(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.reportDefinition.findMany({
      include: { versions: { orderBy: { version: "desc" } } },
    });
  }

  async createReportVersion(
    actor: Actor,
    id: string,
    body: Record<string, unknown>,
  ) {
    this.requireAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const current = await tx.reportDefinitionVersion.findFirstOrThrow({
        where: { definitionId: id },
        orderBy: { version: "desc" },
      });
      const activate = Boolean(body.activate);
      if (activate) {
        await tx.reportDefinitionVersion.updateMany({
          where: { definitionId: id },
          data: { active: false },
        });
      }
      const version = await tx.reportDefinitionVersion.create({
        data: {
          definitionId: id,
          version: current.version + 1,
          active: activate,
          requiresLlm: Boolean(body.requiresLlm ?? current.requiresLlm),
          templateKey: String(body.templateKey ?? current.templateKey),
          requiredContext: body.requiredContext ?? current.requiredContext,
          permittedRoles: body.permittedRoles ?? current.permittedRoles,
          outputSchema: body.outputSchema ?? current.outputSchema,
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "report.version.created",
          targetType: "report_definition_version",
          targetId: version.id,
          metadata: { definitionId: id, version: version.version, active: version.active },
        },
      });
      return version;
    });
  }

  knowledge(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.knowledgeBase.findMany({
      include: { versions: true, mappings: true },
    });
  }

  audits(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.platformAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
