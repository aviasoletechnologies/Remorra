import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  CurrentActor,
  type Actor,
} from "../../shared/request-context.js";
import { notFound } from "../../shared/http-errors.js";
import { DiscoverService } from "./discover.service.js";

@ApiTags("discover")
@Controller("discover/sessions")
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Post()
  start(@CurrentActor() actor: Actor, @Body() body: { projectId: string }) {
    return this.discover.start(body.projectId, actor.userId);
  }

  @Get("project/:projectId/latest")
  latest(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.discover.latest(projectId, actor.userId);
  }

  @Get(":id")
  async get(@CurrentActor() actor: Actor, @Param("id") id: string) {
    const session = await this.discover.get(id, actor.userId);
    if (!session) notFound("Discover session", id);
    return session;
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post(":id/messages")
  async message(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { content: string },
  ) {
    return this.discover.message(id, actor.userId, body.content);
  }

  @Post(":id/extract")
  extract(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.discover.extract(id, actor.userId);
  }

  @Post(":id/extracts/:extractId/confirm")
  confirm(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("extractId") extractId: string,
  ) {
    return this.discover.confirmExtract(id, extractId, actor.userId);
  }

  @Post(":id/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.discover.upload(id, actor.userId, file);
  }
}
