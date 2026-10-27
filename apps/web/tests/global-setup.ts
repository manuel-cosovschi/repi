import postgres from "postgres";
import { runMigrations } from "../scripts/migrate";
import { assertLocalDatabaseIdentity, assertTestDatabaseTarget } from "../scripts/lib/database-target";

// Recrea el esquema de la base de pruebas en cada corrida.
export default async function setup() {
  try { process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname); } catch {}
  const url = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, process.env);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
  const [identity] = await sql<{ database: string; serverAddress: string }[]>`select current_database() as database, host(inet_server_addr()) as "serverAddress"`;
  assertLocalDatabaseIdentity(identity, "repi_test");
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  } finally { await sql.end(); }
  await runMigrations(url);
}
