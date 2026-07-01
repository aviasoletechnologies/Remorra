import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
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
  users(
    @CurrentActor() actor: Actor,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.admin.users(actor, pageNum, limitNum);
  }

  @Get("skills")
  skills(
    @CurrentActor() actor: Actor,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.admin.skills(actor, pageNum, limitNum);
  }

  @Post("skills")
  createSkill(
    @CurrentActor() actor: Actor,
    @Body() body: { id: string; name: string; description: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; kbEligible?: boolean; phase?: string },
  ) {
    return this.admin.createSkill(actor, body);
  }

  @Patch("skills/:skillId")
  updateSkill(
    @CurrentActor() actor: Actor,
    @Param("skillId") skillId: string,
    @Body() body: { name?: string; description?: string; kbEligible?: boolean; phase?: string },
  ) {
    return this.admin.updateSkill(actor, skillId, body);
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

  @Patch("skills/:skillId/versions/:versionId")
  updateSkillVersion(
    @CurrentActor() actor: Actor,
    @Param("skillId") skillId: string,
    @Param("versionId") versionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateSkillVersion(actor, skillId, versionId, body);
  }

  @Delete("skills/:skillId/versions/:versionId")
  deleteSkillVersion(
    @CurrentActor() actor: Actor,
    @Param("skillId") skillId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.admin.deleteSkillVersion(actor, skillId, versionId);
  }

  @Delete("skills/:skillId")
  deleteSkill(
    @CurrentActor() actor: Actor,
    @Param("skillId") skillId: string,
  ) {
    return this.admin.deleteSkill(actor, skillId);
  }

  @Get("db-schema")
  getDbSchema(@CurrentActor() actor: Actor) {
    return this.admin.getDbSchema(actor);
  }


  @Get("event-types")
  getEventTypes(@CurrentActor() actor: Actor) {
    return this.admin.getEventTypes(actor);
  }

  @Get("event-mappings")
  eventMappings(
    @CurrentActor() actor: Actor,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("phase") phase?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.admin.eventMappings(actor, pageNum, limitNum, phase);
  }

  @Post("event-mappings")
  createEventMapping(
    @CurrentActor() actor: Actor,
    @Body() body: { eventType: string; skillId: string; targetQueue?: string; conditions?: Record<string, unknown>; active?: boolean },
  ) {
    return this.admin.createEventMapping(actor, body);
  }

  @Put("event-mappings/:id")
  updateEventMapping(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { active?: boolean; skillId?: string; targetQueue?: string; conditions?: Record<string, unknown> },
  ) {
    return this.admin.updateEventMapping(actor, id, body);
  }

  @Delete("event-mappings/:id")
  deleteEventMapping(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
  ) {
    return this.admin.deleteEventMapping(actor, id);
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

  @Post("knowledge-bases")
  createKnowledge(
    @CurrentActor() actor: Actor,
    @Body() body: { id: string; name: string; description: string; markdown: string; topic?: string },
  ) {
    return this.admin.createKnowledge(actor, body);
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

  @Delete("knowledge-bases/:id")
  deleteKnowledge(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.admin.deleteKnowledge(actor, id);
  }

  @Post("knowledge-bases/:id/embed")
  embedKnowledge(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.admin.embedKnowledge(actor, id);
  }

  @Post("knowledge-bases/:id/versions/:versionId/activate")
  activateKnowledgeVersion(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.admin.activateKnowledgeVersion(actor, id, versionId);
  }

  @Delete("knowledge-bases/:id/versions/:versionId")
  deleteKnowledgeVersion(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.admin.deleteKnowledgeVersion(actor, id, versionId);
  }

  @Get("knowledge-bases")
  knowledge(@CurrentActor() actor: Actor) {
    return this.admin.knowledge(actor);
  }

  @Get("audits")
  audits(@CurrentActor() actor: Actor) {
    return this.admin.audits(actor);
  }

  // --- Phase 1: Document Templates Endpoints ---

  @Get("templates")
  getTemplates(@CurrentActor() actor: Actor) {
    return this.admin.getTemplates(actor);
  }

  @Post("templates/:id/versions")
  createTemplateVersion(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { html: string; css: string; schema: any },
  ) {
    return this.admin.createTemplateVersion(actor, id, body);
  }

  @Post("templates/:id/preview")
  previewTemplate(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { html: string; css: string; schema: any; sampleData: any },
  ) {
    return this.admin.previewTemplate(actor, id, body);
  }

  @Post("templates/:id/versions/:versionId/activate")
  activateTemplateVersion(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.admin.activateTemplateVersion(actor, id, versionId);
  }

  // --- Cost Configuration ---

  @Get("cost-configs")
  getCostConfigs(@CurrentActor() actor: Actor) {
    return this.admin.getCostConfigs(actor);
  }

  @Put("cost-configs/:key")
  updateCostConfig(
    @CurrentActor() actor: Actor,
    @Param("key") key: string,
    @Body() body: { name?: string; unit?: string; active?: boolean; inputCostMinor?: number; outputCostMinor?: number; flatCostMinor?: number },
  ) {
    return this.admin.updateCostConfig(actor, key, body);
  }

  // --- Health Score weight configuration ---

  @Get("health-score-weights")
  getHealthScoreWeights(@CurrentActor() actor: Actor) {
    return this.admin.getHealthScoreWeights(actor);
  }

  @Put("health-score-weights/:component")
  updateHealthScoreWeight(
    @CurrentActor() actor: Actor,
    @Param("component") component: string,
    @Body() body: { weight: number },
  ) {
    return this.admin.updateHealthScoreWeight(actor, component, body);
  }

  // --- Phase 6: Project Context Automation configuration ---

  @Get("context-auto-capture-rules")
  getContextAutoCaptureRules(@CurrentActor() actor: Actor) {
    return this.admin.getContextAutoCaptureRules(actor);
  }

  @Post("context-auto-capture-rules")
  createContextAutoCaptureRule(
    @CurrentActor() actor: Actor,
    @Body() body: { pattern: string; entityTypes: string[]; contextText: string; minOccurrences?: number },
  ) {
    return this.admin.createContextAutoCaptureRule(actor, body);
  }

  @Put("context-auto-capture-rules/:id")
  updateContextAutoCaptureRule(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { pattern?: string; entityTypes?: string[]; contextText?: string; minOccurrences?: number; active?: boolean },
  ) {
    return this.admin.updateContextAutoCaptureRule(actor, id, body);
  }

  @Delete("context-auto-capture-rules/:id")
  deleteContextAutoCaptureRule(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.admin.deleteContextAutoCaptureRule(actor, id);
  }

  @Get("context-review-config")
  getContextReviewConfig(@CurrentActor() actor: Actor) {
    return this.admin.getContextReviewConfig(actor);
  }

  @Put("context-review-config/:id")
  updateContextReviewConfig(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { cronExpression?: string; active?: boolean },
  ) {
    return this.admin.updateContextReviewConfig(actor, id, body);
  }

  // --- Phase 2: Metrics Endpoints ---

  @Get("metrics/overview")
  getOverviewMetrics(
    @CurrentActor() actor: Actor,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.admin.getOverviewMetrics(actor, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get("metrics/usage")
  getUsageMetrics(
    @CurrentActor() actor: Actor,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.admin.getUsageMetrics(actor, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get("metrics/costs")
  getCostsMetrics(
    @CurrentActor() actor: Actor,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.admin.getCostsMetrics(actor, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get("metrics/jobs")
  getJobsMetrics(
    @CurrentActor() actor: Actor,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.admin.getJobsMetrics(actor, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get("metrics/projects")
  getProjectsMetrics(@CurrentActor() actor: Actor) {
    return this.admin.getProjectsMetrics(actor);
  }

  // --- Support Workspace Endpoints ---

  @Get("support/projects")
  getSupportProjects(
    @CurrentActor() actor: Actor,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.admin.getSupportProjects(actor, pageNum, limitNum);
  }

  @Get("support/projects/:id")
  getSupportProjectDetails(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.admin.getSupportProjectDetails(actor, id);
  }
}
