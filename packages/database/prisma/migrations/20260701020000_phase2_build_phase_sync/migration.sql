-- Phase 2: Build Phase + Build Sync
-- Add: BuildPhaseStatus enum, BuildPhase, BuildPack, BuildSyncUpload
-- Modify: Story (add buildPhaseId)

-- CreateEnum
CREATE TYPE "BuildPhaseStatus" AS ENUM ('draft', 'ready', 'active', 'closed');

-- CreateTable
CREATE TABLE "BuildPhase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BuildPhaseStatus" NOT NULL DEFAULT 'draft',
    "brandKitObjectId" UUID,
    "userFlowObjectId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildPack" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buildPhaseId" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'queued',
    "prdDocumentId" UUID,
    "buildSyncFileObjectId" UUID,
    "buildSyncInstructionsObjectId" UUID,
    "projectContextSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BuildPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildSyncUpload" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buildPhaseId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "storageObjectId" UUID NOT NULL,
    "buildPhaseIdentifier" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "ingestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildSyncUpload_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Story" ADD COLUMN "buildPhaseId" UUID;

-- CreateIndex
CREATE INDEX "BuildPhase_projectId_idx" ON "BuildPhase"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BuildPack_buildPhaseId_key" ON "BuildPack"("buildPhaseId");

-- CreateIndex
CREATE INDEX "BuildSyncUpload_buildPhaseId_idx" ON "BuildSyncUpload"("buildPhaseId");

-- CreateIndex
CREATE INDEX "Story_buildPhaseId_idx" ON "Story"("buildPhaseId");

-- AddForeignKey
ALTER TABLE "BuildPhase" ADD CONSTRAINT "BuildPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPack" ADD CONSTRAINT "BuildPack_buildPhaseId_fkey" FOREIGN KEY ("buildPhaseId") REFERENCES "BuildPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildSyncUpload" ADD CONSTRAINT "BuildSyncUpload_buildPhaseId_fkey" FOREIGN KEY ("buildPhaseId") REFERENCES "BuildPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_buildPhaseId_fkey" FOREIGN KEY ("buildPhaseId") REFERENCES "BuildPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
