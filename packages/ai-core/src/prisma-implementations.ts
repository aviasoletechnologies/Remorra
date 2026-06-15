import type {
  SkillRegistry,
  SkillDefinition,
  ContextAssembler,
  AiContextSection,
  AiInvocation,
  AiUsage,
  TokenTracker,
  AuditLogger,
} from "./index.js";

/**
 * PrismaSkillRegistry — Loads active skill versions from database.
 * Implements SkillRegistry interface.
 */
export class PrismaSkillRegistry implements SkillRegistry {
  constructor(private readonly prisma: any) {}

  async getActive<T = unknown>(skillId: string): Promise<SkillDefinition<T>> {
    const version = await this.prisma.skillVersion.findFirstOrThrow({
      where: { skillId, active: true },
      orderBy: { version: "desc" },
    });
    return {
      id: version.skillId,
      versionId: version.id,
      name: version.skillId,
      version: version.version,
      modelTier: version.modelTier,
      systemPrompt: version.systemPrompt,
      contextRequirements: (version.contextRequirements as string[]) ?? [],
      constraints: (version.constraints as string[]) ?? [],
      tokenCeiling: version.tokenCeiling,
      retryPolicy: version.retryPolicy,
      outputSchema: version.outputSchema,
    };
  }
}

/**
 * PrismaContextAssembler — Assembles tagged XML context sections from database.
 * Implements ContextAssembler interface.
 */
export class PrismaContextAssembler implements ContextAssembler {
  constructor(private readonly prisma: any) {}

  async assemble(
    projectId: string,
    requirements: readonly string[],
  ): Promise<readonly AiContextSection[]> {
    const sections: AiContextSection[] = [];
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    for (const req of requirements) {
      switch (req) {
        case "project.metadata":
          sections.push({
            tag: "project_metadata",
            trust: "trusted",
            content: JSON.stringify({
              id: project.id,
              name: project.name,
              summary: project.summary,
              phase: project.phase,
              version: project.version,
            }),
          });
          break;

        case "project.phase":
          sections.push({
            tag: "project_phase",
            trust: "trusted",
            content: project.phase,
          });
          break;

        case "ambitions.all":
        case "okrs.all": {
          const ambitions = await this.prisma.ambition.findMany({
            where: { projectId },
            include: { okrs: true },
          });
          sections.push({
            tag: "ambitions",
            trust: "trusted",
            content: JSON.stringify(ambitions),
          });
          break;
        }

        case "personas.all": {
          const personas = await this.prisma.persona.findMany({
            where: { projectId },
          });
          sections.push({
            tag: "personas",
            trust: "trusted",
            content: JSON.stringify(personas),
          });
          break;
        }

        case "personas.all_with_pain_points_and_user_needs": {
          const personas = await this.prisma.persona.findMany({
            where: { projectId },
            include: { painPoints: true, userNeeds: true },
          });
          sections.push({
            tag: "personas_with_needs",
            trust: "trusted",
            content: JSON.stringify(personas),
          });
          break;
        }

        case "linkage_map.full": {
          const [ambitions, personas, stories] = await Promise.all([
            this.prisma.ambition.findMany({
              where: { projectId },
              include: { okrs: true },
            }),
            this.prisma.persona.findMany({
              where: { projectId },
              include: { painPoints: true, userNeeds: true },
            }),
            this.prisma.userStory.findMany({ where: { projectId } }),
          ]);
          sections.push({
            tag: "linkage_map",
            trust: "trusted",
            content: JSON.stringify({ ambitions, personas, stories }),
          });
          break;
        }

        case "viability_score.current": {
          const snapshot = await this.prisma.viabilitySnapshot.findFirst({
            where: { projectId },
            orderBy: { createdAt: "desc" },
          });
          sections.push({
            tag: "viability_score",
            trust: "trusted",
            content: JSON.stringify(snapshot),
          });
          break;
        }

        case "founder.preferred_name": {
          const owner = await this.prisma.profile.findFirst({
            where: { ownedProjects: { some: { id: projectId } } },
          });
          sections.push({
            tag: "founder",
            trust: "trusted",
            content: JSON.stringify({
              preferredName: owner?.preferredName,
            }),
          });
          break;
        }

        case "user_stories.all": {
          const stories = await this.prisma.userStory.findMany({
            where: { projectId },
          });
          sections.push({
            tag: "user_stories",
            trust: "trusted",
            content: JSON.stringify(stories),
          });
          break;
        }

        case "tasks.all": {
          const tasks = await this.prisma.task.findMany({
            where: { projectId },
          });
          sections.push({
            tag: "tasks",
            trust: "trusted",
            content: JSON.stringify(tasks),
          });
          break;
        }

        case "cycles.all": {
          const cycles = await this.prisma.cycle.findMany({
            where: { projectId },
          });
          sections.push({
            tag: "cycles",
            trust: "trusted",
            content: JSON.stringify(cycles),
          });
          break;
        }

        case "raid_items.all": {
          const items = await this.prisma.raidItem.findMany({
            where: { projectId },
          });
          sections.push({
            tag: "raid_items",
            trust: "trusted",
            content: JSON.stringify(items),
          });
          break;
        }

        case "finance.all": {
          const entries = await this.prisma.financeEntry.findMany({
            where: { projectId },
          });
          sections.push({
            tag: "finance",
            trust: "trusted",
            content: JSON.stringify(entries),
          });
          break;
        }

        case "founder_pack.current": {
          const pack = await this.prisma.founderPack.findFirst({
            where: { projectId },
            orderBy: { version: "desc" },
          });
          sections.push({
            tag: "founder_pack",
            trust: "trusted",
            content: JSON.stringify(pack),
          });
          break;
        }

        case "product_pack.current": {
          const pack = await this.prisma.productPack.findFirst({
            where: { projectId },
            orderBy: { version: "desc" },
          });
          sections.push({
            tag: "product_pack",
            trust: "trusted",
            content: JSON.stringify(pack),
          });
          break;
        }
      }
    }

    return sections;
  }
}

/**
 * PrismaTokenTracker — Records token usage per AI invocation.
 * Implements TokenTracker interface.
 */
export class PrismaTokenTracker implements TokenTracker {
  constructor(private readonly prisma: any) {}

  async record(invocation: AiInvocation, usage: AiUsage): Promise<void> {
    const costConfig = await this.prisma.costConfig.findFirst({
      where: { key: `model:${usage.model}`, active: true },
    });
    let costMinor = 0;
    if (costConfig) {
      if (costConfig.unit === "per_1m_tokens") {
        costMinor = Math.round(
          (usage.inputTokens * costConfig.inputCostMinor +
            usage.outputTokens * costConfig.outputCostMinor) /
            1000000,
        );
      } else if (costConfig.unit === "flat") {
        costMinor = costConfig.flatCostMinor;
      }
    } else {
      // Default fallback rates (per 1M tokens)
      const standardInputRate = usage.model.includes("opus") ? 1500 : 300;
      const standardOutputRate = usage.model.includes("opus") ? 7500 : 1500;
      costMinor = Math.round(
        (usage.inputTokens * standardInputRate +
          usage.outputTokens * standardOutputRate) /
          1000000,
      );
    }

    await this.prisma.tokenUsage.create({
      data: {
        userId: invocation.userId,
        projectId: invocation.projectId,
        skillVersionId: invocation.skill.versionId,
        requestId: invocation.requestId,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costMinor,
      },
    });
  }
}

/**
 * PrismaAuditLogger — Appends audit events to the database.
 * Implements AuditLogger interface.
 */
export class PrismaAuditLogger implements AuditLogger {
  constructor(private readonly prisma: any) {}

  async append(event: {
    projectId: string;
    actorId: string;
    type: string;
    skillId?: string;
    skillVersion?: number;
    payload: unknown;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        projectId: event.projectId,
        actorId: event.actorId,
        eventType: event.type,
        metadata: {
          ...(typeof event.payload === "object" && event.payload !== null
            ? (event.payload as Record<string, unknown>)
            : { value: event.payload }),
          ...(event.skillId
            ? { skillId: event.skillId, skillVersion: event.skillVersion }
            : {}),
        },
      },
    });
  }
}

/**
 * ResponseParser — Validates and extracts structured JSON from LLM text output.
 * Uses basic structural validation against a JSON schema shape.
 */
export class ResponseParser {
  /**
   * Parse raw LLM text into a structured object.
   * Extracts JSON from fenced code blocks if present.
   */
  static extractJson(text: string): unknown {
    const fenced =
      text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
    return JSON.parse(fenced.trim());
  }

  /**
   * Validate a parsed object against a JSON schema.
   * Returns { valid: true, data } or { valid: false, errors }.
   */
  static validate(
    data: unknown,
    schema: Record<string, unknown>,
  ): { valid: boolean; data: unknown; errors?: string[] } {
    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true, data };
    }

    // Basic structural validation — check required fields
    if (
      schema.type === "object" &&
      schema.required &&
      Array.isArray(schema.required)
    ) {
      const obj = data as Record<string, unknown>;
      const missing = (schema.required as string[]).filter(
        (key) => !(key in obj),
      );
      if (missing.length > 0) {
        return {
          valid: false,
          data,
          errors: missing.map((k) => `Missing required field: ${k}`),
        };
      }
    }

    return { valid: true, data };
  }

  /**
   * Parse and validate in one step.
   */
  static parseAndValidate(
    text: string,
    schema: Record<string, unknown>,
  ): { valid: boolean; data: unknown; errors?: string[] } {
    const data = ResponseParser.extractJson(text);
    return ResponseParser.validate(data, schema);
  }
}
