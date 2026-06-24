-- Change embedding column from vector(384) to vector(1024) for @cf/baai/bge-m3
ALTER TABLE "KnowledgeBase" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "KnowledgeBase" ADD COLUMN "embedding" vector(1024);
