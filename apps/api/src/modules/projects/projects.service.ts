import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import {
  createProjectSchema,
  drivePhaseSchema,
  type CreateProject,
} from "@remorra/contracts";
import { forbidden, notFound } from "../../shared/http-errors.js";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from "./project.repository.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: ProjectRepository,
    private readonly prisma: PrismaService,
  ) {}

  list(userId: string) {
    return this.repository.listForUser(userId);
  }

  async create(userId: string, input: CreateProject) {
    const parsed = createProjectSchema.parse(input);
    return this.repository.create({ ownerId: userId, ...parsed });
  }

  async getForUser(projectId: string, userId: string) {
    const project = await this.repository.find(projectId);
    if (!project) notFound("Project", projectId);
    const role = await this.repository.roleForUser(projectId, userId);
    if (!role) forbidden("You do not have access to this project.");
    return { ...project, role };
  }

  async advance(
    projectId: string,
    userId: string,
    expectedVersion: number,
    phase: string,
  ) {
    const role = await this.repository.roleForUser(projectId, userId);
    if (role !== "founder") {
      forbidden("Only the project founder can advance the DRIVE phase.");
    }
    return this.repository.advance(
      projectId,
      expectedVersion,
      drivePhaseSchema.parse(phase),
    );
  }

  async developerExport(projectId: string, userId: string) {
    const project = await this.getForUser(projectId, userId);
    if (project.role === "supplier") forbidden("Suppliers cannot export developer change packs.");
    const [
      ambitions,
      okrs,
      personas,
      painPoints,
      userNeeds,
      stories,
      tasks,
    ] = await Promise.all([
      this.prisma.client.ambition.findMany({ where: { projectId } }),
      this.prisma.client.okr.findMany({ where: { projectId } }),
      this.prisma.client.persona.findMany({ where: { projectId } }),
      this.prisma.client.painPoint.findMany({ where: { projectId } }),
      this.prisma.client.userNeed.findMany({ where: { projectId } }),
      this.prisma.client.userStory.findMany({ where: { projectId } }),
      this.prisma.client.task.findMany({ where: { projectId } }),
    ]);
    return {
      format: "remorra-developer-change-pack",
      version: 1,
      exportedAt: new Date().toISOString(),
      project: { id: projectId, version: project.version, name: project.name },
      entities: { ambitions, okrs, personas, painPoints, userNeeds, stories, tasks },
      instructions:
        "Submit changes back through developer-import. Remorra will convert them to Evolve impact items for founder approval.",
    };
  }

  async developerImport(projectId: string, userId: string, body: any) {
    const project = await this.getForUser(projectId, userId);
    if (project.role !== "founder") {
      forbidden("Only founders can import developer changes.");
    }
    const changes = Array.isArray(body?.changes)
      ? body.changes
      : Array.isArray(body?.impacts)
        ? body.impacts
        : [];
    const current = await this.prisma.client.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { version: true },
    });
    return this.prisma.client.$transaction(async (tx: any) => {
      const session = await tx.evolveSession.create({
        data: {
          projectId,
          mode: "publish",
          status: "screening",
          topic: String(body?.topic ?? "Developer change import"),
          launchedFrom: "developer-import",
          baseProjectVersion: current.version,
        },
      });
      for (const change of changes) {
        const proposedChange = {
          ...(change.proposedChange ?? change),
          operation:
            change.proposedChange?.operation ??
            change.operation ??
            change.action ??
            "update",
          entityId: change.entityId ?? change.proposedChange?.entityId,
          expectedVersion:
            change.expectedVersion ?? change.proposedChange?.expectedVersion,
        };
        await tx.impactItem.create({
          data: {
            evolveSessionId: session.id,
            entityType: String(change.entityType ?? proposedChange.entityType ?? "task"),
            entityId: typeof change.entityId === "string" ? change.entityId : null,
            severity: String(change.severity ?? "amber"),
            title: String(change.title ?? "Imported developer change"),
            reasoning: String(
              change.reasoning ??
                "Imported change requires founder conflict review before it can affect product history.",
            ),
            proposedChange,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: userId,
          eventType: "developer_import.received",
          metadata: { sessionId: session.id, changes: changes.length },
        },
      });
      return { sessionId: session.id, impactsCreated: changes.length };
    });
  }
}
