-- Aplicación de 0049 en producción (SI2, procedencia de rutinas importadas), en UNA transacción. Mismo efecto que
-- `scripts/migrate.ts`: las sentencias del archivo y el registro en drizzle.__drizzle_migrations (sha256 del archivo y
-- `when` del journal). Mismo manejo de roles que hosted-0048.sql (repi_app dueño; postgres sólo con SET en la transacción).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0048 aplicada.
-- ADITIVA: una columna jsonb nula en own_routine y un índice único parcial (sólo filas con origin.opId: ninguna hoy). No
-- modifica ni borra filas. El código actual de producción es compatible con 0049 aplicada (no lee ni escribe la columna):
-- aplicar ANTES de integrar.
-- Ensayado en una base descartable con scripts/operations/verify-0049.sh.
-- Generado desde drizzle/0049_own_routine_origin.sql (sha256 714d9b7a49ea2e07062b2ad12ac3d83f371aadeb1326c7cca5fce20db152709f).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "own_routine" ADD COLUMN "origin" jsonb;
CREATE UNIQUE INDEX "own_routine_import_op_unique" ON "own_routine" USING btree ("user_id",("origin"->>'opId'),("origin"->>'day')) WHERE "own_routine"."origin" ? 'opId';
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'own_routine' and column_name = 'origin') then raise exception '0049: falta own_routine.origin'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'own_routine_import_op_unique') then raise exception '0049: falta el índice'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('714d9b7a49ea2e07062b2ad12ac3d83f371aadeb1326c7cca5fce20db152709f', 1794021005579);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
