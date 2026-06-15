import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";
import { PrismaProjectRepository } from "./prisma-project.repository.js";
import { PROJECT_REPOSITORY } from "./project.repository.js";
import { EvolveModule } from "../evolve/evolve.module.js";

@Module({
  imports: [EvolveModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    {
      provide: PROJECT_REPOSITORY,
      useClass: PrismaProjectRepository,
    },
  ],
  exports: [ProjectsService, PROJECT_REPOSITORY],
})
export class ProjectsModule {}
