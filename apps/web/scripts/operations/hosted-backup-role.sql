-- D190: rol de SÓLO LECTURA para el respaldo diario de GitHub Actions (.github/workflows/backup.yml).
-- No es una migración de la app: no cambia tablas ni datos. Se crea SIN contraseña, así que no puede entrar hasta que
-- el titular le fije una (ver docs/RESPALDOS.md, «Puesta en marcha»). Las tablas son de repi_app (D186), por eso los
-- permisos se otorgan como repi_app con la misma membresía temporal que las migraciones.
--   - BYPASSRLS: las 98 tablas tienen RLS sin políticas; sin esto el respaldo leería 0 filas sin avisar.
--   - Lectura obligada: default_transaction_read_only y, además, el respaldo abre su transacción READ ONLY.
--   - Sin herencia, sin crear bases ni roles, como máximo 3 conexiones.
-- Revertir: drop owned by repi_backup; drop role repi_backup;  (no toca datos)
begin;
create role repi_backup with login nosuperuser nocreatedb nocreaterole noinherit noreplication bypassrls connection limit 3;
alter role repi_backup set default_transaction_read_only = on;
alter role repi_backup set statement_timeout = '10min';
alter role repi_backup set idle_in_transaction_session_timeout = '5min';
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
grant usage on schema drizzle to repi_backup;
grant select on table drizzle.__drizzle_migrations to repi_backup;
grant select on all tables in schema public to repi_backup;
-- Las tablas que creen migraciones futuras (siempre como repi_app) también quedan legibles para el respaldo.
alter default privileges for role repi_app in schema public grant select on tables to repi_backup;
reset role;
revoke repi_app from postgres granted by postgres;
commit;
