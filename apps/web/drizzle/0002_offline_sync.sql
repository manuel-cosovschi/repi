CREATE TABLE "sync_conflict" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_key" text NOT NULL,
	"server_payload" jsonb NOT NULL,
	"client_payload" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_conflict" ADD CONSTRAINT "sync_conflict_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflict" ADD CONSTRAINT "sync_conflict_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_conflict_user_idx" ON "sync_conflict" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_conflict_open_unique" ON "sync_conflict" USING btree ("session_id","target_key") WHERE status = 'open';