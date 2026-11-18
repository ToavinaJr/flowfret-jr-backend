-- CreateEnum
CREATE TYPE "PlaylistCollaboratorStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "playlist_collaborators" ADD COLUMN     "accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "status" "PlaylistCollaboratorStatus" NOT NULL DEFAULT 'PENDING';
