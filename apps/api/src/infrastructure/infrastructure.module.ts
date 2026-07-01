import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AnthropicService } from "./anthropic.service.js";
import { SupabaseAuthGuard } from "./auth.guard.js";
import { PrismaService } from "./prisma.service.js";
import { QueueService } from "./queue.service.js";
import { StorageService } from "./storage.service.js";
import { ProjectAccessService } from "./project-access.service.js";
import { PhaseGuard } from "../shared/phase.guard.js";
import { PhaseCompletionService } from "../shared/phase-completion.service.js";

@Global()
@Module({
  providers: [
    PrismaService,
    StorageService,
    QueueService,
    AnthropicService,
    ProjectAccessService,
    PhaseGuard,
    PhaseCompletionService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [
    PrismaService,
    StorageService,
    QueueService,
    AnthropicService,
    ProjectAccessService,
    PhaseGuard,
    PhaseCompletionService,
  ],
})
export class InfrastructureModule {}
