-- Phase 3: Health Score
-- Add: HealthScore, HealthScoreComponent (one-time readiness assessment at Initiate)

-- CreateTable
CREATE TABLE "HealthScore" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "readinessAssessment" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skillVersionId" UUID NOT NULL,

    CONSTRAINT "HealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthScoreComponent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "healthScoreId" UUID NOT NULL,
    "component" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "actions" JSONB NOT NULL,

    CONSTRAINT "HealthScoreComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthScore_projectId_calculatedAt_idx" ON "HealthScore"("projectId", "calculatedAt");

-- CreateIndex
CREATE INDEX "HealthScoreComponent_healthScoreId_idx" ON "HealthScoreComponent"("healthScoreId");

-- AddForeignKey
ALTER TABLE "HealthScore" ADD CONSTRAINT "HealthScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthScore" ADD CONSTRAINT "HealthScore_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthScoreComponent" ADD CONSTRAINT "HealthScoreComponent_healthScoreId_fkey" FOREIGN KEY ("healthScoreId") REFERENCES "HealthScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
