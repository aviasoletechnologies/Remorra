-- Phase 4a: model tier + Evolve session scaffolding
-- Add: ModelTier enum, SkillVersion.modelTier (fixes silent "standard"-only bug)
-- Add: EvolveSession (session-scoping for Evolve, per-phase resumable sessions
--      for Discover/Refine reuse the existing Conversation.kind mechanism)

-- CreateEnum
CREATE TYPE "ModelTier" AS ENUM ('fast', 'standard', 'reasoning');

-- AlterTable
ALTER TABLE "SkillVersion" ADD COLUMN "modelTier" "ModelTier" NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "EvolveSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "launchedFrom" TEXT NOT NULL,
    "topic" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvolveSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvolveSession_conversationId_key" ON "EvolveSession"("conversationId");

-- CreateIndex
CREATE INDEX "EvolveSession_projectId_status_idx" ON "EvolveSession"("projectId", "status");

-- AddForeignKey
ALTER TABLE "EvolveSession" ADD CONSTRAINT "EvolveSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolveSession" ADD CONSTRAINT "EvolveSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
