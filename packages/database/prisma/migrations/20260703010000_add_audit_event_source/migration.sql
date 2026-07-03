-- CreateEnum
CREATE TYPE "AuditEventSource" AS ENUM ('evolve_session', 'build_sync', 'manual_edit', 'auto_detection');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN "source" "AuditEventSource";
