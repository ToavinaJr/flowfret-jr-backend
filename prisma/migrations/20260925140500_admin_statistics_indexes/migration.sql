CREATE INDEX "transcriptions_is_deleted_created_at_idx"
ON "transcriptions"("is_deleted", "created_at" DESC);

CREATE INDEX "users_is_deleted_created_at_idx"
ON "users"("is_deleted", "created_at" DESC);

CREATE INDEX "users_is_deleted_status_idx"
ON "users"("is_deleted", "status");

CREATE INDEX "posts_is_deleted_created_at_idx"
ON "posts"("is_deleted", "created_at" DESC);

CREATE INDEX "comments_is_deleted_created_at_idx"
ON "comments"("is_deleted", "created_at" DESC);

CREATE INDEX "uploads_is_deleted_created_at_idx"
ON "uploads"("is_deleted", "created_at" DESC);

CREATE INDEX "audit_logs_action_is_deleted_created_at_idx"
ON "audit_logs"("action", "is_deleted", "created_at" DESC);

CREATE INDEX "post_reports_is_deleted_created_at_idx"
ON "post_reports"("is_deleted", "created_at" DESC);
