CREATE TABLE "set_skip" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"session_id" text NOT NULL,
	"program_exercise_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"spec_id" text,
	"skipped" boolean DEFAULT true NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "interval_state" jsonb;--> statement-breakpoint
ALTER TABLE "set_skip" ADD CONSTRAINT "set_skip_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_skip" ADD CONSTRAINT "set_skip_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "set_skip_unique" ON "set_skip" USING btree ("session_id","program_exercise_id","set_index");