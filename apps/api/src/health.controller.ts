import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "./infrastructure/public.decorator.js";

@ApiTags("system")
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      status: "ok",
      service: "remorra-api",
      timestamp: new Date().toISOString(),
    };
  }
}
