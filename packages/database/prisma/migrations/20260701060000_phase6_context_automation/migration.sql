-- Phase 6: Project Context Automation (RemoraDocument §10)
-- Generalizes ContextProposal beyond Evolve (Layer 2) to also carry Layer 1
-- (entity-pattern/roster auto-capture) and Layer 3 (periodic drift review)
-- proposals, plus founder-configurable rules/schedule for those two layers.

-- CreateEnum
CREATE TYPE "ContextProposalSource" AS ENUM ('layer1', 'layer2', 'layer3');

-- DropForeignKey
ALTER TABLE "ContextProposal" DROP CONSTRAINT "ContextProposal_evolveSessionId_fkey";

-- AlterTable
ALTER TABLE "ContextProposal"
  ALTER COLUMN "evolveSessionId" DROP NOT NULL,
  ADD COLUMN "source" "ContextProposalSource" NOT NULL DEFAULT 'layer2';

-- AddForeignKey
ALTER TABLE "ContextProposal" ADD CONSTRAINT "ContextProposal_evolveSessionId_fkey" FOREIGN KEY ("evolveSessionId") REFERENCES "EvolveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ContextAutoCaptureRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pattern" TEXT NOT NULL,
    "entityTypes" TEXT[],
    "contextText" TEXT NOT NULL,
    "minOccurrences" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextAutoCaptureRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextReviewConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cronExpression" TEXT NOT NULL DEFAULT '0 3 * * 1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextReviewConfig_pkey" PRIMARY KEY ("id")
);

-- Seed a single default config row (weekly, Monday 3am) so Layer 3 has a
-- schedule out of the box; admin can edit cronExpression/active afterward.
INSERT INTO "ContextReviewConfig" ("id", "cronExpression", "active", "updatedAt")
VALUES (gen_random_uuid(), '0 3 * * 1', true, CURRENT_TIMESTAMP);
