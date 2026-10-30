DROP INDEX "exercise_org_name_unique";--> statement-breakpoint
ALTER TABLE "exercise" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_owner_idx" ON "exercise" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_org_name_unique" ON "exercise" USING btree (coalesce("org_id", ''),coalesce("owner_user_id", ''),"name");