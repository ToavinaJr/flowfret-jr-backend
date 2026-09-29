CREATE TYPE "InstructorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "TeachingCourseFormat" AS ENUM ('INDIVIDUAL', 'GROUP');
CREATE TYPE "TeachingMode" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');
CREATE TYPE "TeachingCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "TeachingPriceUnit" AS ENUM ('PER_COURSE', 'PER_LESSON');
CREATE TYPE "TeachingEnrollmentStatus" AS ENUM ('REQUESTED', 'INVITED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_COURSE_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_ENROLLMENT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'TEACHING_ENROLLMENT_UPDATED';

CREATE TABLE "instructor_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "InstructorStatus" NOT NULL DEFAULT 'PENDING',
  "headline" VARCHAR(160),
  "biography" TEXT,
  "experience_years" INTEGER,
  "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "storage_quota_bytes" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "instructor_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instructor_profiles_experience_nonnegative" CHECK ("experience_years" IS NULL OR "experience_years" >= 0),
  CONSTRAINT "instructor_profiles_storage_quota_nonnegative" CHECK ("storage_quota_bytes" >= 0)
);

CREATE TABLE "teaching_courses" (
  "id" UUID NOT NULL,
  "instructor_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "level" VARCHAR(50),
  "format" "TeachingCourseFormat" NOT NULL DEFAULT 'INDIVIDUAL',
  "max_students" INTEGER NOT NULL DEFAULT 1,
  "teaching_mode" "TeachingMode" NOT NULL DEFAULT 'HYBRID',
  "price_amount" INTEGER NOT NULL,
  "price_currency" VARCHAR(3) NOT NULL,
  "price_unit" "TeachingPriceUnit" NOT NULL DEFAULT 'PER_COURSE',
  "duration_minutes" INTEGER NOT NULL,
  "status" "TeachingCourseStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "teaching_courses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teaching_courses_capacity_valid" CHECK (("format" = 'INDIVIDUAL' AND "max_students" = 1) OR ("format" = 'GROUP' AND "max_students" >= 2)),
  CONSTRAINT "teaching_courses_paid_price_positive" CHECK ("price_amount" > 0),
  CONSTRAINT "teaching_courses_duration_valid" CHECK ("duration_minutes" BETWEEN 15 AND 480),
  CONSTRAINT "teaching_courses_currency_format" CHECK ("price_currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "teaching_enrollments" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "status" "TeachingEnrollmentStatus" NOT NULL DEFAULT 'REQUESTED',
  "invited_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "teaching_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "instructor_profiles_user_id_key" ON "instructor_profiles"("user_id");
CREATE INDEX "instructor_profiles_status_is_deleted_created_at_idx" ON "instructor_profiles"("status", "is_deleted", "created_at" DESC);
CREATE INDEX "teaching_courses_instructor_id_status_is_deleted_updated_at_idx" ON "teaching_courses"("instructor_id", "status", "is_deleted", "updated_at" DESC);
CREATE INDEX "teaching_courses_status_teaching_mode_is_deleted_created_at_idx" ON "teaching_courses"("status", "teaching_mode", "is_deleted", "created_at" DESC);
CREATE UNIQUE INDEX "teaching_enrollments_course_student_unique" ON "teaching_enrollments"("course_id", "student_id");
CREATE INDEX "teaching_enrollments_student_id_status_is_deleted_updated_at_idx" ON "teaching_enrollments"("student_id", "status", "is_deleted", "updated_at" DESC);
CREATE INDEX "teaching_enrollments_course_id_status_is_deleted_created_at_idx" ON "teaching_enrollments"("course_id", "status", "is_deleted", "created_at");

ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_courses" ADD CONSTRAINT "teaching_courses_instructor_id_fkey"
  FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_enrollments" ADD CONSTRAINT "teaching_enrollments_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "teaching_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_enrollments" ADD CONSTRAINT "teaching_enrollments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
