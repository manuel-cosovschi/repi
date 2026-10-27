CREATE TABLE "client_goal" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_client_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"exercise_id" text,
	"target" text NOT NULL,
	"target_reps" integer,
	"unit" text NOT NULL,
	"baseline" text,
	"manual_value" text,
	"manual_at" timestamp with time zone,
	"due_on" text,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_goal_rel_idx" ON "client_goal" USING btree ("coach_client_id","status");