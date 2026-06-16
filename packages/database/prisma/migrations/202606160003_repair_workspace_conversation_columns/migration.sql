ALTER TABLE "Conversation"
ADD COLUMN IF NOT EXISTS "activeSkillId" TEXT,
ADD COLUMN IF NOT EXISTS "activeSkillVersionId" UUID,
ADD COLUMN IF NOT EXISTS "activeSkillPinnedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_activeSkillId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_activeSkillId_fkey"
    FOREIGN KEY ("activeSkillId") REFERENCES "Skill"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_activeSkillVersionId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_activeSkillVersionId_fkey"
    FOREIGN KEY ("activeSkillVersionId") REFERENCES "SkillVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Conversation_activeSkillId_idx" ON "Conversation"("activeSkillId");
CREATE INDEX IF NOT EXISTS "Conversation_activeSkillVersionId_idx" ON "Conversation"("activeSkillVersionId");
