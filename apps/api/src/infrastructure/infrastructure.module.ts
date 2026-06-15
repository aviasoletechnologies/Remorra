import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AnthropicService } from "./anthropic.service.js";
import { SupabaseAuthGuard } from "./auth.guard.js";
import { CryptoService } from "./crypto.service.js";
import { PrismaService } from "./prisma.service.js";
import { QueueService } from "./queue.service.js";
import { StorageService } from "./storage.service.js";
import { ProjectAccessService } from "./project-access.service.js";

@Global()
@Module({
  providers: [
    PrismaService,
    CryptoService,
    StorageService,
    QueueService,
    AnthropicService,
    ProjectAccessService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
  exports: [
    PrismaService,
    CryptoService,
    StorageService,
    QueueService,
    AnthropicService,
    ProjectAccessService,
  ],
})
export class InfrastructureModule {}
