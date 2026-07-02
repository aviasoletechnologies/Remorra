import puppeteer from "puppeteer";
import Ajv from "ajv";
import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";
import { boss } from "../lib/boss";
import { jsonValue, parseAndValidateJson, escapeHtml } from "../lib/utils";
import { assembleProductPackData, assembleBuildPackData } from "../assemblers/packs";
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

  const jobId = payload.jobRecordId;
  const projectId = document.projectId;
  const userId = document.reportGeneration?.requestedById ?? (payload.userId ? String(payload.userId) : null);

  // Fetch the current max sequence for this jobId to handle retries safely
  const maxEvent = jobId
    ? await prisma.jobStreamEvent.findFirst({
        where: { jobId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      })
    : null;
  let sequence = (maxEvent?.sequence ?? 0) + 1;

  const logStream = async (message: string, stage?: string, type = "log", extraMetadata?: any) => {
    if (!jobId) return;
    try {
      await prisma.jobStreamEvent.create({
        data: {
          jobId,
          projectId: projectId || null,
          userId: userId || null,
          sequence: sequence++,
          type,
          delta: message,
          metadata: jsonValue({
            stage,
            ...extraMetadata,
          }),
        },
      });
    } catch (err) {
      console.error("[worker:document] failed to write JobStreamEvent", err);
    }
  };

  try {
    await logStream("Initializing PDF rendering engine...", "start");
    await logStream(document.type, "routing", "info", { skillId: document.type });
    await logStream("PDF Compiler", "invoking", "completed", { model: "Puppeteer PDF Engine" });

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: document.projectId },
    });

    // 1. Determine template key
    await logStream("Locating active document template...", "find_template");
    let templateId = "";
    if (document.type === "product-pack") {
      templateId = document.type;
    } else if (document.type.startsWith("build-pack:")) {
      templateId = "build-pack";
    } else if (document.type.startsWith("build-sync-instructions:")) {
      templateId = "build-sync-instructions";
    } else if (document.type.startsWith("report:")) {
      const reportDefId = document.type.substring(7);
      const reportDefVer = await prisma.reportDefinitionVersion.findFirst({
        where: { reportDefinitionId: reportDefId, active: true },
      });
      templateId = reportDefVer?.templateKey ?? "report-default";
    } else {
      templateId = "report-default";
    }

    // 2. Fetch active template version (bypassed for chat-report)
    let activeTemplateVer: any = null;
    if (document.type !== "chat-report") {
      activeTemplateVer = await prisma.documentTemplateVersion.findFirst({
        where: { documentTemplateId: templateId, active: true },
      });
      if (!activeTemplateVer) {
        throw new Error(`No active template version found for template key: ${templateId}`);
      }
    }

    // 3. Assemble data
    await logStream("Assembling document data context...", "assemble_data");
    const reportContent = document.reportGeneration?.content?.structuredContent;
    let content: any = {};
    if (document.type === "product-pack") {
      content = await assembleProductPackData(project.id);
    } else if (document.type.startsWith("build-pack:")) {
      content = await assembleBuildPackData(document.type.substring("build-pack:".length));
    } else if (document.type.startsWith("build-sync-instructions:")) {
      content = { buildPhaseId: document.type.substring("build-sync-instructions:".length) };
    } else {
      content = reportContent ?? {};
    }

    // 4. Validate payload using AJV (bypassed for chat-report)
    if (document.type !== "chat-report" && activeTemplateVer?.schema) {
      await logStream("Validating payload data schema...", "validate_schema");
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
    await logStream("Compiling HTML layout structure...", "compile_html");
    let html = "";
    if (document.type === "chat-report") {
      const text = (content as any)?.text || "";
      html = renderChatReportHtml("Generated Report", text);
    } else {
      const renderedBody = renderTemplate(activeTemplateVer.html, content);
      html = `<!doctype html><html><head><meta charset="utf-8"><style>${activeTemplateVer.css}</style></head><body>${renderedBody}</body></html>`;
    }

    // 6. Launch Puppeteer (sandbox blocked network)
    await logStream("Launching Puppeteer browser instance...", "launch_puppeteer");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      await logStream("Setting viewport and rendering layout PDF...", "render_pdf");
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
      
      await logStream("Uploading generated PDF artifact to storage...", "upload_storage");
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      
      await logStream("Finalizing storage and GeneratedDocument references...", "finalize_refs");
      const storageObject = await prisma.storageObject.upsert({
        where: { path },
        create: {
          projectId: project.id,
          bucket,
          path,
          mimeType: "application/pdf",
          sizeBytes: bytes.byteLength,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          sizeBytes: bytes.byteLength,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.generatedDocument.update({
        where: { id: document.id },
        data: {
          status: "completed",
          storageObject: { connect: { id: storageObject.id } },
          expiresAt: storageObject.expiresAt,
          templateVer: activeTemplateVer ? { connect: { id: activeTemplateVer.id } } : undefined,
          templateVersion: activeTemplateVer?.version ?? 1,
        },
      });
      if (document.reportGenerationId) {
        await prisma.reportGeneration.update({
          where: { id: document.reportGenerationId },
          data: { status: "completed", completedAt: new Date() },
        });
      }

      if (document.type.startsWith("build-pack:")) {
        const buildPhaseId = document.type.substring("build-pack:".length);
        await updateBuildPackField(buildPhaseId, { prdDocumentId: document.id });
      } else if (document.type.startsWith("build-sync-instructions:")) {
        const buildPhaseId = document.type.substring("build-sync-instructions:".length);
        await updateBuildPackField(buildPhaseId, { buildSyncInstructionsObjectId: storageObject.id });
      }

      await logStream("PDF generation completed successfully!", "completed", "completed");
      return { documentId: document.id, path };
    } finally {
      await browser.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStream(`PDF generation failed: ${message}`, "failed", "failed");
    if (document.type.startsWith("build-pack:") || document.type.startsWith("build-sync-instructions:")) {
      const buildPhaseId = document.type.split(":")[1]!;
      await prisma.buildPack.upsert({
        where: { buildPhaseId },
        create: { buildPhaseId, status: "failed" },
        update: { status: "failed" },
      }).catch(() => undefined);
    }
    throw err;
  }
}

async function updateBuildPackField(buildPhaseId: string, data: Record<string, unknown>) {
  const pack = await prisma.buildPack.upsert({
    where: { buildPhaseId },
    create: { buildPhaseId, ...data },
    update: data,
  });
  const allArtefactsReady = Boolean(
    pack.prdDocumentId && pack.buildSyncFileObjectId && pack.buildSyncInstructionsObjectId && pack.projectContextSnapshot,
  );
  if (allArtefactsReady && pack.status !== "completed") {
    await prisma.buildPack.update({
      where: { buildPhaseId },
      data: { status: "completed", completedAt: new Date() },
    });
  }
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
  const snapshot = await assembleProductPackData(generation.projectId);
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

export function renderChatReportHtml(title: string, text: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background: #ffffff;
      line-height: 1.6;
      padding: 20px;
    }
    header {
      border-bottom: 2px solid #059669;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .brand {
      color: #059669;
      font-weight: 700;
      letter-spacing: 1px;
      font-size: 12px;
      text-transform: uppercase;
    }
    h1 {
      font-size: 24px;
      margin: 6px 0 0 0;
      color: #111827;
    }
    .content {
      font-size: 14px;
      white-space: pre-wrap;
    }
    footer {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
      color: #9ca3af;
      font-size: 10px;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">Remorra Intelligence</div>
    <h1>${escapeHtml(title)}</h1>
  </header>
  <div class="content">${escapeHtml(text)}</div>
  <footer>Generated by Remorra Product Intelligence</footer>
</body>
</html>`;
}
