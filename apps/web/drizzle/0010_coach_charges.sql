CREATE TABLE "coach_charge" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_org_id" text NOT NULL,
	"coach_client_id" text NOT NULL,
	"concept" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"due_on" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_on" text,
	"method" text,
	"note" text,
	"void_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_charge" ADD CONSTRAINT "coach_charge_coach_org_id_organization_id_fk" FOREIGN KEY ("coach_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_charge" ADD CONSTRAINT "coach_charge_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_charge" ADD CONSTRAINT "coach_charge_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_charge_org_idx" ON "coach_charge" USING btree ("coach_org_id","status");--> statement-breakpoint
CREATE INDEX "coach_charge_client_idx" ON "coach_charge" USING btree ("coach_client_id");