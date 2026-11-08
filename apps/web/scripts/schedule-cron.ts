// Programa el job de avisos cada minuto con pg_cron + pg_net en Supabase (D68): Vercel Hobby sólo permite cron diario.
// Uso (una vez por entorno, con la URL en modo sesión del MISMO rol que creó los jobs; en producción, repi_app):
//   DATABASE_URL=… APP_URL=https://repiclub.com tsx scripts/schedule-cron.ts
// Requiere en la base: extensiones pg_cron, pg_net y supabase_vault, y antes haber corrido como postgres
// scripts/operations/cron-secret-vault.sql (guarda la clave en Vault y crea repi_private.cron_bearer()). Idempotente.
//
// La clave ya no va escrita en el comando del job: pg_cron registra ese texto en postgres_logs en cada corrida.
// El comando sólo llama a repi_private.cron_bearer(), que la lee de Vault. Este script nunca ve ni imprime la clave.
import postgres from "postgres";

const { DATABASE_URL: url, APP_URL: rawApp } = process.env;
if (!url || !rawApp) throw new Error("faltan DATABASE_URL o APP_URL");
if (process.env.CRON_SECRET) throw new Error("CRON_SECRET ya no se pasa a este script: la clave vive en Vault (ver scripts/operations/cron-secret-vault.sql)");
const app = new URL(rawApp);
if (app.protocol !== "https:" && app.hostname !== "localhost") throw new Error("APP_URL debe ser https");
const base = app.origin; // sin barra final ni ruta: el texto va dentro de una cadena SQL

const call = (path: string) =>
  `select net.http_get(url := '${base}${path}', headers := jsonb_build_object('Authorization', repi_private.cron_bearer()), timeout_milliseconds := 20000)`;

const sql = postgres(url, { max: 1, onnotice: () => {} });
(async () => {
  const [{ me }] = await sql<{ me: string }[]>`select current_user as me`;
  // pg_cron identifica el job por nombre y rol: con otro rol se crearía un segundo job y el viejo seguiría corriendo.
  const others = await sql<{ jobname: string; username: string }[]>`select jobname, username from cron.job where jobname like 'repi-%' and username <> current_user`;
  if (others.length) throw new Error(`los jobs ${others.map((j) => `${j.jobname} (${j.username})`).join(", ")} son de otro rol: correr con ese rol, no con ${me}`);
  // Sin mostrar la clave: sólo se comprueba que la función exista, sea ejecutable y devuelva algo.
  const [ready] = await sql<{ ok: boolean }[]>`
    select to_regprocedure('repi_private.cron_bearer()') is not null
       and has_function_privilege('repi_private.cron_bearer()', 'execute')
       and repi_private.cron_bearer() is not null as ok`;
  if (!ready?.ok) throw new Error("falta la clave en Vault o el permiso: correr antes scripts/operations/cron-secret-vault.sql como postgres");
  await sql`select cron.schedule('repi-notifications', '* * * * *', ${call("/api/cron/notifications")})`;
  // El historial de ejecuciones crece una fila por minuto: se conserva 3 días.
  await sql`select cron.schedule('repi-cron-cleanup', '15 5 * * *', ${"delete from cron.job_run_details where end_time < now() - interval '3 days'"})`;
  // Ningún job de REPI puede llevar una clave escrita en el comando.
  const leaks = await sql`select jobname from cron.job where jobname like 'repi-%' and command ilike '%Bearer %'`;
  if (leaks.length) throw new Error(`jobs con la clave escrita en el comando: ${leaks.map((j) => j.jobname).join(", ")}`);
  const jobs = await sql`select jobname, schedule, active, username from cron.job where jobname like 'repi-%' order by jobname`;
  console.log(jobs.map((j) => `${j.jobname} ${j.schedule} (${j.username})${j.active ? "" : " inactivo"}`).join("\n"));
  await sql.end();
})().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await sql.end({ timeout: 1 });
  process.exit(1);
});
