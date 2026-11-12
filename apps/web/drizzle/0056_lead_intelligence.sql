CREATE TABLE "lead_activity" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"business_id" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb,
	"actor_user_id" text,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_area" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"province" text,
	"tier" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_km" double precision NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_discovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_business" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"norm_name" text NOT NULL,
	"legal_name" text,
	"city" text,
	"locality" text,
	"province" text,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"website" text,
	"domain" text,
	"instagram" text,
	"facebook" text,
	"email" text,
	"phone" text,
	"phone_national" text,
	"whatsapp" text,
	"category" text DEFAULT 'unknown' NOT NULL,
	"positioning" text,
	"branches" integer,
	"est_members" integer,
	"tools" text,
	"contact_name" text,
	"contact_role" text,
	"chain_key" text,
	"external_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"area_id" text,
	"geo_tier" integer,
	"stage" text DEFAULT 'discovered' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"score_band" text DEFAULT 'low' NOT NULL,
	"score_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scored_at" timestamp with time zone,
	"tech_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intent_flags" jsonb DEFAULT '{"inbound":false,"replied":false,"positive":false,"askedPrice":false,"meeting":false}'::jsonb NOT NULL,
	"owner_user_id" text,
	"rep_id" text,
	"sales_prospect_id" text,
	"commercial_lead_id" text,
	"org_id" text,
	"exclusion" text,
	"exclusion_note" text,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"review_of_id" text,
	"review_signals" jsonb,
	"next_action" text,
	"next_action_on" text,
	"first_sent_on" text,
	"last_sent_on" text,
	"followups_sent" integer DEFAULT 0 NOT NULL,
	"sequence_stopped" boolean DEFAULT false NOT NULL,
	"snooze_until" text,
	"last_reply_at" timestamp with time zone,
	"notes" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"enriched_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_campaign" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"variant" text DEFAULT 'first_contact' NOT NULL,
	"area_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_score" integer DEFAULT 0 NOT NULL,
	"max_recipients" integer DEFAULT 10 NOT NULL,
	"daily_limit" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval" jsonb,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_fact" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"business_id" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"observed_at" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_message" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"business_id" text NOT NULL,
	"campaign_id" text,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"variant" text,
	"step" integer,
	"subject" text,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"generated_by" text,
	"guard_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"to_address" text,
	"intent" text,
	"confidence" double precision,
	"needs_review" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"provider" text,
	"provider_id" text,
	"error" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"confirmed_by" text,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_run" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"actor_user_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "lead_run_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "lead_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_suppression" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"channel" text NOT NULL,
	"value" text NOT NULL,
	"business_id" text,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_task" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"business_id" text NOT NULL,
	"kind" text NOT NULL,
	"due_on" text NOT NULL,
	"due_at" text,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_user_id" text,
	"dedupe_key" text,
	"created_by" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_task_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_business_id_lead_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."lead_business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_business" ADD CONSTRAINT "lead_business_area_id_lead_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."lead_area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_business" ADD CONSTRAINT "lead_business_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_business" ADD CONSTRAINT "lead_business_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_business" ADD CONSTRAINT "lead_business_sales_prospect_id_sales_prospect_id_fk" FOREIGN KEY ("sales_prospect_id") REFERENCES "public"."sales_prospect"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_business" ADD CONSTRAINT "lead_business_commercial_lead_id_commercial_lead_id_fk" FOREIGN KEY ("commercial_lead_id") REFERENCES "public"."commercial_lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_business" ADD CONSTRAINT "lead_business_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_campaign" ADD CONSTRAINT "lead_campaign_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_campaign" ADD CONSTRAINT "lead_campaign_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_fact" ADD CONSTRAINT "lead_fact_business_id_lead_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."lead_business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_fact" ADD CONSTRAINT "lead_fact_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_message" ADD CONSTRAINT "lead_message_business_id_lead_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."lead_business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_message" ADD CONSTRAINT "lead_message_campaign_id_lead_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."lead_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_message" ADD CONSTRAINT "lead_message_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_message" ADD CONSTRAINT "lead_message_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_message" ADD CONSTRAINT "lead_message_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_run" ADD CONSTRAINT "lead_run_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_setting" ADD CONSTRAINT "lead_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_suppression" ADD CONSTRAINT "lead_suppression_business_id_lead_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."lead_business"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_suppression" ADD CONSTRAINT "lead_suppression_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_task" ADD CONSTRAINT "lead_task_business_id_lead_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."lead_business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_task" ADD CONSTRAINT "lead_task_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_task" ADD CONSTRAINT "lead_task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activity_business_idx" ON "lead_activity" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_activity_kind_idx" ON "lead_activity" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_area_name_uq" ON "lead_area" USING btree ("name");--> statement-breakpoint
CREATE INDEX "lead_business_stage_idx" ON "lead_business" USING btree ("stage","score");--> statement-breakpoint
CREATE INDEX "lead_business_city_idx" ON "lead_business" USING btree ("city");--> statement-breakpoint
CREATE INDEX "lead_business_norm_idx" ON "lead_business" USING btree ("norm_name");--> statement-breakpoint
CREATE INDEX "lead_business_domain_idx" ON "lead_business" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "lead_business_phone_idx" ON "lead_business" USING btree ("phone_national");--> statement-breakpoint
CREATE INDEX "lead_business_ig_idx" ON "lead_business" USING btree ("instagram");--> statement-breakpoint
CREATE INDEX "lead_business_next_idx" ON "lead_business" USING btree ("next_action_on");--> statement-breakpoint
CREATE INDEX "lead_business_rep_idx" ON "lead_business" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "lead_fact_business_idx" ON "lead_fact" USING btree ("business_id","field");--> statement-breakpoint
CREATE INDEX "lead_message_business_idx" ON "lead_message" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_message_status_idx" ON "lead_message" USING btree ("status","direction");--> statement-breakpoint
CREATE INDEX "lead_message_campaign_idx" ON "lead_message" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "lead_run_kind_idx" ON "lead_run" USING btree ("kind","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_suppression_uq" ON "lead_suppression" USING btree ("channel","value");--> statement-breakpoint
CREATE INDEX "lead_task_due_idx" ON "lead_task" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "lead_task_business_idx" ON "lead_task" USING btree ("business_id");