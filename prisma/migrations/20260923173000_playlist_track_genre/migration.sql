ALTER TABLE "catalog_tracks"
ADD COLUMN "genre" VARCHAR(120);

CREATE INDEX "catalog_tracks_genre_idx" ON "catalog_tracks"("genre");
