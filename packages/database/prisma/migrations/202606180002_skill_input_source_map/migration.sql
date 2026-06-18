ALTER TABLE "SkillVersion"
ADD COLUMN IF NOT EXISTS "inputRequirementText" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "inputSourceMap" JSONB NOT NULL DEFAULT '{"requiredInputs": []}'::jsonb;
