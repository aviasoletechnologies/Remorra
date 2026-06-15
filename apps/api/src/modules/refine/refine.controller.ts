import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { RefineService } from "./refine.service.js";

@Controller()
export class RefineController {
  constructor(private readonly refine: RefineService) {}

  @Post("refine/sessions")
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.refine.create(actor.userId, body);
  }

  @Get("refine/sessions/:id")
  get(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.get(id, actor.userId);
  }

  @Post("refine/sessions/:id/messages")
  message(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { content: string },
  ) {
    return this.refine.message(id, actor.userId, body.content);
  }

  @Post("refine/sessions/:id/extract")
  extract(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.extract(id, actor.userId);
  }

  @Get("refine/sessions/:id/proposals")
  proposals(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.proposals(id, actor.userId);
  }

  @Post("refine/proposals/:id/confirm")
  confirm(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.decide(id, actor.userId, true);
  }

  @Post("refine/proposals/:id/reject")
  reject(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.decide(id, actor.userId, false);
  }

  @Get("projects/:id/product-pack")
  pack(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.productPack(id, actor.userId);
  }

  @Get("projects/:id/linkage")
  linkage(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.linkage(id, actor.userId);
  }

  @Post("projects/:id/linkage/check")
  check(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.refine.linkage(id, actor.userId);
  }
}
