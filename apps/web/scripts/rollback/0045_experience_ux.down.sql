-- Reversión de 0045 (D195). Sólo si se abandona también el código de este bloque: el código anterior no lee nada de 0045,
-- así que revertir el código NO requiere correr esto. Pierde el catálogo de equipamiento, la auditoría de correcciones y las
-- ayudas vistas. Las correcciones de valores ya hechas en set_log quedan (son los valores vigentes); lo que se pierde es su
-- rastro. Si hay series o entrenamientos ANULADOS, se niega a correr: con el código anterior volverían a contar (las
-- columnas desaparecen). Primero restaurarlos o decidir qué hacer con ellos (consulta abajo); nada se borra solo.
--   select id, status, voided_at from workout_session where voided_at is not null;
--   select id, session_id, voided_at from set_log where voided_at is not null;
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from set_log where voided_at is not null) or exists (select 1 from workout_session where voided_at is not null or status = 'voided') then
    raise exception '0045: hay series o entrenamientos anulados; restaurarlos antes de revertir';
  end if;
end $$;
DROP TABLE IF EXISTS "training_correction";
DROP TABLE IF EXISTS "gym_equipment_exercise";
DROP TABLE IF EXISTS "gym_equipment";
ALTER TABLE "set_log" DROP COLUMN IF EXISTS "voided_at", DROP COLUMN IF EXISTS "voided_by", DROP COLUMN IF EXISTS "void_reason";
ALTER TABLE "workout_session" DROP COLUMN IF EXISTS "voided_at", DROP COLUMN IF EXISTS "voided_by", DROP COLUMN IF EXISTS "void_reason";
ALTER TABLE "user_pref" DROP COLUMN IF EXISTS "hints";
delete from drizzle.__drizzle_migrations where hash = '36cdc6b5faee6da95152a7a2e2a87425c3b1e79e4e233607d4a328304fa7a685';
commit;
