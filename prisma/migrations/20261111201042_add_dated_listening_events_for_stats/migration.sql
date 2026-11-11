-- CreateTable
CREATE TABLE "listening_history_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "provider_track_id" VARCHAR(255) NOT NULL,
    "played_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listening_history_events_user_id_played_at_idx" ON "listening_history_events"("user_id", "played_at");

-- CreateIndex
CREATE INDEX "listening_history_events_user_id_provider_provider_track_id_idx" ON "listening_history_events"("user_id", "provider", "provider_track_id", "played_at");

-- AddForeignKey
ALTER TABLE "listening_history_events" ADD CONSTRAINT "listening_history_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
