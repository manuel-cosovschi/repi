CREATE TABLE "session_exercise_change" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"session_id" text NOT NULL,
	"program_exercise_id" text NOT NULL,
	"kind" text NOT NULL,
	"substitute_exercise_id" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "session_exercise_change" ADD CONSTRAINT "session_exercise_change_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercise_change" ADD CONSTRAINT "session_exercise_change_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercise_change" ADD CONSTRAINT "session_exercise_change_substitute_exercise_id_exercise_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_exercise_change_uq" ON "session_exercise_change" USING btree ("session_id","program_exercise_id");