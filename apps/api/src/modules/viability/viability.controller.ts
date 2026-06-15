import { Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { ViabilityService } from "./viability.service.js";
import {
  CurrentActor,
  type Actor,
} from "../../shared/request-context.js";

@ApiTags("viability")
@Controller("viability")
export class ViabilityController {
  constructor(private readonly viability: ViabilityService) {}

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post("projects/:projectId/calculate")
  calculate(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.viability.calculate(projectId, actor.userId);
  }

  @Get("projects/:projectId/current")
  current(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.viability.current(projectId, actor.userId);
  }
}
