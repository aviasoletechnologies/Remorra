import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";
import { boss } from "../lib/boss";
import { jsonValue } from "../lib/utils";
import { assembleBuildSyncCsv, buildSyncCsvColumns } from "../assemblers/packs";
import type { Payload } from "./conversation";

async function enqueueDocumentRender(projectId: string, documentType: string) {
  const document = await prisma.generatedDocument.create({
    data: { projectId, type: documentType, templateVersion: 1 },
  });
  const jobRecord = await prisma.jobRecord.create({
    data: {
      projectId,
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
  return document.id;
}

export async function handleBuildPackGenerate(payload: Payload) {
  const buildPhaseId = String(payload.buildPhaseId);
  const buildPhase = await prisma.buildPhase.findUniqueOrThrow({
    where: { id: buildPhaseId },
    include: { project: true },
  });

  await prisma.buildPack.upsert({
    where: { buildPhaseId },
    create: { buildPhaseId, status: "generating" },
    update: { status: "generating" },
  });

  // Build Sync File — clean export, blank statuses
  const csv = await assembleBuildSyncCsv(buildPhaseId, true);
  const syncPath = `${buildPhase.projectId}/build-phases/${buildPhaseId}/build-sync-file.csv`;
  const { error: syncUploadError } = await supabase.storage
    .from(bucket)
    .upload(syncPath, Buffer.from(csv, "utf-8"), { contentType: "text/csv", upsert: true });
  if (syncUploadError) throw syncUploadError;
  const syncStorageObject = await prisma.storageObject.upsert({
    where: { path: syncPath },
    create: {
      projectId: buildPhase.projectId,
      bucket,
      path: syncPath,
      mimeType: "text/csv",
      sizeBytes: Buffer.byteLength(csv, "utf-8"),
    },
    update: { sizeBytes: Buffer.byteLength(csv, "utf-8") },
  });

  // project.context snapshot at time of generation
  const projectContextSnapshot = buildPhase.project.context ?? {};

  await prisma.buildPack.update({
    where: { buildPhaseId },
    data: {
      buildSyncFileObjectId: syncStorageObject.id,
      projectContextSnapshot: jsonValue(projectContextSnapshot),
    },
  });

  // PRD + Build Sync Instructions render async via the existing document.render pipeline
  await enqueueDocumentRender(buildPhase.projectId, `build-pack:${buildPhaseId}`);
  await enqueueDocumentRender(buildPhase.projectId, `build-sync-instructions:${buildPhaseId}`);

  return { buildPhaseId, buildSyncColumns: buildSyncCsvColumns() };
}

export async function handleBuildSyncExport(payload: Payload) {
  const buildPhaseId = String(payload.buildPhaseId);
  const buildPhase = await prisma.buildPhase.findUniqueOrThrow({ where: { id: buildPhaseId } });

  const csv = await assembleBuildSyncCsv(buildPhaseId, true);
  const path = `${buildPhase.projectId}/build-phases/${buildPhaseId}/build-sync-export-${Date.now()}.csv`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(csv, "utf-8"), { contentType: "text/csv", upsert: true });
  if (error) throw error;
  const storageObject = await prisma.storageObject.create({
    data: {
      projectId: buildPhase.projectId,
      bucket,
      path,
      mimeType: "text/csv",
      sizeBytes: Buffer.byteLength(csv, "utf-8"),
    },
  });

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 900);
  if (signError) throw signError;

  return { storageObjectId: storageObject.id, path, downloadUrl: signed.signedUrl };
}

export async function handleBuildSyncIngest(payload: Payload) {
  const uploadId = String(payload.buildSyncUploadId);

  try {
    const upload = await prisma.buildSyncUpload.findUniqueOrThrow({
      where: { id: uploadId },
      include: { buildPhase: true, storageObject: true },
    });

    await prisma.buildSyncUpload.update({ where: { id: uploadId }, data: { status: "running" } });

    const { data, error } = await supabase.storage.from(bucket).download(upload.storageObject.path);
    if (error) throw error;
    const text = await data.text();
    const rows = parseBuildSyncCsv(text);

    // Validate every row's buildPhaseIdentifier matches this upload's Build Phase
    // before mapping any statuses — reject the whole file on a mismatch rather
    // than silently applying a partial update.
    const unknownRows = rows.filter((row) => row.buildPhaseIdentifier !== upload.buildPhaseId);
    if (rows.length === 0 || unknownRows.length > 0) {
      throw new Error(
        `Build Sync File does not match Build Phase ${upload.buildPhaseId} (${unknownRows.length} mismatched row(s)).`,
      );
    }

    const validStatuses = new Set(["ready", "in_progress", "review", "done"]);
    let updated = 0;
    for (const row of rows) {
      if (!row.status || !validStatuses.has(row.status)) continue;
      const result = await prisma.story.updateMany({
        where: { id: row.storyId, buildPhaseId: upload.buildPhaseId },
        data: { status: row.status as any },
      });
      updated += result.count;
    }

    await prisma.buildSyncUpload.update({
      where: { id: uploadId },
      data: { status: "completed", ingestedAt: new Date(), buildPhaseIdentifier: upload.buildPhaseId },
    });
    return { uploadId, storiesUpdated: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.buildSyncUpload.update({ where: { id: uploadId }, data: { status: "failed", error: message } });
    throw err;
  }
}

function parseBuildSyncCsv(text: string): Array<{ buildPhaseIdentifier: string; storyId: string; status: string }> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0]!.split(",").map((h) => h.trim());
  const idIdx = header.indexOf("buildPhaseIdentifier");
  const storyIdx = header.indexOf("storyId");
  const statusIdx = header.indexOf("status");
  if (idIdx === -1 || storyIdx === -1 || statusIdx === -1) {
    throw new Error("Build Sync File is missing required columns: buildPhaseIdentifier, storyId, status.");
  }
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(",");
    return {
      buildPhaseIdentifier: (cols[idIdx] ?? "").trim(),
      storyId: (cols[storyIdx] ?? "").trim(),
      status: (cols[statusIdx] ?? "").trim(),
    };
  });
}
