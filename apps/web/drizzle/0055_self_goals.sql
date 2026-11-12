ALTER TABLE "client_goal" ALTER COLUMN "coach_client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "client_goal" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "client_goal" ADD COLUMN "origin" text DEFAULT 'coach' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_goal_self_idx" ON "client_goal" USING btree ("user_id","status") WHERE user_id is not null;--> statement-breakpoint
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_owner_valid" CHECK (("client_goal"."origin" = 'coach' and "client_goal"."coach_client_id" is not null and "client_goal"."user_id" is null) or ("client_goal"."origin" = 'self' and "client_goal"."user_id" is not null and "client_goal"."coach_client_id" is null));