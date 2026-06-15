import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";

@Injectable()
export class ViabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
  ) {}

  async calculate(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const config = this.config();
    const existing = await this.prisma.client.viabilitySnapshot.count({
      where: { projectId },
    });
    if (existing >= config.recalculationLimit) {
      throw new BadRequestException(
        `Viability recalculation limit reached (${config.recalculationLimit}).`,
      );
    }
    return this.queue.enqueue({
      queue: QUEUES.aiExtract,
      projectId,
      userId,
      idempotencyKey: `viability:${projectId}:${new Date().toISOString().slice(0, 13)}`,
      payload: { eventType: "viability.calculate", projectId },
    });
  }

  async current(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const [snapshot, count] = await Promise.all([
      this.prisma.client.viabilitySnapshot.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      }),
      this.prisma.client.viabilitySnapshot.count({ where: { projectId } }),
    ]);
    return {
      snapshot,
      config: this.config(),
      recalculationsUsed: count,
      recalculationsRemaining: Math.max(0, this.config().recalculationLimit - count),
    };
  }

  private config() {
    return {
      recalculationLimit: Number(process.env.VIABILITY_RECALCULATION_LIMIT ?? 3),
      componentWeights: {
        evidence: Number(process.env.VIABILITY_WEIGHT_EVIDENCE ?? 25),
        linkage: Number(process.env.VIABILITY_WEIGHT_LINKAGE ?? 25),
        delivery: Number(process.env.VIABILITY_WEIGHT_DELIVERY ?? 25),
        risk: Number(process.env.VIABILITY_WEIGHT_RISK ?? 25),
      },
      readinessCriteria: [
        "One complete Ambition-to-User-Need thread exists.",
        "At least one active delivery cycle or Build Pack exists.",
        "Open high-severity risks have an owner or mitigation.",
        "The latest score rationale references confirmed product evidence.",
      ],
    };
  }
}
