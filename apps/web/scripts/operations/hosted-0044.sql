-- Aplicación de 0044 en producción (D192), en UNA transacción. Mismo efecto que `scripts/migrate.ts`: las sentencias del
-- archivo, RLS activado (D68) y el registro en drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo
-- ya existe, falla y no queda nada a medias. Mismo manejo de roles que hosted-0043.sql.
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0043 aplicada (ya en producción), y el código
-- del PR #21 todavía sin publicar (el código actual de producción no lee `set_type`: probado en tests/coach-workflow.test.ts).
-- Sólo crea una tabla nueva: no modifica ni borra filas existentes (programas, sesiones, set_log e historial quedan iguales).
-- Además activa RLS en training_target y training_proposal (0043 las creó sin RLS; `anon` y `authenticated` no tienen
-- permisos sobre ellas, así que no hubo exposición, pero D68 pide RLS en todas las tablas). Es idempotente.
-- APLICADO en producción el 04/11/2026 (~23:44 UTC), tras el respaldo backup-20261104-234215-41935448423. Ensayado antes en
-- una base descartable con scripts/operations/verify-0044.sh. No volver a correrlo (falla entero sin cambios: la tabla ya existe).
-- Generado desde drizzle/0044_set_types.sql (sha256 ca3d81a89f7f6dd43ef7bb0821250b0cccc85202c8134eed62d8e9f181694920).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
CREATE TABLE "set_type" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "set_type" ADD CONSTRAINT "set_type_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "set_type" ADD CONSTRAINT "set_type_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "set_type_owner_name_unique" ON "set_type" USING btree ("org_id","owner_user_id",lower("name")) WHERE archived_at is null;
CREATE INDEX "set_type_owner_idx" ON "set_type" USING btree ("org_id","owner_user_id");
alter table public."set_type" enable row level security;
alter table public."training_target" enable row level security;
alter table public."training_proposal" enable row level security;
-- Comprobación dentro de la transacción: si falta algo, se aborta y no queda nada aplicado.
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'set_type') then raise exception '0044: falta set_type'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'set_type_owner_name_unique') then raise exception '0044: falta el índice único'; end if;
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname in ('set_type', 'training_target', 'training_proposal') and not relrowsecurity) then raise exception '0044: falta RLS'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('ca3d81a89f7f6dd43ef7bb0821250b0cccc85202c8134eed62d8e9f181694920', 1793818585874);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
