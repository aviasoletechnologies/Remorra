import type {
  SkillRegistry,
  SkillDefinition,
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
    if (!process.env.DEFAULT_MODEL_TIER) {
      throw new Error("Missing required environment variable: DEFAULT_MODEL_TIER");
    }
    if (!process.env.DEFAULT_TOKEN_CEILING) {
      throw new Error("Missing required environment variable: DEFAULT_TOKEN_CEILING");
    }
    const modelTier = process.env.DEFAULT_MODEL_TIER as any;
    const tokenCeiling = Number(process.env.DEFAULT_TOKEN_CEILING);
    if (Number.isNaN(tokenCeiling)) {
      throw new Error("Invalid DEFAULT_TOKEN_CEILING environment variable; must be a number");
    }

    return {
      id: version.skillId,
      versionId: version.id,
      name: version.skillId,
      version: version.version,
      modelTier,
      systemPrompt: version.systemPrompt,
      contextRequirements: (version.contextRequirements as string[]) ?? [],
      constraints: (version.constraints as string[]) ?? [],
      tokenCeiling,
      retryPolicy: version.retryPolicy,
      outputSchema: version.outputSchema,
    };
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
