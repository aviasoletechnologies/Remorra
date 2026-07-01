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

  @Post("projects/:projectId/cycles")
  cycle(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createCycle(projectId, actor.userId, body);
  }

  @Post("projects/:projectId/cycles/:cycleId/activate")
  activate(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("cycleId") cycleId: string,
  ) {
    return this.venture.activateCycle(projectId, cycleId, actor.userId);
  }

  @Patch("projects/:projectId/cycles/:cycleId")
  updateCycle(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("cycleId") cycleId: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateCycle(projectId, cycleId, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/cycles/:cycleId")
  deleteCycle(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("cycleId") cycleId: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteCycle(projectId, cycleId, actor.userId, Number(version));
  }

  @Post("projects/:projectId/stories")
  story(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createStory(projectId, actor.userId, body);
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

  @Delete("projects/:projectId/stories/:storyId")
  deleteStory(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("storyId") storyId: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteStory(projectId, storyId, actor.userId, Number(version));
  }

  @Post("projects/:projectId/tasks")
  task(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createTask(projectId, actor.userId, body);
  }

  @Patch("projects/:projectId/tasks/:taskId/move")
  move(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
  ) {
    return this.venture.moveTask(projectId, taskId, actor.userId, body);
  }

  @Patch("projects/:projectId/tasks/:taskId")
  updateTask(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateTask(projectId, taskId, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/tasks/:taskId")
  deleteTask(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteTask(projectId, taskId, actor.userId, Number(version));
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

  @Post("projects/:projectId/finance/categories")
  financeCategory(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createFinanceCategory(projectId, actor.userId, body);
  }

  @Patch("projects/:projectId/finance/categories/:id")
  updateFinanceCategory(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateFinanceCategory(projectId, id, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/finance/categories/:id")
  deleteFinanceCategory(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteFinanceCategory(projectId, id, actor.userId, Number(version));
  }

  @Get("projects/:projectId/finance")
  finance(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.venture.finance(projectId, actor.userId);
  }

  @Post("projects/:projectId/finance")
  financeEntry(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createFinanceEntry(projectId, actor.userId, body);
  }

  @Patch("projects/:projectId/finance/:id")
  updateFinanceEntry(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateFinanceEntry(projectId, id, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/finance/:id")
  deleteFinanceEntry(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteFinanceEntry(projectId, id, actor.userId, Number(version));
  }

  @Post("projects/:projectId/meetings")
  meeting(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createMeeting(projectId, actor.userId, body);
  }

  @Patch("projects/:projectId/meetings/:id")
  updateMeeting(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateMeeting(projectId, id, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/meetings/:id")
  deleteMeeting(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteMeeting(projectId, id, actor.userId, Number(version));
  }

  @Post("projects/:projectId/retrospectives")
  retrospective(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.venture.createRetrospective(projectId, actor.userId, body);
  }

  @Patch("projects/:projectId/retrospectives/:id")
  updateRetrospective(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
    @Body() body: unknown,
  ) {
    return this.venture.updateRetrospective(projectId, id, actor.userId, Number(version), body);
  }

  @Delete("projects/:projectId/retrospectives/:id")
  deleteRetrospective(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Headers("if-match") version: string,
  ) {
    return this.venture.deleteRetrospective(projectId, id, actor.userId, Number(version));
  }

  @Post("projects/:projectId/meetings/:id/generate-summary")
  meetingSummary(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.venture.generateSummary(projectId, id, "meeting", actor.userId);
  }

  @Post("projects/:projectId/retrospectives/:id/generate-insights")
  retroInsights(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.venture.generateSummary(
      projectId,
      id,
      "retrospective",
      actor.userId,
    );
  }

  @Post("projects/:projectId/build-pack")
  buildPack(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.venture.generateBuildPack(projectId, actor.userId);
  }
}
