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
      include: { components: true },
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
    return this.queue.enqueue({
      queue: QUEUES.healthScoreCalculate,
      projectId,
      userId,
      idempotencyKey: `health-score:${projectId}:${new Date().toISOString().slice(0, 10)}`,
      payload: { projectId },
    });
  }
}
