CREATE TABLE "own_routine" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"exercises" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "own_routine" ADD CONSTRAINT "own_routine_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "own_routine_user_idx" ON "own_routine" USING btree ("user_id");