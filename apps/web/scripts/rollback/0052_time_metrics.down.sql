-- Reversión de 0052 (ejercicios por tiempo). Sólo si se abandona también el código de ejercicios por tiempo: el código
-- anterior no lee estas columnas, así que revertir el código NO requiere correr esto (las actividades configuradas en
-- `program_exercise.detail.activity` quedan en el jsonb; el código anterior las ignora y muestra «1 × 10 min»).
-- Borra DEFINITIVAMENTE exercise.metrics_profile y set_log.metrics. Se NIEGA si hay datos de personas: valores de actividad
-- registrados en series (velocidad, inclinación, nivel…) o el perfil elegido para un ejercicio propio. Primero exportarlos
-- (exportMyData incluye las métricas de cada serie) o decidir qué hacer. El perfil del catálogo se recalcula desde el código.
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
-- Migración: sha256 8479be9db877c55fbc9bda556ef5c7401a8019630b41154d54c45bc7f6e27b54
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from set_log where metrics is not null) then
    raise exception '0052: hay series con valores de actividad registrados (velocidad, inclinación, nivel…); exportarlos o decidir antes de revertir';
  end if;
  if exists (select 1 from exercise where metrics_profile is not null and (org_id is not null or owner_user_id is not null)) then
    raise exception '0052: hay ejercicios propios con el perfil elegido (cinta, bici, remo…); decidir antes de revertir';
  end if;
end $$;
alter table "set_log" drop constraint if exists "set_log_metrics_object";
alter table "exercise" drop constraint if exists "exercise_metrics_profile_valid";
alter table "set_log" drop column "metrics";
alter table "exercise" drop column "metrics_profile";
delete from drizzle.__drizzle_migrations where hash = '8479be9db877c55fbc9bda556ef5c7401a8019630b41154d54c45bc7f6e27b54';
commit;
