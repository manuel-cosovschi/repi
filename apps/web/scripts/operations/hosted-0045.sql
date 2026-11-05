-- Aplicación de 0045 en producción (D195, Experience Intelligence & UX 2.0), en UNA transacción. Mismo efecto que
-- `scripts/migrate.ts`: las sentencias del archivo, RLS activado en las tablas nuevas (D68) y el registro en
-- drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo ya existe, falla y no queda nada a medias.
-- Mismo manejo de roles que hosted-0044.sql.
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0044 aplicada (ya en producción) y aprobación
-- explícita del titular. El código actual de producción es compatible con 0045 aplicada: sólo agrega columnas que admiten
-- NULL (o con valor por defecto) y tablas nuevas que ese código no lee.
-- Sólo AGREGA: tres tablas nuevas (gym_equipment, gym_equipment_exercise, training_correction), columnas de anulación en
-- set_log y workout_session (voided_at, voided_by, void_reason; todas NULL) y user_pref.hints (por defecto {}). No modifica
-- ni borra filas existentes: programas, sesiones, set_log e historial quedan iguales (lo prueba verify-0045.sh).
-- NO APLICADO. Ensayado en una base descartable con scripts/operations/verify-0045.sh.
-- Generado desde drizzle/0045_experience_ux.sql (sha256 36cdc6b5faee6da95152a7a2e2a87425c3b1e79e4e233607d4a328304fa7a685).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
CREATE TABLE "gym_equipment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"code" text,
	"unit" text DEFAULT 'kg' NOT NULL,
	"increment" double precision,
	"per_side" boolean DEFAULT false NOT NULL,
	"min_load" double precision,
	"max_load" double precision,
	"loads" jsonb,
	"note" text,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_equipment_category_valid" CHECK ("gym_equipment"."category" in ('dumbbell', 'barbell', 'plate_loaded', 'machine', 'cable', 'kettlebell', 'bodyweight', 'other')),
	CONSTRAINT "gym_equipment_unit_valid" CHECK ("gym_equipment"."unit" in ('kg', 'lb'))
);
CREATE TABLE "gym_equipment_exercise" (
	"equipment_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_equipment_exercise_equipment_id_exercise_id_pk" PRIMARY KEY("equipment_id","exercise_id")
);
CREATE TABLE "training_correction" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"set_log_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"reason" text,
	"request_id" text NOT NULL,
	"base_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_correction_action_valid" CHECK ("training_correction"."action" in ('set_edit', 'set_void', 'set_restore', 'set_add', 'session_void', 'session_restore'))
);
ALTER TABLE "set_log" ADD COLUMN "voided_at" timestamp with time zone;
ALTER TABLE "set_log" ADD COLUMN "voided_by" text;
ALTER TABLE "set_log" ADD COLUMN "void_reason" text;
ALTER TABLE "user_pref" ADD COLUMN "hints" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "workout_session" ADD COLUMN "voided_at" timestamp with time zone;
ALTER TABLE "workout_session" ADD COLUMN "voided_by" text;
ALTER TABLE "workout_session" ADD COLUMN "void_reason" text;
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gym_equipment_exercise" ADD CONSTRAINT "gym_equipment_exercise_equipment_id_gym_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."gym_equipment"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gym_equipment_exercise" ADD CONSTRAINT "gym_equipment_exercise_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_set_log_id_set_log_id_fk" FOREIGN KEY ("set_log_id") REFERENCES "public"."set_log"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_correction" ADD CONSTRAINT "training_correction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "gym_equipment_location_idx" ON "gym_equipment" USING btree ("org_id","location_id");
CREATE UNIQUE INDEX "gym_equipment_name_unique" ON "gym_equipment" USING btree ("location_id",lower("name")) WHERE archived_at is null;
CREATE INDEX "gym_equipment_exercise_ex_idx" ON "gym_equipment_exercise" USING btree ("exercise_id");
CREATE UNIQUE INDEX "training_correction_request_unique" ON "training_correction" USING btree ("user_id","request_id");
CREATE INDEX "training_correction_session_idx" ON "training_correction" USING btree ("session_id","created_at");
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
alter table public."gym_equipment" enable row level security;
alter table public."gym_equipment_exercise" enable row level security;
alter table public."training_correction" enable row level security;
-- Comprobación dentro de la transacción: si falta algo, se aborta y no queda nada aplicado.
do $$ begin
  if (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('gym_equipment', 'gym_equipment_exercise', 'training_correction')) <> 3 then raise exception '0045: faltan tablas'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('set_log', 'workout_session') and column_name in ('voided_at', 'voided_by', 'void_reason')) <> 6 then raise exception '0045: faltan columnas de anulación'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_pref' and column_name = 'hints') then raise exception '0045: falta user_pref.hints'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'training_correction_request_unique') then raise exception '0045: falta el índice de idempotencia'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'gym_equipment_name_unique') then raise exception '0045: falta el índice único de equipos'; end if;
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname in ('gym_equipment', 'gym_equipment_exercise', 'training_correction') and not relrowsecurity) then raise exception '0045: falta RLS'; end if;
  if exists (select 1 from set_log where voided_at is not null) or exists (select 1 from workout_session where voided_at is not null) then raise exception '0045: anulaciones inesperadas'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('36cdc6b5faee6da95152a7a2e2a87425c3b1e79e4e233607d4a328304fa7a685', 1793838453674);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
