import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { EventRouterService } from "../event-router/event-router.service.js";

@Injectable()
export class ViabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly eventRouter: EventRouterService,
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
    const jobs = await this.eventRouter.route({
      eventType: "viability_snapshot.create",
      projectId,
      userId,
      idempotencyKey: `viability:${projectId}:${new Date().toISOString().slice(0, 13)}`,
      payload: { projectId },
    });
    if (jobs.length === 0) {
      throw new BadRequestException("Admin has disabled this feature");
    }
    return { id: jobs[0].jobId };
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

  async autoRecalculate(projectId: string, userId: string) {
    const profile = await this.prisma.client.profile.findUniqueOrThrow({ where: { id: userId } });
    if (profile.tier === "free") return; // Free tier: manual only
    const existing = await this.prisma.client.viabilitySnapshot.count({ where: { projectId } });
    const config = this.config();
    if (existing >= config.recalculationLimit) return; // Limit reached
    const jobs = await this.eventRouter.route({
      eventType: "viability_snapshot.create",
      projectId,
      userId,
      idempotencyKey: `viability:${projectId}:${new Date().toISOString().slice(0, 13)}`,
      payload: { projectId },
    });
    return jobs[0] ?? null;
  }

  private config() {
    return {
      recalculationLimit: Number(process.env.VIABILITY_RECALCULATION_LIMIT ?? 3),
      componentWeights: {
        problem_articulation: 10,
        audience_profile: 10,
        product_concept: 10,
        vision_statement: 10,
        commercial_context: 10,
        ambitions: 10,
        okrs: 10,
        personas: 10,
        user_needs: 10,
        cohesion: 10,
      },
      readinessCriteria: [
        "Problem Articulation is clearly defined with supporting evidence.",
        "Audience Profile identifies at least one validated persona.",
        "Product Concept covers core features and differentiation.",
        "Vision Statement is concise and actionable.",
        "Commercial Context covers revenue model and market size.",
        "At least one Ambition is defined with measurable OKRs.",
        "OKRs are linked to at least one Persona.",
        "Each Persona has at least one Pain Point and one User Need.",
        "One complete Ambition-to-User-Need linkage thread exists.",
        "The latest score rationale references confirmed product evidence.",
      ],
    };
  }
}
