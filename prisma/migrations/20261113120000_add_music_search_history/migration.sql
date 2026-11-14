CREATE TABLE "music_searches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "result_limit" INTEGER NOT NULL,
    "result_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_searches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "music_search_results" (
    "id" UUID NOT NULL,
    "search_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "provider_track_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "artists" JSONB NOT NULL,
    "album" VARCHAR(500),
    "duration_ms" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_search_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "music_search_results_search_position_unique"
ON "music_search_results"("search_id", "position");

CREATE INDEX "music_searches_user_id_created_at_idx"
ON "music_searches"("user_id", "created_at" DESC);

CREATE INDEX "music_searches_provider_created_at_idx"
ON "music_searches"("provider", "created_at" DESC);

CREATE INDEX "music_search_results_provider_provider_track_id_idx"
ON "music_search_results"("provider", "provider_track_id");

CREATE INDEX "music_search_results_search_id_position_idx"
ON "music_search_results"("search_id", "position");

ALTER TABLE "music_searches"
ADD CONSTRAINT "music_searches_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "music_search_results"
ADD CONSTRAINT "music_search_results_search_id_fkey"
FOREIGN KEY ("search_id") REFERENCES "music_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
