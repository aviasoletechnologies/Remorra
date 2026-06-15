import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { AuthService } from "./auth.service.js";

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("auth/me")
  me(@CurrentActor() actor: Actor) {
    return this.auth.me(actor.userId);
  }

  @Post("auth/consent")
  consent(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.auth.consent(actor.userId, body);
  }

  @Post("projects/:id/invitations")
  invite(
    @CurrentActor() actor: Actor,
    @Param("id") projectId: string,
    @Body() body: unknown,
  ) {
    return this.auth.invite(projectId, actor.userId, body);
  }

  @Post("invitations/:token/accept")
  accept(@CurrentActor() actor: Actor, @Param("token") token: string) {
    return this.auth.accept(actor.userId, actor.email, token);
  }
}
