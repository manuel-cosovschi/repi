CREATE TABLE "conversation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"relation_id" text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text,
	"member_user_id" text NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_marker" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"side" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "conversation_marker_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gym_handoff" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text,
	"shift_log_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_handoff_item" (
	"handoff_id" text NOT NULL,
	"task_id" text NOT NULL,
	"summary" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	CONSTRAINT "gym_handoff_item_handoff_id_task_id_pk" PRIMARY KEY("handoff_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "gym_note" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gym_task" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"number" integer NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"gym_member_id" text,
	"category" text NOT NULL,
	"priority" text DEFAULT 'media' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text NOT NULL,
	"summary" text NOT NULL,
	"video_id" text,
	"assignee_user_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"taken_at" timestamp with time zone,
	"taken_by" text,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"completed_off_shift" boolean DEFAULT false NOT NULL,
	"seen_by_member_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_side" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_case" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"number" integer NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"type" text NOT NULL,
	"review_id" text,
	"task_id" text,
	"opened_by" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"appeal_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"case_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"invite_id" text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"trainer_user_id" text NOT NULL,
	"member_user_id" text NOT NULL,
	"category" text NOT NULL,
	"stars" integer NOT NULL,
	"dim1" integer,
	"dim2" integer,
	"dim3" integer,
	"text" text,
	"status" text DEFAULT 'published' NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_invite_id_unique" UNIQUE("invite_id")
);
--> statement-breakpoint
CREATE TABLE "review_invite" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"task_id" text NOT NULL,
	"member_user_id" text NOT NULL,
	"trainer_user_id" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_invite_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "shift_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shift_plan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"code" text NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_pref" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active_relation_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "assignment_active_unique";--> statement-breakpoint
ALTER TABLE "program_assignment" ALTER COLUMN "coach_client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_session" ALTER COLUMN "coach_client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "review_responses" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "gym_member_id" text;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD COLUMN "gym_member_id" text;--> statement-breakpoint
ALTER TABLE "program_version" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "staff_membership" ADD COLUMN "after_hours_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "gym_member_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_marker" ADD CONSTRAINT "conversation_marker_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_marker" ADD CONSTRAINT "conversation_marker_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff" ADD CONSTRAINT "gym_handoff_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff" ADD CONSTRAINT "gym_handoff_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff" ADD CONSTRAINT "gym_handoff_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff" ADD CONSTRAINT "gym_handoff_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff" ADD CONSTRAINT "gym_handoff_shift_log_id_shift_log_id_fk" FOREIGN KEY ("shift_log_id") REFERENCES "public"."shift_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff_item" ADD CONSTRAINT "gym_handoff_item_handoff_id_gym_handoff_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."gym_handoff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff_item" ADD CONSTRAINT "gym_handoff_item_task_id_gym_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gym_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_handoff_item" ADD CONSTRAINT "gym_handoff_item_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_note" ADD CONSTRAINT "gym_note_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_note" ADD CONSTRAINT "gym_note_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_note" ADD CONSTRAINT "gym_note_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_note" ADD CONSTRAINT "gym_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_video_id_media_object_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_taken_by_user_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_task_id_gym_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gym_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_opened_by_user_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_case_id_moderation_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_invite_id_review_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."review_invite"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_trainer_user_id_user_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invite" ADD CONSTRAINT "review_invite_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invite" ADD CONSTRAINT "review_invite_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invite" ADD CONSTRAINT "review_invite_task_id_gym_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gym_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invite" ADD CONSTRAINT "review_invite_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invite" ADD CONSTRAINT "review_invite_trainer_user_id_user_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_log" ADD CONSTRAINT "shift_log_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_log" ADD CONSTRAINT "shift_log_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_log" ADD CONSTRAINT "shift_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_log" ADD CONSTRAINT "shift_log_plan_id_shift_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."shift_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan" ADD CONSTRAINT "shift_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan" ADD CONSTRAINT "shift_plan_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan" ADD CONSTRAINT "shift_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan" ADD CONSTRAINT "shift_plan_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_relation_unique" ON "conversation" USING btree ("kind","relation_id");--> statement-breakpoint
CREATE INDEX "conversation_org_idx" ON "conversation" USING btree ("org_id","last_message_at");--> statement-breakpoint
CREATE INDEX "gym_handoff_loc_idx" ON "gym_handoff" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "gym_note_member_idx" ON "gym_note" USING btree ("gym_member_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_task_number_unique" ON "gym_task" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "gym_task_loc_status_idx" ON "gym_task" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "gym_task_assignee_idx" ON "gym_task" USING btree ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "gym_task_member_idx" ON "gym_task" USING btree ("gym_member_id");--> statement-breakpoint
CREATE INDEX "message_conv_idx" ON "message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_case_number_unique" ON "moderation_case" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "moderation_case_loc_idx" ON "moderation_case" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "moderation_log_case_idx" ON "moderation_log" USING btree ("case_id","at");--> statement-breakpoint
CREATE INDEX "review_trainer_idx" ON "review" USING btree ("trainer_user_id");--> statement-breakpoint
CREATE INDEX "review_loc_idx" ON "review" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "review_invite_member_idx" ON "review_invite" USING btree ("member_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_log_one_active" ON "shift_log" USING btree ("user_id") WHERE ended_at is null;--> statement-breakpoint
CREATE INDEX "shift_log_loc_idx" ON "shift_log" USING btree ("location_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_plan_unique" ON "shift_plan" USING btree ("user_id","location_id","date");--> statement-breakpoint
CREATE INDEX "shift_plan_loc_idx" ON "shift_plan" USING btree ("location_id","date");--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_member_active_unique" ON "program_assignment" USING btree ("gym_member_id") WHERE status = 'active' and gym_member_id is not null;--> statement-breakpoint
CREATE INDEX "session_member_idx" ON "workout_session" USING btree ("gym_member_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_active_unique" ON "program_assignment" USING btree ("coach_client_id") WHERE status = 'active' and coach_client_id is not null;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "assignment_one_relation" CHECK (("program_assignment"."coach_client_id" is null) <> ("program_assignment"."gym_member_id" is null));