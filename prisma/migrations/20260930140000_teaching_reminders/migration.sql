ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEACHING_LESSON_REMINDER';
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" VARCHAR(255);
CREATE UNIQUE INDEX "notifications_dedupe_key_unique" ON "notifications"("dedupe_key");
CREATE TABLE "teaching_lesson_reminders" (
  "id" UUID NOT NULL,
  "lesson_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "minutes_before" INTEGER NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teaching_lesson_reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teaching_lesson_reminders_once_unique" ON "teaching_lesson_reminders"("lesson_id", "user_id", "minutes_before", "starts_at");
CREATE INDEX "teaching_lesson_reminders_user_id_created_at_idx" ON "teaching_lesson_reminders"("user_id", "created_at" DESC);
ALTER TABLE "teaching_lesson_reminders" ADD CONSTRAINT "teaching_lesson_reminders_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "teaching_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teaching_lesson_reminders" ADD CONSTRAINT "teaching_lesson_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
