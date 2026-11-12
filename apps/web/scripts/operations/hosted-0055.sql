-- Aplicación de 0055 en producción (D217: metas propias del alumno por ejercicio en client_goal), en UNA transacción.
-- Mismo efecto que `scripts/migrate.ts`: las sentencias del archivo y el registro en drizzle.__drizzle_migrations (sha256 del
-- archivo y `when` del journal). Si algo ya existe, falla entero. Mismo manejo de roles que hosted-0054.sql.
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0054 aplicada (55 migraciones registradas) y
-- aprobación (máster Personalization & Progress Intelligence 2.0: migraciones aditivas autorizadas).
-- ADITIVA: client_goal.coach_client_id deja de ser obligatoria (sólo para filas nuevas «self»), dos columnas nuevas (user_id nula
-- con FK a user ON DELETE CASCADE; origin con valor por defecto 'coach'), un índice parcial y una restricción que exige dueño
-- coherente. Las filas existentes quedan origin = 'coach' con su relación (lo prueba verify-0055.sh). El código actual de
-- producción es compatible con 0055 aplicada (no lee las columnas nuevas e inserta metas de coach como siempre).
-- Generado desde drizzle/0055_self_goals.sql (sha256 c1658fb62797f5f8dc6be81d974f5c0af3d1e91434c67a1d9f6c6a50099d73a4).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "client_goal" ALTER COLUMN "coach_client_id" DROP NOT NULL;
ALTER TABLE "client_goal" ADD COLUMN "user_id" text;
ALTER TABLE "client_goal" ADD COLUMN "origin" text DEFAULT 'coach' NOT NULL;
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "client_goal_self_idx" ON "client_goal" USING btree ("user_id","status") WHERE user_id is not null;
ALTER TABLE "client_goal" ADD CONSTRAINT "client_goal_owner_valid" CHECK (("client_goal"."origin" = 'coach' and "client_goal"."coach_client_id" is not null and "client_goal"."user_id" is null) or ("client_goal"."origin" = 'self' and "client_goal"."user_id" is not null and "client_goal"."coach_client_id" is null));
do $$ begin
  if exists (select 1 from client_goal where origin <> 'coach' or coach_client_id is null or user_id is not null) then raise exception '0055: filas existentes alteradas'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'client_goal' and column_name in ('user_id', 'origin')) <> 2 then raise exception '0055: faltan columnas'; end if;
  if exists (select 1 from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name = 'client_goal') then raise exception '0055: permisos públicos'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('c1658fb62797f5f8dc6be81d974f5c0af3d1e91434c67a1d9f6c6a50099d73a4', 1794491042333);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
