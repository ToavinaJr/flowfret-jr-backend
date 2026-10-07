CREATE TYPE "AudioStemStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "audio_stems" (
  "id" UUID NOT NULL,
  "provider" "MusicProvider" NOT NULL DEFAULT 'AUDIUS',
  "track_id" VARCHAR(255) NOT NULL,
  "title" VARCHAR(500),
  "artist" VARCHAR(500),
  "engine_version" VARCHAR(32) NOT NULL,
  "status" "AudioStemStatus" NOT NULL DEFAULT 'PENDING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "duration" DOUBLE PRECISION,
  "vocals_url" TEXT,
  "vocals_public_id" TEXT,
  "vocals_file_size" BIGINT,
  "instrumental_url" TEXT,
  "instrumental_public_id" TEXT,
  "instrumental_file_size" BIGINT,
  "error_code" VARCHAR(64),
  "error_message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "audio_stems_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audio_stems_cache_key_unique" ON "audio_stems"("provider", "track_id", "engine_version");
CREATE INDEX "audio_stems_provider_track_id_idx" ON "audio_stems"("provider", "track_id");
CREATE INDEX "audio_stems_status_idx" ON "audio_stems"("status");
