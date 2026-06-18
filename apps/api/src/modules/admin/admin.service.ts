import { ForbiddenException, Injectable, BadRequestException, Optional } from "@nestjs/common";
import Ajv from "ajv";
import { generateInputSourceMap, validateInputSourceMap } from "@remorra/ai-core";
import type { Actor } from "../../shared/request-context.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { InputSourceMapProposalService } from "./input-source-map-proposal.service.js";

// Safe local micro-template engine helpers
function renderTemplateLocal(template: string, data: any): string {
  let result = template;
  const loopRegex = /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  result = result.replace(loopRegex, (_, path, innerTemplate) => {
    const list = getPathValueLocal(data, path);
    if (!Array.isArray(list)) return "";
    return list.map((item) => renderTemplateLocal(innerTemplate, item)).join("");
  });

  const varRegex = /\{\{([\w.]+)\}\}/g;
  result = result.replace(varRegex, (_, path) => {
    const val = getPathValueLocal(data, path);
    return val !== undefined && val !== null ? escapeHtmlLocal(String(val)) : "";
  });
  return result;
}

function getPathValueLocal(obj: any, path: string): any {
  if (path === "this") return obj;
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

function escapeHtmlLocal(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Optional() private readonly inputSourceMapProposer?: InputSourceMapProposalService,
  ) {}

  requireAdmin(actor: Actor) {
    if (!["admin", "support"].includes(actor.platformRole)) {
      throw new ForbiddenException("Platform administrator access is required.");
    }
  }

  requireWriteAdmin(actor: Actor) {
    if (actor.platformRole !== "admin") {
      throw new ForbiddenException("Only platform administrators can perform this write operation.");
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

  async users(actor: Actor, page: number = 1, limit: number = 10) {
    this.requireAdmin(actor);
    const skip = (page - 1) * limit;
    const take = limit;

    const [items, total] = await Promise.all([
      this.prisma.client.profile.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.client.profile.count(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async skills(actor: Actor, page: number = 1, limit: number = 10) {
    this.requireAdmin(actor);
    const skip = (page - 1) * limit;
    const take = limit;

    const [items, total] = await Promise.all([
      this.prisma.client.skill.findMany({
        include: { versions: { orderBy: { version: "desc" } } },
        orderBy: { id: "asc" },
        skip,
        take,
      }),
      this.prisma.client.skill.count(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createSkill(
    actor: Actor,
    body: { id: string; name: string; description: string; systemPrompt: string; inputRequirementText?: string },
  ) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);

    const id = body.id?.trim();
    const name = body.name?.trim();
    const description = body.description?.trim();
    const { systemPrompt } = body;
    if (!id || !name || !description || !systemPrompt) {
      throw new BadRequestException("Missing required fields for skill creation.");
    }
    const inputRequirementText = typeof body.inputRequirementText === "string"
      ? body.inputRequirementText.trim()
      : "";
    const inputSourceMap = await this.resolveInputSourceMap(
      { inputRequirementText },
      { inputSourceMap: { requiredInputs: [] } },
    );

    return this.prisma.client.$transaction(async (tx: any) => {
      // Check if skill already exists
      const existing = await tx.skill.findUnique({ where: { id } });
      if (existing) {
        throw new BadRequestException(`Skill with ID "${id}" already exists.`);
      }

      // Create skill
      const skill = await tx.skill.create({
        data: {
          id,
          name,
          description,
        },
      });

      // Create initial active version (v1)
      const version = await tx.skillVersion.create({
        data: {
          skillId: id,
          version: 1,
          active: true,
          modelTier: "model:claude-sonnet-4-6",
          systemPrompt,
          contextRequirements: {},
          inputRequirementText,
          inputSourceMap,
          constraints: [],
          examples: [],
          retryPolicy: {},
          tokenCeiling: 100000,
        },
      });

      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "skill.created",
          targetType: "skill",
          targetId: id,
          metadata: { name, version: 1 },
        },
      });

      return { ...skill, versions: [version] };
    });
  }

  async skill(actor: Actor, id: string) {
    this.requireAdmin(actor);
    const skill = await this.prisma.client.skill.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: "desc" } },
      },
    });
    if (!skill) throw new BadRequestException(`Skill with ID ${id} not found.`);
    return skill;
  }

  async updateSkill(
    actor: Actor,
    id: string,
    body: Record<string, any>,
  ) {
    this.requireWriteAdmin(actor);
    const data: Record<string, any> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.description === "string") data.description = body.description.trim();

    const skill = await this.prisma.client.skill.update({
      where: { id },
      data,
    });

    await this.auditPlatform(actor, "platform.skill.updated", "skill", id, data);
    return skill;
  }

  async activateSkill(actor: Actor, skillId: string, versionId: string) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    const targetVersion = await this.prisma.client.skillVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    const validation = validateInputSourceMap(targetVersion.inputSourceMap);
    if (!validation.valid) {
      throw new BadRequestException(`Skill input source map is invalid: ${validation.errors.join("; ")}`);
    }

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
    this.requireWriteAdmin(actor);
    const current = await this.prisma.client.skillVersion.findFirstOrThrow({
      where: { skillId },
      orderBy: { version: "desc" },
    });
    const inputRequirementText = this.resolveInputRequirementText(body, current);
    const inputSourceMap = await this.resolveInputSourceMap(body, current);

    return this.prisma.client.$transaction(async (tx: any) => {
      const version = await tx.skillVersion.create({
        data: {
          skillId,
          version: current.version + 1,
          active: false,
          modelTier: String(body.modelTier ?? current.modelTier),
          systemPrompt: String(body.systemPrompt ?? current.systemPrompt),
          contextRequirements: body.contextRequirements ?? current.contextRequirements,
          inputRequirementText,
          inputSourceMap,
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

  async updateSkillVersion(
    actor: Actor,
    skillId: string,
    versionId: string,
    body: Record<string, unknown>,
  ) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    const current = await this.prisma.client.skillVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    if (current.skillId !== skillId) {
      throw new BadRequestException("Skill version does not belong to this skill.");
    }

    const inputRequirementText = this.resolveInputRequirementText(body, current);
    const inputSourceMap = await this.resolveInputSourceMap(body, current);
    const version = await this.prisma.client.skillVersion.update({
      where: { id: versionId },
      data: {
        ...(body.modelTier !== undefined ? { modelTier: String(body.modelTier) } : {}),
        ...(body.systemPrompt !== undefined ? { systemPrompt: String(body.systemPrompt) } : {}),
        ...(body.contextRequirements !== undefined ? { contextRequirements: body.contextRequirements } : {}),
        inputRequirementText,
        inputSourceMap,
        ...(body.outputSchema !== undefined ? { outputSchema: body.outputSchema } : {}),
        ...(body.constraints !== undefined ? { constraints: body.constraints } : {}),
        ...(body.examples !== undefined ? { examples: body.examples } : {}),
        ...(body.retryPolicy !== undefined ? { retryPolicy: body.retryPolicy } : {}),
        ...(body.tokenCeiling !== undefined ? { tokenCeiling: Number(body.tokenCeiling) } : {}),
      },
    });
    await this.auditPlatform(actor, "platform.skill_version.updated", "skill_version", versionId, {
      skillId,
      version: version.version,
    });
    return version;
  }

  async deleteSkillVersion(actor: Actor, skillId: string, versionId: string) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    const version = await this.prisma.client.skillVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    if (version.skillId !== skillId) {
      throw new BadRequestException("Skill version does not belong to this skill.");
    }
    if (version.active) {
      throw new BadRequestException("Activate another version before deleting the active version.");
    }
    const count = await this.prisma.client.skillVersion.count({ where: { skillId } });
    if (count <= 1) {
      throw new BadRequestException("A skill must keep at least one version.");
    }

    await this.prisma.client.skillVersion.delete({ where: { id: versionId } });
    await this.auditPlatform(actor, "platform.skill_version.deleted", "skill_version", versionId, {
      skillId,
      version: version.version,
    });
    return { success: true };
  }

  async deleteSkill(actor: Actor, skillId: string) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    const skill = await this.prisma.client.skill.findUniqueOrThrow({
      where: { id: skillId },
    });
    await this.prisma.client.skill.delete({ where: { id: skillId } });
    await this.auditPlatform(actor, "platform.skill.deleted", "skill", skillId, {
      name: skill.name,
    });
    return { success: true };
  }

  private resolveInputRequirementText(body: Record<string, unknown>, current: any): string {
    if (typeof body.inputRequirementText === "string") {
      return body.inputRequirementText.trim();
    }
    return typeof current.inputRequirementText === "string" ? current.inputRequirementText : "";
  }

  private async resolveInputSourceMap(body: Record<string, unknown>, current: any) {
    if (typeof body.inputRequirementText === "string") {
      const generated = generateInputSourceMap(body.inputRequirementText.trim());
      if (generated.valid) {
        return generated.map;
      }

      const proposed = await this.inputSourceMapProposer?.propose(body.inputRequirementText.trim());
      const proposalValidation = validateInputSourceMap(proposed);
      if (proposalValidation.valid && (proposalValidation.map.requiredInputs?.length ?? 0) > 0) {
        return proposalValidation.map;
      }

      const proposalErrors = proposed ? proposalValidation.errors : ["LLM proposal unavailable"];
      throw new BadRequestException(
        `Skill input requirements are invalid: ${[...generated.errors, ...proposalErrors].join("; ")}`,
      );
    }

    const existing = current.inputSourceMap ?? { requiredInputs: [] };
    const validation = validateInputSourceMap(existing);
    if (!validation.valid) {
      throw new BadRequestException(`Existing skill input source map is invalid: ${validation.errors.join("; ")}`);
    }
    return validation.map;
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
    this.requireWriteAdmin(actor);
    const job = await this.prisma.client.jobRecord.findUniqueOrThrow({
      where: { id },
    });
    if (job.status !== "failed") {
      throw new BadRequestException("Only failed jobs can be retried.");
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
    this.requireWriteAdmin(actor);
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
    this.requireWriteAdmin(actor);
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
    this.requireWriteAdmin(actor);
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
    this.requireWriteAdmin(actor);
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

  // --- Phase 1: Document Templates Endpoints ---

  async getTemplates(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.documentTemplate.findMany({
      include: { versions: { orderBy: { version: "desc" } } },
    });
  }

  async createTemplateVersion(actor: Actor, id: string, body: { html: string; css: string; schema: any }) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const current = await tx.documentTemplateVersion.findFirst({
        where: { documentTemplateId: id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (current?.version ?? 0) + 1;
      const version = await tx.documentTemplateVersion.create({
        data: {
          documentTemplateId: id,
          version: nextVersion,
          active: false,
          html: body.html,
          css: body.css,
          schema: body.schema ? JSON.parse(JSON.stringify(body.schema)) : null,
          createdBy: actor.userId,
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "template.version.created",
          targetType: "document_template_version",
          targetId: version.id,
          metadata: { templateId: id, version: nextVersion },
        },
      });
      return version;
    });
  }

  async previewTemplate(actor: Actor, id: string, body: { html: string; css: string; schema: any; sampleData: any }) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    
    if (body.schema) {
      const ajv = new Ajv({ allErrors: true, strict: false });
      const validate = ajv.compile(body.schema);
      const isValid = validate(body.sampleData);
      if (!isValid) {
        throw new BadRequestException(`Validation failed: ${ajv.errorsText(validate.errors)}`);
      }
    }

    const renderedBody = renderTemplateLocal(body.html, body.sampleData);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${body.css}</style></head><body>${renderedBody}</body></html>`;
    return { html };
  }

  async activateTemplateVersion(actor: Actor, id: string, versionId: string) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.documentTemplateVersion.updateMany({
        where: { documentTemplateId: id },
        data: { active: false },
      });
      const version = await tx.documentTemplateVersion.update({
        where: { id: versionId },
        data: { active: true },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "template.version.activated",
          targetType: "document_template_version",
          targetId: versionId,
          metadata: { templateId: id, version: version.version },
        },
      });
      return version;
    });
  }

  // --- Cost Configuration ---

  async getCostConfigs(actor: Actor) {
    this.requireAdmin(actor);
    return this.prisma.client.costConfig.findMany({
      orderBy: { key: "asc" },
    });
  }

  async updateCostConfig(actor: Actor, key: string, body: { name?: string; unit?: string; active?: boolean; inputCostMinor?: number; outputCostMinor?: number; flatCostMinor?: number }) {
    this.requireAdmin(actor);
    this.requireWriteAdmin(actor);
    return this.prisma.client.$transaction(async (tx: any) => {
      const config = await tx.costConfig.findUniqueOrThrow({ where: { key } });
      const updated = await tx.costConfig.update({
        where: { key },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.unit !== undefined ? { unit: body.unit } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.inputCostMinor !== undefined ? { inputCostMinor: body.inputCostMinor } : {}),
          ...(body.outputCostMinor !== undefined ? { outputCostMinor: body.outputCostMinor } : {}),
          ...(body.flatCostMinor !== undefined ? { flatCostMinor: body.flatCostMinor } : {}),
          version: config.version + 1,
          updatedBy: actor.userId,
        },
      });
      await tx.platformAuditEvent.create({
        data: {
          actorId: actor.userId,
          eventType: "cost_config.updated",
          targetType: "cost_config",
          targetId: updated.id,
          metadata: { key, old: config, updated: body },
        },
      });
      return updated;
    });
  }

  // --- Phase 2: Metrics Endpoints ---

  async getOverviewMetrics(actor: Actor, from?: Date, to?: Date) {
    this.requireAdmin(actor);
    const dateRange = this.dateFilter(from, to);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [users, projects, activeProjects, failedJobs, tokens, docs, storage] = await Promise.all([
      this.prisma.client.profile.count({ where: dateRange.createdAt ? { createdAt: dateRange.createdAt } : undefined }),
      this.prisma.client.project.count({ where: dateRange.createdAt ? { createdAt: dateRange.createdAt } : undefined }),
      this.prisma.client.project.count({
        where: { updatedAt: { gte: from ?? thirtyDaysAgo, ...(to ? { lte: to } : {}) } },
      }),
      this.prisma.client.jobRecord.count({
        where: { status: "failed", updatedAt: { gte: from ?? thirtyDaysAgo, ...(to ? { lte: to } : {}) } },
      }),
      this.prisma.client.tokenUsage.aggregate({
        where: dateRange.createdAt ? { createdAt: dateRange.createdAt } : undefined,
        _sum: { inputTokens: true, outputTokens: true, costMinor: true },
      }),
      this.prisma.client.generatedDocument.count({
        where: { status: "completed", ...(dateRange.createdAt ? { createdAt: dateRange.createdAt } : {}) },
      }),
      this.prisma.client.storageObject.aggregate({
        _sum: { sizeBytes: true },
      }),
    ]);

    const pdfConfig = await this.prisma.client.costConfig.findFirst({ where: { key: "pdf-render" } });
    const storageConfig = await this.prisma.client.costConfig.findFirst({ where: { key: "storage-per-mb" } });
    
    const aiCost = tokens._sum.costMinor ?? 0;
    const pdfCost = docs * (pdfConfig?.flatCostMinor ?? 5);
    const totalStorageMB = (storage._sum.sizeBytes ?? 0) / (1024 * 1024);
    const storageCost = Math.round(totalStorageMB * (storageConfig?.flatCostMinor ?? 2));

    const totalCost = aiCost + pdfCost + storageCost;
    const configuredRevenue = projects * 5000;
    const margin = configuredRevenue > 0 ? Math.round(((configuredRevenue - totalCost) / configuredRevenue) * 100) : 100;

    const riskProjectsCount = await this.getSupportRiskProjectsCount();

    return {
      users,
      projects,
      activeProjects,
      failedJobs,
      tokens: tokens._sum,
      aiCost,
      pdfCost,
      storageCost,
      totalCost,
      configuredRevenue,
      margin,
      riskProjectsCount,
    };
  }

  private async getSupportRiskProjectsCount(): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const atRiskProjects = await this.prisma.client.project.findMany({
      where: {
        OR: [
          { jobs: { some: { status: "failed", updatedAt: { gte: sevenDaysAgo } } } },
          { raidItems: { some: { severity: "critical", status: { not: "done" } } } }
        ]
      },
      select: { id: true }
    });
    return atRiskProjects.length;
  }

  async getUsageMetrics(actor: Actor, from?: Date, to?: Date) {
    this.requireAdmin(actor);
    const dateRange = this.dateFilter(from, to);
    const tokenWhere = dateRange.createdAt ? { createdAt: dateRange.createdAt } : undefined;
    const [byModel, bySkill, byProject, byUser, storageByProject] = await Promise.all([
      this.prisma.client.tokenUsage.groupBy({
        by: ["model"],
        where: tokenWhere,
        _sum: { inputTokens: true, outputTokens: true, costMinor: true },
        _count: true,
      }),
      this.prisma.client.tokenUsage.groupBy({
        by: ["skillVersionId"],
        where: tokenWhere,
        _sum: { inputTokens: true, outputTokens: true, costMinor: true },
      }),
      this.prisma.client.tokenUsage.groupBy({
        by: ["projectId"],
        where: tokenWhere,
        _sum: { inputTokens: true, outputTokens: true, costMinor: true },
      }),
      this.prisma.client.tokenUsage.groupBy({
        by: ["userId"],
        where: tokenWhere,
        _sum: { inputTokens: true, outputTokens: true, costMinor: true },
      }),
      this.prisma.client.storageObject.groupBy({
        by: ["projectId"],
        _sum: { sizeBytes: true },
      }),
    ]);

    return { byModel, bySkill, byProject, byUser, storageByProject };
  }

  async getCostsMetrics(actor: Actor, from?: Date, to?: Date) {
    this.requireAdmin(actor);
    const dateRange = this.dateFilter(from, to);
    const tokenWhere = dateRange.createdAt ? { createdAt: dateRange.createdAt } : undefined;
    const tokens = await this.prisma.client.tokenUsage.aggregate({
      where: tokenWhere,
      _sum: { costMinor: true },
    });
    const docCount = await this.prisma.client.generatedDocument.count({
      where: { status: "completed", ...(dateRange.createdAt ? { createdAt: dateRange.createdAt } : {}) },
    });
    const storage = await this.prisma.client.storageObject.aggregate({
      _sum: { sizeBytes: true },
    });

    const pdfConfig = await this.prisma.client.costConfig.findFirst({ where: { key: "pdf-render" } });
    const storageConfig = await this.prisma.client.costConfig.findFirst({ where: { key: "storage-per-mb" } });
    const totalStorageMB = (storage._sum.sizeBytes ?? 0) / (1024 * 1024);

    const aiCost = tokens._sum.costMinor ?? 0;
    const pdfCost = docCount * (pdfConfig?.flatCostMinor ?? 5);
    const storageCost = Math.round(totalStorageMB * (storageConfig?.flatCostMinor ?? 2));

    const configs = await this.prisma.client.costConfig.findMany({ orderBy: { key: "asc" } });

    return {
      aiCost,
      pdfCost,
      storageCost,
      totalCost: aiCost + pdfCost + storageCost,
      configs,
    };
  }

  async getJobsMetrics(actor: Actor, from?: Date, to?: Date) {
    this.requireAdmin(actor);
    const dateRange = this.dateFilter(from, to);
    const jobWhere = dateRange.createdAt ? { finishedAt: { not: null as Date | null }, status: "completed" as const, startedAt: dateRange.createdAt } : { status: "completed" as const, finishedAt: { not: null as Date | null } };
    const completedAttempts = await this.prisma.client.jobAttempt.findMany({
      where: jobWhere,
      select: { startedAt: true, finishedAt: true },
    });

    const latencies = completedAttempts
      .map((a: any) => a.finishedAt!.getTime() - a.startedAt.getTime())
      .sort((a: number, b: number) => a - b);

    const avgLatency = latencies.length > 0 ? latencies.reduce((sum: number, val: number) => sum + val, 0) / latencies.length : 0;
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies.length > 0 ? latencies[p95Idx] : 0;

    const jobRecordWhere = dateRange.createdAt ? { createdAt: dateRange.createdAt } : undefined;
    const totalJobs = await this.prisma.client.jobRecord.count({ where: jobRecordWhere });
    const failedJobs = await this.prisma.client.jobRecord.count({ where: { status: "failed", ...jobRecordWhere } });
    const errorRate = totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;

    const recentFailed = await this.prisma.client.jobRecord.findMany({
      where: { status: "failed", ...(dateRange.createdAt ? { createdAt: dateRange.createdAt } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return {
      avgLatencyMs: Math.round(avgLatency),
      p95LatencyMs: p95Latency,
      totalJobs,
      failedJobs,
      errorRate: Math.round(errorRate * 10) / 10,
      recentFailed,
    };
  }

  private dateFilter(from?: Date, to?: Date) {
    if (!from && !to) return {};
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    return { createdAt };
  }

  async getProjectsMetrics(actor: Actor) {
    this.requireAdmin(actor);
    const projects = await this.prisma.client.project.findMany({
      include: {
        memberships: { include: { user: true } },
        jobs: { where: { status: "failed" } },
        raidItems: { where: { severity: "critical", status: { not: "done" } } },
      },
    });

    return projects.map((p: any) => {
      const hasFailedJob = p.jobs.length > 0;
      const hasCriticalRisk = p.raidItems.length > 0;
      const isRisk = hasFailedJob || hasCriticalRisk;

      return {
        id: p.id,
        name: p.name,
        ownerId: p.ownerId,
        membersCount: p.memberships.length,
        failedJobsCount: p.jobs.length,
        criticalRisksCount: p.raidItems.length,
        latestViabilityScore: null,
        isSupportRisk: isRisk,
        updatedAt: p.updatedAt,
      };
    });
  }

  // --- Support Workspace Endpoints ---

  async getSupportProjects(actor: Actor, page: number = 1, limit: number = 10) {
    this.requireAdmin(actor);
    const skip = (page - 1) * limit;
    const take = limit;

    const [projects, total] = await Promise.all([
      this.prisma.client.project.findMany({
        include: {
          owner: true,
          memberships: true,
          jobs: { where: { status: "failed" } },
          raidItems: { where: { severity: "critical", status: { not: "done" } } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      this.prisma.client.project.count(),
    ]);

    const items = projects.map((p: any) => {
      const hasFailedJob = p.jobs.length > 0;
      const hasCriticalRisk = p.raidItems.length > 0;
      const isRisk = hasFailedJob || hasCriticalRisk;

      return {
        id: p.id,
        name: p.name,
        ownerEmail: p.owner.email,
        membersCount: p.memberships.length,
        failedJobsCount: p.jobs.length,
        criticalRisksCount: p.raidItems.length,
        latestViabilityScore: null,
        isSupportRisk: isRisk,
        createdAt: p.createdAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSupportProjectDetails(actor: Actor, projectId: string) {
    this.requireAdmin(actor);
    
    await this.prisma.client.platformAuditEvent.create({
      data: {
        actorId: actor.userId,
        eventType: "platform.support.view",
        targetType: "project",
        targetId: projectId,
        metadata: { projectId },
      },
    });

    const project = await this.prisma.client.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        owner: true,
        memberships: { include: { user: true } },
        jobs: { orderBy: { updatedAt: "desc" }, take: 30 },
      },
    });

    const projectAudits = await this.prisma.client.auditEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const redactedAudits = projectAudits.map((a: any) => ({
      id: a.id,
      eventType: a.eventType,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt,
      metadata: "[Redacted for Security]",
      before: a.before ? "[Redacted for Security]" : null,
      after: a.after ? "[Redacted for Security]" : null,
    }));

    const redactedJobs = project.jobs.map((j: any) => ({
      id: j.id,
      queue: j.queue,
      status: j.status,
      attempts: j.attempts,
      error: j.error,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      payload: "[Redacted for Security]",
      result: "[Redacted for Security]",
    }));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [recentUsage, prevUsage] = await Promise.all([
      this.prisma.client.tokenUsage.aggregate({
        where: { projectId, createdAt: { gte: sevenDaysAgo } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.client.tokenUsage.aggregate({
        where: { projectId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ]);

    const recentTotal = (recentUsage._sum.inputTokens ?? 0) + (recentUsage._sum.outputTokens ?? 0);
    const prevTotal = (prevUsage._sum.inputTokens ?? 0) + (prevUsage._sum.outputTokens ?? 0);
    const usageSpikePercent = prevTotal > 0 ? Math.round(((recentTotal - prevTotal) / prevTotal) * 100) : 0;

    return {
      id: project.id,
      name: project.name,
      ownerEmail: project.owner.email,
      members: project.memberships.map((m: any) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.preferredName,
        role: m.role,
      })),
      viabilityHistory: [],
      recentJobs: redactedJobs,
      recentAudits: redactedAudits,
      usageSpikePercent,
    };
  }


  async getEventTypes(actor: Actor) {
    this.requireAdmin(actor);

    // All business tables that can trigger skills
    const tables = [
      // Core entities
      { table: "project", group: "Project" },
      { table: "conversation", group: "Conversation" },
      { table: "conversation_message", group: "Conversation" },
      // Discover/Refine entities
      { table: "ambition", group: "Entity" },
      { table: "okr", group: "Entity" },
      { table: "persona", group: "Entity" },
      { table: "okr_persona", group: "Entity" },
      { table: "pain_point", group: "Entity" },
      { table: "user_need", group: "Entity" },
      { table: "user_story", group: "Entity" },
      { table: "task", group: "Entity" },
      // Refine
      { table: "structured_extract", group: "Refine" },
      // Cycle management
      { table: "cycle", group: "Cycle" },
      { table: "raid_item", group: "Cycle" },
      { table: "daily_meeting", group: "Cycle" },
      { table: "retrospective", group: "Cycle" },
    ];

    const operations = ["create", "update", "delete"];

    const tableItems = tables.flatMap(({ table, group }) =>
      operations.map(op => ({
        eventType: `${table}.${op}`,
        table,
        operation: op,
        group,
      }))
    );

    // ── Skill completion events ──────────────────────────────────────────────
    // Dynamically built from all skills in the DB so the list stays in sync
    // automatically whenever a new skill is created — no code change needed.
    // Emitted by the worker when skillIsDone=true (skill_done tag or JSON).
    const skills = await this.prisma.client.skill.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
    });

    const skillItems = skills.map((skill: { id: string }) => ({
      eventType: `skill.${skill.id}.completed`,
      table: "skill",
      operation: "completed",
      group: "Skill Completion",
    }));

    return { items: [...tableItems, ...skillItems] };
  }

  async eventMappings(actor: Actor, page: number = 1, limit: number = 10) {
    this.requireAdmin(actor);
    const skip = (page - 1) * limit;
    const take = limit;

    const [items, total] = await Promise.all([
      this.prisma.client.skillEventMapping.findMany({
        orderBy: { eventType: "asc" },
        include: { skill: true },
        skip,
        take,
      }),
      this.prisma.client.skillEventMapping.count(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createEventMapping(
    actor: Actor,
    body: { eventType: string; skillId: string; targetQueue?: string; conditions?: Record<string, unknown>; active?: boolean },
  ) {
    this.requireWriteAdmin(actor);
    const eventType = body.eventType?.trim();
    const skillId = body.skillId?.trim();
    if (!eventType || !skillId) {
      throw new BadRequestException("Event type and Skill ID are required.");
    }
    const targetQueue = body.targetQueue?.trim() || "ai.conversation";
    await this.prisma.client.skill.findUniqueOrThrow({ where: { id: skillId } });

    const mapping = await this.prisma.client.skillEventMapping.create({
      data: {
        eventType,
        skillId,
        targetQueue,
        conditions: body.conditions ?? {},
        active: body.active ?? true,
      },
      include: { skill: true },
    });
    await this.auditPlatform(actor, "platform.event_mapping.created", "event_mapping", mapping.id, { eventType, skillId, targetQueue, conditions: body.conditions ?? {} });
    return mapping;
  }

  async updateEventMapping(
    actor: Actor,
    id: string,
    body: { active?: boolean; skillId?: string; targetQueue?: string; conditions?: Record<string, unknown> },
  ) {
    this.requireWriteAdmin(actor);
    const data: Record<string, any> = {};
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.skillId === "string") {
      const skillId = body.skillId.trim();
      await this.prisma.client.skill.findUniqueOrThrow({ where: { id: skillId } });
      data.skillId = skillId;
    }
    if (typeof body.targetQueue === "string") {
      data.targetQueue = body.targetQueue.trim();
    }
    if (body.conditions !== undefined) {
      data.conditions = body.conditions;
    }

    const mapping = await this.prisma.client.skillEventMapping.update({
      where: { id },
      data,
      include: { skill: true },
    });

    await this.auditPlatform(actor, "platform.event_mapping.updated", "event_mapping", mapping.id, data);
    return mapping;
  }

  async deleteEventMapping(actor: Actor, id: string) {
    this.requireWriteAdmin(actor);
    const mapping = await this.prisma.client.skillEventMapping.delete({
      where: { id },
    });
    await this.auditPlatform(actor, "platform.event_mapping.deleted", "event_mapping", id, { eventType: mapping.eventType });
    return { success: true };
  }

  private auditPlatform(
    actor: Actor,
    eventType: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.client.platformAuditEvent.create({
      data: { actorId: actor.userId, eventType, targetType, targetId, metadata },
    });
  }
}
