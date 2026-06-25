import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { CreateProject } from "@remorra/contracts";
import {
  CurrentActor,
  type Actor,
} from "../../shared/request-context.js";
import { ProjectsService } from "./projects.service.js";

@ApiTags("projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.projects.list(actor.userId);
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body() input: CreateProject) {
    return this.projects.create(actor.userId, input);
  }

  @Get(":id")
  get(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.projects.getForUser(id, actor.userId);
  }


  @Patch(":id/phase")
  advance(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Headers("if-match") ifMatch: string,
    @Body() body: { phase: string },
  ) {
    return this.projects.advance(
      id,
      actor.userId,
      Number(ifMatch),
      body.phase,
    );
  }

  @Get(":id/product-pack")
  getProductPack(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.projects.getProductPack(id, actor.userId);
  }
}
