CREATE TABLE "set_type" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_type" ADD CONSTRAINT "set_type_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_type" ADD CONSTRAINT "set_type_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "set_type_owner_name_unique" ON "set_type" USING btree ("org_id","owner_user_id",lower("name")) WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "set_type_owner_idx" ON "set_type" USING btree ("org_id","owner_user_id");