-- CreateEnum
CREATE TYPE "PlaylistCollaboratorRole" AS ENUM ('VIEWER', 'EDITOR');

-- CreateTable
CREATE TABLE "playlist_collaborators" (
    "playlist_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "role" "PlaylistCollaboratorRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "playlist_collaborators_pkey" PRIMARY KEY ("playlist_id","user_id")
);

-- CreateIndex
CREATE INDEX "playlist_collaborators_user_id_updated_at_idx" ON "playlist_collaborators"("user_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
