-- Reversión de 0054 (registro desde la pantalla de rutinas, D216). Sólo si se abandona también el código del registro: el código
-- anterior no lee estas columnas, así que revertir el código NO requiere correr esto.
-- Borra DEFINITIVAMENTE qué entrenamientos y series se guardaron desde una pantalla (las series y los entrenamientos quedan; sólo
-- se pierde la marca de origen; el detalle sigue en audit_event). Se NIEGA si hay marcas de gimnasios reales: primero decidir.
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
-- Migración: sha256 1ed3801c6ccffc5b7b613336d45c6413749505d94ffbfcdd25b57013bb553e7a
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from set_log l join gym_kiosk k on k.id = l.kiosk_id join organization o on o.id = k.org_id where not o.is_demo) then raise exception '0054: hay series registradas en pantallas de gimnasios reales'; end if;
  if exists (select 1 from workout_session s join gym_kiosk k on k.id = s.kiosk_id join organization o on o.id = k.org_id where not o.is_demo) then raise exception '0054: hay entrenamientos empezados en pantallas de gimnasios reales'; end if;
end $$;
drop index if exists "set_log_kiosk_idx";
drop index if exists "workout_session_kiosk_idx";
alter table "set_log" drop constraint if exists "set_log_kiosk_id_gym_kiosk_id_fk";
alter table "workout_session" drop constraint if exists "workout_session_kiosk_id_gym_kiosk_id_fk";
alter table "set_log" drop column if exists "kiosk_id";
alter table "workout_session" drop column if exists "kiosk_id";
delete from drizzle.__drizzle_migrations where hash = '1ed3801c6ccffc5b7b613336d45c6413749505d94ffbfcdd25b57013bb553e7a';
commit;
