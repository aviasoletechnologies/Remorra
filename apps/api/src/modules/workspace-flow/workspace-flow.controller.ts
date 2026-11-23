import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { PhaseGuard, RequirePhase } from "../../shared/phase.guard.js";
import { WorkspaceFlowService } from "./workspace-flow.service.js";

@RequirePhase("discover", "refine")
@UseGuards(PhaseGuard)
@Controller("workspace")
export class WorkspaceFlowController {
  constructor(private readonly workspace: WorkspaceFlowService) {}

  @Get("projects/:projectId/flow")
  get(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.workspace.getOrCreate(projectId, actor.userId);
  }

  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post("projects/:projectId/messages")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  message(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body("content") content: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.workspace.message(projectId, actor.userId, content ?? "", file);
  }

  @Post("projects/:projectId/actions")
  action(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: { outputs?: Record<string, unknown>; note?: string },
  ) {
    return this.workspace.action(projectId, actor.userId, body);
  }

  @Get("projects/:projectId/refine-summary")
  refineSummary(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.workspace.getRefineSummary(projectId, actor.userId);
  }
}
