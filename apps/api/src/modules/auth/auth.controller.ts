import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { AuthService } from "./auth.service.js";

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("auth/me")
  me(@CurrentActor() actor: Actor) {
    return this.auth.me(actor.userId);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("auth/consent")
  consent(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.auth.consent(actor.userId, body);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("projects/:id/invitations")
  invite(
    @CurrentActor() actor: Actor,
    @Param("id") projectId: string,
    @Body() body: unknown,
  ) {
    return this.auth.invite(projectId, actor.userId, body);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("invitations/:token/accept")
  accept(@CurrentActor() actor: Actor, @Param("token") token: string) {
    return this.auth.accept(actor.userId, actor.email, token);
  }
}
