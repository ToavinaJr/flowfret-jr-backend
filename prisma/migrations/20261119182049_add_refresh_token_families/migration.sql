-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "family_id" UUID,
ADD COLUMN     "rotated_at" TIMESTAMPTZ(6);

-- Existing tokens have no reliable rotation lineage; keep each one isolated.
UPDATE "refresh_tokens" SET "family_id" = "id";

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_revoked_at_idx" ON "refresh_tokens"("family_id", "revoked_at");
