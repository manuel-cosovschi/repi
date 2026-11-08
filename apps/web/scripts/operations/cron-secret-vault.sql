-- Clave de los jobs programados (CRON_SECRET) en Supabase Vault, sin que aparezca en los registros.
-- Correr UNA vez en Supabase (SQL editor o MCP), como postgres. Idempotente y aditivo: no toca datos ni el job actual.
--
-- Por qué: el comando del job repi-notifications llevaba el bearer escrito; pg_cron escribe el comando en
-- postgres_logs en cada corrida. Con esto el comando sólo llama a repi_private.cron_bearer() y el texto registrado
-- ya no contiene la clave.
--
-- La clave nueva la genera la base (32 bytes al azar) y no se imprime: el titular la copia desde
-- Supabase → Integrations → Vault («repi_cron_secret») a Vercel → CRON_SECRET. Pasos completos en docs/DESPLIEGUE.md.
-- Los jobs pertenecen a repi_app (los creó ese rol) y repi_app no tiene acceso a Vault: la función, de postgres y
-- SECURITY DEFINER, le devuelve sólo esta clave y nada más del Vault.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'repi_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'repi_cron_secret', 'Bearer de /api/cron/* (D68)');
  end if;
end $$;

-- Esquema propio, fuera de los esquemas que expone la API de Supabase.
create schema if not exists repi_private;
revoke all on schema repi_private from public;
grant usage on schema repi_private to repi_app;

create or replace function repi_private.cron_bearer() returns text
  language sql stable security definer set search_path = ''
  as $$ select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'repi_cron_secret' limit 1 $$;
revoke all on function repi_private.cron_bearer() from public, anon, authenticated;
grant execute on function repi_private.cron_bearer() to repi_app;

-- Comprobación (sin mostrar la clave): las tres columnas deben dar true.
select exists (select 1 from vault.secrets where name = 'repi_cron_secret') as vault_ok,
       has_function_privilege('repi_app', 'repi_private.cron_bearer()', 'execute') as app_ok,
       not has_function_privilege('anon', 'repi_private.cron_bearer()', 'execute') as anon_blocked;
