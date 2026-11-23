import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { HealthScoreService } from "./health-score.service.js";

// No PhaseGuard here — reading the latest score is harmless in any phase
// (Overview shows it once calculated, "not scored" otherwise), and the
// "fires once at Initiate" rule is enforced inside HealthScoreService.calculate()
// with a precise error message rather than a generic phase-mismatch one.
@Controller("projects/:projectId/health-score")
export class HealthScoreController {
  constructor(private readonly healthScore: HealthScoreService) {}

  @Get()
  latest(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.healthScore.latest(projectId, actor.userId);
  }

  @Post("calculate")
  calculate(@CurrentActor() actor: Actor, @Param("projectId") projectId: string) {
    return this.healthScore.calculate(projectId, actor.userId);
  }
}
