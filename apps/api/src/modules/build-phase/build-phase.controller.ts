import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { PhaseGuard, RequirePhase } from "../../shared/phase.guard.js";
import { BuildPhaseService } from "./build-phase.service.js";

@RequirePhase("venture", "evolve")
@UseGuards(PhaseGuard)
@Controller("projects/:projectId/build-phases")
export class BuildPhaseController {
  constructor(private readonly buildPhases: BuildPhaseService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.buildPhases.list(projectId, actor.userId);
  }

  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.buildPhases.create(projectId, actor.userId, body);
  }

  @Get(":buildPhaseId")
  get(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
  ) {
    return this.buildPhases.get(projectId, buildPhaseId, actor.userId);
  }

  @Patch(":buildPhaseId")
  update(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.buildPhases.update(projectId, buildPhaseId, actor.userId, Number(version), body);
  }

  @Post(":buildPhaseId/stories")
  assignStories(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
    @Body() body: unknown,
  ) {
    return this.buildPhases.assignStories(projectId, buildPhaseId, actor.userId, body);
  }

  @Patch(":buildPhaseId/brand-kit")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadBrandKit(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.buildPhases.uploadBrandKit(projectId, buildPhaseId, actor.userId, file);
  }

  @Patch(":buildPhaseId/user-flow")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadUserFlow(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.buildPhases.uploadUserFlow(projectId, buildPhaseId, actor.userId, file);
  }

  @Post(":buildPhaseId/pack/generate")
  generatePack(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
  ) {
    return this.buildPhases.generatePack(projectId, buildPhaseId, actor.userId);
  }

  @Get(":buildPhaseId/pack")
  getPack(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
  ) {
    return this.buildPhases.getPack(projectId, buildPhaseId, actor.userId);
  }

  @Post(":buildPhaseId/sync/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadSync(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.buildPhases.uploadSync(projectId, buildPhaseId, actor.userId, file);
  }

  @Get(":buildPhaseId/sync/export")
  exportSync(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
  ) {
    return this.buildPhases.exportSync(projectId, buildPhaseId, actor.userId);
  }

  @Get(":buildPhaseId/sync/uploads")
  listSyncUploads(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("buildPhaseId") buildPhaseId: string,
  ) {
    return this.buildPhases.listSyncUploads(projectId, buildPhaseId, actor.userId);
  }
}
