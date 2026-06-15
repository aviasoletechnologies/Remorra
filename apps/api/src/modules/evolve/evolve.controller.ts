import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  CurrentActor,
  type Actor,
} from "../../shared/request-context.js";
import { EvolveService } from "./evolve.service.js";

@ApiTags("evolve")
@Controller("evolve/sessions")
export class EvolveController {
  constructor(private readonly evolve: EvolveService) {}

  @Post()
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.evolve.create(body, actor.userId);
  }

  @Get(":id")
  get(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.evolve.get(id, actor.userId);
  }

  @Post(":id/messages")
  message(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { content: string },
  ) {
    return this.evolve.message(id, actor.userId, body.content);
  }

  @Post(":id/screen")
  screen(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.evolve.screen(id, actor.userId);
  }

  @Post(":id/impacts/:impactId/decision")
  decide(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("impactId") impactId: string,
    @Body() body: { decision: "approved" | "rejected" },
  ) {
    return this.evolve.decide(id, impactId, body.decision, actor.userId);
  }

  @Post(":id/impacts/:impactId/resolve")
  resolve(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("impactId") impactId: string,
    @Body() body: {
      resolution: "accept" | "keep_current" | "edit_payload" | "retarget" | "split" | "reject";
      note?: string;
      payload?: any;
    },
  ) {
    return this.evolve.resolve(
      id,
      impactId,
      body.resolution,
      body.note,
      body.payload,
      actor.userId,
    );
  }

  @Post(":id/complete")
  complete(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { currentProjectVersion: number },
  ) {
    return this.evolve.complete(id, body.currentProjectVersion, actor.userId);
  }
}
