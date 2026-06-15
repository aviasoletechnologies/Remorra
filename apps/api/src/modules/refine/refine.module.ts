import { Module } from "@nestjs/common";
import { RefineController } from "./refine.controller.js";
import { RefineService } from "./refine.service.js";
import { ViabilityModule } from "../viability/viability.module.js";

@Module({
  imports: [ViabilityModule],
  controllers: [RefineController],
  providers: [RefineService],
})
export class RefineModule {}

