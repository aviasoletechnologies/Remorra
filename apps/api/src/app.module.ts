import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { DiscoverModule } from "./modules/discover/discover.module.js";
import { EvolveModule } from "./modules/evolve/evolve.module.js";
import { ViabilityModule } from "./modules/viability/viability.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { RefineModule } from "./modules/refine/refine.module.js";
import { VentureModule } from "./modules/venture/venture.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { JobsModule } from "./modules/jobs/jobs.module.js";
import { GdprModule } from "./modules/gdpr/gdpr.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";

@Module({
  imports: [
    InfrastructureModule,
    ProjectsModule,
    DiscoverModule,
    EvolveModule,
    ViabilityModule,
    AuthModule,
    RefineModule,
    VentureModule,
    ReportsModule,
    JobsModule,
    GdprModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
