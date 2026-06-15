import type { DrivePhase, Project, ProjectRole } from "@remorra/contracts";

export interface ProjectRecord extends Project {
  ownerId: string;
  summary?: string;
}

export interface ProjectRepository {
  listForUser(userId: string): Promise<ProjectRecord[]>;
  find(id: string): Promise<ProjectRecord | null>;
  roleForUser(projectId: string, userId: string): Promise<ProjectRole | null>;
  create(input: {
    ownerId: string;
    name: string;
    summary?: string;
  }): Promise<ProjectRecord>;
  advance(
    id: string,
    expectedVersion: number,
    phase: DrivePhase,
  ): Promise<ProjectRecord>;
}

export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");
