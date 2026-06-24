-- DropForeignKey
ALTER TABLE "AiInvocation" DROP CONSTRAINT "AiInvocation_skillVersionId_fkey";

-- DropForeignKey
ALTER TABLE "SkillVersion" DROP CONSTRAINT "SkillVersion_skillId_fkey";

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation" ADD CONSTRAINT "AiInvocation_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
