CREATE TABLE "access_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_client_id" text NOT NULL,
	"item" text NOT NULL,
	"reason" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"energy" integer NOT NULL,
	"sleep" integer NOT NULL,
	"mood" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_access_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"subject_user_id" text NOT NULL,
	"actor_user_id" text,
	"org_id" text,
	"item" text NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injury" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"zone" text NOT NULL,
	"detail" text,
	"status" text NOT NULL,
	"since" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_object" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pain_report" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"zone" text NOT NULL,
	"level" integer NOT NULL,
	"context" text NOT NULL,
	"exercise_name" text,
	"session_id" text,
	"note" text,
	"shared_with_relation_id" text,
	"seen_by_coach_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"coach_client_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"video_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"seen_resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury" ADD CONSTRAINT "injury_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_object" ADD CONSTRAINT "media_object_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_report" ADD CONSTRAINT "pain_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_request" ADD CONSTRAINT "student_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_request" ADD CONSTRAINT "student_request_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_request" ADD CONSTRAINT "student_request_video_id_media_object_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_request" ADD CONSTRAINT "student_request_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_request_relation_idx" ON "access_request" USING btree ("coach_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_request_pending_unique" ON "access_request" USING btree ("coach_client_id","item") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_user_date_unique" ON "checkin" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "data_access_subject_idx" ON "data_access_log" USING btree ("subject_user_id","at");--> statement-breakpoint
CREATE INDEX "injury_user_idx" ON "injury" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pain_user_idx" ON "pain_report" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "request_relation_idx" ON "student_request" USING btree ("coach_client_id","status");--> statement-breakpoint
CREATE INDEX "request_user_idx" ON "student_request" USING btree ("user_id");