import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../infrastructure/prisma.service.js";

export const REQUIRE_PHASE_KEY = "requirePhase";

export const RequirePhase = (...phases: string[]) =>
  SetMetadata(REQUIRE_PHASE_KEY, phases);

@Injectable()
export class PhaseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string[]>(
      REQUIRE_PHASE_KEY,
      context.getHandler(),
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string>;
    }>();
    const projectId =
      request.params?.["projectId"] ?? request.params?.["id"];

    if (!projectId) return true;

    const project = await this.prisma.client.project.findUnique({
      where: { id: projectId },
      select: { phase: true },
    });

    if (!project || !required.includes(project.phase)) {
      throw new ForbiddenException(
        `This feature requires the project to be in phase: ${required.join(" or ")}. Current phase: ${project?.phase ?? "unknown"}.`,
      );
    }

    return true;
  }
}
