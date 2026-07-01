-- Health Score component weights become admin-configurable (RemoraDocument
-- §20: "Health Score components and weightings" is a Configuration item,
-- not code) instead of a hardcoded object in the worker.

-- CreateTable
CREATE TABLE "HealthScoreWeightConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "component" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthScoreWeightConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthScoreWeightConfig_component_key" ON "HealthScoreWeightConfig"("component");

-- Seed the 7 default weights per HARDIK doc Q13 (admin can adjust afterward)
INSERT INTO "HealthScoreWeightConfig" ("id", "component", "weight", "updatedAt") VALUES
  (gen_random_uuid(), 'problem_top', 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'idea_top', 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'user_top', 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'problem_detail', 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'idea_detail', 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'user_detail', 15, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'cohesion', 10, CURRENT_TIMESTAMP);
