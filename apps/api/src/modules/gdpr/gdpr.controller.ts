import { Body, Controller, Delete, Get, Post } from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { GdprService } from "./gdpr.service.js";

@Controller("users/me")
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Get("export")
  latest(@CurrentActor() actor: Actor) {
    return this.gdpr.latestExport(actor.userId);
  }

  @Post("export")
  requestExport(@CurrentActor() actor: Actor) {
    return this.gdpr.requestExport(actor.userId);
  }

  @Post("deletion")
  deletion(@CurrentActor() actor: Actor) {
    return this.gdpr.requestDeletion(actor.userId);
  }

  @Delete("deletion")
  cancel(@CurrentActor() actor: Actor) {
    return this.gdpr.cancelDeletion(actor.userId);
  }

  @Post("purge-data")
  purgeData(@CurrentActor() actor: Actor) {
    return this.gdpr.purgeUserData(actor.userId);
  }

  @Post("subscription/cancel")
  cancelSubscription(@CurrentActor() actor: Actor, @Body() body: { reason: string }) {
    return this.gdpr.cancelSubscription(actor.userId, body);
  }
}
