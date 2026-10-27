ALTER TABLE "contract_notice" DROP CONSTRAINT "contract_notice_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "contract_notice" DROP CONSTRAINT "contract_notice_ack_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "contract_notice" ADD CONSTRAINT "contract_notice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_notice" ADD CONSTRAINT "contract_notice_ack_by_user_id_fk" FOREIGN KEY ("ack_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;