import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("metrics")
  metrics(@CurrentActor() actor: Actor) {
    return this.admin.metrics(actor);
  }

  @Get("users")
  users(@CurrentActor() actor: Actor) {
    return this.admin.users(actor);
  }

  @Get("skills")
  skills(@CurrentActor() actor: Actor) {
    return this.admin.skills(actor);
  }

  @Post("skills/:skillId/versions/:versionId/activate")
  activate(
    @CurrentActor() actor: Actor,
    @Param("skillId") skillId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.admin.activateSkill(actor, skillId, versionId);
  }

  @Post("skills/:skillId/versions")
  createSkillVersion(
    @CurrentActor() actor: Actor,
    @Param("skillId") skillId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.createSkillVersion(actor, skillId, body);
  }

  @Get("skill-mappings")
  mappings(@CurrentActor() actor: Actor) {
    return this.admin.mappings(actor);
  }

  @Put("skill-mappings/:eventType")
  setMapping(
    @CurrentActor() actor: Actor,
    @Param("eventType") eventType: string,
    @Body() body: { skillId: string },
  ) {
    return this.admin.setMapping(actor, eventType, body.skillId);
  }

  @Get("jobs")
  jobs(@CurrentActor() actor: Actor) {
    return this.admin.jobs(actor);
  }

  @Post("jobs/:id/retry")
  retryJob(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.admin.retryJob(actor, id);
  }

  @Get("retention")
  retention(@CurrentActor() actor: Actor) {
    return this.admin.retention(actor);
  }

  @Patch("retention/:id")
  updateRetention(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { retentionDays?: number | null; enabled?: boolean },
  ) {
    return this.admin.updateRetention(actor, id, body);
  }

  @Patch("users/:id/platform-role")
  updatePlatformRole(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { platformRole: "user" | "admin" | "support" },
  ) {
    return this.admin.updatePlatformRole(actor, id, body.platformRole);
  }

  @Post("knowledge-bases/:id/versions")
  createKnowledgeVersion(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { markdown: string; activate?: boolean },
  ) {
    return this.admin.createKnowledgeVersion(actor, id, body);
  }

  @Get("reports")
  reports(@CurrentActor() actor: Actor) {
    return this.admin.reports(actor);
  }

  @Post("reports/:id/versions")
  createReportVersion(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.createReportVersion(actor, id, body);
  }

  @Get("knowledge-bases")
  knowledge(@CurrentActor() actor: Actor) {
    return this.admin.knowledge(actor);
  }

  @Get("audits")
  audits(@CurrentActor() actor: Actor) {
    return this.admin.audits(actor);
  }
}
