-- BuildSyncUpload.storageObjectId had no declared relation to StorageObject
-- since Phase 2 — the worker's handleBuildSyncIngest include: { storageObject: true }
-- has been throwing "Unknown field `storageObject`" on every real upload,
-- and that throw happens before the try/catch, so BuildSyncUpload.status
-- never even advances past "queued". This adds the missing FK.
ALTER TABLE "BuildSyncUpload" ADD CONSTRAINT "BuildSyncUpload_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
