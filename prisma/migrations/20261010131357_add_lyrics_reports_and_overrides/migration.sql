-- CreateTable
CREATE TABLE "lyrics_reports" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "track_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "artist" VARCHAR(500) NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "lyrics_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lyrics_overrides" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "track_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "artist" VARCHAR(500) NOT NULL,
    "plain_lyrics" TEXT NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lyrics_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lyrics_reports_provider_track_id_status_idx" ON "lyrics_reports"("provider", "track_id", "status");

-- CreateIndex
CREATE INDEX "lyrics_reports_status_created_at_idx" ON "lyrics_reports"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lyrics_overrides_provider_track_id_key" ON "lyrics_overrides"("provider", "track_id");

-- AddForeignKey
ALTER TABLE "lyrics_reports" ADD CONSTRAINT "lyrics_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyrics_overrides" ADD CONSTRAINT "lyrics_overrides_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "teaching_enrollments_student_id_status_is_deleted_updated_at_id" RENAME TO "teaching_enrollments_student_id_status_is_deleted_updated_a_idx";
