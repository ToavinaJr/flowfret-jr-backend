ALTER TABLE "transcriptions"
ADD COLUMN "provider" "MusicProvider" NOT NULL DEFAULT 'AUDIUS';

ALTER TABLE "transcriptions"
DROP CONSTRAINT "transcriptions_cache_key_unique";

DROP INDEX IF EXISTS "transcriptions_track_id_idx";

CREATE UNIQUE INDEX "transcriptions_cache_key_unique"
ON "transcriptions"("provider", "track_id", "requested_language", "model", "engine_version");

CREATE INDEX "transcriptions_provider_track_id_idx"
ON "transcriptions"("provider", "track_id");
