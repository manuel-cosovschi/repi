-- Aplicación de 0054 en producción (REPI Control: la pantalla de rutinas registra entrenamientos, D216), en UNA transacción.
-- Mismo efecto que `scripts/migrate.ts`: las sentencias del archivo y el registro en drizzle.__drizzle_migrations (sha256 del
-- archivo y `when` del journal). Si algo ya existe, falla entero. Mismo manejo de roles que hosted-0053.sql.
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0053 aplicada (54 migraciones registradas) y
-- aprobación (ampliación del máster REPI Control: migraciones aditivas autorizadas).
-- ADITIVA: dos columnas nulas (workout_session.kiosk_id y set_log.kiosk_id, referencia a gym_kiosk con ON DELETE SET NULL) y dos
-- índices parciales (sólo filas con pantalla: hoy ninguna). No cambia filas existentes (lo prueba verify-0054.sh). El código
-- actual de producción es compatible con 0054 aplicada (no lee las columnas nuevas): aplicar ANTES de integrar.
-- Generado desde drizzle/0054_kiosk_log.sql (sha256 1ed3801c6ccffc5b7b613336d45c6413749505d94ffbfcdd25b57013bb553e7a).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "set_log" ADD COLUMN "kiosk_id" text;
ALTER TABLE "workout_session" ADD COLUMN "kiosk_id" text;
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_kiosk_id_gym_kiosk_id_fk" FOREIGN KEY ("kiosk_id") REFERENCES "public"."gym_kiosk"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_kiosk_id_gym_kiosk_id_fk" FOREIGN KEY ("kiosk_id") REFERENCES "public"."gym_kiosk"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "set_log_kiosk_idx" ON "set_log" USING btree ("kiosk_id") WHERE kiosk_id is not null;
CREATE INDEX "workout_session_kiosk_idx" ON "workout_session" USING btree ("kiosk_id") WHERE kiosk_id is not null;
do $$ begin
  if exists (select 1 from set_log where kiosk_id is not null) or exists (select 1 from workout_session where kiosk_id is not null) then raise exception '0054: marcas de pantalla inesperadas'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'kiosk_id' and table_name in ('set_log', 'workout_session') and is_nullable = 'YES') <> 2 then raise exception '0054: faltan columnas'; end if;
  if exists (select 1 from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in ('set_log', 'workout_session')) then raise exception '0054: permisos públicos'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('1ed3801c6ccffc5b7b613336d45c6413749505d94ffbfcdd25b57013bb553e7a', 1794246607856);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
