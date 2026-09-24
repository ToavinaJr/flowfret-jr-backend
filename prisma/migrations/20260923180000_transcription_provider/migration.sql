ALTER TABLE "transcriptions"
ADD COLUMN IF NOT EXISTS "provider" "MusicProvider" NOT NULL DEFAULT 'AUDIUS';

-- Prisma created this uniqueness rule as an index in
-- 20260807110000_transcriptions, not as a table constraint.
DROP INDEX IF EXISTS "transcriptions_cache_key_unique";

DROP INDEX IF EXISTS "transcriptions_track_id_idx";

DROP INDEX IF EXISTS "transcriptions_provider_track_id_idx";

CREATE UNIQUE INDEX "transcriptions_cache_key_unique"
ON "transcriptions"("provider", "track_id", "requested_language", "model", "engine_version");

CREATE INDEX "transcriptions_provider_track_id_idx"
ON "transcriptions"("provider", "track_id");
