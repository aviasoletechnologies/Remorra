import { Module } from "@nestjs/common";
import { RefineController } from "./refine.controller.js";
import { RefineService } from "./refine.service.js";

@Module({ controllers: [RefineController], providers: [RefineService] })
export class RefineModule {}
