ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "notification_settings" jsonb;
