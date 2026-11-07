-- Aplicación de 0048 en producción (D206, preferencias del pedido de programa), en UNA transacción. Mismo efecto que
-- `scripts/migrate.ts`: la sentencia del archivo y el registro en drizzle.__drizzle_migrations (sha256 del archivo y
-- `when` del journal). Mismo manejo de roles que hosted-0047.sql (repi_app dueño; postgres sólo con SET en la transacción).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0047 aplicada y aprobación del titular.
-- ADITIVA: una columna jsonb nula en student_request. No modifica ni borra filas. El código actual de producción es
-- compatible con 0048 aplicada (no lee ni escribe la columna): aplicar ANTES de integrar.
-- Ensayado en una base descartable con scripts/operations/verify-0048.sh.
-- Generado desde drizzle/0048_program_request_brief.sql (sha256 7f000e8c0aa10760304ac4e9b50db9e7c0fea34dbc84620d5b667105c1f29dc1).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "student_request" ADD COLUMN "brief" jsonb;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'student_request' and column_name = 'brief') then raise exception '0048: falta student_request.brief'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('7f000e8c0aa10760304ac4e9b50db9e7c0fea34dbc84620d5b667105c1f29dc1', 1794012400689);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
