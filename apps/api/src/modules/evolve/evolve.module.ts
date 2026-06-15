import { Module } from "@nestjs/common";
import { EvolveController } from "./evolve.controller.js";
import { EvolveService } from "./evolve.service.js";

@Module({
  controllers: [EvolveController],
  providers: [EvolveService],
})
export class EvolveModule {}
