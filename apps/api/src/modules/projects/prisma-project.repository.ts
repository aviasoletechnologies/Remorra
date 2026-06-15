import { Injectable } from "@nestjs/common";
import type { DrivePhase } from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { versionConflict } from "../../shared/http-errors.js";
import type {
  ProjectRecord,
  ProjectRepository,
} from "./project.repository.js";

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<ProjectRecord[]> {
    const projects = await this.prisma.client.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { memberships: { some: { userId } } }],
      },
      include: { memberships: { where: { userId }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    return projects.map((project: any) => ({
      id: project.id,
      ownerId: project.ownerId,
      name: project.name,
      summary: project.summary ?? undefined,
      phase: project.phase,
      role:
        project.ownerId === userId
          ? "founder"
          : (project.memberships[0]?.role ?? "supplier"),
      version: project.version,
      viabilityScore: null,
      updatedAt: project.updatedAt.toISOString(),
    }));
  }

  async find(id: string): Promise<ProjectRecord | null> {
    const project = await this.prisma.client.project.findUnique({
      where: { id },
      include: {
        viabilitySnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!project) return null;
    return {
      id: project.id,
      ownerId: project.ownerId,
      name: project.name,
      summary: project.summary ?? undefined,
      phase: project.phase,
      role: "founder",
      version: project.version,
      viabilityScore: project.viabilitySnapshots[0]?.overall ?? null,
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  async roleForUser(projectId: string, userId: string) {
    const project = await this.prisma.client.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        memberships: { where: { userId }, take: 1 },
      },
    });
    if (!project) return null;
    return project.ownerId === userId
      ? ("founder" as const)
      : (project.memberships[0]?.role ?? null);
  }

  async create(input: {
    ownerId: string;
    name: string;
    summary?: string;
  }): Promise<ProjectRecord> {
    const project = await this.prisma.client.project.create({
      data: input,
    });
    return {
      ...project,
      summary: project.summary ?? undefined,
      role: "founder",
      viabilityScore: null,
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  async advance(id: string, expectedVersion: number, phase: DrivePhase) {
    const result = await this.prisma.client.project.updateMany({
      where: { id, version: expectedVersion },
      data: { phase, version: { increment: 1 } },
    });
    if (result.count === 0) {
      const current = await this.prisma.client.project.findUniqueOrThrow({
        where: { id },
        select: { version: true },
      });
      versionConflict(current.version);
    }
    return (await this.find(id))!;
  }
}
