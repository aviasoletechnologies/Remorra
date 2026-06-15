import { Module } from "@nestjs/common";
import { ViabilityController } from "./viability.controller.js";
import { ViabilityService } from "./viability.service.js";

@Module({
  controllers: [ViabilityController],
  providers: [ViabilityService],
})
export class ViabilityModule {}
