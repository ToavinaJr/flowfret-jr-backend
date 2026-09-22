CREATE TABLE IF NOT EXISTS "tags" (
  "id" UUID NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "post_tags" (
  "post_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id", "tag_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_key" ON "tags"("name");
CREATE INDEX IF NOT EXISTS "tags_name_idx" ON "tags"("name");
CREATE INDEX IF NOT EXISTS "post_tags_tag_id_idx" ON "post_tags"("tag_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_tags_post_id_fkey') THEN
    ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey"
      FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_tags_tag_id_fkey') THEN
    ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey"
      FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
