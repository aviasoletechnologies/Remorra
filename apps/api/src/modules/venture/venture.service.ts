import { Injectable } from "@nestjs/common";
import {
  cycleInputSchema,
  storyInputSchema,
  taskInputSchema,
  taskMoveSchema,
} from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { versionConflict } from "../../shared/http-errors.js";

@Injectable()
export class VentureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
  ) {}

  async overview(projectId: string, userId: string) {
    const role = await this.access.require(projectId, userId);
    const taskWhere =
      role === "supplier" ? { projectId, assigneeId: userId } : { projectId };
    const [cycles, stories, tasks, raid, financeCategories, financeEntries, meetings, retrospectives, userNeeds, members] =
      await Promise.all([
        this.prisma.client.cycle.findMany({
          where: { projectId },
          orderBy: { startsAt: "desc" },
        }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.userStory.findMany({
              where: { projectId },
              orderBy: [{ status: "asc" }, { position: "asc" }],
            }),
        this.prisma.client.task.findMany({
          where: taskWhere,
          orderBy: [{ status: "asc" }, { position: "asc" }],
          include: { story: { select: { title: true } } },
        }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.raidItem.findMany({ where: { projectId } }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.financeCategory.findMany({
              where: { projectId },
              orderBy: { name: "asc" },
            }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.financeEntry.findMany({
              where: { projectId },
              include: { category: true },
              orderBy: { occurredAt: "desc" },
            }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.dailyMeeting.findMany({
              where: { projectId },
              orderBy: { meetingDate: "desc" },
              take: 10,
            }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.retrospective.findMany({
              where: { projectId },
              orderBy: { createdAt: "desc" },
              take: 10,
            }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.userNeed.findMany({
              where: { projectId },
              orderBy: { createdAt: "asc" },
            }),
        role === "supplier"
          ? Promise.resolve([])
          : this.prisma.client.projectMembership.findMany({
              where: { projectId },
              include: { user: { select: { id: true, preferredName: true, email: true } } },
            }),
      ]);
    return {
      role,
      cycles,
      stories,
      tasks,
      raid,
      financeCategories,
      financeEntries,
      meetings,
      retrospectives,
      userNeeds,
      members,
    };
  }

  async createCycle(projectId: string, userId: string, input: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = cycleInputSchema.parse(input);
    return this.prisma.client.cycle.create({
      data: {
        projectId,
        ...data,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
      },
    });
  }

  async activateCycle(projectId: string, cycleId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.cycle.updateMany({
        where: { projectId, status: "active" },
        data: { status: "completed" },
      });
      return tx.cycle.update({
        where: { id: cycleId },
        data: { status: "active", version: { increment: 1 } },
      });
    });
  }

  async updateCycle(
    projectId: string,
    cycleId: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("cycle", cycleId, projectId, version, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.startsAt ? { startsAt: new Date(body.startsAt) } : {}),
      ...(body.endsAt ? { endsAt: new Date(body.endsAt) } : {}),
      ...(body.isBuildCycle !== undefined
        ? { isBuildCycle: Boolean(body.isBuildCycle) }
        : {}),
      ...(body.status ? { status: body.status } : {}),
    });
  }

  async deleteCycle(
    projectId: string,
    cycleId: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("cycle", cycleId, projectId, version);
  }

  async createStory(projectId: string, userId: string, input: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = storyInputSchema.parse(input);
    return this.prisma.client.userStory.create({
      data: {
        projectId,
        ...data,
        acceptance: data.acceptance,
      },
    });
  }

  async updateStory(
    projectId: string,
    storyId: string,
    userId: string,
    version: number,
    input: unknown,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = storyInputSchema.partial().parse(input);
    const result = await this.prisma.client.userStory.updateMany({
      where: { id: storyId, projectId, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!result.count) await this.throwStoryVersion(storyId);
    return this.prisma.client.userStory.findUniqueOrThrow({
      where: { id: storyId },
    });
  }

  async deleteStory(
    projectId: string,
    storyId: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("userStory", storyId, projectId, version);
  }

  async createTask(projectId: string, userId: string, input: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = taskInputSchema.parse(input);
    return this.prisma.client.task.create({
      data: {
        projectId,
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
      },
    });
  }

  async moveTask(
    projectId: string,
    taskId: string,
    userId: string,
    input: unknown,
  ) {
    const role = await this.access.require(projectId, userId);
    const data = taskMoveSchema.parse(input);
    const task = await this.prisma.client.task.findUniqueOrThrow({
      where: { id: taskId },
    });
    if (role === "supplier" && task.assigneeId !== userId) {
      await this.access.require(projectId, userId, []);
    }
    const result = await this.prisma.client.task.updateMany({
      where: { id: taskId, projectId, version: data.version },
      data: {
        status: data.status,
        position: data.position,
        version: { increment: 1 },
      },
    });
    if (!result.count) {
      const current = await this.prisma.client.task.findUniqueOrThrow({
        where: { id: taskId },
      });
      versionConflict(current.version);
    }
    return this.prisma.client.task.findUniqueOrThrow({ where: { id: taskId } });
  }

  async updateTask(
    projectId: string,
    taskId: string,
    userId: string,
    version: number,
    input: unknown,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = taskInputSchema.partial().parse(input);
    return this.updateVersioned("task", taskId, projectId, version, {
      ...data,
      ...(data.dueAt !== undefined
        ? { dueAt: data.dueAt ? new Date(data.dueAt) : null }
        : {}),
    });
  }

  async deleteTask(
    projectId: string,
    taskId: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("task", taskId, projectId, version);
  }

  async createRaid(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.raidItem.create({
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

  async createFinanceCategory(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.financeCategory.create({
      data: {
        projectId,
        name: String(body.name),
        type: String(body.type ?? "cost"),
      },
    });
  }

  async updateFinanceCategory(
    projectId: string,
    id: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("financeCategory", id, projectId, version, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.type !== undefined ? { type: String(body.type) } : {}),
    });
  }

  async deleteFinanceCategory(
    projectId: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("financeCategory", id, projectId, version);
  }

  async finance(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.financeEntry.findMany({
      where: { projectId },
      include: { category: true },
      orderBy: { occurredAt: "desc" },
    });
  }

  async createFinanceEntry(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.financeEntry.create({
      data: {
        projectId,
        categoryId: String(body.categoryId),
        description: String(body.description),
        amountMinor: Number(body.amountMinor),
        currency: String(body.currency ?? "GBP"),
        occurredAt: new Date(body.occurredAt),
      },
    });
  }

  async updateFinanceEntry(
    projectId: string,
    id: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("financeEntry", id, projectId, version, {
      ...(body.categoryId !== undefined
        ? { categoryId: String(body.categoryId) }
        : {}),
      ...(body.description !== undefined
        ? { description: String(body.description) }
        : {}),
      ...(body.amountMinor !== undefined
        ? { amountMinor: Number(body.amountMinor) }
        : {}),
      ...(body.currency !== undefined
        ? { currency: String(body.currency) }
        : {}),
      ...(body.occurredAt
        ? { occurredAt: new Date(body.occurredAt) }
        : {}),
    });
  }

  async deleteFinanceEntry(
    projectId: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("financeEntry", id, projectId, version);
  }

  async createMeeting(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.dailyMeeting.create({
      data: {
        projectId,
        cycleId: body.cycleId ?? null,
        meetingDate: new Date(body.meetingDate),
        yesterday: body.yesterday ?? null,
        today: body.today ?? null,
        blockers: body.blockers ?? null,
      },
    });
  }

  async updateMeeting(
    projectId: string,
    id: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("dailyMeeting", id, projectId, version, {
      ...(body.cycleId !== undefined ? { cycleId: body.cycleId || null } : {}),
      ...(body.meetingDate
        ? { meetingDate: new Date(body.meetingDate) }
        : {}),
      ...(body.yesterday !== undefined ? { yesterday: body.yesterday } : {}),
      ...(body.today !== undefined ? { today: body.today } : {}),
      ...(body.blockers !== undefined ? { blockers: body.blockers } : {}),
    });
  }

  async deleteMeeting(
    projectId: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("dailyMeeting", id, projectId, version);
  }

  async createRetrospective(projectId: string, userId: string, body: any) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.retrospective.create({
      data: {
        projectId,
        cycleId: body.cycleId ?? null,
        wentWell: String(body.wentWell),
        improvements: String(body.improvements),
        actions: String(body.actions),
      },
    });
  }

  async updateRetrospective(
    projectId: string,
    id: string,
    userId: string,
    version: number,
    body: any,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.updateVersioned("retrospective", id, projectId, version, {
      ...(body.cycleId !== undefined ? { cycleId: body.cycleId || null } : {}),
      ...(body.wentWell !== undefined ? { wentWell: String(body.wentWell) } : {}),
      ...(body.improvements !== undefined
        ? { improvements: String(body.improvements) }
        : {}),
      ...(body.actions !== undefined ? { actions: String(body.actions) } : {}),
    });
  }

  async deleteRetrospective(
    projectId: string,
    id: string,
    userId: string,
    version: number,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.deleteVersioned("retrospective", id, projectId, version);
  }

  async generateSummary(
    projectId: string,
    resourceId: string,
    kind: "meeting" | "retrospective",
    userId: string,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.queue.enqueue({
      queue: QUEUES.aiSummary,
      projectId,
      userId,
      idempotencyKey: `${kind}-summary:${resourceId}`,
      payload: {
        resourceId,
        kind,
        skillId:
          kind === "meeting"
            ? "daily-meeting-summary"
            : "retrospective-insights",
      },
    });
  }

  async generateBuildPack(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.queue.enqueue({
      queue: QUEUES.documentRender,
      projectId,
      userId,
      idempotencyKey: `build-pack:${projectId}:${new Date().toISOString().slice(0, 10)}`,
      payload: { projectId, documentType: "build-pack" },
    });
  }

  private async throwStoryVersion(storyId: string): Promise<never> {
    const current = await this.prisma.client.userStory.findUniqueOrThrow({
      where: { id: storyId },
    });
    versionConflict(current.version);
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
