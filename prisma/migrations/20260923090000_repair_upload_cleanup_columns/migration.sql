-- Repair production databases where the upload cleanup fields were not
-- created even though an earlier migration may already be recorded.
ALTER TABLE "uploads"
  ADD COLUMN IF NOT EXISTS "storage_public_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cleanup_pending" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "uploads_cleanup_pending_is_deleted_idx"
  ON "uploads" ("cleanup_pending", "is_deleted");
