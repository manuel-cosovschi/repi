CREATE TABLE "gym_floor_pick" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"trainer_user_id" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_session" ADD COLUMN "floor_trainer_id" text;--> statement-breakpoint
ALTER TABLE "gym_floor_pick" ADD CONSTRAINT "gym_floor_pick_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_floor_pick" ADD CONSTRAINT "gym_floor_pick_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_floor_pick" ADD CONSTRAINT "gym_floor_pick_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_floor_pick" ADD CONSTRAINT "gym_floor_pick_trainer_user_id_user_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_floor_pick_day" ON "gym_floor_pick" USING btree ("gym_member_id","day");--> statement-breakpoint
CREATE INDEX "gym_floor_pick_trainer_idx" ON "gym_floor_pick" USING btree ("trainer_user_id","day");