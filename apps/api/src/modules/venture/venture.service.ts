import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { notFound, versionConflict } from "../../shared/http-errors.js";
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
    const [stories, raid, goals] = await Promise.all([
      this.prisma.client.story.findMany({
        where: { projectId },
        orderBy: [{ status: "asc" }, { position: "asc" }],
        include: { epic: { select: { title: true } }, buildPhase: { select: { name: true, status: true } } },
      }),
      this.prisma.client.raidItem.findMany({ where: { projectId } }),
      this.prisma.client.goal.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        include: {
          epics: {
            orderBy: { createdAt: "asc" },
            include: { stories: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, status: true } } },
          },
        },
      }),
    ]);
    return { role, stories, raid, goals };
  }

  async updateStory(
    projectId: string,
    storyId: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"], true);

    // A closed Build Phase means the handoff is finished — its Stories become
    // a frozen record rather than editable, so a founder can't accidentally
    // drift the backlog out of sync with what was actually shipped.
    const existing = await this.prisma.client.story.findUnique({
      where: { id: storyId },
      include: { buildPhase: { select: { status: true, name: true } } },
    });
    if (!existing || existing.projectId !== projectId) notFound("Story", storyId);
    if (existing!.buildPhase?.status === "closed") {
      throw new BadRequestException(
        `This Story belongs to the closed Build Phase "${existing!.buildPhase.name}" and can no longer be edited.`,
      );
    }
    // Once a Build Phase is Active, its Stories are being tracked via the
    // developer's Build Sync File — status changes must come from there
    // (handleBuildSyncIngest writes status directly), not manual board clicks,
    // so the two sources of truth can't drift apart.
    if (body.status !== undefined && existing!.buildPhase?.status === "active") {
      throw new BadRequestException(
        `This Story's Build Phase "${existing!.buildPhase.name}" is Active — status can only be updated via a Build Sync File upload.`,
      );
    }

    const updated = await this.updateVersioned("story", storyId, projectId, version, {
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.position !== undefined ? { position: Number(body.position) } : {}),
      ...(body.priority !== undefined ? { priority: String(body.priority) } : {}),
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
    });
    if (body.title !== undefined || body.description !== undefined) {
      await this.contextAutomation.runLayer1AutoCapture(projectId).catch(() => undefined);
    }
    return updated;
  }

  async createRaid(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"], true);
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
    await this.access.require(projectId, userId, ["founder", "team"], true);
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
    await this.access.require(projectId, userId, ["founder", "team"], true);
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
