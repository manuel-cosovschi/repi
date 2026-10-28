CREATE TABLE "gym_access_display" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "gym_access_display_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "gym_access_policy" (
	"org_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'hybrid' NOT NULL,
	"strict_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qr_ttl_sec" integer DEFAULT 30 NOT NULL,
	"pass_hours" integer DEFAULT 3 NOT NULL,
	"geo_mode" text DEFAULT 'off' NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_checkin" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"user_id" text NOT NULL,
	"gym_member_id" text,
	"method" text NOT NULL,
	"result" text NOT NULL,
	"reason" text,
	"nonce" text,
	"display_id" text,
	"geo_result" text,
	"verified_by" text,
	"note" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_location" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "gym_location" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "gym_location" ADD COLUMN "geo_radius_m" integer;--> statement-breakpoint
ALTER TABLE "gym_member" ADD COLUMN "access_until" text;--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "presence_checkin_id" text;--> statement-breakpoint
ALTER TABLE "gym_access_display" ADD CONSTRAINT "gym_access_display_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_access_display" ADD CONSTRAINT "gym_access_display_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_access_display" ADD CONSTRAINT "gym_access_display_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_access_policy" ADD CONSTRAINT "gym_access_policy_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_access_policy" ADD CONSTRAINT "gym_access_policy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_checkin" ADD CONSTRAINT "gym_checkin_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_checkin" ADD CONSTRAINT "gym_checkin_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_checkin" ADD CONSTRAINT "gym_checkin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_checkin" ADD CONSTRAINT "gym_checkin_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_checkin" ADD CONSTRAINT "gym_checkin_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_checkin" ADD CONSTRAINT "gym_checkin_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_access_display_org_idx" ON "gym_access_display" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_checkin_user_nonce" ON "gym_checkin" USING btree ("user_id","nonce") WHERE result = 'ok' and nonce is not null;--> statement-breakpoint
CREATE INDEX "gym_checkin_org_idx" ON "gym_checkin" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "gym_checkin_user_idx" ON "gym_checkin" USING btree ("user_id","expires_at");