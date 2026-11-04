ALTER TABLE "user_pref" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "theme_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_theme_valid" CHECK ("user_pref"."theme" in ('light', 'dark', 'system'));