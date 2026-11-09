CREATE TABLE "gym_kiosk" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "gym_kiosk_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "kiosk_credential" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"member_code" text NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "kiosk_credential_code_format" CHECK ("kiosk_credential"."member_code" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE "kiosk_session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kiosk_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "kiosk_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "commercial_lead" ADD COLUMN "product_mode" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "routine_policy" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "kiosk_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_membership" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_membership" ADD COLUMN "revoked_by" text;--> statement-breakpoint
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_credential" ADD CONSTRAINT "kiosk_credential_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_credential" ADD CONSTRAINT "kiosk_credential_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_credential" ADD CONSTRAINT "kiosk_credential_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_session" ADD CONSTRAINT "kiosk_session_kiosk_id_gym_kiosk_id_fk" FOREIGN KEY ("kiosk_id") REFERENCES "public"."gym_kiosk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_session" ADD CONSTRAINT "kiosk_session_credential_id_kiosk_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."kiosk_credential"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_kiosk_org_idx" ON "gym_kiosk" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kiosk_credential_code_unique" ON "kiosk_credential" USING btree ("org_id","member_code") WHERE revoked_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "kiosk_credential_member_unique" ON "kiosk_credential" USING btree ("gym_member_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "kiosk_session_kiosk_idx" ON "kiosk_session" USING btree ("kiosk_id");--> statement-breakpoint
ALTER TABLE "staff_membership" ADD CONSTRAINT "staff_membership_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_routine_policy_valid" CHECK ("organization"."routine_policy" in ('open', 'supervised'));