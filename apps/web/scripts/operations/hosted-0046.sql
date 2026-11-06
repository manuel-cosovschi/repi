-- Aplicación de 0046 en producción (D199–D202, Personal Progress & Body Tracking 1.0 + novedades de REPI), en UNA
-- transacción. Mismo efecto que `scripts/migrate.ts`: las sentencias del archivo, RLS activado en las tablas nuevas (D68) y el
-- registro en drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo ya existe, falla entero.
-- Mismo manejo de roles que hosted-0045.sql (repi_app como dueño; postgres sólo con SET dentro de la transacción).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0045 aplicada (ya en producción) y aprobación
-- explícita del titular. El código actual de producción es compatible con 0046 aplicada: sólo agrega cinco tablas que ese
-- código no lee. No modifica ni borra filas ni columnas existentes (lo prueba verify-0046.sh). `media_object.purpose` es
-- texto sin restricción en la base: el valor nuevo «progress_photo» no necesita cambio de esquema.
-- NO APLICADO. Ensayado en una base descartable con scripts/operations/verify-0046.sh.
-- Generado desde drizzle/0046_personal_progress.sql (sha256 322f74f7491b934dcc1360117f2a650a97838a22efa72f6d4521c0b2da5269e2).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
CREATE TABLE "announcement_read" (
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_read_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
CREATE TABLE "body_goal" (
	"user_id" text PRIMARY KEY NOT NULL,
	"start_source" text DEFAULT 'first_entry' NOT NULL,
	"start_weight_g" integer,
	"start_on" text,
	"target_weight_g" integer NOT NULL,
	"target_on" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_goal_target_range" CHECK ("body_goal"."target_weight_g" between 20000 and 400000),
	CONSTRAINT "body_goal_start_range" CHECK ("body_goal"."start_weight_g" is null or "body_goal"."start_weight_g" between 20000 and 400000),
	CONSTRAINT "body_goal_start_valid" CHECK ("body_goal"."start_source" = 'first_entry' or ("body_goal"."start_weight_g" is not null and "body_goal"."start_on" is not null))
);
CREATE TABLE "body_weight_entry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"measured_on" text NOT NULL,
	"weight_g" integer NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_weight_range" CHECK ("body_weight_entry"."weight_g" between 20000 and 400000),
	CONSTRAINT "body_weight_day_valid" CHECK ("body_weight_entry"."measured_on" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "body_weight_source_valid" CHECK ("body_weight_entry"."source" in ('manual'))
);
CREATE TABLE "product_announcement" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"cta_label" text,
	"destination" text DEFAULT 'none' NOT NULL,
	"audience" text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_kind_valid" CHECK ("product_announcement"."kind" in ('feature', 'improvement', 'important', 'guide', 'notice')),
	CONSTRAINT "announcement_status_valid" CHECK ("product_announcement"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "announcement_published_at" CHECK ("product_announcement"."status" = 'draft' or "product_announcement"."publish_at" is not null)
);
CREATE TABLE "progress_photo" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"media_id" text NOT NULL,
	"taken_on" text NOT NULL,
	"pose" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_photo_media_id_unique" UNIQUE("media_id"),
	CONSTRAINT "progress_photo_pose_valid" CHECK ("progress_photo"."pose" is null or "progress_photo"."pose" in ('front', 'side', 'back', 'other')),
	CONSTRAINT "progress_photo_day_valid" CHECK ("progress_photo"."taken_on" ~ '^\d{4}-\d{2}-\d{2}$')
);
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_announcement_id_product_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."product_announcement"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "body_goal" ADD CONSTRAINT "body_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "body_weight_entry" ADD CONSTRAINT "body_weight_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "product_announcement" ADD CONSTRAINT "product_announcement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;ALTER TABLE "product_announcement" ADD CONSTRAINT "product_announcement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;ALTER TABLE "progress_photo" ADD CONSTRAINT "progress_photo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "progress_photo" ADD CONSTRAINT "progress_photo_media_id_media_object_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_object"("id") ON DELETE no action ON UPDATE no action;CREATE INDEX "announcement_read_user_idx" ON "announcement_read" USING btree ("user_id");CREATE UNIQUE INDEX "body_weight_user_day_unique" ON "body_weight_entry" USING btree ("user_id","measured_on");CREATE INDEX "announcement_status_idx" ON "product_announcement" USING btree ("status","publish_at");CREATE INDEX "progress_photo_user_idx" ON "progress_photo" USING btree ("user_id","taken_on");
alter table public."announcement_read" enable row level security;
alter table public."body_goal" enable row level security;
alter table public."body_weight_entry" enable row level security;
alter table public."product_announcement" enable row level security;
alter table public."progress_photo" enable row level security;
do $$ begin
  if (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('announcement_read', 'body_goal', 'body_weight_entry', 'product_announcement', 'progress_photo')) <> 5 then raise exception '0046: faltan tablas'; end if;
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname in ('announcement_read', 'body_goal', 'body_weight_entry', 'product_announcement', 'progress_photo') and not relrowsecurity) then raise exception '0046: falta RLS'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'body_weight_user_day_unique') then raise exception '0046: falta el índice de una medición por día'; end if;
  if not exists (select 1 from pg_constraint where conname = 'progress_photo_media_id_media_object_id_fk') then raise exception '0046: falta la referencia de fotos a media_object (purga D196)'; end if;
  if exists (select 1 from product_announcement) or exists (select 1 from body_weight_entry) or exists (select 1 from progress_photo) then raise exception '0046: datos inesperados'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('322f74f7491b934dcc1360117f2a650a97838a22efa72f6d4521c0b2da5269e2', 1793922541616);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
