import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { PhaseGuard, RequirePhase } from "../../shared/phase.guard.js";
import { EvolveService } from "./evolve.service.js";

@RequirePhase("venture", "evolve")
@UseGuards(PhaseGuard)
@Controller()
export class EvolveController {
  constructor(private readonly evolve: EvolveService) {}

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post("projects/:projectId/evolve/sessions")
  create(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.evolve.createSession(projectId, actor.userId, body);
  }

  @Get("projects/:projectId/evolve/sessions")
  list(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.evolve.listSessions(projectId, actor.userId);
  }

  @Patch("projects/:projectId/evolve/sessions/:sessionId/status")
  updateStatus(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.evolve.updateStatus(projectId, sessionId, actor.userId, body);
  }
}
