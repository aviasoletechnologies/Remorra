import { Module } from "@nestjs/common";
import { BuildPhaseController } from "./build-phase.controller.js";
import { BuildPhaseService } from "./build-phase.service.js";

@Module({ controllers: [BuildPhaseController], providers: [BuildPhaseService] })
export class BuildPhaseModule {}
