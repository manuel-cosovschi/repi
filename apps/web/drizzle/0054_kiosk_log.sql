ALTER TABLE "set_log" ADD COLUMN "kiosk_id" text;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "kiosk_id" text;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_kiosk_id_gym_kiosk_id_fk" FOREIGN KEY ("kiosk_id") REFERENCES "public"."gym_kiosk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_kiosk_id_gym_kiosk_id_fk" FOREIGN KEY ("kiosk_id") REFERENCES "public"."gym_kiosk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "set_log_kiosk_idx" ON "set_log" USING btree ("kiosk_id") WHERE kiosk_id is not null;--> statement-breakpoint
CREATE INDEX "workout_session_kiosk_idx" ON "workout_session" USING btree ("kiosk_id") WHERE kiosk_id is not null;