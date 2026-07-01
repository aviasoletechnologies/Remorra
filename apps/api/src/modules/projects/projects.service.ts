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
import { PhaseCompletionService } from "../../shared/phase-completion.service.js";

const PHASE_ORDER = [
  "discover",
  "refine",
  "initiate",
  "venture",
  "evolve",
] as const;

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: ProjectRepository,
    private readonly prisma: PrismaService,
    private readonly eventRouter: EventRouterService,
    private readonly access: ProjectAccessService,
    private readonly phaseCompletion: PhaseCompletionService,
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

    const fromIndex = PHASE_ORDER.indexOf(fromPhase as (typeof PHASE_ORDER)[number]);
    const toIndex = PHASE_ORDER.indexOf(toPhase as (typeof PHASE_ORDER)[number]);
    const isForward = toIndex === fromIndex + 1;
    const isBackward = toIndex === fromIndex - 1;

    if (!isForward && !isBackward) {
      throw new BadRequestException(
        `Invalid phase transition: cannot move from "${fromPhase}" to "${toPhase}". Phases move one step at a time, forward or back.`,
      );
    }

    // Completion gating only applies to forward moves — e.g. HARDIK doc Q13:
    // a low Health Score at Initiate must still let the founder return to
    // Refine to improve it, without needing Refine's own completion flag.
    if (isForward) {
      const complete = await this.phaseCompletion.isComplete(projectId, fromPhase);
      if (!complete) {
        throw new BadRequestException(
          `The "${fromPhase}" phase is not yet complete — the Skill guiding this phase has not signalled completion.`,
        );
      }
    }

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
    const project = await this.repository.find(projectId);
    if (!project) notFound("Project", projectId);

    const productPackData = await this.getProductPack(projectId, userId);

    return {
      project: {
        id: project.id,
        name: project.name,
        summary: project.summary ?? null,
        phase: project.phase,
        version: project.version,
        updatedAt: project.updatedAt,
      },
      productPack: productPackData,
      coveragePercent: productPackData.coveragePercent,
      linkageValid: productPackData.linkageValid,
      exportedAt: new Date().toISOString(),
    };
  }

  async getProductPack(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const project = await this.repository.find(projectId);
    if (!project) notFound("Project", projectId);

    const goals = await this.prisma.client.goal.findMany({
      where: { projectId },
      include: { epics: { include: { stories: { include: { personas: true } } } } },
    });
    const personas = await this.prisma.client.persona.findMany({
      where: { projectId },
      include: { painPoints: true, stories: { include: { story: true } } },
    });

    const completeThread = goals.some((goal: any) =>
      goal.epics.some((epic: any) =>
        epic.stories.some((story: any) =>
          story.personas.some((link: any) => {
            const persona = personas.find((p: any) => p.id === link.personaId);
            return persona?.painPoints.length;
          }),
        ),
      ),
    );

    const goalScore = goals.length > 0 ? 100 : 0;
    const goalsWithEpics = goals.filter((g: any) => g.epics.length > 0).length;
    const epicScore = goals.length > 0 ? (goalsWithEpics / goals.length) * 100 : 0;

    const personaScore = personas.length > 0 ? 100 : 0;
    const personasWithPainPoints = personas.filter((p: any) => p.painPoints.length > 0).length;
    const painPointScore = personas.length > 0 ? (personasWithPainPoints / personas.length) * 100 : 0;

    const personasWithStories = personas.filter((p: any) => p.stories.length > 0).length;
    const storyLinkScore = personas.length > 0 ? (personasWithStories / personas.length) * 100 : 0;

    const coveragePercent = Math.round(
      (goalScore + epicScore + personaScore + painPointScore + storyLinkScore) / 5
    );

    return {
      projectName: project.name,
      coveragePercent,
      linkageValid: Boolean(completeThread),
      passThread: Boolean(completeThread),
      goals: goals.map((g: any) => ({
        id: g.id,
        title: g.title,
        detail: g.detail,
        epics: g.epics.map((epic: any) => ({
          id: epic.id,
          title: epic.title,
          storyTitles: epic.stories.map((s: any) => s.title),
          personaIds: Array.from(
            new Set(epic.stories.flatMap((s: any) => s.personas.map((link: any) => link.personaId))),
          ),
        })),
      })),
      personas: personas.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        painPoints: p.painPoints.map((pt: any) => ({ id: pt.id, statement: pt.statement })),
        linkedStories: p.stories.map((link: any) => ({ id: link.story.id, statement: link.story.title })),
      })),
      assembledAt: new Date().toISOString(),
    };
  }
}

