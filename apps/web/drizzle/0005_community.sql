CREATE TABLE "achievement" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"source_key" text NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"source" text NOT NULL,
	"recorded_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"price_ars" integer NOT NULL,
	"promo" text,
	"highlighted" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"image_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "challenge" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text,
	"title" text NOT NULL,
	"rule" text NOT NULL,
	"unit" text NOT NULL,
	"lower_is_better" boolean DEFAULT false NOT NULL,
	"category" text NOT NULL,
	"prize" text NOT NULL,
	"ends_on" text NOT NULL,
	"record_value_x10" integer,
	"record_attempt_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_attempt" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"challenge_id" text NOT NULL,
	"org_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value_x10" integer NOT NULL,
	"division" text,
	"video_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"new_record" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_block" (
	"user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_block_user_id_blocked_user_id_pk" PRIMARY KEY("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "club_comment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_member" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"show_name" boolean DEFAULT true NOT NULL,
	"in_ranking" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "club_member_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_post" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"achievement_id" text,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_reaction" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_reaction_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_report" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"badge" text,
	"image_id" text,
	"valid_until" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_notice" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"ref_id" text,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prize" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"delivered_by" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_location" ADD COLUMN "reception_hours" text;--> statement-breakpoint
ALTER TABLE "media_object" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_image_id_media_object_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_video_id_media_object_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_block" ADD CONSTRAINT "club_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_block" ADD CONSTRAINT "club_block_blocked_user_id_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_comment" ADD CONSTRAINT "club_comment_post_id_club_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."club_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_comment" ADD CONSTRAINT "club_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_member" ADD CONSTRAINT "club_member_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_member" ADD CONSTRAINT "club_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_post" ADD CONSTRAINT "club_post_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_post" ADD CONSTRAINT "club_post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_post" ADD CONSTRAINT "club_post_achievement_id_achievement_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reaction" ADD CONSTRAINT "club_reaction_post_id_club_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."club_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reaction" ADD CONSTRAINT "club_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_report" ADD CONSTRAINT "club_report_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_report" ADD CONSTRAINT "club_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_report" ADD CONSTRAINT "club_report_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_image_id_media_object_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notice" ADD CONSTRAINT "member_notice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notice" ADD CONSTRAINT "member_notice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize" ADD CONSTRAINT "prize_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize" ADD CONSTRAINT "prize_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize" ADD CONSTRAINT "prize_attempt_id_challenge_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."challenge_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize" ADD CONSTRAINT "prize_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize" ADD CONSTRAINT "prize_delivered_by_user_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_unique" ON "achievement" USING btree ("user_id","kind","source_key");--> statement-breakpoint
CREATE INDEX "attendance_member_idx" ON "attendance" USING btree ("gym_member_id","at");--> statement-breakpoint
CREATE INDEX "attendance_loc_idx" ON "attendance" USING btree ("location_id","at");--> statement-breakpoint
CREATE INDEX "catalog_org_idx" ON "catalog_item" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "challenge_org_idx" ON "challenge" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "attempt_challenge_idx" ON "challenge_attempt" USING btree ("challenge_id","status");--> statement-breakpoint
CREATE INDEX "attempt_user_idx" ON "challenge_attempt" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_one_pending" ON "challenge_attempt" USING btree ("challenge_id","user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "club_comment_post_idx" ON "club_comment" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "club_post_org_idx" ON "club_post" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_report_once" ON "club_report" USING btree ("target_type","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX "club_report_org_idx" ON "club_report" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "community_post_org_idx" ON "community_post" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "member_notice_user_idx" ON "member_notice" USING btree ("user_id","seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prize_one_per_challenge" ON "prize" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prize_code_unique" ON "prize" USING btree ("org_id","code");