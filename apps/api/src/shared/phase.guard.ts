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
    // @RequirePhase is applied at the controller-class level everywhere it's
    // used — reflector.get(key, context.getHandler()) alone only sees
    // method-level metadata and silently never matches, so the guard would
    // always pass. getAllAndOverride checks the handler first, then falls
    // back to the class, which is what class-level SetMetadata needs.
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PHASE_KEY,
      [context.getHandler(), context.getClass()],
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
