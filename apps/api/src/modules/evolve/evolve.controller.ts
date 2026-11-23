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

  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post("projects/:projectId/evolve/sessions/:sessionId/messages")
  sendMessage(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.evolve.sendMessage(projectId, sessionId, actor.userId, body);
  }

  @Get("projects/:projectId/evolve/sessions/:sessionId/messages")
  listMessages(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.evolve.listMessages(projectId, sessionId, actor.userId);
  }

  @Get("projects/:projectId/evolve/sessions/:sessionId/actions")
  listActions(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.evolve.listActions(projectId, sessionId, actor.userId);
  }

  @Patch("projects/:projectId/evolve/actions/:actionId/impact-items/:itemId")
  decideImpactItem(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("actionId") actionId: string,
    @Param("itemId") itemId: string,
    @Body() body: { decision?: "confirmed" | "rejected" },
  ) {
    return this.evolve.decideImpactItem(projectId, actionId, itemId, actor.userId, body);
  }

  @Post("projects/:projectId/evolve/actions/:actionId/approve")
  approveAction(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.evolve.approveAction(projectId, actionId, actor.userId);
  }

  @Post("projects/:projectId/evolve/actions/:actionId/reject")
  rejectAction(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.evolve.rejectAction(projectId, actionId, actor.userId);
  }

  @Get("projects/:projectId/evolve/context-proposals")
  listContextProposals(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.evolve.listContextProposals(projectId, actor.userId);
  }

  @Post("projects/:projectId/evolve/context-proposals/:proposalId/approve")
  approveContextProposal(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("proposalId") proposalId: string,
  ) {
    return this.evolve.approveContextProposal(projectId, proposalId, actor.userId);
  }

  @Post("projects/:projectId/evolve/context-proposals/:proposalId/reject")
  rejectContextProposal(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Param("proposalId") proposalId: string,
  ) {
    return this.evolve.rejectContextProposal(projectId, proposalId, actor.userId);
  }
}
