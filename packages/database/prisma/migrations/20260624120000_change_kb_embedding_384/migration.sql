-- Change embedding column from vector(768) to vector(384) for all-MiniLM-L6-v2
ALTER TABLE "KnowledgeBase" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "KnowledgeBase" ADD COLUMN "embedding" vector(384);
