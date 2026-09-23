CREATE TYPE "MusicProvider" AS ENUM ('AUDIUS', 'SPOTIFY', 'YOUTUBE');
CREATE TYPE "PlaylistVisibility" AS ENUM ('PRIVATE', 'FRIENDS', 'PUBLIC');

CREATE TABLE "catalog_tracks" (
  "id" UUID NOT NULL,
  "provider" "MusicProvider" NOT NULL,
  "provider_track_id" VARCHAR(255) NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "artists" JSONB NOT NULL,
  "album" VARCHAR(500),
  "image_url" TEXT,
  "external_url" TEXT NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "isrc" VARCHAR(32),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "catalog_tracks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_tracks_duration_nonnegative" CHECK ("duration_ms" >= 0)
);

CREATE TABLE "playlists" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "cover_url" TEXT,
  "visibility" "PlaylistVisibility" NOT NULL DEFAULT 'PRIVATE',
  "version" INTEGER NOT NULL DEFAULT 0,
  "next_position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "playlists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "playlists_version_nonnegative" CHECK ("version" >= 0),
  CONSTRAINT "playlists_next_position_nonnegative" CHECK ("next_position" >= 0)
);

CREATE TABLE "playlist_items" (
  "id" UUID NOT NULL,
  "playlist_id" UUID NOT NULL,
  "track_id" UUID NOT NULL,
  "added_by_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "playlist_items_position_nonnegative" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "catalog_tracks_provider_track_unique"
  ON "catalog_tracks"("provider", "provider_track_id");
CREATE INDEX "catalog_tracks_provider_title_idx"
  ON "catalog_tracks"("provider", "title");
CREATE INDEX "playlists_user_id_is_deleted_updated_at_idx"
  ON "playlists"("user_id", "is_deleted", "updated_at" DESC);
CREATE UNIQUE INDEX "playlist_items_playlist_track_unique"
  ON "playlist_items"("playlist_id", "track_id");
CREATE UNIQUE INDEX "playlist_items_playlist_position_unique"
  ON "playlist_items"("playlist_id", "position");
CREATE INDEX "playlist_items_track_id_idx" ON "playlist_items"("track_id");
CREATE INDEX "playlist_items_added_by_id_idx" ON "playlist_items"("added_by_id");

ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_fkey"
  FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_track_id_fkey"
  FOREIGN KEY ("track_id") REFERENCES "catalog_tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_added_by_id_fkey"
  FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
