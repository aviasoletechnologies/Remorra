/*
  Warnings:

  - You are about to drop the column `modelTier` on the `SkillVersion` table. All the data in the column will be lost.
  - You are about to drop the column `tokenCeiling` on the `SkillVersion` table. All the data in the column will be lost.
  - Added the required column `targetQueue` to the `SkillEventMapping` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ConversationMessage" DROP CONSTRAINT "ConversationMessage_skillVersionId_fkey";

-- DropIndex
DROP INDEX "Conversation_activeSkillVersionId_idx";

-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'report',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "DocumentTemplateVersion" ADD COLUMN     "createdBy" UUID,
ADD COLUMN     "schema" JSONB;

-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN     "templateVersionId" UUID;

-- AlterTable
ALTER TABLE "SkillEventMapping" ADD COLUMN     "conditions" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "targetQueue" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SkillVersion" DROP COLUMN "modelTier",
DROP COLUMN "tokenCeiling",
ALTER COLUMN "inputSourceMap" SET DEFAULT '{}';

-- CreateTable
CREATE TABLE "CostConfig" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inputCostMinor" INTEGER NOT NULL DEFAULT 0,
    "outputCostMinor" INTEGER NOT NULL DEFAULT 0,
    "flatCostMinor" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStreamEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "projectId" UUID,
    "userId" UUID,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "delta" TEXT,
    "snapshot" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStreamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostConfig_key_key" ON "CostConfig"("key");

-- CreateIndex
CREATE INDEX "JobStreamEvent_projectId_createdAt_idx" ON "JobStreamEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "JobStreamEvent_userId_createdAt_idx" ON "JobStreamEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JobStreamEvent_jobId_sequence_idx" ON "JobStreamEvent"("jobId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "JobStreamEvent_jobId_sequence_key" ON "JobStreamEvent"("jobId", "sequence");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStreamEvent" ADD CONSTRAINT "JobStreamEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStreamEvent" ADD CONSTRAINT "JobStreamEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStreamEvent" ADD CONSTRAINT "JobStreamEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
