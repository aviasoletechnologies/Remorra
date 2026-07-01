import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { PhaseGuard, RequirePhase } from "../../shared/phase.guard.js";
import { VentureService } from "./venture.service.js";

@RequirePhase("venture", "evolve")
@UseGuards(PhaseGuard)
@Controller()
export class VentureController {
  constructor(private readonly venture: VentureService) {}

  @Get("projects/:projectId/venture")
  overview(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.venture.overview(projectId, actor.userId);
  }

  @Patch("projects/:projectId/stories/:storyId")
  updateStory(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("storyId") storyId: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateStory(
      projectId,
      storyId,
      actor.userId,
      Number(version),
      body,
    );
  }

  @Post("projects/:projectId/raid")
  raid(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createRaid(projectId, actor.userId, body);
  }

  @Patch("projects/:projectId/raid/:id")
  updateRaid(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateRaid(projectId, id, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/raid/:id")
  deleteRaid(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteRaid(projectId, id, actor.userId, Number(version));
  }
}
