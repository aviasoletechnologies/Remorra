import { Module } from "@nestjs/common";
import { WorkspaceFlowController } from "./workspace-flow.controller.js";
import { IntentRouterService } from "./intent-router.service.js";
import { WorkspaceFlowService } from "./workspace-flow.service.js";
import { EventRouterModule } from "../event-router/event-router.module.js";

@Module({
  imports: [EventRouterModule],
  controllers: [WorkspaceFlowController],
  providers: [WorkspaceFlowService, IntentRouterService],
})
export class WorkspaceFlowModule {}
