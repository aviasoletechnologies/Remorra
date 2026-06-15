import { Module } from "@nestjs/common";
import { EvolveController } from "./evolve.controller.js";
import { EvolveService } from "./evolve.service.js";
import { ViabilityModule } from "../viability/viability.module.js";

@Module({
  imports: [ViabilityModule],
  controllers: [EvolveController],
  providers: [EvolveService],
  exports: [EvolveService],
})
export class EvolveModule {}
