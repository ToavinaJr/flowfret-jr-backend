CREATE TABLE "transcription_access" (
  "user_id" UUID NOT NULL,
  "transcription_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "transcription_access_pkey" PRIMARY KEY ("user_id", "transcription_id")
);

CREATE INDEX "transcription_access_transcription_id_idx"
  ON "transcription_access"("transcription_id");

ALTER TABLE "transcription_access"
  ADD CONSTRAINT "transcription_access_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transcription_access"
  ADD CONSTRAINT "transcription_access_transcription_id_fkey"
  FOREIGN KEY ("transcription_id") REFERENCES "transcriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
