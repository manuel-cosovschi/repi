-- Reversión de 0049 (SI2). Sólo si se abandona también el código de Smart Import 2.0: el código anterior no lee la columna,
-- así que revertir el código NO requiere correr esto. Borra la procedencia de las rutinas importadas (las rutinas quedan
-- intactas). Producción: respaldo verde antes; como repi_app.
-- Migración: sha256 714d9b7a49ea2e07062b2ad12ac3d83f371aadeb1326c7cca5fce20db152709f
begin;
set local lock_timeout = '5s';
drop index if exists "own_routine_import_op_unique";
alter table "own_routine" drop column "origin";
delete from drizzle.__drizzle_migrations where hash = '714d9b7a49ea2e07062b2ad12ac3d83f371aadeb1326c7cca5fce20db152709f';
commit;
