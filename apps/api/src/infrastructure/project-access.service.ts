import { ForbiddenException, Injectable } from "@nestjs/common";
import type { ProjectRole } from "@remorra/contracts";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async role(projectId: string, userId: string): Promise<ProjectRole | null> {
    const project = await this.prisma.client.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        memberships: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (!project) return null;
    if (project.ownerId === userId) return "founder";
    return project.memberships[0]?.role ?? null;
  }

  async require(
    projectId: string,
    userId: string,
    allowed: ProjectRole[] = ["founder", "team", "supplier"],
  ) {
    const role = await this.role(projectId, userId);
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException("You do not have permission for this project.");
    }
    return role;
  }
}
