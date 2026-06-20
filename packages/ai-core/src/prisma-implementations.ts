import type {
  SkillRegistry,
  SkillDefinition,
  ContextAssembler,
  AiContextSection,
  AiInvocation,
  AiUsage,
  InputSourceMap,
  InputSourceMapItem,
  RuntimeContextScope,
  TokenTracker,
  AuditLogger,
} from "./index.js";

type SourceValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  unmatchedTokens: string[];
  map: InputSourceMap;
};

const EMPTY_INPUT_SOURCE_MAP: InputSourceMap = { requiredInputs: [] };

export interface MissingInputDetail {
  key: string;
  description?: string | undefined;
  entity?: string | undefined;
  field?: string | undefined;
}

export class ContextAssemblyMissingDataError extends Error {
  constructor(
    readonly missingInputs: string[],
    readonly missingDetails: MissingInputDetail[] = [],
  ) {
    super(`Missing required context inputs: ${missingInputs.join(", ")}`);
    this.name = "ContextAssemblyMissingDataError";
  }
}

function hasInputSourceMap(map: InputSourceMap | null | undefined): map is InputSourceMap {
  return Array.isArray(map?.requiredInputs) && map.requiredInputs.length > 0;
}

export function validateInputSourceMap(map: unknown): SourceValidationResult {
  const inputMap = normalizeInputSourceMap(map);
  const errors: string[] = [];

  for (const item of inputMap.requiredInputs ?? []) {
    if (!item.key?.trim()) {
      errors.push("input key is required");
      continue;
    }
    if (item.source?.type === "skill_output") {
      // skillId may be empty string before admin.service resolves it — skip validation here
      if (!item.source.skillName?.trim()) {
        errors.push(`${item.key}: skill_output source requires a non-empty skillName`);
      }
      continue;
    }
    if (item.source?.type === "url") {
      if (!item.source.value?.trim()) {
        errors.push(`${item.key}: url source requires a non-empty value`);
      }
      continue;
    }
    if (item.source?.type !== "database") {
      errors.push(`${item.key}: source.type must be "database", "url", or "skill_output"`);
      continue;
    }
    // Entity validated at runtime via Prisma delegate convention — no static registry needed
  }

  return { valid: errors.length === 0, errors, warnings: [], unmatchedTokens: [], map: inputMap };
}

export function generateInputSourceMap(inputRequirementText: string): SourceValidationResult {
  if (!inputRequirementText.trim()) {
    return { valid: true, errors: [], warnings: [], unmatchedTokens: [], map: EMPTY_INPUT_SOURCE_MAP };
  }

  const requiredInputs: InputSourceMapItem[] = [];

  // Detect URLs
  const urlPattern = /https?:\/\/\S+/g;
  let urlStripped = inputRequirementText;
  let urlIdx = 0;
  let urlM: RegExpExecArray | null;
  while ((urlM = urlPattern.exec(inputRequirementText)) !== null) {
    const url = urlM[0];
    const key = `urlDocument${urlIdx++ > 0 ? urlIdx : ""}`;
    requiredInputs.push({ key, description: url, required: true, source: { type: "url", value: url } });
    urlStripped = urlStripped.replace(url, "");
  }

  // Detect @skill mentions for skill_output entries
  const mentionPattern = /@([\w\s-]+?)(?:\.(\w+))?(?=\s|,|$)/g;
  let mentionM: RegExpExecArray | null;
  let soIdx = 0;
  while ((mentionM = mentionPattern.exec(inputRequirementText)) !== null) {
    const skillName = mentionM[1]?.trim() ?? "";
    const jsonPath = mentionM[2]?.trim();
    if (!skillName) continue;
    const key = `skillOutput${soIdx++ > 0 ? soIdx : ""}`;
    requiredInputs.push({
      key,
      description: `${skillName} output`,
      required: true,
      source: { type: "skill_output", skillId: "", skillName, ...(jsonPath ? { jsonPath } : {}) },
    });
    urlStripped = urlStripped.replace(mentionM[0], "");
  }

  if (requiredInputs.length === 0) {
    return { valid: true, errors: [], warnings: [], unmatchedTokens: [], map: EMPTY_INPUT_SOURCE_MAP };
  }

  const result = validateInputSourceMap({ requiredInputs });
  return { ...result, warnings: [], unmatchedTokens: [] };
}

function normalizeInputSourceMap(map: unknown): InputSourceMap {
  if (!map || typeof map !== "object") return EMPTY_INPUT_SOURCE_MAP;
  const requiredInputs = Array.isArray((map as InputSourceMap).requiredInputs)
    ? (map as InputSourceMap).requiredInputs!
    : [];
  return { requiredInputs };
}

function resolveRuntimeValue(value: string, runtime: RuntimeContextScope): unknown {
  if (!value.startsWith("$runtime.")) return value;
  const key = value.slice("$runtime.".length) as keyof RuntimeContextScope;
  return runtime[key];
}

function buildWhere(scope: Record<string, string> | undefined, runtime: RuntimeContextScope) {
  const where: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(scope ?? {})) {
    const resolved = resolveRuntimeValue(value, runtime);
    if (resolved !== undefined && resolved !== null && resolved !== "") {
      where[field] = resolved;
    }
  }
  return where;
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
      inputSourceMap: normalizeInputSourceMap(version.inputSourceMap),
      constraints: (version.constraints as string[]) ?? [],
      tokenCeiling,
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
    _requirements: readonly string[],
    options?: {
      inputSourceMap?: InputSourceMap | null;
      runtime?: RuntimeContextScope;
    },
  ): Promise<readonly AiContextSection[]> {
    if (hasInputSourceMap(options?.inputSourceMap)) {
      return this.assembleFromSourceMap(projectId, options.inputSourceMap, options.runtime);
    }
    return [];
  }

  private async assembleFromSourceMap(
    projectId: string,
    inputSourceMap: InputSourceMap,
    runtime?: RuntimeContextScope,
  ): Promise<readonly AiContextSection[]> {
    const validation = validateInputSourceMap(inputSourceMap);
    if (!validation.valid) {
      throw new ContextAssemblyMissingDataError(validation.errors);
    }

    const resolvedInputs: Record<string, unknown> = {};
    const missingInputs: string[] = [];
    const missingDetails: MissingInputDetail[] = [];
    const currentRuntime = { projectId, ...runtime };

    for (const item of validation.map.requiredInputs ?? []) {
      // skill_output source type — fetch last assistant message from that skill in this conversation
      if (item.source.type === "skill_output") {
        const skillId = item.source.skillId;
        const conversationId = currentRuntime.conversationId;
        if (!skillId || !conversationId) {
          if (item.required !== false) {
            missingInputs.push(item.key);
            missingDetails.push({ key: item.key, description: item.description ?? item.source.skillName });
          }
          continue;
        }
        const msg = await this.prisma.conversationMessage.findFirst({
          where: { conversationId, skillId, role: "assistant" },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        });
        if (msg?.content) {
          let value: string = msg.content;
          const jsonPath = item.source.jsonPath;
          if (jsonPath) {
            try {
              const parsed = JSON.parse(value);
              const extracted = jsonPath.split(".").reduce((obj: any, key) => obj?.[key], parsed);
              if (extracted !== undefined) {
                value = typeof extracted === "string" ? extracted : JSON.stringify(extracted, null, 2);
              }
            } catch { /* non-JSON output — use full content */ }
          }
          resolvedInputs[item.key] = value;
        } else if (item.required !== false) {
          missingInputs.push(item.key);
          missingDetails.push({ key: item.key, description: `${item.source.skillName} has not run yet in this conversation` });
        }
        continue;
      }

      // url source type — fetch at runtime
      if (item.source.type === "url") {
        try {
          const res = await fetch(item.source.value, { signal: AbortSignal.timeout(10_000) });
          if (res.ok) {
            const html = await res.text();
            const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20_000);
            resolvedInputs[item.key] = text;
          } else if (item.required !== false) {
            missingInputs.push(item.key);
            missingDetails.push({ key: item.key, description: item.description ?? item.source.value });
          }
        } catch {
          if (item.required !== false) {
            missingInputs.push(item.key);
            missingDetails.push({ key: item.key, description: item.description ?? item.source.value });
          }
        }
        continue;
      }

      // database source type
      const dbSource = item.source as { type: "database"; entity: string; field: string; scope?: Record<string, string>; limit?: number; multiple?: boolean; include?: string[] };
      // Resolve Prisma delegate dynamically via camelCase convention (no static registry)
      const delegateName = dbSource.entity.charAt(0).toLowerCase() + dbSource.entity.slice(1);
      const delegate = this.prisma[delegateName];
      if (!delegate?.findFirst) {
        missingInputs.push(`${item.key} (${dbSource.entity} source is unavailable)`);
        missingDetails.push({ key: item.key, description: item.description, entity: dbSource.entity, field: dbSource.field });
        continue;
      }

      const where = buildWhere(dbSource.scope ?? {}, currentRuntime);

      // Build include from admin-configured relation names
      const includeClause = dbSource.include?.length
        ? dbSource.include.reduce<Record<string, boolean>>((acc, rel) => { acc[rel] = true; return acc; }, {})
        : undefined;

      // field: "*" means fetch all columns (no select filter)
      const selectClause = dbSource.field === "*" ? undefined : { [dbSource.field]: true };

      if (dbSource.multiple) {
        const rows = await delegate.findMany({ where, include: includeClause, select: selectClause });
        if (rows.length === 0 && item.required !== false) {
          missingInputs.push(item.key);
          missingDetails.push({ key: item.key, description: item.description, entity: dbSource.entity, field: dbSource.field });
          continue;
        }
        resolvedInputs[item.key] = rows;
      } else {
        const row = await delegate.findFirst({ where, include: includeClause, select: selectClause });
        const value = dbSource.field === "*" ? row : row?.[dbSource.field];
        if (value === null || value === undefined || value === "") {
          if (item.required !== false) {
            missingInputs.push(item.key);
            missingDetails.push({ key: item.key, description: item.description, entity: dbSource.entity, field: dbSource.field });
          }
          continue;
        }
        resolvedInputs[item.key] = value;
      }
    }

    if (missingInputs.length > 0) {
      throw new ContextAssemblyMissingDataError(missingInputs, missingDetails);
    }

    return [
      {
        tag: "resolved_skill_inputs",
        trust: "trusted",
        content: JSON.stringify(resolvedInputs),
      },
    ];
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
