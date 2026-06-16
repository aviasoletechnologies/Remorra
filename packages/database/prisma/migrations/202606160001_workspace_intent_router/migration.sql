-- Persist the active skill pinned to a workspace conversation.
ALTER TABLE "Conversation"
ADD COLUMN "activeSkillId" TEXT,
ADD COLUMN "activeSkillVersionId" UUID,
ADD COLUMN "activeSkillPinnedAt" TIMESTAMP(3);

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_activeSkillId_fkey"
FOREIGN KEY ("activeSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_activeSkillVersionId_fkey"
FOREIGN KEY ("activeSkillVersionId") REFERENCES "SkillVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Conversation_activeSkillId_idx" ON "Conversation"("activeSkillId");
CREATE INDEX "Conversation_activeSkillVersionId_idx" ON "Conversation"("activeSkillVersionId");
