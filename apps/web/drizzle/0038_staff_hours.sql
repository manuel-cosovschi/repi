CREATE TABLE "staff_hours" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"user_id" text NOT NULL,
	"days" jsonb NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"set_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_log" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_set_by_user_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_hours_unique" ON "staff_hours" USING btree ("user_id","location_id");--> statement-breakpoint
CREATE INDEX "staff_hours_org_idx" ON "staff_hours" USING btree ("org_id");