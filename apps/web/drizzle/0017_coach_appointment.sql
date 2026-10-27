CREATE TABLE "coach_appointment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_org_id" text NOT NULL,
	"coach_client_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"modality" text NOT NULL,
	"place" text,
	"note" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"client_response" text DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_appointment" ADD CONSTRAINT "coach_appointment_coach_org_id_organization_id_fk" FOREIGN KEY ("coach_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_appointment" ADD CONSTRAINT "coach_appointment_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_appointment" ADD CONSTRAINT "coach_appointment_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_appointment" ADD CONSTRAINT "coach_appointment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appt_org_starts_idx" ON "coach_appointment" USING btree ("coach_org_id","starts_at");--> statement-breakpoint
CREATE INDEX "appt_client_starts_idx" ON "coach_appointment" USING btree ("coach_client_id","starts_at");