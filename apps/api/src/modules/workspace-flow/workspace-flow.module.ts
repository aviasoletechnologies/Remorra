import { Module } from "@nestjs/common";
import { WorkspaceFlowController } from "./workspace-flow.controller.js";
import { WorkspaceFlowService } from "./workspace-flow.service.js";

@Module({
  controllers: [WorkspaceFlowController],
  providers: [WorkspaceFlowService],
})
export class WorkspaceFlowModule {}
