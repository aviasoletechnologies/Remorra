-- Surface WHY a Build Sync upload failed (mismatched buildPhaseIdentifier,
-- missing columns, no valid status rows) instead of just a bare "failed"
-- badge with no explanation.
ALTER TABLE "BuildSyncUpload" ADD COLUMN "error" TEXT;
