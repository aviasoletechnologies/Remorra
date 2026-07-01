-- Phase 4: Evolve messaging + Screening Engine + Action Capability
-- RemoraDocument §7 — Goal changes require Impact Screener cascade assessment
-- (EvolveImpactItem, per-item severity) before atomic apply; non-Goal actions
-- (Story/RaidItem/etc.) apply directly on confirm via EvolveAction.
-- RemoraDocument §10 Layer 2 — AI-proposed project.context updates (ContextProposal).

-- CreateEnum
CREATE TYPE "ImpactSeverity" AS ENUM ('red', 'amber', 'green');

-- CreateTable
CREATE TABLE "EvolveAction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evolveSessionId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "actionType" TEXT NOT NULL,
    "proposedChange" JSONB NOT NULL,
    "requiresScreening" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" UUID,

    CONSTRAINT "EvolveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvolveImpactItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evolveActionId" UUID NOT NULL,
    "affectedEntityType" TEXT NOT NULL,
    "affectedEntityId" UUID,
    "severity" "ImpactSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "suggestedChange" JSONB,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "EvolveImpactItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextProposal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evolveSessionId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "proposedText" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" UUID,

    CONSTRAINT "ContextProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvolveAction_evolveSessionId_status_idx" ON "EvolveAction"("evolveSessionId", "status");

-- CreateIndex
CREATE INDEX "EvolveAction_projectId_status_idx" ON "EvolveAction"("projectId", "status");

-- CreateIndex
CREATE INDEX "EvolveImpactItem_evolveActionId_idx" ON "EvolveImpactItem"("evolveActionId");

-- CreateIndex
CREATE INDEX "ContextProposal_evolveSessionId_status_idx" ON "ContextProposal"("evolveSessionId", "status");

-- CreateIndex
CREATE INDEX "ContextProposal_projectId_status_idx" ON "ContextProposal"("projectId", "status");

-- AddForeignKey
ALTER TABLE "EvolveAction" ADD CONSTRAINT "EvolveAction_evolveSessionId_fkey" FOREIGN KEY ("evolveSessionId") REFERENCES "EvolveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolveAction" ADD CONSTRAINT "EvolveAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolveImpactItem" ADD CONSTRAINT "EvolveImpactItem_evolveActionId_fkey" FOREIGN KEY ("evolveActionId") REFERENCES "EvolveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextProposal" ADD CONSTRAINT "ContextProposal_evolveSessionId_fkey" FOREIGN KEY ("evolveSessionId") REFERENCES "EvolveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextProposal" ADD CONSTRAINT "ContextProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
