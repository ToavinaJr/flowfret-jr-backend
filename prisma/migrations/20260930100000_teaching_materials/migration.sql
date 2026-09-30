ALTER TYPE "UploadSourceType" ADD VALUE IF NOT EXISTS 'COURSE_MATERIAL';
CREATE TYPE "UploadResourceType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "UploadAccessType" AS ENUM ('PUBLIC', 'AUTHENTICATED');
ALTER TABLE "uploads"
  ADD COLUMN "resource_type" "UploadResourceType" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "access_type" "UploadAccessType" NOT NULL DEFAULT 'PUBLIC';
CREATE TABLE "teaching_materials" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "lesson_id" UUID,
  "upload_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "teaching_materials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teaching_materials_upload_id_key" ON "teaching_materials"("upload_id");
CREATE INDEX "teaching_materials_course_id_is_deleted_created_at_idx" ON "teaching_materials"("course_id", "is_deleted", "created_at" DESC);
CREATE INDEX "teaching_materials_lesson_id_is_deleted_created_at_idx" ON "teaching_materials"("lesson_id", "is_deleted", "created_at" DESC);
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "teaching_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "teaching_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
