import type { ZodType } from "zod";

export type ModelTier = "fast" | "standard" | "reasoning";

export interface SkillDefinition<TOutput = unknown> {
  id: string;
  versionId: string;
  name: string;
  version: number;
  modelTier: ModelTier;
  systemPrompt: string;
  inputSourceMap?: any;
  outputSchema?: any;
  constraints: readonly string[];
  tokenCeiling?: number;
  retryPolicy?: unknown;
}

export interface RuntimeContextScope {
  projectId: string;
  conversationId?: string;
  userId?: string;
  skillId?: string;
  skillVersionId?: string;
}

export interface AiContextSection {
  tag: string;
  trust: "trusted" | "application" | "uploaded" | "user";
  content: string;
}

export interface AiInvocation {
  requestId: string;
  userId: string;
  projectId: string;
  skill: SkillDefinition;
  sections: readonly AiContextSection[];
  idempotencyKey?: string | undefined;
  onDelta?: ((delta: string, accumulated: string) => void | Promise<void>) | undefined;
  onLlmInput?: ((system: string, messages: readonly { role: string; content: string }[]) => void) | undefined;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult<T = unknown> {
  value: T;
  usage: AiUsage;
  skillVersion: number;
}

export interface LlmGateway {
  invoke<T>(invocation: AiInvocation): Promise<AiResult<T>>;
  stream(invocation: AiInvocation): AsyncIterable<string>;
}

export interface SkillRegistry {
  getActive<T = unknown>(skillId: string): Promise<SkillDefinition<T>>;
}

export interface TokenTracker {
  record(invocation: AiInvocation, usage: AiUsage): Promise<void>;
}

export interface AuditLogger {
  append(event: {
    projectId: string;
    actorId: string;
    type: string;
    source?: "evolve_session" | "build_sync" | "manual_edit" | "auto_detection";
    skillId?: string;
    skillVersion?: number;
    payload: unknown;
  }): Promise<void>;
}

export class AiOrchestrator {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly gateway: LlmGateway,
    private readonly tokens: TokenTracker,
    private readonly audit: AuditLogger,
  ) {}

  async invoke<T>(
    input: Omit<AiInvocation, "skill" | "sections"> & {
      skillId: string;
      skillOverride?: SkillDefinition<T>;
      additionalSections?: readonly AiContextSection[];
      contextRuntime?: Partial<RuntimeContextScope>;
      onLlmInput?: AiInvocation["onLlmInput"];
    },
  ): Promise<AiResult<T> & { skill: SkillDefinition }> {
    const skill = input.skillOverride ?? await this.registry.getActive<T>(input.skillId);
    const sections = input.additionalSections ?? [];
    const invocation: AiInvocation = {
      requestId: input.requestId,
      userId: input.userId,
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      onDelta: input.onDelta,
      onLlmInput: input.onLlmInput,
      skill,
      sections,
    };
    const result = await this.gateway.invoke<T>(invocation);
    await this.tokens.record(invocation, result.usage);
    await this.audit.append({
      projectId: input.projectId,
      actorId: input.userId,
      type: "ai.invoked",
      source: "evolve_session",
      skillId: skill.id,
      skillVersion: skill.version,
      payload: { requestId: input.requestId, usage: result.usage },
    });
    return { ...result, skill };
  }
}

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
      modelTier: version.modelTier as ModelTier,
      systemPrompt: version.systemPrompt,
      inputSourceMap: version.inputSourceMap ?? {},
      constraints: (version.constraints as string[]) ?? [],
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
    source?: "evolve_session" | "build_sync" | "manual_edit" | "auto_detection";
    skillId?: string;
    skillVersion?: number;
    payload: unknown;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        projectId: event.projectId,
        actorId: event.actorId,
        eventType: event.type,
        source: event.source ?? null,
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
