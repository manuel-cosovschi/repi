ALTER TABLE "notification_outbox" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_user_idx" ON "notification_outbox" USING btree ("user_id","created_at");