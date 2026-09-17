ALTER TABLE "transcriptions"
  ADD COLUMN "manual_retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processing_phase" VARCHAR(32);
