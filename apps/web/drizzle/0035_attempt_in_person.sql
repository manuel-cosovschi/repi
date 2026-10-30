ALTER TABLE "challenge_attempt" ALTER COLUMN "video_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD COLUMN "method" text DEFAULT 'video' NOT NULL;