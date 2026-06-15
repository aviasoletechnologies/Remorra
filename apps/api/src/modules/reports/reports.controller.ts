import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { ReportsService } from "./reports.service.js";

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("report-definitions")
  definitions() {
    return this.reports.definitions();
  }

  @Post("projects/:projectId/reports")
  create(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: { reportType: string },
  ) {
    return this.reports.createReport(projectId, actor.userId, body.reportType);
  }

  @Get("projects/:projectId/reports")
  list(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
  ) {
    return this.reports.list(projectId, actor.userId);
  }

  @Get("reports/:id")
  report(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.reports.get(id, actor.userId);
  }

  @Post("reports/:id/retry")
  retry(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.reports.retry(id, actor.userId);
  }

  @Post("projects/:projectId/documents")
  document(
    @CurrentActor() actor: Actor,
    @Param("projectId") projectId: string,
    @Body() body: { type: string },
  ) {
    return this.reports.createDocument(projectId, actor.userId, body.type);
  }

  @Get("documents/:id")
  getDocument(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.reports.document(id, actor.userId);
  }

  @Get("documents/:id/download")
  download(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.reports.download(id, actor.userId);
  }
}
