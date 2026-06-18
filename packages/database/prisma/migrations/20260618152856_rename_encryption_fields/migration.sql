-- AlterTable
ALTER TABLE "Conversation" RENAME COLUMN "encryptedTitle" TO "title";

-- AlterTable
ALTER TABLE "ConversationMessage" RENAME COLUMN "encryptedContent" TO "content";
