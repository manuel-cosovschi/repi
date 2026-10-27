CREATE TABLE "billing_payment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contract_id" text NOT NULL,
	"snapshot_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"received_on" text NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"void_reason" text,
	"created_by" text NOT NULL,
	"voided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_contract_id_client_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_snapshot_id_billing_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."billing_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payment_contract_idx" ON "billing_payment" USING btree ("contract_id","received_on");