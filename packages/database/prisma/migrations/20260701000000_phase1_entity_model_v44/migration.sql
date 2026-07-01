-- Phase 1: Entity Model Migration (V4.4)
-- Replace 7-level hierarchy (Ambition→OKR→Persona→UserNeed→UserStory) with 3-level (Goal→Epic→Story)
-- Remove: Cycle, Task, DailyMeeting, Retrospective, FinanceCategory, FinanceEntry, BuildPackSnapshot
-- Remove enums: CycleStatus, EvolveMode
-- Modify enums: ProjectRole (remove supplier)
-- Add: Goal, Epic, Story, PersonaStory
-- Modify: Project (add context), Skill (add phase)

-- DropTable (dependent tables first)
DROP TABLE IF EXISTS "OkrPersona";
DROP TABLE IF EXISTS "MeetingParticipant";
DROP TABLE IF EXISTS "Task";
DROP TABLE IF EXISTS "DailyMeeting";
DROP TABLE IF EXISTS "Retrospective";
DROP TABLE IF EXISTS "FinanceEntry";
DROP TABLE IF EXISTS "FinanceCategory";
DROP TABLE IF EXISTS "UserStory";
DROP TABLE IF EXISTS "UserNeed";
DROP TABLE IF EXISTS "Okr";
DROP TABLE IF EXISTS "Ambition";
DROP TABLE IF EXISTS "Cycle";
DROP TABLE IF EXISTS "BuildPackSnapshot";

-- DropEnum (only after all referencing tables are gone)
DROP TYPE IF EXISTS "CycleStatus";
DROP TYPE IF EXISTS "EvolveMode";

-- Remove 'supplier' from ProjectRole enum
-- PostgreSQL cannot remove enum values directly; recreate the type
ALTER TYPE "ProjectRole" RENAME TO "ProjectRole_old";
CREATE TYPE "ProjectRole" AS ENUM ('founder', 'team');
ALTER TABLE "ProjectMembership" ALTER COLUMN "role" TYPE "ProjectRole" USING "role"::text::"ProjectRole";
ALTER TABLE "Invitation" ALTER COLUMN "role" TYPE "ProjectRole" USING "role"::text::"ProjectRole";
DROP TYPE "ProjectRole_old";

-- WorkStatus and Priority: drop and recreate to remove any stale associations
-- (UserStory is already dropped above so no references remain)
DROP TYPE IF EXISTS "WorkStatus";
DROP TYPE IF EXISTS "Priority";
CREATE TYPE "WorkStatus" AS ENUM ('ready', 'in_progress', 'review', 'done');
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'critical');

-- Add context field to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "context" JSONB;

-- Add phase field to Skill (guard against re-run)
ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "phase" "DrivePhase" NOT NULL DEFAULT 'discover';

-- CreateTable Goal
CREATE TABLE "Goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable Epic
CREATE TABLE "Epic" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable Story
CREATE TABLE "Story" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "epicId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "acceptance" JSONB NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'ready',
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "position" INTEGER NOT NULL DEFAULT 0,
    "estimatePoints" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable PersonaStory (M2M: Persona ↔ Story)
CREATE TABLE "PersonaStory" (
    "personaId" UUID NOT NULL,
    "storyId" UUID NOT NULL,
    CONSTRAINT "PersonaStory_pkey" PRIMARY KEY ("personaId", "storyId")
);

-- CreateIndex
CREATE INDEX "Goal_projectId_idx" ON "Goal"("projectId");
CREATE INDEX "Epic_projectId_idx" ON "Epic"("projectId");
CREATE INDEX "Epic_goalId_idx" ON "Epic"("goalId");
CREATE INDEX "Story_projectId_status_position_idx" ON "Story"("projectId", "status", "position");
CREATE INDEX "Story_epicId_idx" ON "Story"("epicId");

-- AddForeignKey Goal → Project
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Epic → Project
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Epic → Goal
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Story → Project
ALTER TABLE "Story" ADD CONSTRAINT "Story_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Story → Epic
ALTER TABLE "Story" ADD CONSTRAINT "Story_epicId_fkey"
    FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey PersonaStory → Persona
ALTER TABLE "PersonaStory" ADD CONSTRAINT "PersonaStory_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey PersonaStory → Story
ALTER TABLE "PersonaStory" ADD CONSTRAINT "PersonaStory_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
