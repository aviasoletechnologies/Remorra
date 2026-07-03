import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { notFound } from "../../shared/http-errors.js";

@Injectable()
export class HealthScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
  ) {}

  async latest(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.healthScore.findFirst({
      where: { projectId },
      orderBy: { calculatedAt: "desc" },
      // createMany doesn't preserve insertion order on read — order
      // deterministically by weight (Cohesion is the only 10%-weighted
      // component, so it always sorts last, matching the doc's example).
      include: { components: { orderBy: [{ weight: "desc" }, { component: "asc" }] } },
    });
  }

  async calculate(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder"]);
    const project = await this.prisma.client.project.findUnique({ where: { id: projectId } });
    if (!project) notFound("Project", projectId);
    if (project!.phase !== "initiate") {
      // HARDIK doc Q13/§12: Health Score fires once at Initiate, no
      // recalculation in Venture — the route allows GET from venture/evolve
      // so the historical score stays visible, but calculation stays gated here.
      throw new BadRequestException(
        `Health Score can only be calculated during the Initiate phase. Current phase: ${project!.phase}.`,
      );
    }
    // No idempotencyKey — recalculation must always run fresh (e.g. after
    // editing Goals/Epics/Stories post-calculation). A day-scoped key here
    // previously made "Recalculate" silently return the stale job for the
    // rest of the day. The FE already disables the button while a
    // calculation is in flight, which is all the double-submit protection
    // this action needs.
    return this.queue.enqueue({
      queue: QUEUES.healthScoreCalculate,
      projectId,
      userId,
      payload: { projectId },
    });
  }
}
