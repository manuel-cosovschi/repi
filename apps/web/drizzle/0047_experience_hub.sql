CREATE TABLE "site_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"visit" text,
	"profile" text,
	"target" text,
	"source" text,
	"campaign" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"path" text,
	"device" text
);
--> statement-breakpoint
ALTER TABLE "commercial_lead" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_lead" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "commercial_lead" ADD COLUMN "campaign" text;--> statement-breakpoint
ALTER TABLE "commercial_lead" ADD COLUMN "interest" text;--> statement-breakpoint
CREATE INDEX "site_event_at_idx" ON "site_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "site_event_name_at_idx" ON "site_event" USING btree ("name","at");