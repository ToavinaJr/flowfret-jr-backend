CREATE TABLE "chord_transcriptions" (
    "id" UUID NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "provider_track_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500),
    "artist" VARCHAR(500),
    "duration" DOUBLE PRECISION NOT NULL,
    "cues" JSONB NOT NULL,
    "engine_version" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chord_transcriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listening_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "provider_track_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "artists" JSONB NOT NULL,
    "image_url" TEXT,
    "external_url" TEXT NOT NULL,
    "stream_url" TEXT NOT NULL,
    "album" VARCHAR(500),
    "genre" VARCHAR(120),
    "isrc" VARCHAR(32),
    "duration_ms" INTEGER NOT NULL,
    "play_count" INTEGER NOT NULL DEFAULT 1,
    "last_played_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listening_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chord_transcriptions_provider_track_unique"
ON "chord_transcriptions"("provider", "provider_track_id");

CREATE INDEX "chord_transcriptions_provider_provider_track_id_idx"
ON "chord_transcriptions"("provider", "provider_track_id");

CREATE UNIQUE INDEX "listening_history_user_provider_track_unique"
ON "listening_history"("user_id", "provider", "provider_track_id");

CREATE INDEX "listening_history_user_id_last_played_at_idx"
ON "listening_history"("user_id", "last_played_at" DESC);

ALTER TABLE "listening_history"
ADD CONSTRAINT "listening_history_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
