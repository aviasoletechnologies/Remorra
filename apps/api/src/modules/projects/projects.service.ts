import { BadRequestException, Inject, Injectable } from "@nestjs/common";
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
import { EventRouterService } from "../event-router/event-router.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: ProjectRepository,
    private readonly prisma: PrismaService,
    private readonly eventRouter: EventRouterService,
    private readonly access: ProjectAccessService,
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
    const project = await this.repository.find(projectId);
    if (!project) notFound("Project", projectId);
    const fromPhase = project.phase;
    const toPhase = drivePhaseSchema.parse(phase);

    const result = await this.repository.advance(
      projectId,
      expectedVersion,
      toPhase,
    );

    await this.eventRouter.route({
      eventType: "project.update",
      projectId,
      userId,
      payload: { field: "phase", from: fromPhase, to: toPhase },
    });

    return result;
  }

  async developerExport(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const [project, productPack] = await Promise.all([
      this.repository.find(projectId),
      this.prisma.client.productPack.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      }),
    ]);

    if (!project) notFound("Project", projectId);

    return {
      project: {
        id: project.id,
        name: project.name,
        summary: project.summary ?? null,
        phase: project.phase,
        version: project.version,
        updatedAt: project.updatedAt,
      },
      productPack: productPack?.content ?? null,
      coveragePercent: productPack?.coveragePercent ?? null,
      linkageValid: productPack?.linkageValid ?? null,
      exportedAt: new Date().toISOString(),
    };
  }

  async developerImport(projectId: string, userId: string, body: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const changes = this.extractDeveloperChanges(body);

    if (changes.length === 0) {
      throw new BadRequestException(
        "Developer import requires a non-empty changes array.",
      );
    }

    const project = await this.repository.find(projectId);
    if (!project) notFound("Project", projectId);

    const { sessionId, impactsCreated } = await this.prisma.client.$transaction(
      async (tx: any) => {
        const session = await tx.evolveSession.create({
          data: {
            projectId,
            conversationId: null,
            mode: "ideate",
            status: "screening",
            topic: "Developer handoff import",
            launchedFrom: "knowledge-page",
            continuedFromSessionId: null,
            baseProjectVersion: project.version,
          },
        });

        const impacts = await Promise.all(
          changes.map((change: any) =>
            tx.impactItem.create({
              data: {
                evolveSessionId: session.id,
                entityType: String(change.entityType ?? change.type ?? "task"),
                entityId: this.extractUuid(change.entityId ?? change.id),
                severity: this.mapImportSeverity(change),
                title: String(
                  change.title ??
                    change.name ??
                    `${String(change.operation ?? change.action ?? "update")} ${String(change.entityType ?? change.type ?? "item")}`,
                ),
                reasoning: String(
                  change.reason ?? change.reasoning ?? "Imported from developer change pack.",
                ),
                proposedChange: change,
                decision: "pending",
                status: "ready",
                conflictReason: null,
                resolution: null,
                resolutionNote: null,
                resolvedPayload: null,
                currentSnapshot: null,
              },
            }),
          ),
        );

        return { sessionId: session.id, impactsCreated: impacts.length };
      },
    );

    return { sessionId, impactsCreated };
  }

  private extractDeveloperChanges(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    if (typeof body === "string") {
      try {
        return this.extractDeveloperChanges(JSON.parse(body));
      } catch {
        throw new BadRequestException("Developer import payload must be valid JSON.");
      }
    }
    if (!body || typeof body !== "object") return [];
    const candidate = body as Record<string, unknown>;
    if (Array.isArray(candidate.changes)) return candidate.changes;
    if (Array.isArray(candidate.impacts)) return candidate.impacts;
    return [];
  }

  private extractUuid(value: unknown) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  }

  private mapImportSeverity(change: any) {
    const operation = String(change.operation ?? change.action ?? "").toLowerCase();
    if (String(change.severity ?? "").toLowerCase() === "red") return "red";
    if (String(change.severity ?? "").toLowerCase() === "amber") return "amber";
    if (String(change.severity ?? "").toLowerCase() === "green") return "green";
    if (operation === "delete" || operation === "remove") return "red";
    if (operation === "create" || operation === "add") return "amber";
    return "amber";
  }
}

