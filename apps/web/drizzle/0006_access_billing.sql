CREATE TABLE "billing_snapshot" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contract_id" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"mode" text NOT NULL,
	"quantity" integer NOT NULL,
	"quantity_term_id" text NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"price_term_id" text NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contract" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"legal_name" text NOT NULL,
	"responsible_name" text NOT NULL,
	"responsible_email" text NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"scope" text DEFAULT 'organization' NOT NULL,
	"scope_note" text,
	"quantity_definition" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"terms_version" text,
	"accepted_method" text,
	"accepted_ref" text,
	"accepted_at" timestamp with time zone,
	"accepted_recorded_by" text,
	"enabled_by" text,
	"enabled_at" timestamp with time zone,
	"trial_until" text,
	"setup_done_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_contract_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "club_profile" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"bio" text,
	"show_level" boolean DEFAULT false NOT NULL,
	"showcase" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_profile_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_lead" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"org_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_term" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contract_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"value" integer NOT NULL,
	"currency" text,
	"source" text DEFAULT 'admin_declared' NOT NULL,
	"effective_from" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contract_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_alert" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"session_id" text NOT NULL,
	"set_log_id" text NOT NULL,
	"exercise_name" text NOT NULL,
	"feel" text NOT NULL,
	"ack_by" text,
	"ack_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_alert_set_log_id_unique" UNIQUE("set_log_id")
);
--> statement-breakpoint
CREATE TABLE "gym_member_location" (
	"gym_member_id" text NOT NULL,
	"location_id" text NOT NULL,
	"granted_by" text,
	"request_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "gym_member_location_gym_member_id_location_id_pk" PRIMARY KEY("gym_member_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "location_join_link" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "location_join_link_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "notify_pref" (
	"user_id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DROP INDEX "membership_request_pending_unique";--> statement-breakpoint
ALTER TABLE "membership_request" ALTER COLUMN "dni_hmac" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_request" ALTER COLUMN "dni_last3" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "club_post" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "contract_id" text;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "source" text DEFAULT 'dni_legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "kind" text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "join_link_id" text;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "decided_as" text;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "decided_shift_id" text;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "validation_method" text;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "public_reason" text;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_request" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "commercial_status" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "feel" text;--> statement-breakpoint
ALTER TABLE "billing_snapshot" ADD CONSTRAINT "billing_snapshot_contract_id_client_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_snapshot" ADD CONSTRAINT "billing_snapshot_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contract" ADD CONSTRAINT "client_contract_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contract" ADD CONSTRAINT "client_contract_accepted_recorded_by_user_id_fk" FOREIGN KEY ("accepted_recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contract" ADD CONSTRAINT "client_contract_enabled_by_user_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contract" ADD CONSTRAINT "client_contract_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_profile" ADD CONSTRAINT "club_profile_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_profile" ADD CONSTRAINT "club_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_term" ADD CONSTRAINT "contract_term_contract_id_client_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_term" ADD CONSTRAINT "contract_term_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_contract_id_client_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_alert" ADD CONSTRAINT "floor_alert_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_alert" ADD CONSTRAINT "floor_alert_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_alert" ADD CONSTRAINT "floor_alert_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_alert" ADD CONSTRAINT "floor_alert_ack_by_user_id_fk" FOREIGN KEY ("ack_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_member_location" ADD CONSTRAINT "gym_member_location_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_member_location" ADD CONSTRAINT "gym_member_location_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_member_location" ADD CONSTRAINT "gym_member_location_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_join_link" ADD CONSTRAINT "location_join_link_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_join_link" ADD CONSTRAINT "location_join_link_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_join_link" ADD CONSTRAINT "location_join_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_join_link" ADD CONSTRAINT "location_join_link_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify_pref" ADD CONSTRAINT "notify_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_snapshot_period_unique" ON "billing_snapshot" USING btree ("contract_id","period_start","mode");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_term_version_unique" ON "contract_term" USING btree ("contract_id","kind","version");--> statement-breakpoint
CREATE INDEX "floor_alert_loc_idx" ON "floor_alert" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "join_link_one_active" ON "location_join_link" USING btree ("location_id") WHERE active;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "push_sub_user_idx" ON "push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_request_pending_loc_unique" ON "membership_request" USING btree ("org_id","user_id","location_id") WHERE status = 'pending';