ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FRIEND_POST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POST_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOWED_POST_ACTIVITY';

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_preferences_user_type_unique" ON "notification_preferences"("user_id", "type");
CREATE INDEX "notification_preferences_user_id_enabled_idx" ON "notification_preferences"("user_id", "enabled");
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
