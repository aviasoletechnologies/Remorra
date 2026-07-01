import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { versionConflict } from "../../shared/http-errors.js";
import { ContextAutomationService } from "../../shared/context-automation.service.js";

@Injectable()
export class VentureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly contextAutomation: ContextAutomationService,
  ) {}

  async overview(projectId: string, userId: string) {
    const role = await this.access.require(projectId, userId);
    const [stories, raid] = await Promise.all([
      this.prisma.client.story.findMany({
        where: { projectId },
        orderBy: [{ status: "asc" }, { position: "asc" }],
        include: { epic: { select: { title: true } }, buildPhase: { select: { name: true } } },
      }),
      this.prisma.client.raidItem.findMany({ where: { projectId } }),
    ]);
    return { role, stories, raid };
  }

  async updateStory(
    projectId: string,
    storyId: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("story", storyId, projectId, version, {
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.position !== undefined ? { position: Number(body.position) } : {}),
      ...(body.priority !== undefined ? { priority: String(body.priority) } : {}),
    });
  }

  async createRaid(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const created = await this.prisma.client.raidItem.create({
      data: {
        projectId,
        type: String(body.type),
        title: String(body.title),
        description: body.description ? String(body.description) : null,
        status: String(body.status ?? "open"),
        severity: String(body.severity ?? "amber"),
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
    });
    await this.contextAutomation.runLayer1AutoCapture(projectId).catch(() => undefined);
    return created;
  }

  async updateRaid(
    projectId: string,
    id: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("raidItem", id, projectId, version, {
      ...(body.type !== undefined ? { type: String(body.type) } : {}),
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.description !== undefined
        ? { description: body.description ? String(body.description) : null }
        : {}),
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.severity !== undefined
        ? { severity: String(body.severity) }
        : {}),
      ...(body.dueAt !== undefined
        ? { dueAt: body.dueAt ? new Date(body.dueAt) : null }
        : {}),
    });
  }

  async deleteRaid(
    projectId: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("raidItem", id, projectId, version);
  }

  private async updateVersioned(
    modelName: string,
    id: string,
    projectId: string,
    version: number,
    data: Record<string, unknown>,
  ) {
    const model = (this.prisma.client as any)[modelName];
    const result = await model.updateMany({
      where: { id, projectId, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!result.count) {
      const current = await model.findUniqueOrThrow({ where: { id } });
      versionConflict(current.version);
    }
    return model.findUniqueOrThrow({ where: { id } });
  }

  private async deleteVersioned(
    modelName: string,
    id: string,
    projectId: string,
    version: number,
  ) {
    const model = (this.prisma.client as any)[modelName];
    const result = await model.deleteMany({
      where: { id, projectId, version },
    });
    if (!result.count) {
      const current = await model.findUniqueOrThrow({ where: { id } });
      versionConflict(current.version);
    }
    return { id, deleted: true };
  }
}
