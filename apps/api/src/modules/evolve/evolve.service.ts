import { Injectable } from "@nestjs/common";
import {
  createEvolveSessionSchema,
  updateEvolveSessionStatusSchema,
} from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { forbidden, notFound } from "../../shared/http-errors.js";

@Injectable()
export class EvolveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async createSession(projectId: string, userId: string, body: unknown) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = createEvolveSessionSchema.parse(body);

    return this.prisma.client.evolveSession.create({
      data: {
        projectId,
        launchedFrom: data.launchedFrom,
        topic: data.topic ?? null,
        conversation: {
          create: {
            projectId,
            kind: "evolve",
            retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { conversation: true },
    });
  }

  async listSessions(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.prisma.client.evolveSession.findMany({
      where: { projectId, status: { in: ["draft", "completed"] } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async updateStatus(
    projectId: string,
    sessionId: string,
    userId: string,
    body: unknown,
  ) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const { status } = updateEvolveSessionStatusSchema.parse(body);

    const session = await this.prisma.client.evolveSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.projectId !== projectId) {
      notFound("EvolveSession", sessionId);
    }
    if (session!.status === "completed") {
      forbidden("This Evolve session is already completed and is read-only.");
    }

    return this.prisma.client.evolveSession.update({
      where: { id: sessionId },
      data: {
        status,
        completedAt: status === "completed" ? new Date() : session!.completedAt,
      },
    });
  }
}
