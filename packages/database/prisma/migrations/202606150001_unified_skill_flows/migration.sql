ALTER TYPE "ConversationKind" ADD VALUE IF NOT EXISTS 'workspace';

CREATE TYPE "FlowVersionStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "FlowExecutionMode" AS ENUM ('visible_chat', 'internal_helper', 'deterministic', 'explicit_action', 'human_review');
CREATE TYPE "FlowRunStatus" AS ENUM ('active', 'paused', 'completed', 'failed');
CREATE TYPE "FlowStepRunStatus" AS ENUM ('pending', 'active', 'completed', 'skipped', 'failed');

CREATE TABLE "FlowDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlowDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowVersion" (
  "id" UUID NOT NULL,
  "flowDefinitionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "FlowVersionStatus" NOT NULL DEFAULT 'draft',
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowStep" (
  "id" UUID NOT NULL,
  "flowVersionId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "skillId" TEXT,
  "parentStepKey" TEXT,
  "position" INTEGER NOT NULL,
  "executionMode" "FlowExecutionMode" NOT NULL,
  "optional" BOOLEAN NOT NULL DEFAULT false,
  "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "entryRules" JSONB NOT NULL,
  "requiredOutputs" JSONB NOT NULL,
  "completionRules" JSONB NOT NULL,
  "transitionRules" JSONB NOT NULL,
  CONSTRAINT "FlowStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowRun" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "flowVersionId" UUID NOT NULL,
  "currentStepKey" TEXT,
  "status" "FlowRunStatus" NOT NULL DEFAULT 'active',
  "context" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowStepRun" (
  "id" UUID NOT NULL,
  "flowRunId" UUID NOT NULL,
  "flowStepId" UUID NOT NULL,
  "skillVersionId" UUID,
  "status" "FlowStepRunStatus" NOT NULL DEFAULT 'pending',
  "inputSnapshot" JSONB NOT NULL,
  "producedOutputs" JSONB NOT NULL,
  "missingOutputs" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "FlowStepRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionLedger" (
  "id" UUID NOT NULL,
  "flowRunId" UUID NOT NULL,
  "stepRunId" UUID,
  "fieldKey" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "status" TEXT NOT NULL DEFAULT 'asked',
  "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  CONSTRAINT "QuestionLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowVersion_flowDefinitionId_version_key" ON "FlowVersion"("flowDefinitionId", "version");
CREATE INDEX "FlowVersion_flowDefinitionId_status_idx" ON "FlowVersion"("flowDefinitionId", "status");
CREATE UNIQUE INDEX "FlowStep_flowVersionId_key_key" ON "FlowStep"("flowVersionId", "key");
CREATE UNIQUE INDEX "FlowStep_flowVersionId_position_key" ON "FlowStep"("flowVersionId", "position");
CREATE INDEX "FlowStep_flowVersionId_parentStepKey_idx" ON "FlowStep"("flowVersionId", "parentStepKey");
CREATE INDEX "FlowRun_projectId_status_idx" ON "FlowRun"("projectId", "status");
CREATE INDEX "FlowRun_flowVersionId_idx" ON "FlowRun"("flowVersionId");
CREATE UNIQUE INDEX "FlowStepRun_flowRunId_flowStepId_key" ON "FlowStepRun"("flowRunId", "flowStepId");
CREATE INDEX "FlowStepRun_flowRunId_status_idx" ON "FlowStepRun"("flowRunId", "status");
CREATE INDEX "QuestionLedger_flowRunId_status_idx" ON "QuestionLedger"("flowRunId", "status");

ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowDefinitionId_fkey" FOREIGN KEY ("flowDefinitionId") REFERENCES "FlowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlowStep" ADD CONSTRAINT "FlowStep_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowStep" ADD CONSTRAINT "FlowStep_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlowStepRun" ADD CONSTRAINT "FlowStepRun_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowStepRun" ADD CONSTRAINT "FlowStepRun_flowStepId_fkey" FOREIGN KEY ("flowStepId") REFERENCES "FlowStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlowStepRun" ADD CONSTRAINT "FlowStepRun_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionLedger" ADD CONSTRAINT "QuestionLedger_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionLedger" ADD CONSTRAINT "QuestionLedger_stepRunId_fkey" FOREIGN KEY ("stepRunId") REFERENCES "FlowStepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
