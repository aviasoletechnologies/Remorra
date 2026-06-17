import puppeteer from "puppeteer";
import Ajv from "ajv";
import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";
import { boss } from "../lib/boss";
import { jsonValue, parseAndValidateJson, escapeHtml } from "../lib/utils";
import { projectContext } from "../assemblers/context";
import {
  assembleFounderPackData,
  assembleProductPackData,
  assembleInvestorPackData,
  assembleBuildPackData,
} from "../assemblers/packs";
import { invokeSkill } from "../assemblers/skills";
import type { Payload } from "./conversation";

const ajv = new Ajv({ allErrors: true, strict: false });

export async function handleDocument(payload: Payload) {
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
  if (
    document.type === "founder-pack" ||
    document.type === "product-pack" ||
    document.type === "investor-pack" ||
    document.type === "build-pack"
  ) {
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
      throw new Error(
        `Data validation failed for template ${templateId}: ${ajv.errorsText(validate.errors)}`,
      );
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

export async function handleSummary(payload: Payload) {
  const kind = String(payload.kind);
  const resourceId = String(payload.resourceId);
  const resource =
    kind === "meeting"
      ? await prisma.dailyMeeting.findUniqueOrThrow({ where: { id: resourceId } })
      : await prisma.retrospective.findUniqueOrThrow({ where: { id: resourceId } });
  const result = await invokeSkill({
    skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
    eventType: typeof payload.eventType === "string" ? payload.eventType : undefined,
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

export async function handleReport(payload: Payload) {
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
    content = parseAndValidateJson(
      result.text,
      (result.skill.outputSchema as Record<string, unknown>) ?? {},
    );
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

export function renderHtml(title: string, subtitle: string, content: unknown) {
  const sections = escapeHtml(JSON.stringify(content, null, 2));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#17211b}header{border-bottom:3px solid #23694a;padding-bottom:18px;margin-bottom:24px}
  .brand{color:#23694a;font-weight:700;letter-spacing:2px;font-size:11px}h1{font-size:28px;margin:8px 0}
  p,pre{font-size:10px;line-height:1.55;color:#445149}pre{white-space:pre-wrap;background:#f5f7f4;padding:14px;border-radius:8px}
  footer{position:fixed;bottom:0;color:#68736b;font-size:9px}</style></head><body>
  <header><div class="brand">REMORRA</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header>
  <pre>${sections}</pre><footer>Generated by Remorra Product Intelligence</footer></body></html>`;
}
