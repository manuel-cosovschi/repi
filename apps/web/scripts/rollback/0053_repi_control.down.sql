-- Reversión de 0053 (REPI Control). Sólo si se abandona también el código de REPI Control: el código anterior no lee estas
-- tablas ni columnas, así que revertir el código NO requiere correr esto.
-- Borra DEFINITIVAMENTE las pantallas, credenciales y consultas del kiosco, la política por gimnasio, quién revocó a alguien
-- del equipo y la modalidad de los contactos. Se NIEGA si hay datos de uso real: pantallas o credenciales de organizaciones
-- que no son demo, gimnasios reales supervisados, revocaciones registradas o contactos con modalidad. Primero decidir qué hacer.
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
-- Migración: sha256 a405b8466298862f9906f8d765a08e02f383a437d0e51724b2e4dea998ed9051
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from gym_kiosk k join organization o on o.id = k.org_id where not o.is_demo) then raise exception '0053: hay pantallas de gimnasios reales'; end if;
  if exists (select 1 from kiosk_credential c join organization o on o.id = c.org_id where not o.is_demo) then raise exception '0053: hay credenciales de socios reales'; end if;
  if exists (select 1 from organization where not is_demo and (routine_policy <> 'open' or kiosk_enabled)) then raise exception '0053: hay gimnasios reales con REPI Control activo'; end if;
  if exists (select 1 from staff_membership where revoked_at is not null) then raise exception '0053: hay revocaciones de personal registradas'; end if;
  if exists (select 1 from commercial_lead where product_mode is not null) then raise exception '0053: hay contactos con modalidad'; end if;
end $$;
drop table if exists "kiosk_session";
drop table if exists "kiosk_credential";
drop table if exists "gym_kiosk";
alter table "organization" drop constraint if exists "organization_routine_policy_valid";
alter table "organization" drop column if exists "routine_policy";
alter table "organization" drop column if exists "kiosk_enabled";
alter table "staff_membership" drop constraint if exists "staff_membership_revoked_by_user_id_fk";
alter table "staff_membership" drop column if exists "revoked_at";
alter table "staff_membership" drop column if exists "revoked_by";
alter table "commercial_lead" drop column if exists "product_mode";
delete from drizzle.__drizzle_migrations where hash = 'a405b8466298862f9906f8d765a08e02f383a437d0e51724b2e4dea998ed9051';
commit;
