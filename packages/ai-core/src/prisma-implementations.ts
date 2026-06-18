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

type SourceRegistryEntry = {
  delegate: string;
  fields: readonly string[];
  aliases: Record<string, string>;
  defaultScope: Record<string, string>;
};

type SourceValidationResult = {
  valid: boolean;
  errors: string[];
  map: InputSourceMap;
};

const EMPTY_INPUT_SOURCE_MAP: InputSourceMap = { requiredInputs: [] };

const SOURCE_REGISTRY: Record<string, SourceRegistryEntry> = {
  Project: {
    delegate: "project",
    fields: ["id", "name", "summary", "phase", "version"],
    aliases: {
      "project id": "id",
      "project name": "name",
      "project title": "name",
      "product name": "name",
      "project summary": "summary",
      "product summary": "summary",
      "project phase": "phase",
      "project version": "version",
    },
    defaultScope: { id: "$runtime.projectId" },
  },
  Conversation: {
    delegate: "conversation",
    fields: ["id", "projectId", "kind", "status", "activeSkillId", "activeSkillVersionId"],
    aliases: {
      "conversation id": "id",
      "conversation status": "status",
      "active skill": "activeSkillId",
      "active skill id": "activeSkillId",
      "active skill version": "activeSkillVersionId",
    },
    defaultScope: { id: "$runtime.conversationId" },
  },
  ConversationMessage: {
    delegate: "conversationMessage",
    fields: ["id", "conversationId", "role", "content", "skillId", "skillVersionId"],
    aliases: {
      "latest message": "content",
      "user message": "content",
      "message role": "role",
    },
    defaultScope: { conversationId: "$runtime.conversationId" },
  },
  Ambition: {
    delegate: "ambition",
    fields: ["id", "projectId", "title", "detail", "version"],
    aliases: {
      ambition: "title",
      ambitions: "title",
      "ambition title": "title",
      "ambition detail": "detail",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  Okr: {
    delegate: "okr",
    fields: ["id", "projectId", "objective", "keyResults", "version"],
    aliases: {
      okr: "objective",
      okrs: "objective",
      objective: "objective",
      "key results": "keyResults",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  Persona: {
    delegate: "persona",
    fields: ["id", "projectId", "name", "description", "version"],
    aliases: {
      persona: "name",
      personas: "name",
      "persona name": "name",
      "persona description": "description",
      audience: "description",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  PainPoint: {
    delegate: "painPoint",
    fields: ["id", "projectId", "personaId", "statement", "version"],
    aliases: {
      "pain point": "statement",
      "pain points": "statement",
      problem: "statement",
      problems: "statement",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  UserNeed: {
    delegate: "userNeed",
    fields: ["id", "projectId", "personaId", "statement", "version"],
    aliases: {
      "user need": "statement",
      "user needs": "statement",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  UserStory: {
    delegate: "userStory",
    fields: ["id", "projectId", "title", "description", "acceptance", "status", "priority"],
    aliases: {
      "user story": "title",
      "user stories": "title",
      story: "title",
      stories: "title",
      acceptance: "acceptance",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  Task: {
    delegate: "task",
    fields: ["id", "projectId", "title", "description", "status", "priority", "position"],
    aliases: {
      task: "title",
      tasks: "title",
      "task status": "status",
      priority: "priority",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  FounderPack: {
    delegate: "founderPack",
    fields: ["id", "projectId", "version", "content", "confirmedAt"],
    aliases: {
      "founder pack": "content",
      "founder pack content": "content",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
  ProductPack: {
    delegate: "productPack",
    fields: ["id", "projectId", "version", "content", "coveragePercent", "linkageValid"],
    aliases: {
      "product pack": "content",
      "product pack content": "content",
      coverage: "coveragePercent",
      "coverage percent": "coveragePercent",
      linkage: "linkageValid",
    },
    defaultScope: { projectId: "$runtime.projectId" },
  },
};

export class ContextAssemblyMissingDataError extends Error {
  constructor(readonly missingInputs: string[]) {
    super(`Missing required context inputs: ${missingInputs.join(", ")}`);
    this.name = "ContextAssemblyMissingDataError";
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function toInputKey(entity: string, field: string): string {
  const raw = `${entity}${field.charAt(0).toUpperCase()}${field.slice(1)}`;
  return raw.charAt(0).toLowerCase() + raw.slice(1);
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
    if (item.source?.type !== "database") {
      errors.push(`${item.key}: source.type must be database`);
      continue;
    }
    const registryEntry = SOURCE_REGISTRY[item.source.entity];
    if (!registryEntry) {
      errors.push(`${item.key}: unknown entity ${item.source.entity}`);
      continue;
    }
    if (!registryEntry.fields.includes(item.source.field)) {
      errors.push(`${item.key}: unknown field ${item.source.entity}.${item.source.field}`);
    }
  }

  return { valid: errors.length === 0, errors, map: inputMap };
}

export function listInputSourceRegistry() {
  return Object.fromEntries(
    Object.entries(SOURCE_REGISTRY).map(([entity, entry]) => [
      entity,
      {
        fields: entry.fields,
        aliases: Object.keys(entry.aliases),
        defaultScope: entry.defaultScope,
      },
    ]),
  );
}

export function generateInputSourceMap(inputRequirementText: string): SourceValidationResult {
  const text = normalizeText(inputRequirementText);
  if (!text) {
    return { valid: true, errors: [], map: EMPTY_INPUT_SOURCE_MAP };
  }

  const requiredInputs: InputSourceMapItem[] = [];
  for (const [entity, entry] of Object.entries(SOURCE_REGISTRY)) {
    for (const [alias, field] of Object.entries(entry.aliases)) {
      if (!text.includes(normalizeText(alias))) continue;
      const key = toInputKey(entity, field);
      if (requiredInputs.some((item) => item.key === key)) continue;
      requiredInputs.push({
        key,
        description: alias,
        required: true,
        source: {
          type: "database",
          entity,
          field,
          scope: entry.defaultScope,
          limit: 1,
        },
      });
    }
  }

  if (requiredInputs.length === 0) {
    return {
      valid: false,
      errors: [`Could not map input requirement text to known sources: "${inputRequirementText}"`],
      map: EMPTY_INPUT_SOURCE_MAP,
    };
  }

  return validateInputSourceMap({ requiredInputs });
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
    requirements: readonly string[],
    options?: {
      inputSourceMap?: InputSourceMap | null;
      runtime?: RuntimeContextScope;
    },
  ): Promise<readonly AiContextSection[]> {
    if (hasInputSourceMap(options?.inputSourceMap)) {
      return this.assembleFromSourceMap(projectId, options.inputSourceMap, options.runtime);
    }

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
    const currentRuntime = { projectId, ...runtime };

    for (const item of validation.map.requiredInputs ?? []) {
      const registryEntry = SOURCE_REGISTRY[item.source.entity];
      if (!registryEntry) {
        missingInputs.push(`${item.key} (${item.source.entity} source is not registered)`);
        continue;
      }
      const delegate = this.prisma[registryEntry.delegate];
      if (!delegate?.findFirst) {
        missingInputs.push(`${item.key} (${item.source.entity} source is unavailable)`);
        continue;
      }

      const where = buildWhere(item.source.scope ?? registryEntry.defaultScope, currentRuntime);
      const row = await delegate.findFirst({
        where,
        orderBy: registryEntry.fields.includes("createdAt") ? { createdAt: "desc" } : undefined,
        select: { [item.source.field]: true },
      });
      const value = row?.[item.source.field];
      if (value === null || value === undefined || value === "") {
        if (item.required !== false) missingInputs.push(item.key);
        continue;
      }
      resolvedInputs[item.key] = value;
    }

    if (missingInputs.length > 0) {
      throw new ContextAssemblyMissingDataError(missingInputs);
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
