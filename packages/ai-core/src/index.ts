import type { ZodType } from "zod";

export type ModelTier = "fast" | "standard" | "reasoning";

export interface SkillDefinition<TOutput = unknown> {
  id: string;
  versionId: string;
  name: string;
  version: number;
  modelTier: ModelTier;
  systemPrompt: string;
  contextRequirements: readonly string[];
  inputSourceMap?: InputSourceMap;
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

export interface InputSourceMap {
  requiredInputs?: readonly InputSourceMapItem[];
}

export type InputSourceMapItem =
  | {
      key: string;
      description?: string;
      required?: boolean;
      source: {
        type: "database";
        entity: string;
        field: string;
        scope?: Record<string, string>;
        limit?: number;
        multiple?: boolean;
        include?: string[];
      };
    }
  | {
      key: string;
      description?: string;
      required?: boolean;
      source: {
        type: "url";
        value: string;
      };
    }
  | {
      key: string;
      description?: string;
      required?: boolean;
      source: {
        type: "skill_output";
        skillId: string;
        skillName: string;
        jsonPath?: string | undefined;
      };
    };

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

export interface ContextAssembler {
  assemble(
    projectId: string,
    requirements: readonly string[],
    options?: {
      inputSourceMap?: InputSourceMap | null | undefined;
      runtime?: RuntimeContextScope;
    },
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
      contextRuntime?: Partial<RuntimeContextScope>;
      onLlmInput?: AiInvocation["onLlmInput"];
    },
  ): Promise<AiResult<T> & { skill: SkillDefinition }> {
    const skill = input.skillOverride ?? await this.registry.getActive<T>(input.skillId);
    const assembledSections = await this.context.assemble(
      input.projectId,
      skill.contextRequirements,
      {
        inputSourceMap: skill.inputSourceMap,
        runtime: {
          projectId: input.projectId,
          userId: input.userId,
          skillId: skill.id,
          skillVersionId: skill.versionId,
          ...input.contextRuntime,
        },
      },
    );
    const sections = [...assembledSections, ...(input.additionalSections ?? [])];
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
      skillId: skill.id,
      skillVersion: skill.version,
      payload: { requestId: input.requestId, usage: result.usage },
    });
    return { ...result, skill };
  }
}

export {
  ContextAssemblyMissingDataError,
  PrismaSkillRegistry,
  PrismaContextAssembler,
  PrismaTokenTracker,
  PrismaAuditLogger,
  ResponseParser,
  generateInputSourceMap,
  validateInputSourceMap,
} from "./prisma-implementations.js";
