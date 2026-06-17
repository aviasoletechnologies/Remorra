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
import { AiOrchestrator, PrismaSkillRegistry, PrismaContextAssembler, PrismaTokenTracker, PrismaAuditLogger, ResponseParser } from "@remorra/ai-core";

const databaseUrl = required("DATABASE_URL");
const prisma = createPrismaClient(databaseUrl);
const boss = new PgBoss({
  connectionString: databaseUrl,
  max: Number(process.env.PG_BOSS_POOL_MAX ?? 2),
});
const llmProvider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
const isGrok = llmProvider === "groq" || llmProvider === "grok";
const anthropic = !isGrok
  ? new Anthropic({
      apiKey: required("ANTHROPIC_API_KEY"),
      baseURL: process.env.ANTHROPIC_BASE_URL,
    })
  : null;

function grokModelFor(tier: string) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  const isGroq = !!process.env.GROQ_API_KEY || (typeof apiKey === "string" && apiKey.startsWith("gsk_"));
  const defaultModel = isGroq ? "llama-3.3-70b-versatile" : "grok-2-1212";

  if (tier === "fast") return process.env.GROK_MODEL_FAST || process.env.GROQ_MODEL_FAST || defaultModel;
  if (tier === "reasoning") return process.env.GROK_MODEL_REASONING || process.env.GROQ_MODEL_REASONING || defaultModel;
  return process.env.GROK_MODEL_STANDARD || process.env.GROQ_MODEL_STANDARD || defaultModel;
}

async function* streamGrok(input: {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  const isGroq = !!process.env.GROQ_API_KEY || (typeof apiKey === "string" && apiKey.startsWith("gsk_"));
  const defaultBaseUrl = isGroq ? "https://api.groq.com/openai/v1" : "https://api.x.ai/v1";
  const baseUrl = process.env.GROK_BASE_URL || process.env.GROQ_BASE_URL || defaultBaseUrl;

  const payload = {
    model: input.model,
    max_tokens: input.max_tokens,
    temperature: input.temperature ?? 0,
    messages: [
      ...(input.system ? [{ role: "system", content: input.system }] : []),
      ...input.messages.map(m => ({ role: m.role, content: m.content })),
    ],
    stream: true,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Grok Streaming API error (${res.status}): ${errorText}`);
  }

  if (!res.body) throw new Error("Response body is empty");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") break;
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // ignore parse errors for keepalives
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function invokeGrokStream(input: {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
}) {
  let accumulated = "";
  for await (const delta of streamGrok(input)) {
    accumulated += delta;
    if (input.onDelta) {
      await input.onDelta(delta, accumulated);
    }
  }

  const promptTokens = Math.ceil((JSON.stringify(input.messages).length + (input.system?.length ?? 0)) / 4);
  const completionTokens = Math.ceil(accumulated.length / 4);

  return {
    content: [{ type: "text", text: accumulated }],
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
    },
  };
}

async function invokeGrok(input: {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  const isGroq = !!process.env.GROQ_API_KEY || (typeof apiKey === "string" && apiKey.startsWith("gsk_"));
  const defaultBaseUrl = isGroq ? "https://api.groq.com/openai/v1" : "https://api.x.ai/v1";
  const baseUrl = process.env.GROK_BASE_URL || process.env.GROQ_BASE_URL || defaultBaseUrl;

  const payload = {
    model: input.model,
    max_tokens: input.max_tokens,
    temperature: input.temperature ?? 0,
    messages: [
      ...(input.system ? [{ role: "system", content: input.system }] : []),
      ...input.messages.map(m => ({ role: m.role, content: m.content })),
    ],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Grok API error (${res.status}): ${errorText}`);
  }

  const data = await res.json() as any;
  const text = data.choices[0]?.message?.content || "";
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  return {
    content: [{ type: "text", text }],
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
    },
  };
}

const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const bucket = process.env.SUPABASE_PRIVATE_BUCKET ?? "private-documents";
const ajv = new Ajv({ allErrors: true, strict: false });

const orchestrator = new AiOrchestrator(
  new PrismaSkillRegistry(prisma),
  new PrismaContextAssembler(prisma),
  { // LlmGateway - delegates to Anthropic with retry
    async invoke(invocation) {
      const llmProvider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
      const isGrok = llmProvider === "groq" || llmProvider === "grok";
      const model = isGrok ? grokModelFor(invocation.skill.modelTier) : modelFor(invocation.skill.modelTier);
      const sections = invocation.sections.map(s => `<${s.tag} trust="${s.trust}">${s.content}</${s.tag}>`).join("\n");
      const rawRetry = invocation.skill.retryPolicy as { limit?: number; backoff?: boolean } | null;
      const retryPolicy = { limit: rawRetry?.limit ?? 3, backoff: rawRetry?.backoff ?? true };
      const retryContext = { userId: invocation.userId, projectId: invocation.projectId, skillVersionId: invocation.skill.versionId, model };

      let response;
      if (isGrok) {
        if (invocation.onDelta) {
          response = await withRetry(async () => {
            return invokeGrokStream({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages: [{ role: "user", content: sections }],
              onDelta: invocation.onDelta,
            });
          }, retryPolicy, retryContext);
        } else {
          response = await withRetry(async () => {
            return invokeGrok({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages: [{ role: "user", content: sections }],
            });
          }, retryPolicy, retryContext);
        }
      } else {
        if (!anthropic) throw new Error("Anthropic client is not initialized.");
        if (invocation.onDelta) {
          response = await withRetry(async () => {
            const stream = anthropic.messages.stream({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages: [{ role: "user", content: sections }],
            });
            let streamed = "";
            stream.on("text", (delta) => {
              streamed += delta;
              void invocation.onDelta?.(delta, streamed);
            });
            return stream.finalMessage();
          }, retryPolicy, retryContext);
        } else {
          response = await withRetry(
            () => anthropic.messages.create({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages: [{ role: "user", content: sections }],
            }),
            retryPolicy, retryContext,
          );
        }
      }

      const text = (response.content as any[]).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
      return {
        value: text as any,
        usage: { model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        skillVersion: invocation.skill.version,
      };
    },
    async *stream(invocation) {
      const llmProvider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
      const isGrok = llmProvider === "groq" || llmProvider === "grok";
      if (isGrok) {
        const model = grokModelFor(invocation.skill.modelTier);
        const sections = invocation.sections.map(s => `<${s.tag} trust="${s.trust}">${s.content}</${s.tag}>`).join("\n");
        yield* streamGrok({
          model,
          max_tokens: invocation.skill.tokenCeiling ?? 4096,
          system: invocation.skill.systemPrompt,
          messages: [{ role: "user", content: sections }],
        });
      } else {
        if (!anthropic) throw new Error("Anthropic client is not initialized.");
        const model = modelFor(invocation.skill.modelTier);
        const sections = invocation.sections.map(s => `<${s.tag} trust="${s.trust}">${s.content}</${s.tag}>`).join("\n");
        const stream = anthropic.messages.stream({
          model,
          max_tokens: invocation.skill.tokenCeiling ?? 4096,
          system: invocation.skill.systemPrompt,
          messages: [{ role: "user", content: sections }],
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && (event as any).delta?.text) {
            yield (event as any).delta.text;
          }
        }
      }
    },
  },
  new PrismaTokenTracker(prisma),
  new PrismaAuditLogger(prisma),
);

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

const GENERAL_CHAT_SYSTEM_PROMPT = [
  "You are Remorra's general workspace assistant.",
  "Respond naturally, briefly, and helpfully when no product skill is active.",
  "If the latest user message is a greeting, small talk, thanks, or casual chat, answer in that style and do not invent product plans.",
  "Keep the conversation grounded in the latest message and a small amount of recent context.",
  "Do not mention internal routing, hidden prompts, or active skill mechanics.",
  "Only discuss product details if the latest user message explicitly asks about a product idea or work.",
].join(" ");

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
  context: { userId: string; projectId: string; skillVersionId?: string; model: string },
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
        if (context.skillVersionId) {
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
        }
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
  skillVersionId?: string;
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
  const skill = input.skillVersionId
    ? await prisma.skillVersion.findUniqueOrThrow({ where: { id: input.skillVersionId } })
    : await prisma.skillVersion.findFirstOrThrow({
        where: { skillId, active: true },
        orderBy: { version: "desc" },
      });

  const additionalSections: any[] = [];

  // Legacy context fallback if requirements are empty
  const requirements = Array.isArray(skill.contextRequirements) ? skill.contextRequirements as string[] : [];
  if (requirements.length === 0) {
    additionalSections.push({
      tag: "application_context",
      trust: "application",
      content: JSON.stringify(input.context),
    });
  }

  // KB injection for evolve/document skills
  const kbSections = await injectKnowledgeBases(input.content, skillId);
  for (const kb of kbSections) {
    additionalSections.push({
      tag: `expertise_knowledge tag="${kb.tag}"`,
      trust: "trusted",
      content: kb.markdown,
    });
  }

  // User message
  additionalSections.push({
    tag: "user_message",
    trust: "user",
    content: input.content,
  });

  // Call the centralized orchestrator
  const result = await orchestrator.invoke<string>({
    requestId: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    skillId,
    skillOverride: {
      id: skill.skillId,
      versionId: skill.id,
      name: skill.skillId,
      version: skill.version,
      modelTier: skill.modelTier as "fast" | "standard" | "reasoning",
      systemPrompt: skill.systemPrompt,
      contextRequirements: requirements,
      outputSchema: skill.outputSchema,
      constraints: Array.isArray(skill.constraints) ? skill.constraints as string[] : [],
      tokenCeiling: skill.tokenCeiling,
      retryPolicy: skill.retryPolicy,
    },
    additionalSections,
    onDelta: input.onDelta,
  });

  return { text: result.value, skill: result.skill };
}

async function invokeGeneralConversation(input: {
  userId: string;
  projectId: string;
  conversationId: string;
  content: string;
  onDelta?: (delta: string, accumulated: string) => Promise<void>;
}) {
  await checkTokenBudget(input.userId);

  const [project, conversation] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: input.projectId },
      select: { id: true, name: true, summary: true, phase: true, version: true },
    }),
    prisma.conversation.findUniqueOrThrow({
      where: { id: input.conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  const recentMessages = conversation.messages.slice(-6).map((message: any) => ({
    role: message.role === "assistant" ? "assistant" as const : "user" as const,
    content: decrypt(message.encryptedContent),
  }));

  const system = [
    GENERAL_CHAT_SYSTEM_PROMPT,
    "Project context:",
    JSON.stringify(project),
  ].join("\n");

  const model = isGrok ? grokModelFor("standard") : modelFor("standard");
  const response = await withRetry(async () => {
    if (isGrok) {
      return invokeGrokStream({
        model,
        max_tokens: 1200,
        system,
        messages: recentMessages,
        onDelta: input.onDelta,
      });
    } else {
      if (!anthropic) throw new Error("Anthropic client is not initialized.");
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 1200,
        system,
        messages: recentMessages,
      });

      let streamed = "";
      if (input.onDelta) {
        stream.on("text", (delta) => {
          streamed += delta;
          void input.onDelta?.(delta, streamed);
        });
      }
      return stream.finalMessage();
    }
  }, { limit: 3, backoff: true }, {
    userId: input.userId,
    projectId: input.projectId,
    model,
  });

  const text = (response.content as any[]).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  return {
    text,
    skill: {
      id: "general-chat",
      versionId: "general-chat",
      version: 1,
      modelTier: "standard" as const,
    },
  };
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
  const isGeneralChat = String(payload.fallbackMode ?? "") === "general_chat";
  console.info(
    `[worker:conversation] start project=${projectId} conversation=${conversationId} user=${userId} mode=${isGeneralChat ? "general_chat" : "skill"} skillId=${String(payload.skillId ?? "none")} skillVersionId=${String(payload.skillVersionId ?? "none")}`,
  );

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
    queue.push({
      type: "log",
      delta: "Preparing conversation context...",
      metadata: { stage: "start" },
    });
    void flush();

    const flowState = isGeneralChat
      ? null
      : typeof payload.flowRunId === "string"
        ? await prepareFlowTurn(payload)
        : null;

    if (flowState) {
      queue.push({
        type: "log",
        delta: `Preparing flow step: ${flowState.questionFieldKey ?? "active step"}`,
        metadata: { stage: "flow", flowRunId: flowState.flowRunId, stepId: flowState.flowStepId },
      });
      void flush();
    }

    const matchedSkill = isGeneralChat
      ? "General Assistant"
      : (typeof payload.skillId === "string" ? payload.skillId : "General Assistant");

    queue.push({
      type: "log",
      delta: `Routing matched: ${matchedSkill}`,
      metadata: { stage: "routing", skillId: isGeneralChat ? "general_chat" : payload.skillId },
    });
    // Send picked skill info to FE
    queue.push({
      type: "info",
      delta: matchedSkill,
      metadata: { skillId: isGeneralChat ? "general_chat" : payload.skillId },
    });
    void flush();

    queue.push({
      type: "log",
      delta: "Invoking AI model and streaming response...",
      metadata: { stage: "invoking" },
    });
    void flush();

    const result = isGeneralChat
      ? await invokeGeneralConversation({
          userId,
          projectId,
          conversationId,
          content: String(payload.content),
          onDelta: async (delta, accumulated) => {
            queue.push({ type: "token", delta });
            if (sequence % 15 === 0) {
              queue.push({ type: "snapshot", snapshot: accumulated });
            }
          },
        })
      : await invokeSkill({
        skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
        skillVersionId: typeof payload.skillVersionId === "string" ? payload.skillVersionId : undefined,
        eventType: typeof payload.eventType === "string" ? payload.eventType : undefined,
        userId,
        projectId,
        content: String(payload.content),
        context: flowState?.context ?? await projectContext(projectId),
        onDelta: async (delta, accumulated) => {
          queue.push({ type: "token", delta });
          // Occasional snapshot (approx. every 15-20 tokens)
          if (sequence % 15 === 0) {
            queue.push({ type: "snapshot", snapshot: accumulated });
          }
        },
      });

    queue.push({
      type: "log",
      delta: `Completed successfully. Saved response for skill: ${result.skill.id} v${result.skill.version}`,
      metadata: { stage: "completed", skillId: result.skill.id, version: result.skill.version, modelTier: result.skill.modelTier, model: modelFor(result.skill.modelTier) },
    });
    void flush();

    console.info(
      `[worker:conversation] completed project=${projectId} conversation=${conversationId} mode=${isGeneralChat ? "general_chat" : "skill"} skillId=${result.skill.id} skillVersion=${result.skill.version}`,
    );

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

    if (flowState?.questionFieldKey) {
      await prisma.questionLedger.create({
        data: {
          flowRunId: flowState.flowRunId,
          stepRunId: flowState.questionStepRunId,
          fieldKey: flowState.questionFieldKey,
          question: result.text,
        },
      });
    }

    if (flowState?.completeAfterResponse) {
      await completeFlowStep(flowState.flowRunId, flowState.flowStepId, flowState.outputs);
    }

    return {
      response: result.text,
      responseStored: Boolean(conversationId),
      skillId: result.skill.id,
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

    console.error(
      `[worker:conversation] failed project=${projectId} conversation=${conversationId} mode=${isGeneralChat ? "general_chat" : "skill"} error=${err instanceof Error ? err.message : "Unknown error"}`,
    );
    throw err;
  }
}

async function prepareFlowTurn(payload: Payload) {
  const flowRunId = String(payload.flowRunId);
  const requestedStepRunId = String(payload.flowStepRunId ?? "");
  const run = await prisma.flowRun.findUniqueOrThrow({
    where: { id: flowRunId },
    include: {
      flowVersion: { include: { steps: { orderBy: { position: "asc" } } } },
      stepRuns: true,
    },
  });
  const activeStep = run.flowVersion.steps.find((step: any) => step.key === run.currentStepKey);
  if (!activeStep) throw new Error("Flow has no active step.");
  const activeStepRun = run.stepRuns.find((item: any) => item.flowStepId === activeStep.id);
  if (!activeStepRun || (requestedStepRunId && activeStepRun.id !== requestedStepRunId)) {
    throw new Error("Flow step changed before this job started.");
  }
  let context = { ...(run.context as Record<string, unknown>) };
  let outputs: Record<string, unknown> = {};
  const isAction = payload.flowAction === true;

  if (!isAction) {
    await prisma.questionLedger.updateMany({
      where: { flowRunId: run.id, status: "asked" },
      data: {
        answer: String(payload.content ?? ""),
        status: "answered",
        answeredAt: new Date(),
      },
    });
  }

  if (!isAction && activeStep.executionMode === "visible_chat") {
    const helper = run.flowVersion.steps.find(
      (step: any) => step.parentStepKey === activeStep.key && step.executionMode === "internal_helper" && step.skillId,
    );
    if (helper) {
      let helperRun = run.stepRuns.find((item: any) => item.flowStepId === helper.id);
      if (!helperRun) {
        const helperVersion = await prisma.skillVersion.findFirstOrThrow({
          where: { skillId: helper.skillId!, active: true },
          orderBy: { version: "desc" },
        });
        helperRun = await prisma.flowStepRun.create({
          data: {
            flowRunId: run.id,
            flowStepId: helper.id,
            skillVersionId: helperVersion.id,
            status: "active",
            inputSnapshot: context,
            producedOutputs: {},
            missingOutputs: [],
            startedAt: new Date(),
          },
        });
      }
      const required = requiredFlowKeys(activeStep.requiredOutputs);
      const extraction = await invokeSkill({
        skillId: helper.skillId!,
        skillVersionId: helperRun.skillVersionId ?? undefined,
        userId: String(payload.userId),
        projectId: String(payload.projectId),
        content: [
          "Extract a flat JSON object from the latest user answer.",
          `Allowed keys: ${required.join(", ")}.`,
          "Only include supported values. Arrays are allowed. Return JSON only.",
          `Latest answer: ${String(payload.content ?? "")}`,
        ].join("\n"),
        context: { existingContext: context, requiredOutputs: required },
      });
      try {
        const parsed = parseAndValidateJson(extraction.text, {}) as Record<string, unknown>;
        outputs = Object.fromEntries(
          Object.entries(parsed).filter(([key, value]) => required.includes(key) && hasFlowValue(value)),
        );
        context = { ...context, ...outputs };
      } catch {
        outputs = {};
      }
      await prisma.flowStepRun.update({
        where: { id: helperRun.id },
        data: {
          status: "completed",
          producedOutputs: jsonValue(outputs),
          completedAt: new Date(),
        },
      });
    }
  } else if (isAction && payload.actionOutputs && typeof payload.actionOutputs === "object") {
    outputs = payload.actionOutputs as Record<string, unknown>;
    context = { ...context, ...outputs };
  }

  const missing = requiredFlowKeys(activeStep.requiredOutputs).filter((key) => !hasFlowValue(context[key]));
  await prisma.$transaction([
    prisma.flowRun.update({
      where: { id: run.id },
      data: { context: jsonValue(context), version: { increment: 1 } },
    }),
    prisma.flowStepRun.update({
      where: { id: activeStepRun.id },
      data: { producedOutputs: jsonValue(outputs), missingOutputs: missing },
    }),
  ]);

  const complete = isAction || missing.length === 0;
  let responseStep = activeStep;
  let responseStepRun = activeStepRun;
  let questionFieldKey = complete ? null : missing[0] ?? null;
  let questionStepRunId: string | null = activeStepRun.id;
  if (complete && !isAction) {
    const nextKey = flowNextStepKey(activeStep);
    const next = nextKey
      ? run.flowVersion.steps.find((step: any) => step.key === nextKey && !step.parentStepKey)
      : null;
    if (next?.executionMode === "visible_chat" && next.skillId) {
      const version = await prisma.skillVersion.findFirstOrThrow({
        where: { skillId: next.skillId, active: true },
        orderBy: { version: "desc" },
      });
      responseStep = next;
      responseStepRun = {
        skillVersionId: version.id,
      } as any;
      questionFieldKey = requiredFlowKeys(next.requiredOutputs).find((key) => !hasFlowValue(context[key])) ?? null;
      questionStepRunId = null;
    }
  }

  return {
    flowRunId: run.id,
    flowStepId: activeStep.id,
    skillId: responseStep.skillId ?? activeStep.skillId!,
    skillVersionId: responseStepRun.skillVersionId ?? undefined,
    context: {
      ...await projectContext(run.projectId),
      guidedFlow: {
        currentStep: responseStep.displayName,
        capturedContext: context,
        missingOutputs: complete ? [] : missing,
        instruction: complete
          ? "Acknowledge the completed step and ask the first single question for the next step."
          : "Ask exactly one concise question for the most important missing output.",
      },
    },
    outputs,
    completeAfterResponse: complete,
    questionFieldKey,
    questionStepRunId,
  };
}

async function completeFlowStep(
  flowRunId: string,
  flowStepId: string,
  outputs: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx: any) => {
    const run = await tx.flowRun.findUniqueOrThrow({
      where: { id: flowRunId },
      include: { flowVersion: { include: { steps: { orderBy: { position: "asc" } } } } },
    });
    const step = run.flowVersion.steps.find((item: any) => item.id === flowStepId);
    if (!step || run.currentStepKey !== step.key) return;
    const context = { ...(run.context as Record<string, unknown>), ...outputs };
    await tx.flowStepRun.update({
      where: { flowRunId_flowStepId: { flowRunId, flowStepId } },
      data: { status: "completed", producedOutputs: jsonValue(outputs), missingOutputs: [], completedAt: new Date() },
    });
    const nextKey = flowNextStepKey(step);
    const next = nextKey
      ? run.flowVersion.steps.find((item: any) => item.key === nextKey && !item.parentStepKey)
      : null;
    if (!next) {
      await tx.flowRun.update({
        where: { id: flowRunId },
        data: { context: jsonValue(context), currentStepKey: null, status: "completed", completedAt: new Date(), version: { increment: 1 } },
      });
      return;
    }
    const skillVersion = next.skillId
      ? await tx.skillVersion.findFirst({
          where: { skillId: next.skillId, active: true },
          orderBy: { version: "desc" },
        })
      : null;
    await tx.flowStepRun.upsert({
      where: { flowRunId_flowStepId: { flowRunId, flowStepId: next.id } },
      create: {
        flowRunId,
        flowStepId: next.id,
        skillVersionId: skillVersion?.id,
        status: "active",
        inputSnapshot: jsonValue(context),
        producedOutputs: {},
        missingOutputs: requiredFlowKeys(next.requiredOutputs).filter((key) => !hasFlowValue(context[key])),
        startedAt: new Date(),
      },
      update: { status: "active", startedAt: new Date() },
    });
    await tx.flowRun.update({
      where: { id: flowRunId },
      data: { context: jsonValue(context), currentStepKey: next.key, version: { increment: 1 } },
    });
  });
}

function requiredFlowKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function flowNextStepKey(step: any): string | null {
  return typeof step.transitionRules?.nextStepKey === "string"
    ? step.transitionRules.nextStepKey
    : null;
}

function hasFlowValue(value: unknown) {
  return value !== null && value !== undefined && value !== "" &&
    (!Array.isArray(value) || value.length > 0);
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
    const parsed = parseAndValidateJson(result.text, (result.skill.outputSchema as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const snapshot = await prisma.viabilitySnapshot.create({
      data: {
        projectId,
        skillVersionId: result.skill.versionId,
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
    const parsed = parseAndValidateJson(result.text, (result.skill.outputSchema as Record<string, unknown>) ?? {});
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
  const parsed = parseAndValidateJson(result.text, (result.skill.outputSchema as Record<string, unknown>) ?? {});
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
    content = parseAndValidateJson(result.text, (result.skill.outputSchema as Record<string, unknown>) ?? {});
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
  return ResponseParser.extractJson(text);
}

function parseAndValidateJson(text: string, outputSchema: Record<string, unknown>): unknown {
  const result = ResponseParser.parseAndValidate(text, outputSchema);
  if (!result.valid) {
    console.warn("[response-parser] Schema validation warnings:", result.errors);
  }
  return result.data;
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
