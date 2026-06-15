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
import { EvolveService } from "../evolve/evolve.service.js";

const REMORRA_BUILD_RULES = `# REMORRA BUILD RULES

> This file is mandatory. It must be ingested and followed by every developer receiving a Build Pack.

## Entity Integrity Rules
- Never break linkage. Every Task must remain linked to its parent User Story.
- Do not create, modify, or delete strategic entities (Ambitions, OKRs, Personas, Pain Points, User Needs). These are managed exclusively through Evolve.
- Task status transitions follow Kanban flow: backlog → todo → in_progress → done.
- Preserve version fields — used for optimistic concurrency control.

## Import Format
Submit a JSON file with: buildCycleId, completedAt, changes (array of {entityType, entityId, action, fields}), newIssues, and notes.

## Import Processing
1. An Evolve session is created from the import.
2. Impact Screener assesses each change against linked entities.
3. Founder reviews and approves/rejects per item.
4. Approved changes applied atomically with audit trail logging.

## Communication
- Suppliers: direct all questions to the Founder.
- Build issues: document as RAID items in the import file.
- Reference Task ID and User Story ID in commit messages.
`;

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: ProjectRepository,
    private readonly prisma: PrismaService,
    private readonly evolve: EvolveService,
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
      buildRules: REMORRA_BUILD_RULES,
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
    const session = await this.prisma.client.$transaction(async (tx: any) => {
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
        const operation = String(change.operation ?? change.action ?? "update");
        const entityType = String(change.entityType ?? change.proposedChange?.entityType ?? "task");
        const entityId = typeof change.entityId === "string" ? change.entityId : (typeof change.proposedChange?.entityId === "string" ? change.proposedChange.entityId : null);
        const expectedVersion = typeof change.expectedVersion === "number" ? change.expectedVersion : (typeof change.proposedChange?.expectedVersion === "number" ? change.proposedChange.expectedVersion : null);
        const data = (change.data ?? change.proposedChange?.data ?? change.fields ?? change.proposedChange?.fields ?? {}) as Record<string, any>;
        const reason = String(change.reason ?? change.reasoning ?? change.proposedChange?.reason ?? change.proposedChange?.reasoning ?? "Imported developer change");
        const source = String(change.source ?? change.proposedChange?.source ?? "developer-import");

        const proposedChange = {
          operation,
          entityType,
          entityId,
          expectedVersion,
          data,
          reason,
          source,
        };

        await tx.impactItem.create({
          data: {
            evolveSessionId: session.id,
            entityType,
            entityId,
            severity: String(change.severity ?? change.proposedChange?.severity ?? "amber"),
            title: String(change.title ?? change.proposedChange?.title ?? "Imported developer change"),
            reasoning: reason,
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
      return session;
    });

    await this.evolve.validateSession(session.id, projectId);

    return { sessionId: session.id, impactsCreated: changes.length };
  }
}
