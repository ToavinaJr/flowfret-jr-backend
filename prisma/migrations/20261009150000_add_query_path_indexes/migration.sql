CREATE INDEX "comments_post_id_is_deleted_created_at_idx"
ON "comments"("post_id", "is_deleted", "created_at" DESC);

CREATE INDEX "post_likes_post_id_is_deleted_created_at_idx"
ON "post_likes"("post_id", "is_deleted", "created_at" DESC);

CREATE INDEX "notifications_user_id_is_deleted_created_at_idx"
ON "notifications"("user_id", "is_deleted", "created_at" DESC);

CREATE INDEX "uploads_user_id_is_deleted_idx"
ON "uploads"("user_id", "is_deleted");

CREATE INDEX "post_reports_post_id_is_deleted_created_at_idx"
ON "post_reports"("post_id", "is_deleted", "created_at" DESC);
