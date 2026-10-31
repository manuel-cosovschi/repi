ALTER TABLE "challenge" ADD COLUMN "proposed_by" text;--> statement-breakpoint
ALTER TABLE "challenge" ADD COLUMN "difficulty" integer;--> statement-breakpoint
ALTER TABLE "challenge" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "challenge" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;