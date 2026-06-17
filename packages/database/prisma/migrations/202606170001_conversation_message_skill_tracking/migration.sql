-- Track which AI skill was active when each message was created.
-- Applies to both user messages (skill pinned at send time) and
-- assistant messages (skill that generated the response).
ALTER TABLE "ConversationMessage"
ADD COLUMN IF NOT EXISTS "skillId"        TEXT,
ADD COLUMN IF NOT EXISTS "skillVersionId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConversationMessage_skillId_fkey'
  ) THEN
    ALTER TABLE "ConversationMessage"
    ADD CONSTRAINT "ConversationMessage_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConversationMessage_skillVersionId_fkey'
  ) THEN
    ALTER TABLE "ConversationMessage"
    ADD CONSTRAINT "ConversationMessage_skillVersionId_fkey"
    FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ConversationMessage_skillId_idx" ON "ConversationMessage"("skillId");
