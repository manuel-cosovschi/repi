CREATE TABLE "announcement_read" (
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_read_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "body_goal" (
	"user_id" text PRIMARY KEY NOT NULL,
	"start_source" text DEFAULT 'first_entry' NOT NULL,
	"start_weight_g" integer,
	"start_on" text,
	"target_weight_g" integer NOT NULL,
	"target_on" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_goal_target_range" CHECK ("body_goal"."target_weight_g" between 20000 and 400000),
	CONSTRAINT "body_goal_start_range" CHECK ("body_goal"."start_weight_g" is null or "body_goal"."start_weight_g" between 20000 and 400000),
	CONSTRAINT "body_goal_start_valid" CHECK ("body_goal"."start_source" = 'first_entry' or ("body_goal"."start_weight_g" is not null and "body_goal"."start_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "body_weight_entry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"measured_on" text NOT NULL,
	"weight_g" integer NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_weight_range" CHECK ("body_weight_entry"."weight_g" between 20000 and 400000),
	CONSTRAINT "body_weight_day_valid" CHECK ("body_weight_entry"."measured_on" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "body_weight_source_valid" CHECK ("body_weight_entry"."source" in ('manual'))
);
--> statement-breakpoint
CREATE TABLE "product_announcement" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"cta_label" text,
	"destination" text DEFAULT 'none' NOT NULL,
	"audience" text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_kind_valid" CHECK ("product_announcement"."kind" in ('feature', 'improvement', 'important', 'guide', 'notice')),
	CONSTRAINT "announcement_status_valid" CHECK ("product_announcement"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "announcement_published_at" CHECK ("product_announcement"."status" = 'draft' or "product_announcement"."publish_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "progress_photo" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"media_id" text NOT NULL,
	"taken_on" text NOT NULL,
	"pose" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_photo_media_id_unique" UNIQUE("media_id"),
	CONSTRAINT "progress_photo_pose_valid" CHECK ("progress_photo"."pose" is null or "progress_photo"."pose" in ('front', 'side', 'back', 'other')),
	CONSTRAINT "progress_photo_day_valid" CHECK ("progress_photo"."taken_on" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_announcement_id_product_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."product_announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_goal" ADD CONSTRAINT "body_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_weight_entry" ADD CONSTRAINT "body_weight_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_announcement" ADD CONSTRAINT "product_announcement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_announcement" ADD CONSTRAINT "product_announcement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photo" ADD CONSTRAINT "progress_photo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photo" ADD CONSTRAINT "progress_photo_media_id_media_object_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_read_user_idx" ON "announcement_read" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "body_weight_user_day_unique" ON "body_weight_entry" USING btree ("user_id","measured_on");--> statement-breakpoint
CREATE INDEX "announcement_status_idx" ON "product_announcement" USING btree ("status","publish_at");--> statement-breakpoint
CREATE INDEX "progress_photo_user_idx" ON "progress_photo" USING btree ("user_id","taken_on");