-- Soft deletion is uniform across every application table.
ALTER TABLE "transcriptions" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "profiles" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "posts" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "comments" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "friendships" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "uploads" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "audit_logs" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "refresh_tokens" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "password_reset_tokens" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "email_verification_tokens" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "post_likes" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "post_reports" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "tags" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "post_tags" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "post_attachments" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "posts_is_deleted_created_at_idx" ON "posts"("is_deleted", "created_at" DESC);
CREATE INDEX "comments_is_deleted_created_at_idx" ON "comments"("is_deleted", "created_at" DESC);
