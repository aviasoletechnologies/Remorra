-- AlterTable: add document context columns to ConversationMessage
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "documentName" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "documentContent" TEXT;
