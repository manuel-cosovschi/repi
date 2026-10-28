CREATE TABLE "exercise_substitution" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"substitute_exercise_id" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_substitute_exercise_id_exercise_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_substitution_uq" ON "exercise_substitution" USING btree ("org_id","exercise_id","substitute_exercise_id");