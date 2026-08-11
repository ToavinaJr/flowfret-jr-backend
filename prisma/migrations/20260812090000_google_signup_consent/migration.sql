-- Explicitly distinguish a Google sign-up from the former auto-provisioning
-- behavior of the Google login endpoint. Legacy rows must confirm once via
-- the dedicated registration flow.
ALTER TABLE "users"
ADD COLUMN "google_signup_completed" BOOLEAN NOT NULL DEFAULT false;
