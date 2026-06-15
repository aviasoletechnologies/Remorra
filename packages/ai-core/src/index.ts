import type { ZodType } from "zod";

export type ModelTier = "fast" | "standard" | "reasoning";

export interface SkillDefinition<TOutput = unknown> {
  id: string;
  name: string;
  version: number;
  modelTier: ModelTier;
  systemPrompt: string;
  contextRequirements: readonly string[];
  outputSchema?: any;
  constraints: readonly string[];
  tokenCeiling?: number;
  retryPolicy?: unknown;
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

export interface ContextAssembler {
  assemble(
    projectId: string,
    requirements: readonly string[],
  ): Promise<readonly AiContextSection[]>;
}

export interface TokenTracker {
  record(invocation: AiInvocation, usage: AiUsage): Promise<void>;
}

export interface AuditLogger {
  append(event: {
    projectId: string;
    actorId: string;
    type: string;
    skillId?: string;
    skillVersion?: number;
    payload: unknown;
  }): Promise<void>;
}

export class AiOrchestrator {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly context: ContextAssembler,
    private readonly gateway: LlmGateway,
    private readonly tokens: TokenTracker,
    private readonly audit: AuditLogger,
  ) {}

  async invoke<T>(
    input: Omit<AiInvocation, "skill" | "sections"> & {
      skillId: string;
      skillOverride?: SkillDefinition<T>;
      additionalSections?: readonly AiContextSection[];
    },
  ): Promise<AiResult<T> & { skill: SkillDefinition }> {
    const skill = input.skillOverride ?? await this.registry.getActive<T>(input.skillId);
    const assembledSections = await this.context.assemble(
      input.projectId,
      skill.contextRequirements,
    );
    const sections = [...assembledSections, ...(input.additionalSections ?? [])];
    const invocation: AiInvocation = {
      requestId: input.requestId,
      userId: input.userId,
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      onDelta: input.onDelta,
      skill,
      sections,
    };
    const result = await this.gateway.invoke<T>(invocation);
    await this.tokens.record(invocation, result.usage);
    await this.audit.append({
      projectId: input.projectId,
      actorId: input.userId,
      type: "ai.invoked",
      skillId: skill.id,
      skillVersion: skill.version,
      payload: { requestId: input.requestId, usage: result.usage },
    });
    return { ...result, skill };
  }
}

export { PrismaSkillRegistry, PrismaContextAssembler, PrismaTokenTracker, PrismaAuditLogger, ResponseParser } from "./prisma-implementations.js";
