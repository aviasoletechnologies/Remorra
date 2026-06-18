import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health.controller.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { VentureModule } from "./modules/venture/venture.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { JobsModule } from "./modules/jobs/jobs.module.js";
import { GdprModule } from "./modules/gdpr/gdpr.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { SanitizeMiddleware } from "./infrastructure/sanitize.middleware.js";
import { EventRouterModule } from "./modules/event-router/event-router.module.js";
import { WorkspaceFlowModule } from "./modules/workspace-flow/workspace-flow.module.js";


@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    InfrastructureModule,
    ProjectsModule,
    AuthModule,
    VentureModule,
    ReportsModule,
    JobsModule,
    GdprModule,
    AdminModule,
    EventRouterModule,
    WorkspaceFlowModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SanitizeMiddleware).forRoutes("*");
  }
}
