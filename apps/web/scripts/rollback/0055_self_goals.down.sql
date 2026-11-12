-- Reversión de 0055 (metas propias del alumno, D217). Sólo si se abandona también el código de metas propias: el código anterior
-- no lee estas columnas, así que revertir el código NO requiere correr esto.
-- Se NIEGA si existe alguna meta propia (origin = 'self'): son datos de personas; primero decidir qué hacer con ellas.
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
-- Migración: sha256 c1658fb62797f5f8dc6be81d974f5c0af3d1e91434c67a1d9f6c6a50099d73a4
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from client_goal where origin = 'self' or coach_client_id is null) then raise exception '0055: hay metas propias de alumnos'; end if;
end $$;
alter table "client_goal" drop constraint if exists "client_goal_owner_valid";
drop index if exists "client_goal_self_idx";
alter table "client_goal" drop constraint if exists "client_goal_user_id_user_id_fk";
alter table "client_goal" drop column if exists "user_id";
alter table "client_goal" drop column if exists "origin";
alter table "client_goal" alter column "coach_client_id" set not null;
delete from drizzle.__drizzle_migrations where hash = 'c1658fb62797f5f8dc6be81d974f5c0af3d1e91434c67a1d9f6c6a50099d73a4';
commit;
