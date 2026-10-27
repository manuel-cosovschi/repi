// Aplica migraciones versionadas de ./drizzle. Uso: pnpm db:migrate (lee .env.local).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  // D68: RLS activado en todas las tablas de la app. La app entra como dueña de las tablas (no la afecta); en Supabase
  // deja sin acceso a la API REST pública aunque alguien otorgue privilegios por error.
  const open = await sql<{ t: string }[]>`select tablename as t from pg_tables where schemaname = 'public' and not rowsecurity`;
  for (const { t } of open) await sql.unsafe(`alter table public."${t.replace(/"/g, "")}" enable row level security`);
  await sql.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está configurada");
  runMigrations(url).then(() => console.log("migraciones aplicadas"));
}
