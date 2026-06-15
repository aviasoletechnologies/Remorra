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

async function invokeSkill(input: {
  skillId?: string;
  eventType?: string;
  userId: string;
  projectId: string;
  content: string;
  context: unknown;
  onText?: (text: string) => Promise<void>;
}) {
  const skillId = input.skillId ?? await resolveSkillId(input.eventType);
  const skill = await prisma.skillVersion.findFirstOrThrow({
    where: { skillId, active: true },
    orderBy: { version: "desc" },
  });
  const model = modelFor(skill.modelTier);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: skill.tokenCeiling,
    system: skill.systemPrompt,
    messages: [
      {
        role: "user",
        content: `<application_context>${JSON.stringify(input.context)}</application_context>`,
      },
      { role: "user", content: `<user_message>${input.content}</user_message>` },
    ],
  };
  let response;
  if (input.onText) {
    const stream = anthropic.messages.stream(request);
    let streamed = "";
    let lastPublished = 0;
    stream.on("text", (delta) => {
      streamed += delta;
      if (streamed.length - lastPublished >= 40) {
        lastPublished = streamed.length;
        void input.onText?.(streamed);
      }
    });
    response = await stream.finalMessage();
    await input.onText(streamed);
  } else {
    response = await anthropic.messages.create(request);
  }
  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  await prisma.tokenUsage.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      skillVersionId: skill.id,
      requestId: randomUUID(),
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costMinor: 0,
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
  const result = await invokeSkill({
    skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
    eventType: typeof payload.eventType === "string" ? payload.eventType : undefined,
    userId,
    projectId,
    content: String(payload.content),
    context: await projectContext(projectId),
    onText: async (text) => {
      await prisma.jobRecord.update({
        where: { id: payload.jobRecordId },
        data: { result: jsonValue({ stream: text, complete: false }) },
      });
    },
  });
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
  const title = document.reportGeneration?.definition.name ?? document.type;
  const reportContent = document.reportGeneration?.content?.structuredContent;
  let content = reportContent ?? (await projectContext(project.id));
  if (document.type === "build-pack") {
    const activeCycle = await prisma.cycle.findFirst({
      where: { projectId: project.id, status: "active" },
    });
    const snapshot = await prisma.buildPackSnapshot.create({
      data: {
        projectId: project.id,
        cycleId: activeCycle?.id,
        content: jsonValue(content),
      },
    });
    content = { snapshotId: snapshot.id, generatedAt: snapshot.createdAt, ...content as object };
  }
  const html = renderHtml(title, project.name, content);
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
