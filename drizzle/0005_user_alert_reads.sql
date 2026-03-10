CREATE TABLE IF NOT EXISTS "user_alert_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "alert_id" varchar(200) NOT NULL,
  "read_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_alert_reads_user_alert_idx"
ON "user_alert_reads" ("user_id", "alert_id");
