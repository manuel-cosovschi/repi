CREATE TABLE "training_proposal" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_client_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"algo_version" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_target" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"program_exercise_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"version_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"spec_id" text,
	"set_kind" text NOT NULL,
	"block_index" integer NOT NULL,
	"stage_index" integer NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"quality" text NOT NULL,
	"weight_kg" text,
	"reps_min" integer,
	"reps_max" integer,
	"reps_target" integer,
	"rir_target" integer,
	"rpe_target" double precision,
	"rest_sec" integer,
	"rest_suggest_sec" integer,
	"pending" boolean DEFAULT false NOT NULL,
	"detail" jsonb NOT NULL,
	"algo_version" text NOT NULL,
	"decision" text,
	"set_log_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_version_id_program_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."program_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_proposal_open_unique" ON "training_proposal" USING btree ("coach_client_id","exercise_id","kind") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "training_proposal_rel_idx" ON "training_proposal" USING btree ("coach_client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "training_target_seq_unique" ON "training_target" USING btree ("session_id","program_exercise_id","set_index","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "training_target_current_unique" ON "training_target" USING btree ("session_id","program_exercise_id","set_index") WHERE superseded_at is null;--> statement-breakpoint
CREATE INDEX "training_target_user_idx" ON "training_target" USING btree ("user_id","created_at");