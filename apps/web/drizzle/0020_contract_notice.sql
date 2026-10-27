CREATE TABLE "contract_notice" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contract_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"effective_from" text,
	"dedupe_key" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery" text,
	"ack_by" text,
	"ack_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contract_notice" ADD CONSTRAINT "contract_notice_contract_id_client_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_notice" ADD CONSTRAINT "contract_notice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_notice" ADD CONSTRAINT "contract_notice_ack_by_user_id_fk" FOREIGN KEY ("ack_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_notice_dedupe_uq" ON "contract_notice" USING btree ("contract_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "contract_notice_contract_idx" ON "contract_notice" USING btree ("contract_id","created_at");