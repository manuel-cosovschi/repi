// Programa el job de avisos cada minuto con pg_cron + pg_net en Supabase (D68): Vercel Hobby sólo permite cron diario.
// Uso (una vez por entorno, con la URL en modo sesión del rol dueño): DATABASE_URL=… APP_URL=https://… CRON_SECRET=… tsx scripts/schedule-cron.ts
// Requiere en la base: extensiones pg_cron y pg_net, y uso de los esquemas cron y net para el rol. Idempotente.
import postgres from "postgres";

const { DATABASE_URL: url, APP_URL: app, CRON_SECRET: secret } = process.env;
if (!url || !app || !secret) throw new Error("faltan DATABASE_URL, APP_URL o CRON_SECRET");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const call = (path: string) =>
  `select net.http_get(url := '${app}${path}', headers := jsonb_build_object('Authorization', 'Bearer ${secret}'), timeout_milliseconds := 20000)`;
(async () => {
  await sql`select cron.schedule('repi-notifications', '* * * * *', ${call("/api/cron/notifications")})`;
  // El historial de ejecuciones crece una fila por minuto: se conserva 3 días.
  await sql`select cron.schedule('repi-cron-cleanup', '15 5 * * *', ${"delete from cron.job_run_details where end_time < now() - interval '3 days'"})`;
  const jobs = await sql`select jobname, schedule from cron.job where jobname like 'repi-%'`;
  console.log(jobs.map((j) => `${j.jobname} ${j.schedule}`).join("\n"));
  await sql.end();
})();
