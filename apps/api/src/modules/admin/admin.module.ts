import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { InputSourceMapProposalService } from "./input-source-map-proposal.service.js";

@Module({ controllers: [AdminController], providers: [AdminService, InputSourceMapProposalService] })
export class AdminModule {}
