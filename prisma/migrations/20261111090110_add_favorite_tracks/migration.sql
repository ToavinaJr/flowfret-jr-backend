-- AlterTable
ALTER TABLE "listening_history" ADD COLUMN     "is_favorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "listening_history_user_id_is_favorite_updated_at_idx" ON "listening_history"("user_id", "is_favorite", "updated_at" DESC);
