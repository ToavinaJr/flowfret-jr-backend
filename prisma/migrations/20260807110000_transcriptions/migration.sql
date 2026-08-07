CREATE TYPE "TranscriptionStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'PROCESSING', 'READY_TO_PLAY', 'COMPLETED', 'FAILED');

CREATE TABLE "transcriptions" (
  "id" UUID NOT NULL,
  "track_id" VARCHAR(255) NOT NULL,
  "title" VARCHAR(500),
  "artist" VARCHAR(500),
  "requested_language" VARCHAR(16) NOT NULL DEFAULT 'auto',
  "detected_language" VARCHAR(16),
  "model" VARCHAR(32) NOT NULL,
  "engine_version" VARCHAR(32) NOT NULL,
  "status" "TranscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "buffered_until" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "duration" DOUBLE PRECISION,
  "ready_to_play" BOOLEAN NOT NULL DEFAULT false,
  "segments" JSONB,
  "lrc_content" TEXT,
  "error_code" VARCHAR(64),
  "error_message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "transcriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transcriptions_cache_key_unique" ON "transcriptions"("track_id", "requested_language", "model", "engine_version");
CREATE INDEX "transcriptions_track_id_idx" ON "transcriptions"("track_id");
CREATE INDEX "transcriptions_status_idx" ON "transcriptions"("status");
