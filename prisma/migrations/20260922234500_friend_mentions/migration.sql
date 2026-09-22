CREATE TABLE "post_mentions" (
  "post_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "post_mentions_pkey" PRIMARY KEY ("post_id", "user_id")
);

CREATE TABLE "comment_mentions" (
  "comment_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("comment_id", "user_id")
);

CREATE INDEX "post_mentions_user_id_created_at_idx" ON "post_mentions"("user_id", "created_at" DESC);
CREATE INDEX "comment_mentions_user_id_created_at_idx" ON "comment_mentions"("user_id", "created_at" DESC);

ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "post_tags";
DROP TABLE IF EXISTS "tags";
