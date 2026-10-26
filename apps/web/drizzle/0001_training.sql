CREATE TABLE "exercise" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"muscle_group" text NOT NULL,
	"kind" text DEFAULT 'load_reps' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"coach_client_id" text,
	"source_program_id" text,
	"source_version_id" text,
	"current_version_id" text,
	"archived_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_assignment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_client_id" text NOT NULL,
	"program_id" text NOT NULL,
	"starts_on" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_day" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"version_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_exercise" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"day_id" text NOT NULL,
	"position" integer NOT NULL,
	"exercise_id" text NOT NULL,
	"name" text NOT NULL,
	"sets" integer NOT NULL,
	"reps" text NOT NULL,
	"rir" integer,
	"rest_sec" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "program_version" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"program_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"weeks" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_log" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"program_exercise_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"weight_kg" text,
	"reps" integer,
	"rir" integer,
	"completed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"coach_client_id" text NOT NULL,
	"assignment_id" text NOT NULL,
	"version_id" text NOT NULL,
	"day_id" text NOT NULL,
	"day_name" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_resumed_at" timestamp with time zone,
	"active_ms" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone,
	"rpe" integer,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_day" ADD CONSTRAINT "program_day_version_id_program_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."program_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD CONSTRAINT "program_exercise_day_id_program_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."program_day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD CONSTRAINT "program_exercise_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_version" ADD CONSTRAINT "program_version_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_version" ADD CONSTRAINT "program_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_assignment_id_program_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."program_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_version_id_program_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."program_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_day_id_program_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."program_day"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_org_name_unique" ON "exercise" USING btree (coalesce("org_id", ''),"name");--> statement-breakpoint
CREATE INDEX "program_org_idx" ON "program" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "program_client_idx" ON "program" USING btree ("coach_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_active_unique" ON "program_assignment" USING btree ("coach_client_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "program_day_pos_unique" ON "program_day" USING btree ("version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "program_exercise_pos_unique" ON "program_exercise" USING btree ("day_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "program_version_unique" ON "program_version" USING btree ("program_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "set_log_unique" ON "set_log" USING btree ("session_id","program_exercise_id","set_index");--> statement-breakpoint
CREATE INDEX "set_log_exercise_idx" ON "set_log" USING btree ("exercise_id","completed_at");--> statement-breakpoint
CREATE INDEX "workout_session_user_idx" ON "workout_session" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "session_relation_idx" ON "workout_session" USING btree ("coach_client_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_one_open_unique" ON "workout_session" USING btree ("user_id") WHERE status in ('in_progress','paused');