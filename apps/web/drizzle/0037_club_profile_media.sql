ALTER TABLE "club_post" ADD COLUMN "image_id" text;--> statement-breakpoint
ALTER TABLE "club_profile" ADD COLUMN "avatar_id" text;--> statement-breakpoint
ALTER TABLE "club_profile" ADD COLUMN "show_maxes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club_post" ADD CONSTRAINT "club_post_image_id_media_object_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_profile" ADD CONSTRAINT "club_profile_avatar_id_media_object_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;