CREATE TABLE "history_entry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"import_id" text NOT NULL,
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"exercise_id" text,
	"exercise_name" text NOT NULL,
	"set_index" integer NOT NULL,
	"weight_kg" text,
	"reps" integer,
	"seconds" integer
);
--> statement-breakpoint
CREATE TABLE "history_import" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text NOT NULL,
	"file_name" text,
	"parsed" jsonb NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"sets" integer DEFAULT 0 NOT NULL,
	"from_day" text,
	"to_day" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_import_id_history_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."history_import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_import" ADD CONSTRAINT "history_import_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_entry_user_day_idx" ON "history_entry" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "history_entry_user_ex_idx" ON "history_entry" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "history_import_user_idx" ON "history_import" USING btree ("user_id","created_at");