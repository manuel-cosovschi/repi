CREATE TABLE "gym_equipment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"code" text,
	"unit" text DEFAULT 'kg' NOT NULL,
	"increment" double precision,
	"per_side" boolean DEFAULT false NOT NULL,
	"min_load" double precision,
	"max_load" double precision,
	"loads" jsonb,
	"note" text,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_equipment_category_valid" CHECK ("gym_equipment"."category" in ('dumbbell', 'barbell', 'plate_loaded', 'machine', 'cable', 'kettlebell', 'bodyweight', 'other')),
	CONSTRAINT "gym_equipment_unit_valid" CHECK ("gym_equipment"."unit" in ('kg', 'lb'))
);
--> statement-breakpoint
CREATE TABLE "gym_equipment_exercise" (
	"equipment_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_equipment_exercise_equipment_id_exercise_id_pk" PRIMARY KEY("equipment_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "training_correction" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"set_log_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"reason" text,
	"request_id" text NOT NULL,
	"base_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_correction_action_valid" CHECK ("training_correction"."action" in ('set_edit', 'set_void', 'set_restore', 'set_add', 'session_void', 'session_restore'))
);
--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "hints" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_equipment_exercise" ADD CONSTRAINT "gym_equipment_exercise_equipment_id_gym_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."gym_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_equipment_exercise" ADD CONSTRAINT "gym_equipment_exercise_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_set_log_id_set_log_id_fk" FOREIGN KEY ("set_log_id") REFERENCES "public"."set_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_equipment_location_idx" ON "gym_equipment" USING btree ("org_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_equipment_name_unique" ON "gym_equipment" USING btree ("location_id",lower("name")) WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "gym_equipment_exercise_ex_idx" ON "gym_equipment_exercise" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_correction_request_unique" ON "training_correction" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "training_correction_session_idx" ON "training_correction" USING btree ("session_id","created_at");--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;