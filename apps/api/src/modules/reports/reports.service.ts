import { Injectable } from "@nestjs/common";
import { reportTypeSchema } from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { StorageService } from "../../infrastructure/storage.service.js";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  definitions() {
    return this.prisma.client.reportDefinition.findMany({
      where: { active: true },
      include: { versions: { where: { active: true }, take: 1 } },
      orderBy: { name: "asc" },
    });
  }

  async createReport(projectId: string, userId: string, type: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const reportDefinitionId = reportTypeSchema.parse(type);
    const generation = await this.prisma.client.reportGeneration.create({
      data: { projectId, requestedById: userId, reportDefinitionId },
    });
    const job = await this.queue.enqueue({
      queue: QUEUES.aiReport,
      projectId,
      userId,
      idempotencyKey: `report:${generation.id}`,
      payload: { reportGenerationId: generation.id },
    });
    return { generation, job };
  }

  async list(projectId: string, userId: string) {
    const role = await this.access.require(projectId, userId, [
      "founder",
      "team",
      "supplier",
    ]);
    if (role === "supplier") {
      const documents = await this.prisma.client.generatedDocument.findMany({
        where: { projectId, type: "build-pack" },
        include: { storageObject: true },
        orderBy: { createdAt: "desc" },
      });
      return documents.map((document: any) => ({
        id: document.id,
        status: document.status,
        createdAt: document.createdAt,
        definition: {
          name: "Build Pack",
          description: "Read-only delivery pack for assigned supplier work.",
        },
        document,
      }));
    }
    return this.prisma.client.reportGeneration.findMany({
      where: { projectId },
      include: { definition: true, document: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(reportId: string, userId: string) {
    const report = await this.prisma.client.reportGeneration.findUniqueOrThrow({
      where: { id: reportId },
      include: {
        definition: true,
        content: true,
        sourceSnapshot: true,
        document: { include: { storageObject: true } },
      },
    });
    await this.access.require(report.projectId, userId, ["founder", "team"]);
    return report;
  }

  async retry(reportId: string, userId: string) {
    const report = await this.get(reportId, userId);
    await this.prisma.client.reportGeneration.update({
      where: { id: reportId },
      data: { status: "queued", error: null },
    });
    return this.queue.enqueue({
      queue: QUEUES.aiReport,
      projectId: report.projectId,
      userId,
      payload: { reportGenerationId: reportId },
    });
  }

  async createDocument(
    projectId: string,
    userId: string,
    type: string,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const document = await this.prisma.client.generatedDocument.create({
      data: { projectId, type, templateVersion: 1 },
    });
    const job = await this.queue.enqueue({
      queue: QUEUES.documentRender,
      projectId,
      userId,
      idempotencyKey: `document:${document.id}`,
      payload: { documentId: document.id, documentType: type },
    });
    return { document, job };
  }

  async document(documentId: string, userId: string) {
    const document = await this.prisma.client.generatedDocument.findUniqueOrThrow(
      {
        where: { id: documentId },
        include: { storageObject: true },
      },
    );
    await this.access.require(document.projectId, userId, [
      "founder",
      "team",
      "supplier",
    ]);
    return document;
  }

  async download(documentId: string, userId: string) {
    const document = await this.document(documentId, userId);
    if (!document.storageObject) {
      return { ready: false, status: document.status };
    }
    return {
      ready: true,
      url: await this.storage.signedUrl(document.storageObject.path),
      expiresIn: 900,
    };
  }
}
