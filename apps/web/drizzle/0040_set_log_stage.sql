ALTER TABLE "set_log" ADD COLUMN "spec_id" text;--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "set_kind" text;--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "block_index" integer;--> statement-breakpoint
ALTER TABLE "set_log" ADD COLUMN "stage_index" integer;