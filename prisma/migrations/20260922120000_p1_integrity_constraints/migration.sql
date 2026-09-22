-- Normalize the existing identity key before enforcing case-insensitive uniqueness.
UPDATE "users" SET "email" = lower(btrim("email"));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce case-insensitive email uniqueness: duplicate emails exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "users_email_ci_unique" ON "users" (lower("email"));

-- A relationship is unique regardless of who sent the request first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "friendships"
    WHERE "is_deleted" = false AND "status" IN ('PENDING', 'ACCEPTED', 'BLOCKED')
    GROUP BY LEAST("requester_id", "receiver_id"), GREATEST("requester_id", "receiver_id")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce canonical friendship uniqueness: duplicate active relationships exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "friendships_active_canonical_pair_unique"
  ON "friendships" (LEAST("requester_id", "receiver_id"), GREATEST("requester_id", "receiver_id"))
  WHERE "is_deleted" = false AND "status" IN ('PENDING', 'ACCEPTED', 'BLOCKED');

-- A user can have only one active report for a given post.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "post_reports"
    WHERE "is_deleted" = false
    GROUP BY "post_id", "reporter_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce report uniqueness: duplicate active reports exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "post_reports_active_post_reporter_unique"
  ON "post_reports" ("post_id", "reporter_id")
  WHERE "is_deleted" = false;

ALTER TABLE "uploads"
  ADD COLUMN "storage_public_id" TEXT,
  ADD COLUMN "cleanup_pending" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "uploads_cleanup_pending_is_deleted_idx"
  ON "uploads" ("cleanup_pending", "is_deleted");
