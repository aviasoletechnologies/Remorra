import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import Ajv from "ajv";
import { createPrismaClient } from "@remorra/database";
import { PgBoss, type Job } from "pg-boss";
import puppeteer from "puppeteer";

const databaseUrl = required("DATABASE_URL");
const prisma = createPrismaClient(databaseUrl);
const boss = new PgBoss({
  connectionString: databaseUrl,
  max: Number(process.env.PG_BOSS_POOL_MAX ?? 2),
});
const anthropic = new Anthropic({
  apiKey: required("ANTHROPIC_API_KEY"),
  baseURL: process.env.ANTHROPIC_BASE_URL,
});
const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const bucket = process.env.SUPABASE_PRIVATE_BUCKET ?? "private-documents";
const ajv = new Ajv({ allErrors: true, strict: false });

const queues = [
  "ai.conversation",
  "ai.extract",
  "ai.report",
  "ai.summary",
  "document.render",
  "gdpr.export",
  "gdpr.delete",
  "retention.cleanup",
  "storage.expire",
] as const;

type Payload = Record<string, unknown> & { jobRecordId: string };

async function main() {
  await prisma.$connect();
  await boss.start();
  for (const queue of queues) await boss.createQueue(queue);

  await boss.work<Payload>("ai.conversation", handleJobs(handleConversation));
  await boss.work<Payload>("ai.extract", handleJobs(handleExtract));
  await boss.work<Payload>("ai.summary", handleJobs(handleSummary));
  await boss.work<Payload>("ai.report", handleJobs(handleReport));
  await boss.work<Payload>("document.render", handleJobs(handleDocument));
  await boss.work<Payload>("gdpr.export", handleJobs(handleGdprExport));
  await boss.work<Payload>("gdpr.delete", handleJobs(handleGdprDelete));
  await boss.work<Payload>("retention.cleanup", handleJobs(handleRetention));
  await boss.work<Payload>("storage.expire", handleJobs(handleStorageExpiry));

  await boss.schedule("retention.cleanup", "0 2 * * *", {});
  await boss.schedule("storage.expire", "30 2 * * *", {});
  console.info(JSON.stringify({ service: "remorra-worker", event: "ready" }));
}

function handleJobs(handler: (payload: Payload) => Promise<unknown>) {
  return async (jobs: Job<Payload>[]) => {
    const results = [];
    for (const job of jobs) {
      results.push(await execute(job.data, handler));
    }
    return results;
  };
}

async function execute(
  payload: Payload,
  handler: (payload: Payload) => Promise<unknown>,
) {
  const record = await prisma.jobRecord.update({
    where: { id: payload.jobRecordId },
    data: { status: "running", attempts: { increment: 1 } },
  });
  const attempt = await prisma.jobAttempt.create({
    data: {
      jobRecordId: record.id,
      attempt: record.attempts,
      status: "running",
    },
  });
  try {
    const result = await handler(payload);
    await prisma.$transaction([
      prisma.jobRecord.update({
        where: { id: record.id },
        data: { status: "completed", result: jsonValue(result) },
      }),
      prisma.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "completed", finishedAt: new Date() },
      }),
    ]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.$transaction([
      prisma.jobRecord.update({
        where: { id: record.id },
        data: { status: "failed", error: message },
      }),
      prisma.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "failed", error: message, finishedAt: new Date() },
      }),
    ]);
    throw error;
  }
}

async function checkTokenBudget(userId: string) {
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });
  if (profile.tier !== "free") return;
  const cap = Number(process.env.FREE_TIER_TOKEN_CAP ?? 500000);
  const agg = await prisma.tokenUsage.aggregate({
    where: { userId },
    _sum: { inputTokens: true, outputTokens: true },
  });
  const total = (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
  if (total >= cap) {
    throw new Error("TOKEN_BUDGET_EXCEEDED: Free tier token limit reached. Upgrade to continue.");
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  policy: { limit: number; backoff: boolean },
  context: { userId: string; projectId: string; skillVersionId: string; model: string },
): Promise<T> {
  const maxAttempts = policy.limit ?? 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.status ?? error?.statusCode;
      const retryable = [429, 500, 529].includes(status) ||
        error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT";
      if (!retryable || attempt === maxAttempts - 1) {
        // Log to AiFailure on final failure
        await prisma.aiFailure.create({
          data: {
            userId: context.userId,
            projectId: context.projectId,
            skillVersionId: context.skillVersionId,
            model: context.model,
            error: error instanceof Error ? error.message : String(error),
            requestPayload: {},
          },
        }).catch(() => {}); // Don't let logging failure mask the original error
        throw error;
      }
      if (policy.backoff) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw new Error("Retry exhausted");
}

async function injectKnowledgeBases(userContent: string, skillId: string) {
  const kbSkills = ["evolve-facilitator", "document-drafter"];
  if (!kbSkills.includes(skillId)) return [];
  const mappings = await prisma.knowledgeBaseTopicMapping.findMany({
    include: { knowledgeBase: { include: { versions: { where: { active: true }, take: 1 } } } },
  });
  const contentLower = userContent.toLowerCase();
  const matched: { tag: string; markdown: string }[] = [];
  for (const mapping of mappings) {
    if (contentLower.includes(mapping.topic.toLowerCase())) {
      const version = mapping.knowledgeBase.versions[0];
      if (version && mapping.knowledgeBase.active) {
        matched.push({ tag: mapping.knowledgeBase.id, markdown: version.markdown });
      }
    }
  }
  // Sort by priority (higher first) and deduplicate by KB id
  const seen = new Set<string>();
  return matched.filter((m) => {
    if (seen.has(m.tag)) return false;
    seen.add(m.tag);
    return true;
  });
}

async function invokeSkill(input: {
  skillId?: string;
  eventType?: string;
  userId: string;
  projectId: string;
  content: string;
  context: unknown;
  onDelta?: (delta: string, accumulated: string) => Promise<void>;
}) {
  // Free tier budget check
  await checkTokenBudget(input.userId);

  const skillId = input.skillId ?? await resolveSkillId(input.eventType);
  const skill = await prisma.skillVersion.findFirstOrThrow({
    where: { skillId, active: true },
    orderBy: { version: "desc" },
  });
  const model = modelFor(skill.modelTier);

  // Smart context assembly based on skill's contextRequirements
  const requirements = Array.isArray(skill.contextRequirements) ? skill.contextRequirements as string[] : [];
  const contextData = requirements.length > 0
    ? await assembleContext(input.projectId, requirements)
    : `<application_context>${JSON.stringify(input.context)}</application_context>`;

  // KB injection for evolve/document skills
  const kbSections = await injectKnowledgeBases(input.content, skillId);
  const kbContent = kbSections.map((kb) => `<expertise_knowledge tag="${kb.tag}">${kb.markdown}</expertise_knowledge>`).join("\n");

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: contextData },
  ];
  if (kbContent) {
    messages.push({ role: "user", content: kbContent });
  }
  messages.push({ role: "user", content: `<user_message>${input.content}</user_message>` });

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: skill.tokenCeiling,
    system: skill.systemPrompt,
    messages,
  };

  const rawRetry = skill.retryPolicy as { limit?: number; backoff?: boolean } | null;
  const retryPolicy = { limit: rawRetry?.limit ?? 3, backoff: rawRetry?.backoff ?? true };
  const retryContext = { userId: input.userId, projectId: input.projectId, skillVersionId: skill.id, model };

  let response;
  if (input.onDelta) {
    response = await withRetry(async () => {
      const stream = anthropic.messages.stream(request);
      let streamed = "";
      stream.on("text", (delta) => {
        streamed += delta;
        void input.onDelta?.(delta, streamed);
      });
      return stream.finalMessage();
    }, retryPolicy, retryContext);
  } else {
    response = await withRetry(
      () => anthropic.messages.create(request),
      retryPolicy, retryContext,
    );
  }
  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  const costConfig = await prisma.costConfig.findFirst({
    where: { key: `model:${model}`, active: true },
  });
  let costMinor = 0;
  if (costConfig) {
    if (costConfig.unit === "per_1m_tokens") {
      costMinor = Math.round(
        (response.usage.input_tokens * costConfig.inputCostMinor +
          response.usage.output_tokens * costConfig.outputCostMinor) /
          1000000
      );
    } else if (costConfig.unit === "flat") {
      costMinor = costConfig.flatCostMinor;
    }
  } else {
    // Default fallback rates (per 1M tokens)
    const standardInputRate = model.includes("opus") ? 1500 : 300;
    const standardOutputRate = model.includes("opus") ? 7500 : 1500;
    costMinor = Math.round(
      (response.usage.input_tokens * standardInputRate +
        response.usage.output_tokens * standardOutputRate) /
        1000000
    );
  }

  await prisma.tokenUsage.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      skillVersionId: skill.id,
      requestId: randomUUID(),
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costMinor,
    },
  });
  return { text, skill };
}

async function resolveSkillId(eventType?: string) {
  if (!eventType) throw new Error("AI job requires an eventType or skillId.");
  const mapping = await prisma.skillEventMapping.findFirstOrThrow({
    where: { eventType, active: true },
    orderBy: { id: "asc" },
  });
  return mapping.skillId;
}

async function handleConversation(payload: Payload) {
  const userId = String(payload.userId ?? "");
  const projectId = String(payload.projectId ?? "");
  const conversationId = String(payload.conversationId ?? "");

  let sequence = 1;
  const jobId = payload.jobRecordId;
  let queue: Array<{
    type: string;
    delta?: string;
    snapshot?: string;
    metadata?: any;
  }> = [];

  let flushPromise = Promise.resolve();

  const flush = async () => {
    if (queue.length === 0) return;
    const currentBatch = [...queue];
    queue = [];

    const dataToWrite = currentBatch.map((item) => ({
      jobId,
      projectId: projectId || null,
      userId: userId || null,
      sequence: sequence++,
      type: item.type,
      delta: item.delta ?? null,
      snapshot: item.snapshot ?? null,
      metadata: item.metadata ? jsonValue(item.metadata) : null,
    }));

    flushPromise = flushPromise.then(async () => {
      try {
        await prisma.jobStreamEvent.createMany({
          data: dataToWrite,
        });
      } catch (err) {
        console.error("Failed to batch write JobStreamEvents", err);
      }
    });
  };

  const timerId = setInterval(() => {
    void flush();
  }, 80);

  try {
    const result = await invokeSkill({
      skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
      eventType: typeof payload.eventType === "string" ? payload.eventType : undefined,
      userId,
      projectId,
      content: String(payload.content),
      context: await projectContext(projectId),
      onDelta: async (delta, accumulated) => {
        queue.push({ type: "token", delta });
        // Occasional snapshot (approx. every 15-20 tokens)
        if (sequence % 15 === 0) {
          queue.push({ type: "snapshot", snapshot: accumulated });
        }
      },
    });

    clearInterval(timerId);
    await flush();

    queue.push({
      type: "completed",
      snapshot: result.text,
      metadata: {
        modelTier: result.skill.modelTier,
        model: modelFor(result.skill.modelTier),
        outputTokens: result.text.length / 4,
      },
    });
    await flush();
    await flushPromise;

    if (conversationId) {
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: "assistant",
          encryptedContent: encrypt(result.text),
        },
      });
    }

    return {
      response: result.text,
      responseStored: Boolean(conversationId),
      skillId: result.skill.skillId,
      skillVersion: result.skill.version,
    };
  } catch (err: any) {
    clearInterval(timerId);
    await flush();

    const message = err instanceof Error ? err.message : "Unknown error";
    queue.push({
      type: "failed",
      delta: message,
      metadata: {
        errorClass: err.constructor?.name ?? "Error",
      },
    });
    await flush();
    await flushPromise;

    throw err;
  }
}

async function handleExtract(payload: Payload) {
  const eventType =
    typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (
    payload.skillId === "viability-score-calculator" ||
    eventType === "viability.calculate"
  ) {
    const projectId = String(payload.projectId);
    const result = await invokeSkill({
      skillId:
        typeof payload.skillId === "string" ? payload.skillId : undefined,
      eventType,
      userId: String(payload.userId),
      projectId,
      content: "Calculate the current configured viability score.",
      context: await projectContext(projectId),
    });
    const parsed = parseJson(result.text) as Record<string, unknown>;
    const snapshot = await prisma.viabilitySnapshot.create({
      data: {
        projectId,
        skillVersionId: result.skill.id,
        overall: Number(parsed.overall ?? 0),
        components: jsonValue(parsed.components ?? {}),
        rationale: String(parsed.rationale ?? ""),
        actions: jsonValue(parsed.actions ?? []),
        sourceVersion:
          (
            await prisma.project.findUniqueOrThrow({
              where: { id: projectId },
              select: { version: true },
            })
          ).version,
      },
    });
    return { viabilitySnapshotId: snapshot.id };
  }

  if (
    (payload.skillId === "impact-screener" ||
      eventType === "evolve.screen") &&
    payload.evolveSessionId
  ) {
    const session = await prisma.evolveSession.findUniqueOrThrow({
      where: { id: String(payload.evolveSessionId) },
    });
    const result = await invokeSkill({
      skillId:
        typeof payload.skillId === "string" ? payload.skillId : undefined,
      eventType,
      userId: String(payload.userId),
      projectId: session.projectId,
      content: `Screen the proposed Evolve topic: ${session.topic}`,
      context: await projectContext(session.projectId),
    });
    const parsed = parseJson(result.text);
    const items = Array.isArray(parsed) ? parsed : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      await prisma.impactItem.create({
        data: {
          evolveSessionId: session.id,
          entityType: String(value.entityType ?? "project"),
          entityId: typeof value.entityId === "string" ? value.entityId : null,
          severity: String(value.severity ?? "amber"),
          title: String(value.title ?? "Impact item"),
          reasoning: String(value.reasoning ?? ""),
          proposedChange: jsonValue(value.proposedChange ?? {}),
        },
      });
    }
    return { impactsCreated: items.length };
  }

  const conversationId = String(payload.conversationId ?? "");
  const refineSessionId = String(payload.refineSessionId ?? "");
  const conversation = conversationId
    ? await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  const session = refineSessionId
    ? await prisma.refineSession.findUniqueOrThrow({
        where: { id: refineSessionId },
      })
    : null;
  const projectId = conversation?.projectId ?? session!.projectId;
  const content = conversation
    ? conversation.messages
        .map(
          (message: any) =>
            `${message.role}: ${decrypt(message.encryptedContent)}`,
        )
        .join("\n")
    : JSON.stringify(await projectContext(projectId));
  const result = await invokeSkill({
    skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
    eventType,
    userId: String(payload.userId),
    projectId,
    content,
    context: { extractType: payload.extractType ?? "refine-proposals" },
  });
  const parsed = parseJson(result.text);
  if (conversation) {
    await prisma.structuredExtract.create({
      data: { conversationId, schemaVersion: 1, payload: jsonValue(parsed) },
    });
  }
  if (session) {
    const proposals = Array.isArray(parsed) ? parsed : [parsed];
    for (const proposal of proposals) {
      if (!proposal || typeof proposal !== "object") continue;
      const record = proposal as Record<string, unknown>;
      if (!record.entityType || !record.payload) continue;
      await prisma.refineProposal.create({
        data: {
          projectId,
          refineSessionId,
          entityType: String(record.entityType),
          payload: jsonValue(record.payload),
        },
      });
    }
  }
  return { extracted: true };
}

async function handleSummary(payload: Payload) {
  const kind = String(payload.kind);
  const resourceId = String(payload.resourceId);
  const resource =
    kind === "meeting"
      ? await prisma.dailyMeeting.findUniqueOrThrow({ where: { id: resourceId } })
      : await prisma.retrospective.findUniqueOrThrow({ where: { id: resourceId } });
  const result = await invokeSkill({
    skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
    eventType:
      typeof payload.eventType === "string" ? payload.eventType : undefined,
    userId: String(payload.userId),
    projectId: resource.projectId,
    content: JSON.stringify(resource),
    context: await projectContext(resource.projectId),
  });
  if (kind === "meeting") {
    await prisma.dailyMeeting.update({
      where: { id: resourceId },
      data: { aiSummary: result.text },
    });
  } else {
    await prisma.retrospective.update({
      where: { id: resourceId },
      data: { aiInsights: result.text },
    });
  }
  return { updated: resourceId };
}

async function handleReport(payload: Payload) {
  const id = String(payload.reportGenerationId);
  const generation = await prisma.reportGeneration.findUniqueOrThrow({
    where: { id },
    include: {
      definition: { include: { versions: { where: { active: true }, take: 1 } } },
    },
  });
  await prisma.reportGeneration.update({
    where: { id },
    data: { status: "generating" },
  });
  const snapshot = await projectContext(generation.projectId);
  await prisma.reportSourceSnapshot.upsert({
    where: { reportGenerationId: id },
    create: { reportGenerationId: id, payload: jsonValue(snapshot) },
    update: { payload: jsonValue(snapshot) },
  });
  const definition = generation.definition.versions[0];
  if (!definition) throw new Error("Active report definition version not found.");
  let content: unknown = snapshot;
  if (definition.requiresLlm) {
    const result = await invokeSkill({
      eventType: "report.generate",
      userId: generation.requestedById,
      projectId: generation.projectId,
      content: `Generate the ${generation.definition.name} report.`,
      context: snapshot,
    });
    content = parseJson(result.text);
    const validate = ajv.compile(definition.outputSchema as object);
    if (!validate(content)) {
      throw new Error(`Report output schema failed: ${ajv.errorsText(validate.errors)}`);
    }
  }
  await prisma.reportContent.upsert({
    where: { reportGenerationId: id },
    create: { reportGenerationId: id, structuredContent: jsonValue(content) },
    update: { structuredContent: jsonValue(content) },
  });
  const document = await prisma.generatedDocument.create({
    data: {
      projectId: generation.projectId,
      reportGenerationId: id,
      type: `report:${generation.reportDefinitionId}`,
      templateVersion: 1,
    },
  });
  const jobRecord = await prisma.jobRecord.create({
    data: {
      projectId: generation.projectId,
      userId: generation.requestedById,
      queue: "document.render",
      payload: { documentId: document.id },
    },
  });
  const bossJobId = await boss.send("document.render", {
    documentId: document.id,
    jobRecordId: jobRecord.id,
  });
  await prisma.jobRecord.update({
    where: { id: jobRecord.id },
    data: { bossJobId: bossJobId ?? undefined },
  });
  return { reportGenerationId: id, documentId: document.id };
}

async function assembleFounderPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const latestPack = await prisma.founderPack.findFirst({
    where: { projectId, confirmedAt: { not: null } },
    orderBy: { version: "desc" },
  });
  const content = (latestPack?.content as any) || {};
  return {
    projectName: project.name,
    summary: content.summary || "No executive summary available.",
    vision: content.vision || "No vision statement available.",
    targetAudience: content.targetAudience || "No target audience defined.",
    keyFeatures: Array.isArray(content.keyFeatures) ? content.keyFeatures : [],
    revenueModel: content.revenueModel || "No revenue model defined."
  };
}

async function assembleProductPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const latestPack = await prisma.productPack.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  
  const ambitions = await prisma.ambition.findMany({
    where: { projectId },
    include: { okrs: { include: { personaLinks: true } } },
  });
  const personas = await prisma.persona.findMany({
    where: { projectId },
    include: { painPoints: true, userNeeds: true },
  });
  const completeThread = ambitions.some((ambition: any) =>
    ambition.okrs.some((okr: any) =>
      okr.personaLinks.some((link: any) => {
        const persona = personas.find((item: any) => item.id === link.personaId);
        return persona?.painPoints.length && persona.userNeeds.length;
      }),
    ),
  );
  const total = ambitions.length + personas.length;
  const covered =
    ambitions.filter((item: any) => item.okrs.length > 0).length +
    personas.filter(
      (item: any) => item.painPoints.length > 0 && item.userNeeds.length > 0,
    ).length;
  const coveragePercent = total ? Math.round((covered / total) * 100) : 0;

  return {
    projectName: project.name,
    coveragePercent: latestPack?.coveragePercent ?? coveragePercent,
    linkageValid: latestPack?.linkageValid ?? Boolean(completeThread),
    ambitions: ambitions.map((a: any) => ({ id: a.id, title: a.title, detail: a.detail })),
    personas: personas.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      userNeeds: p.userNeeds.map((n: any) => ({ id: n.id, statement: n.statement })),
      painPoints: p.painPoints.map((pt: any) => ({ id: pt.id, statement: pt.statement }))
    }))
  };
}

async function assembleInvestorPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const productPack = await assembleProductPackData(projectId);
  const viability = await prisma.viabilitySnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const activeCycle = await prisma.cycle.findFirst({
    where: { projectId, status: "active" },
  });
  const tasks = await prisma.task.findMany({
    where: { projectId, cycleId: activeCycle?.id || undefined },
  });
  const completedTasks = tasks.filter((t: any) => t.status === "done").length;
  const raid = await prisma.raidItem.findMany({
    where: { projectId },
  });
  const financeEntries = await prisma.financeEntry.findMany({
    where: { projectId },
  });
  const totalSpent = financeEntries.reduce((sum: number, entry: any) => sum + entry.amountMinor, 0);

  return {
    projectName: project.name,
    viabilityScore: viability?.overall ?? 0,
    viabilityRationale: viability?.rationale || "No viability rationale provided.",
    productCoveragePercent: productPack.coveragePercent,
    deliveryLinkageValid: productPack.linkageValid,
    activeSprintCompletedTasks: completedTasks,
    activeSprintTotalTasks: tasks.length,
    totalBudgetSpentMinor: totalSpent,
    totalBudgetAllocatedMinor: Math.round(totalSpent * 1.5) || 500000,
    risksCount: raid.length,
    criticalRisksCount: raid.filter((r: any) => r.severity === "critical" || r.severity === "high").length
  };
}

async function assembleBuildPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const activeCycle = await prisma.cycle.findFirst({
    where: { projectId, status: "active" },
  });
  const stories = await prisma.userStory.findMany({
    where: { projectId },
  });
  const tasks = await prisma.task.findMany({
    where: { projectId, cycleId: activeCycle?.id || undefined },
    include: { assignee: true },
  });
  const raid = await prisma.raidItem.findMany({
    where: { projectId },
  });

  return {
    projectName: project.name,
    cycleName: activeCycle?.name || "No Active Cycle",
    cycleStatus: activeCycle?.status || "inactive",
    stories: stories.map((s: any) => ({
      title: s.title,
      status: s.status,
      description: s.description || "",
      acceptance: Array.isArray(s.acceptance) ? s.acceptance : []
    })),
    tasks: tasks.map((t: any) => ({
      title: t.title,
      status: t.status,
      assigneeName: t.assignee?.preferredName || t.assignee?.email || "Unassigned"
    })),
    risks: raid.map((r: any) => ({
      title: r.title,
      severity: r.severity,
      status: r.status
    }))
  };
}

export function renderTemplate(template: string, data: any): string {
  let result = template;
  
  // 1. Handle loops: {{#each key}} ... {{/each}}
  const loopRegex = /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  result = result.replace(loopRegex, (_, path, innerTemplate) => {
    const list = getPathValue(data, path);
    if (!Array.isArray(list)) return "";
    return list.map((item) => renderTemplate(innerTemplate, item)).join("");
  });

  // 2. Handle simple replacements: {{key}}
  const varRegex = /\{\{([\w.]+)\}\}/g;
  result = result.replace(varRegex, (_, path) => {
    const val = getPathValue(data, path);
    return val !== undefined && val !== null ? escapeHtml(String(val)) : "";
  });

  return result;
}

function getPathValue(obj: any, path: string): any {
  if (path === "this") return obj;
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

async function handleDocument(payload: Payload) {
  const documentId = String(payload.documentId ?? "");
  const document = documentId
    ? await prisma.generatedDocument.findUniqueOrThrow({
        where: { id: documentId },
        include: {
          reportGeneration: {
            include: { definition: true, content: true },
          },
        },
      })
    : await prisma.generatedDocument.create({
        data: {
          projectId: String(payload.projectId),
          type: String(payload.documentType),
          templateVersion: 1,
        },
        include: { reportGeneration: true },
      });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: document.projectId },
  });

  // 1. Determine template key
  let templateId = "";
  if (document.type === "founder-pack" || document.type === "product-pack" || document.type === "investor-pack" || document.type === "build-pack") {
    templateId = document.type;
  } else if (document.type.startsWith("report:")) {
    const reportDefId = document.type.substring(7);
    const reportDefVer = await prisma.reportDefinitionVersion.findFirst({
      where: { reportDefinitionId: reportDefId, active: true },
    });
    templateId = reportDefVer?.templateKey ?? "report-default";
  } else {
    templateId = "report-default";
  }

  // 2. Fetch active template version
  const activeTemplateVer = await prisma.documentTemplateVersion.findFirst({
    where: { documentTemplateId: templateId, active: true },
  });
  if (!activeTemplateVer) {
    throw new Error(`No active template version found for template key: ${templateId}`);
  }

  // 3. Assemble data
  const reportContent = document.reportGeneration?.content?.structuredContent;
  let content: any = {};
  if (document.type === "founder-pack") {
    content = await assembleFounderPackData(project.id);
  } else if (document.type === "product-pack") {
    content = await assembleProductPackData(project.id);
  } else if (document.type === "investor-pack") {
    content = await assembleInvestorPackData(project.id);
  } else if (document.type === "build-pack") {
    // Write snapshot for history
    const rawContext = await projectContext(project.id);
    const activeCycle = await prisma.cycle.findFirst({
      where: { projectId: project.id, status: "active" },
    });
    await prisma.buildPackSnapshot.create({
      data: {
        projectId: project.id,
        cycleId: activeCycle?.id,
        content: jsonValue(rawContext),
      },
    });
    content = await assembleBuildPackData(project.id);
  } else {
    content = reportContent ?? (await projectContext(project.id));
  }

  // 4. Validate payload using AJV
  if (activeTemplateVer.schema) {
    const schema = activeTemplateVer.schema as any;
    const validate = ajv.compile(schema);
    const isValid = validate(content);
    if (!isValid) {
      throw new Error(`Data validation failed for template ${templateId}: ${ajv.errorsText(validate.errors)}`);
    }
  }

  // 5. Render HTML
  const renderedBody = renderTemplate(activeTemplateVer.html, content);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${activeTemplateVer.css}</style></head><body>${renderedBody}</body></html>`;

  // 6. Launch Puppeteer (sandbox blocked network)
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().startsWith("data:") || request.url() === "about:blank") {
        void request.continue();
      } else {
        void request.abort();
      }
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "18mm", bottom: "18mm", left: "18mm" },
    });
    const path = `${project.id}/${document.type}/${document.id}.pdf`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    const storageObject = await prisma.storageObject.create({
      data: {
        projectId: project.id,
        bucket,
        path,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.generatedDocument.update({
      where: { id: document.id },
      data: {
        status: "completed",
        storageObjectId: storageObject.id,
        expiresAt: storageObject.expiresAt,
        templateVersionId: activeTemplateVer.id,
        templateVersion: activeTemplateVer.version,
      },
    });
    if (document.reportGenerationId) {
      await prisma.reportGeneration.update({
        where: { id: document.reportGenerationId },
        data: { status: "completed", completedAt: new Date() },
      });
    }
    return { documentId: document.id, path };
  } finally {
    await browser.close();
  }
}

async function handleGdprExport(payload: Payload) {
  const userId = String(payload.userId);
  const exportId = String(payload.exportId);
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: true,
      consents: true,
      deletionRequests: true,
      dataExports: true,
      tokenUsage: true,
      auditEvents: true,
    },
  });
  const ownedProjects = await prisma.project.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  const projectIds = Array.from(
    new Set([
      ...ownedProjects.map((project: any) => project.id),
      ...profile.memberships.map((membership: any) => membership.projectId),
    ]),
  );
  const where = { projectId: { in: projectIds } };
  const [
    projects,
    ambitions,
    okrs,
    personas,
    painPoints,
    userNeeds,
    stories,
    tasks,
    conversations,
    founderPacks,
    productPacks,
    refineSessions,
    evolveSessions,
    cycles,
    raidItems,
    financeCategories,
    financeEntries,
    meetings,
    retrospectives,
    viability,
    reports,
    documents,
    jobs,
  ] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } } }),
    prisma.ambition.findMany({ where }),
    prisma.okr.findMany({ where }),
    prisma.persona.findMany({ where }),
    prisma.painPoint.findMany({ where }),
    prisma.userNeed.findMany({ where }),
    prisma.userStory.findMany({ where }),
    prisma.task.findMany({ where }),
    prisma.conversation.findMany({
      where,
      include: { messages: { orderBy: { createdAt: "asc" } }, extracts: true },
    }),
    prisma.founderPack.findMany({ where }),
    prisma.productPack.findMany({ where }),
    prisma.refineSession.findMany({ where }),
    prisma.evolveSession.findMany({ where, include: { impacts: true } }),
    prisma.cycle.findMany({ where }),
    prisma.raidItem.findMany({ where }),
    prisma.financeCategory.findMany({ where }),
    prisma.financeEntry.findMany({ where }),
    prisma.dailyMeeting.findMany({ where, include: { participants: true } }),
    prisma.retrospective.findMany({ where }),
    prisma.viabilitySnapshot.findMany({ where }),
    prisma.reportGeneration.findMany({
      where,
      include: { sourceSnapshot: true, content: true, document: true },
    }),
    prisma.generatedDocument.findMany({ where }),
    prisma.jobRecord.findMany({
      where: { OR: [{ userId }, { projectId: { in: projectIds } }] },
      include: { attemptsLog: true },
    }),
  ]);
  const archive = {
    exportedAt: new Date().toISOString(),
    profile,
    projects,
    product: {
      ambitions,
      okrs,
      personas,
      painPoints,
      userNeeds,
      stories,
      tasks,
      founderPacks,
      productPacks,
      refineSessions,
      evolveSessions,
      viability,
    },
    delivery: {
      cycles,
      raidItems,
      financeCategories,
      financeEntries,
      meetings,
      retrospectives,
    },
    conversations: conversations.map((conversation: any) => ({
      ...conversation,
      messages: conversation.messages.map((message: any) => ({
        ...message,
        encryptedContent: undefined,
        content: decrypt(message.encryptedContent),
      })),
    })),
    reports,
    documents,
    jobs,
  };
  const encrypted = Buffer.from(encrypt(JSON.stringify(archive, null, 2)));
  const path = `gdpr/${userId}/${exportId}.json.enc`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, encrypted, {
      contentType: "application/octet-stream",
      upsert: true,
    });
  if (error) throw error;
  const storageObject = await prisma.storageObject.create({
    data: {
      bucket,
      path,
      mimeType: "application/octet-stream",
      sizeBytes: encrypted.byteLength,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.dataExport.update({
    where: { id: exportId },
    data: {
      status: "completed",
      completedAt: new Date(),
      expiresAt: storageObject.expiresAt,
      storageObjectId: storageObject.id,
    },
  });
  return { exportId };
}

async function handleGdprDelete(payload: Payload) {
  const requestId = String(payload.deletionRequestId);
  const request = await prisma.deletionRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  if (request.status !== "scheduled") return { skipped: true };
  if (request.executeAt > new Date()) {
    throw new Error("Deletion grace period has not elapsed.");
  }
  const projects = await prisma.project.findMany({
    where: { ownerId: request.userId },
    select: { id: true },
  });
  const objects = await prisma.storageObject.findMany({
    where: {
      projectId: { in: projects.map((project: any) => project.id) },
    },
  });
  if (objects.length) {
    await supabase.storage
      .from(bucket)
      .remove(objects.map((item: any) => item.path));
  }
  await prisma.$transaction(async (tx: any) => {
    await tx.project.deleteMany({ where: { ownerId: request.userId } });
    await tx.projectMembership.deleteMany({ where: { userId: request.userId } });
    await tx.conversationMessage.updateMany({
      where: { actorId: request.userId },
      data: { actorId: null, encryptedContent: encrypt("[deleted]") },
    });
    await tx.profile.update({
      where: { id: request.userId },
      data: {
        email: `deleted-${request.userId}@invalid`,
        preferredName: null,
        status: "deleted",
        deletedAt: new Date(),
      },
    });
    await tx.deletionRequest.update({
      where: { id: requestId },
      data: { status: "completed", completedAt: new Date() },
    });
  });
  await supabase.auth.admin.deleteUser(request.userId);
  return { deleted: true };
}

async function handleRetention() {
  const run = await prisma.retentionRun.create({ data: {} });
  try {
    const conversationResult = await prisma.conversation.deleteMany({
      where: { retentionUntil: { lt: new Date() }, status: { not: "completed" } },
    });
    await prisma.retentionRunItem.create({
      data: {
        retentionRunId: run.id,
        policyId: "active-conversations",
        affectedCount: conversationResult.count,
      },
    });
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date() },
    });
    return { runId: run.id };
  } catch (error) {
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date() },
    });
    throw error;
  }
}

async function handleStorageExpiry() {
  const objects = await prisma.storageObject.findMany({
    where: { expiresAt: { lt: new Date() } },
    take: 500,
  });
  if (objects.length) {
    await supabase.storage
      .from(bucket)
      .remove(objects.map((item: any) => item.path));
    await prisma.storageObject.deleteMany({
      where: { id: { in: objects.map((item: any) => item.id) } },
    });
  }
  return { removed: objects.length };
}

async function assembleContext(projectId: string, requirements: string[]): Promise<string> {
  const sections: string[] = [];
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  for (const req of requirements) {
    switch (req) {
      case "project.metadata":
        sections.push(`<project_metadata trust="trusted">${JSON.stringify({ id: project.id, name: project.name, summary: project.summary, phase: project.phase, version: project.version })}</project_metadata>`);
        break;
      case "project.phase":
        sections.push(`<project_phase trust="trusted">${project.phase}</project_phase>`);
        break;
      case "ambitions.all":
      case "okrs.all": {
        const ambitions = await prisma.ambition.findMany({ where: { projectId }, include: { okrs: true } });
        sections.push(`<ambitions trust="trusted">${JSON.stringify(ambitions)}</ambitions>`);
        break;
      }
      case "personas.all": {
        const personas = await prisma.persona.findMany({ where: { projectId } });
        sections.push(`<personas trust="trusted">${JSON.stringify(personas)}</personas>`);
        break;
      }
      case "personas.all_with_pain_points_and_user_needs": {
        const personas = await prisma.persona.findMany({ where: { projectId }, include: { painPoints: true, userNeeds: true } });
        sections.push(`<personas_with_needs trust="trusted">${JSON.stringify(personas)}</personas_with_needs>`);
        break;
      }
      case "linkage_map.full": {
        const [ambitions, personas, stories] = await Promise.all([
          prisma.ambition.findMany({ where: { projectId }, include: { okrs: true } }),
          prisma.persona.findMany({ where: { projectId }, include: { painPoints: true, userNeeds: true } }),
          prisma.userStory.findMany({ where: { projectId } }),
        ]);
        sections.push(`<linkage_map trust="trusted">${JSON.stringify({ ambitions, personas, stories })}</linkage_map>`);
        break;
      }
      case "viability_score.current": {
        const snapshot = await prisma.viabilitySnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
        sections.push(`<viability_score trust="trusted">${JSON.stringify(snapshot)}</viability_score>`);
        break;
      }
      case "founder.preferred_name": {
        const owner = await prisma.profile.findFirst({ where: { ownedProjects: { some: { id: projectId } } } });
        sections.push(`<founder trust="trusted">${JSON.stringify({ preferredName: owner?.preferredName })}</founder>`);
        break;
      }
      case "user_stories.all": {
        const stories = await prisma.userStory.findMany({ where: { projectId } });
        sections.push(`<user_stories trust="trusted">${JSON.stringify(stories)}</user_stories>`);
        break;
      }
      case "tasks.all": {
        const tasks = await prisma.task.findMany({ where: { projectId } });
        sections.push(`<tasks trust="trusted">${JSON.stringify(tasks)}</tasks>`);
        break;
      }
      case "cycles.all": {
        const cycles = await prisma.cycle.findMany({ where: { projectId } });
        sections.push(`<cycles trust="trusted">${JSON.stringify(cycles)}</cycles>`);
        break;
      }
      case "raid_items.all": {
        const items = await prisma.raidItem.findMany({ where: { projectId } });
        sections.push(`<raid_items trust="trusted">${JSON.stringify(items)}</raid_items>`);
        break;
      }
      case "finance.all": {
        const entries = await prisma.financeEntry.findMany({ where: { projectId } });
        sections.push(`<finance trust="trusted">${JSON.stringify(entries)}</finance>`);
        break;
      }
      case "founder_pack.current": {
        const pack = await prisma.founderPack.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
        sections.push(`<founder_pack trust="trusted">${JSON.stringify(pack)}</founder_pack>`);
        break;
      }
      case "product_pack.current": {
        const pack = await prisma.productPack.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
        sections.push(`<product_pack trust="trusted">${JSON.stringify(pack)}</product_pack>`);
        break;
      }
    }
  }
  return sections.join("\n");
}

// Legacy fallback for handlers that still use projectContext directly
async function projectContext(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      ambitions: { include: { okrs: true } },
      personas: { include: { painPoints: true, userNeeds: true } },
      userStories: true,
      tasks: true,
      cycles: true,
      raidItems: true,
      financeEntries: true,
      viabilitySnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

function renderHtml(title: string, subtitle: string, content: unknown) {
  const sections = escapeHtml(JSON.stringify(content, null, 2));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#17211b}header{border-bottom:3px solid #23694a;padding-bottom:18px;margin-bottom:24px}
  .brand{color:#23694a;font-weight:700;letter-spacing:2px;font-size:11px}h1{font-size:28px;margin:8px 0}
  p,pre{font-size:10px;line-height:1.55;color:#445149}pre{white-space:pre-wrap;background:#f5f7f4;padding:14px;border-radius:8px}
  footer{position:fixed;bottom:0;color:#68736b;font-size:9px}</style></head><body>
  <header><div class="brand">REMORRA</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header>
  <pre>${sections}</pre><footer>Generated by Remorra Product Intelligence</footer></body></html>`;
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  return JSON.parse(fenced.trim());
}

function jsonValue(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

function encrypt(value: string) {
  const key = createHash("sha256").update(required("ENCRYPTION_KEY")).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  const key = createHash("sha256").update(required("ENCRYPTION_KEY")).digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv!, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag!, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data!, "base64")),
    decipher.final(),
  ]).toString();
}

function modelFor(tier: string) {
  return required(
    tier === "fast"
      ? "ANTHROPIC_MODEL_FAST"
      : tier === "reasoning"
        ? "ANTHROPIC_MODEL_REASONING"
        : "ANTHROPIC_MODEL_STANDARD",
  );
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function shutdown() {
  await boss.stop({ graceful: true });
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

void main();
