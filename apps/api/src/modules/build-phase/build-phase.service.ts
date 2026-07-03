import { Injectable } from "@nestjs/common";
import {
  createBuildPhaseSchema,
  updateBuildPhaseSchema,
  assignBuildPhaseStoriesSchema,
} from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { StorageService } from "../../infrastructure/storage.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { forbidden, notFound, versionConflict } from "../../shared/http-errors.js";

@Injectable()
export class BuildPhaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  async list(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.buildPhase.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { pack: true, _count: { select: { stories: true } } },
    });
  }

  async get(projectId: string, buildPhaseId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({
      where: { id: buildPhaseId },
      include: { stories: { include: { epic: true } } },
    });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    const [brandKitUrl, userFlowUrl] = await Promise.all([
      this.signedUrlForStorageObject(buildPhase!.brandKitObjectId),
      this.signedUrlForStorageObject(buildPhase!.userFlowObjectId),
    ]);

    return { ...buildPhase, brandKitUrl, userFlowUrl };
  }

  async create(projectId: string, userId: string, body: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = createBuildPhaseSchema.parse(body);
    const buildPhase = await this.prisma.client.buildPhase.create({
      data: { projectId, name: data.name, description: data.description ?? null },
    });
    await this.logAudit(projectId, userId, "build_phase.create", buildPhase.id, null, buildPhase);
    return buildPhase;
  }

  async update(
    projectId: string,
    buildPhaseId: string,
    userId: string,
    version: number,
    body: unknown,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = updateBuildPhaseSchema.parse(body);

    const before = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!before || before.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    const result = await this.prisma.client.buildPhase.updateMany({
      where: { id: buildPhaseId, projectId, version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        version: { increment: 1 },
      },
    });
    if (!result.count) versionConflict(before!.version);

    const after = await this.prisma.client.buildPhase.findUniqueOrThrow({ where: { id: buildPhaseId } });
    await this.logAudit(projectId, userId, "build_phase.update", buildPhaseId, before, after);
    return after;
  }

  async assignStories(projectId: string, buildPhaseId: string, userId: string, body: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const { storyIds } = assignBuildPhaseStoriesSchema.parse(body);

    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    const result = await this.prisma.client.story.updateMany({
      where: { id: { in: storyIds }, projectId },
      data: { buildPhaseId },
    });

    await this.logAudit(projectId, userId, "build_phase.stories_assigned", buildPhaseId, null, {
      storyIds,
      count: result.count,
    });

    return this.prisma.client.story.findMany({ where: { buildPhaseId } });
  }

  async unassignStory(projectId: string, buildPhaseId: string, storyId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    const result = await this.prisma.client.story.updateMany({
      where: { id: storyId, projectId, buildPhaseId },
      data: { buildPhaseId: null },
    });
    if (!result.count) notFound("Story", storyId);

    await this.logAudit(projectId, userId, "build_phase.story_unassigned", buildPhaseId, null, { storyId });
    return { storyId, unassigned: true };
  }

  async uploadBrandKit(projectId: string, buildPhaseId: string, userId: string, file: Express.Multer.File) {
    return this.uploadAsset(projectId, buildPhaseId, userId, file, "brand-kit", "brandKitObjectId");
  }

  async uploadUserFlow(projectId: string, buildPhaseId: string, userId: string, file: Express.Multer.File) {
    return this.uploadAsset(projectId, buildPhaseId, userId, file, "user-flow", "userFlowObjectId");
  }

  private async uploadAsset(
    projectId: string,
    buildPhaseId: string,
    userId: string,
    file: Express.Multer.File,
    kind: "brand-kit" | "user-flow",
    field: "brandKitObjectId" | "userFlowObjectId",
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    const path = `${projectId}/build-phases/${buildPhaseId}/${kind}/${file.originalname}`;
    await this.storage.upload(path, file.buffer, file.mimetype);

    const storageObject = await this.prisma.client.storageObject.upsert({
      where: { path },
      create: {
        projectId,
        bucket: this.storage.bucket,
        path,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.byteLength,
      },
      update: {
        mimeType: file.mimetype,
        sizeBytes: file.buffer.byteLength,
      },
    });

    const updated = await this.prisma.client.buildPhase.update({
      where: { id: buildPhaseId },
      data: { [field]: storageObject.id, version: { increment: 1 } },
    });

    await this.logAudit(projectId, userId, `build_phase.${kind}_uploaded`, buildPhaseId, null, {
      storageObjectId: storageObject.id,
    });

    return updated;
  }

  async generatePack(projectId: string, buildPhaseId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);
    if (buildPhase.status !== "ready" && buildPhase.status !== "active") {
      forbidden("Mark the Build Phase as ready before generating its Build Pack.");
    }

    return this.queue.enqueue({
      queue: QUEUES.buildPackGenerate,
      projectId,
      userId,
      idempotencyKey: `build-pack:${buildPhaseId}:${new Date().toISOString().slice(0, 10)}`,
      payload: { buildPhaseId },
    });
  }

  async getPack(projectId: string, buildPhaseId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);
    const pack = await this.prisma.client.buildPack.findUnique({ where: { buildPhaseId } });
    if (!pack) return null;

    // prdDocumentId is a GeneratedDocument id (rendered via the document.render
    // pipeline). buildSyncInstructionsObjectId and buildSyncFileObjectId are
    // both raw StorageObject ids — the worker writes the rendered Instructions
    // PDF's StorageObject id directly onto BuildPack, it does not keep the
    // GeneratedDocument id around (see handlers/document.ts build-sync-instructions branch).
    const [prdUrl, buildSyncInstructionsUrl, buildSyncFileUrl] = await Promise.all([
      this.signedUrlForDocument(pack.prdDocumentId),
      this.signedUrlForStorageObject(pack.buildSyncInstructionsObjectId),
      this.signedUrlForStorageObject(pack.buildSyncFileObjectId),
    ]);

    return { ...pack, prdUrl, buildSyncInstructionsUrl, buildSyncFileUrl };
  }

  private async signedUrlForStorageObject(storageObjectId: string | null): Promise<string | null> {
    if (!storageObjectId) return null;
    const storageObject = await this.prisma.client.storageObject.findUnique({ where: { id: storageObjectId } });
    if (!storageObject) return null;
    return this.storage.signedUrl(storageObject.path);
  }

  private async signedUrlForDocument(documentId: string | null): Promise<string | null> {
    if (!documentId) return null;
    const document = await this.prisma.client.generatedDocument.findUnique({ where: { id: documentId } });
    if (!document?.storageObjectId) return null;
    return this.signedUrlForStorageObject(document.storageObjectId);
  }

  async uploadSync(projectId: string, buildPhaseId: string, userId: string, file: Express.Multer.File) {
    await this.access.require(projectId, userId, ["founder"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    const path = `${projectId}/build-phases/${buildPhaseId}/sync-uploads/${Date.now()}-${file.originalname}`;
    await this.storage.upload(path, file.buffer, file.mimetype);
    const storageObject = await this.prisma.client.storageObject.create({
      data: {
        projectId,
        bucket: this.storage.bucket,
        path,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.byteLength,
      },
    });

    const upload = await this.prisma.client.buildSyncUpload.create({
      data: {
        buildPhaseId,
        uploadedById: userId,
        storageObjectId: storageObject.id,
        buildPhaseIdentifier: "",
      },
    });

    await this.queue.enqueue({
      queue: QUEUES.buildSyncIngest,
      projectId,
      userId,
      idempotencyKey: `build-sync-ingest:${upload.id}`,
      payload: { buildSyncUploadId: upload.id },
    });

    return upload;
  }

  async listSyncUploads(projectId: string, buildPhaseId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);
    return this.prisma.client.buildSyncUpload.findMany({
      where: { buildPhaseId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async exportSync(projectId: string, buildPhaseId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const buildPhase = await this.prisma.client.buildPhase.findUnique({ where: { id: buildPhaseId } });
    if (!buildPhase || buildPhase.projectId !== projectId) notFound("BuildPhase", buildPhaseId);

    return this.queue.enqueue({
      queue: QUEUES.buildSyncExport,
      projectId,
      userId,
      payload: { buildPhaseId },
    });
  }

  private async logAudit(
    projectId: string,
    actorId: string,
    eventType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.client.auditEvent.create({
      data: {
        projectId,
        actorId,
        eventType,
        entityType: "BuildPhase",
        entityId,
        source: "manual_edit",
        before: before ?? undefined,
        after: after ?? undefined,
        metadata: {},
      },
    });
  }
}
