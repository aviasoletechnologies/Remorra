import { Global, Module } from "@nestjs/common";
import { EventRouterService } from "./event-router.service.js";

@Global()
@Module({
  providers: [EventRouterService],
  exports: [EventRouterService],
})
export class EventRouterModule {}
