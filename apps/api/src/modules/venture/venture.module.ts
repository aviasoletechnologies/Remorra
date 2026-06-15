import { Module } from "@nestjs/common";
import { VentureController } from "./venture.controller.js";
import { VentureService } from "./venture.service.js";

@Module({ controllers: [VentureController], providers: [VentureService] })
export class VentureModule {}
