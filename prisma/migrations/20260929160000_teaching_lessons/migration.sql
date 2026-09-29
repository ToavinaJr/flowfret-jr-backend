CREATE TYPE "TeachingLessonStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "LessonAttendanceStatus" AS ENUM ('EXPECTED', 'PRESENT', 'ABSENT', 'EXCUSED');
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_LESSON_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_LESSON_RESCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_LESSON_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_LESSON_COMPLETED';

CREATE TABLE "teaching_lessons" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "time_zone" VARCHAR(64) NOT NULL,
  "teaching_mode" "TeachingMode" NOT NULL,
  "location" VARCHAR(500),
  "meeting_url" TEXT,
  "status" "TeachingLessonStatus" NOT NULL DEFAULT 'SCHEDULED',
  "cancellation_note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "teaching_lessons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teaching_lessons_positive_interval" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "teaching_lessons_timezone_nonempty" CHECK (length(trim("time_zone")) > 0),
  CONSTRAINT "teaching_lessons_location_present" CHECK ("teaching_mode" <> 'IN_PERSON' OR length(trim(coalesce("location", ''))) > 0),
  CONSTRAINT "teaching_lessons_meeting_url_present" CHECK ("teaching_mode" <> 'ONLINE' OR length(trim(coalesce("meeting_url", ''))) > 0)
);

CREATE TABLE "lesson_attendances" (
  "id" UUID NOT NULL,
  "lesson_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "status" "LessonAttendanceStatus" NOT NULL DEFAULT 'EXPECTED',
  "note" VARCHAR(1000),
  "marked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "lesson_attendances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_attendance_lesson_enrollment_unique" ON "lesson_attendances"("lesson_id", "enrollment_id");
CREATE INDEX "teaching_lessons_course_id_starts_at_idx" ON "teaching_lessons"("course_id", "starts_at");
CREATE INDEX "teaching_lessons_status_starts_at_ends_at_idx" ON "teaching_lessons"("status", "starts_at", "ends_at");
CREATE INDEX "teaching_lessons_created_by_id_starts_at_idx" ON "teaching_lessons"("created_by_id", "starts_at");
CREATE INDEX "lesson_attendances_enrollment_id_status_idx" ON "lesson_attendances"("enrollment_id", "status");

ALTER TABLE "teaching_lessons" ADD CONSTRAINT "teaching_lessons_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "teaching_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_lessons" ADD CONSTRAINT "teaching_lessons_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_attendances" ADD CONSTRAINT "lesson_attendances_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "teaching_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_attendances" ADD CONSTRAINT "lesson_attendances_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "teaching_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
