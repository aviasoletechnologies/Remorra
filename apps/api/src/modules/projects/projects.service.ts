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
import { EventRouterService } from "../event-router/event-router.service.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: ProjectRepository,
    private readonly prisma: PrismaService,
    private readonly eventRouter: EventRouterService,
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

}

