CREATE TABLE "commission_entry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"key" text NOT NULL,
	"rep_id" text NOT NULL,
	"deal_id" text,
	"org_id" text,
	"contract_id" text,
	"plan_version_id" text,
	"component_index" integer,
	"component" text,
	"source_type" text NOT NULL,
	"source_id" text,
	"reversal_of" text,
	"base_minor" bigint,
	"rate_bps" integer,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"accrual_on" text NOT NULL,
	"available_on" text NOT NULL,
	"concept" text NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_entry_key_unique" UNIQUE("key"),
	CONSTRAINT "commission_entry_reversal_of_unique" UNIQUE("reversal_of")
);
--> statement-breakpoint
CREATE TABLE "commission_plan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plan_version" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"effective_from" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batch" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"rep_id" text NOT NULL,
	"currency" text NOT NULL,
	"cutoff_on" text NOT NULL,
	"frequency" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_minor" bigint NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"note" text,
	"snapshot" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "payout_batch_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payout_item" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"batch_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "payout_item_entry_id_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
CREATE TABLE "payout_payment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"batch_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_on" text NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"note" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"void_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	CONSTRAINT "payout_payment_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "sales_activity" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"prospect_id" text,
	"opportunity_id" text,
	"deal_id" text,
	"rep_id" text,
	"actor_user_id" text,
	"actor_role" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"due_on" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_attribution" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"contract_id" text,
	"origin_rep_id" text,
	"opportunity_rep_id" text,
	"closing_rep_id" text,
	"assigned_rep_id" text,
	"deal_id" text,
	"source" text,
	"effective_from" text NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_deal" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"rep_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"prospect_id" text,
	"opportunity_id" text,
	"kind" text DEFAULT 'new' NOT NULL,
	"client_kind" text NOT NULL,
	"org_id" text,
	"business_name" text NOT NULL,
	"legal_name" text,
	"cuit" text,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"city" text,
	"province" text,
	"address" text,
	"locations" jsonb,
	"members" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"periodicity" text NOT NULL,
	"contract_start" text NOT NULL,
	"duration_months" integer,
	"renewal_note" text,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"setup_fee_minor" bigint DEFAULT 0 NOT NULL,
	"special_conditions" text,
	"evidence" text NOT NULL,
	"closed_on" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'declared' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"contract_id" text,
	"plan_version_id" text,
	"split" jsonb,
	"previous_members" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_material" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"body" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"valid_until" text,
	"created_by" text,
	"updated_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_notice" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_notice_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "sales_opportunity" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"prospect_id" text NOT NULL,
	"rep_id" text,
	"kind" text DEFAULT 'new' NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"category" text,
	"probability_pct" integer,
	"est_members" integer,
	"est_unit_price_minor" bigint,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"next_contact_on" text,
	"expected_close_on" text,
	"lost_reason" text,
	"notes" text,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_prospect" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_rep_id" text,
	"origin_rep_id" text,
	"kind" text DEFAULT 'gym' NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"cuit" text,
	"city" text,
	"province" text,
	"address" text,
	"est_members" integer,
	"locations" integer,
	"website" text,
	"instagram" text,
	"phone" text,
	"email" text,
	"contact_name" text,
	"contact_role" text,
	"contact_channel" text,
	"notes" text,
	"source" text DEFAULT 'field' NOT NULL,
	"captured_on" text NOT NULL,
	"org_id" text,
	"commercial_lead_id" text,
	"duplicate_status" text DEFAULT 'none' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_region" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"provinces" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_region_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sales_rep" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"province" text,
	"zone" text,
	"region_id" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"status_reason" text,
	"manager_rep_id" text,
	"engagement" text DEFAULT 'independent' NOT NULL,
	"can_sell_coaches" boolean DEFAULT false NOT NULL,
	"payout_frequency" text DEFAULT 'monthly' NOT NULL,
	"payout_note" text,
	"agreement_ref" text,
	"joined_at" timestamp with time zone,
	"profile_completed_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_rep_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sales_rep_invitation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"rep_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" text,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_rep_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sales_rep_plan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"rep_id" text NOT NULL,
	"plan_version_id" text NOT NULL,
	"effective_from" text NOT NULL,
	"reason" text NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"rep_id" text NOT NULL,
	"prospect_id" text,
	"org_id" text,
	"payload" jsonb,
	"message" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_target" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"rep_id" text NOT NULL,
	"month" text NOT NULL,
	"metric" text NOT NULL,
	"target" bigint NOT NULL,
	"currency" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commercial_lead" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan" ADD CONSTRAINT "commission_plan_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_version" ADD CONSTRAINT "commission_plan_version_plan_id_commission_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commission_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_version" ADD CONSTRAINT "commission_plan_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_version" ADD CONSTRAINT "commission_plan_version_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_batch_id_payout_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payout_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_entry_id_commission_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."commission_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_payment" ADD CONSTRAINT "payout_payment_batch_id_payout_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payout_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_payment" ADD CONSTRAINT "payout_payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_payment" ADD CONSTRAINT "payout_payment_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_prospect_id_sales_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."sales_prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_opportunity_id_sales_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_deal_id_sales_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."sales_deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_origin_rep_id_sales_rep_id_fk" FOREIGN KEY ("origin_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_opportunity_rep_id_sales_rep_id_fk" FOREIGN KEY ("opportunity_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_closing_rep_id_sales_rep_id_fk" FOREIGN KEY ("closing_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_assigned_rep_id_sales_rep_id_fk" FOREIGN KEY ("assigned_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_deal_id_sales_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."sales_deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_attribution" ADD CONSTRAINT "sales_attribution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_prospect_id_sales_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."sales_prospect"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_opportunity_id_sales_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_contract_id_client_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contract"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_plan_version_id_commission_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."commission_plan_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_material" ADD CONSTRAINT "sales_material_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_material" ADD CONSTRAINT "sales_material_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_notice" ADD CONSTRAINT "sales_notice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_prospect_id_sales_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."sales_prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_prospect" ADD CONSTRAINT "sales_prospect_owner_rep_id_sales_rep_id_fk" FOREIGN KEY ("owner_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_prospect" ADD CONSTRAINT "sales_prospect_origin_rep_id_sales_rep_id_fk" FOREIGN KEY ("origin_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_prospect" ADD CONSTRAINT "sales_prospect_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_prospect" ADD CONSTRAINT "sales_prospect_commercial_lead_id_commercial_lead_id_fk" FOREIGN KEY ("commercial_lead_id") REFERENCES "public"."commercial_lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_prospect" ADD CONSTRAINT "sales_prospect_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_region" ADD CONSTRAINT "sales_region_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep" ADD CONSTRAINT "sales_rep_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep" ADD CONSTRAINT "sales_rep_region_id_sales_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."sales_region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep" ADD CONSTRAINT "sales_rep_manager_rep_id_sales_rep_id_fk" FOREIGN KEY ("manager_rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep" ADD CONSTRAINT "sales_rep_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep_invitation" ADD CONSTRAINT "sales_rep_invitation_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep_invitation" ADD CONSTRAINT "sales_rep_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep_invitation" ADD CONSTRAINT "sales_rep_invitation_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep_plan" ADD CONSTRAINT "sales_rep_plan_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep_plan" ADD CONSTRAINT "sales_rep_plan_plan_version_id_commission_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."commission_plan_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rep_plan" ADD CONSTRAINT "sales_rep_plan_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_request" ADD CONSTRAINT "sales_request_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_request" ADD CONSTRAINT "sales_request_prospect_id_sales_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."sales_prospect"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_request" ADD CONSTRAINT "sales_request_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_request" ADD CONSTRAINT "sales_request_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_target" ADD CONSTRAINT "sales_target_rep_id_sales_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_rep"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_target" ADD CONSTRAINT "sales_target_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_entry_rep_idx" ON "commission_entry" USING btree ("rep_id","available_on");--> statement-breakpoint
CREATE INDEX "commission_entry_deal_idx" ON "commission_entry" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_plan_version_uq" ON "commission_plan_version" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX "payout_batch_rep_idx" ON "payout_batch" USING btree ("rep_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_batch_open_uq" ON "payout_batch" USING btree ("rep_id","currency") WHERE "payout_batch"."status" in ('draft', 'approved');--> statement-breakpoint
CREATE INDEX "payout_item_batch_idx" ON "payout_item" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payout_payment_batch_idx" ON "payout_payment" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "sales_activity_prospect_idx" ON "sales_activity" USING btree ("prospect_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_activity_rep_due_idx" ON "sales_activity" USING btree ("rep_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_attribution_current_uq" ON "sales_attribution" USING btree ("org_id") WHERE "sales_attribution"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "sales_attribution_assigned_idx" ON "sales_attribution" USING btree ("assigned_rep_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_deal_idem_uq" ON "sales_deal" USING btree ("rep_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "sales_deal_status_idx" ON "sales_deal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_deal_contract_idx" ON "sales_deal" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "sales_notice_user_idx" ON "sales_notice" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_opportunity_rep_idx" ON "sales_opportunity" USING btree ("rep_id","stage");--> statement-breakpoint
CREATE INDEX "sales_opportunity_prospect_idx" ON "sales_opportunity" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "sales_prospect_owner_idx" ON "sales_prospect" USING btree ("owner_rep_id");--> statement-breakpoint
CREATE INDEX "sales_prospect_org_idx" ON "sales_prospect" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_rep_user_uq" ON "sales_rep" USING btree ("user_id") WHERE "sales_rep"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_rep_email_uq" ON "sales_rep" USING btree ("email") WHERE "sales_rep"."status" <> 'terminated';--> statement-breakpoint
CREATE INDEX "sales_rep_status_idx" ON "sales_rep" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_rep_invitation_rep_idx" ON "sales_rep_invitation" USING btree ("rep_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_rep_invitation_pending_uq" ON "sales_rep_invitation" USING btree ("rep_id") WHERE "sales_rep_invitation"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "sales_rep_plan_rep_idx" ON "sales_rep_plan" USING btree ("rep_id","effective_from");--> statement-breakpoint
CREATE INDEX "sales_request_status_idx" ON "sales_request" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_request_freq_open_uq" ON "sales_request" USING btree ("rep_id") WHERE "sales_request"."kind" = 'payout_frequency' and "sales_request"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "sales_target_uq" ON "sales_target" USING btree ("rep_id","month","metric");--> statement-breakpoint
-- D207: el libro de comisiones no se edita ni se borra: un error se corrige con un asiento nuevo (ajuste o reversión).
CREATE OR REPLACE FUNCTION "commission_entry_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commission_entry es inmutable: registrá un ajuste en lugar de modificar o borrar (%).', TG_OP USING ERRCODE = 'P0001';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "commission_entry_no_update" BEFORE UPDATE OR DELETE ON "commission_entry" FOR EACH ROW EXECUTE FUNCTION "commission_entry_immutable"();
