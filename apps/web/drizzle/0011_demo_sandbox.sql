CREATE TABLE "demo_sandbox" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tag" text NOT NULL,
	"role" text NOT NULL,
	"user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"org_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "demo_sandbox_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE INDEX "demo_sandbox_expires_idx" ON "demo_sandbox" USING btree ("expires_at");