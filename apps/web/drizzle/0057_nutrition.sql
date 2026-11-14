CREATE TABLE "nutrition_day" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_day_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "nutrition_day_valid" CHECK ("nutrition_day"."day" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
CREATE TABLE "nutrition_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"meal" text NOT NULL,
	"food" jsonb NOT NULL,
	"qty_amount" double precision NOT NULL,
	"qty_unit" text NOT NULL,
	"grams" double precision,
	"nutrients" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_entry_day_valid" CHECK ("nutrition_entry"."day" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "nutrition_entry_meal_valid" CHECK ("nutrition_entry"."meal" in ('desayuno','almuerzo','merienda','cena','colacion','otra')),
	CONSTRAINT "nutrition_entry_qty_valid" CHECK ("nutrition_entry"."qty_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "nutrition_favorite" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"meal" text,
	"items" jsonb NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_food" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"barcode" text,
	"basis_amount" double precision NOT NULL,
	"basis_unit" text NOT NULL,
	"basis_grams" double precision,
	"values" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_food_basis_valid" CHECK ("nutrition_food"."basis_unit" in ('g','ml','unidad','porcion') and "nutrition_food"."basis_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "nutrition_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"goal" text,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"targets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_source" text,
	"targets_set_at" timestamp with time zone,
	"reminders" boolean DEFAULT false NOT NULL,
	"proactive" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_profile_goal_valid" CHECK ("nutrition_profile"."goal" is null or "nutrition_profile"."goal" in ('habits','organize','track','protein','strength','sport','professional')),
	CONSTRAINT "nutrition_profile_source_valid" CHECK ("nutrition_profile"."target_source" is null or "nutrition_profile"."target_source" in ('self','professional'))
);
--> statement-breakpoint
CREATE TABLE "nutrition_recipe" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"ingredients" jsonb NOT NULL,
	"servings" double precision,
	"final_weight_g" double precision,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_recipe_yield_valid" CHECK (("nutrition_recipe"."servings" is null or "nutrition_recipe"."servings" > 0) and ("nutrition_recipe"."final_weight_g" is null or "nutrition_recipe"."final_weight_g" > 0))
);
--> statement-breakpoint
CREATE TABLE "off_product_cache" (
	"barcode" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"product" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "off_product_status_valid" CHECK ("off_product_cache"."status" in ('found','not_found'))
);
--> statement-breakpoint
ALTER TABLE "nutrition_day" ADD CONSTRAINT "nutrition_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entry" ADD CONSTRAINT "nutrition_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_favorite" ADD CONSTRAINT "nutrition_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_food" ADD CONSTRAINT "nutrition_food_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_profile" ADD CONSTRAINT "nutrition_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_recipe" ADD CONSTRAINT "nutrition_recipe_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nutrition_entry_user_day_idx" ON "nutrition_entry" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "nutrition_favorite_user_idx" ON "nutrition_favorite" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nutrition_food_user_idx" ON "nutrition_food" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nutrition_recipe_user_idx" ON "nutrition_recipe" USING btree ("user_id");