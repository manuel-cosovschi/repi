import postgres from "postgres";
import { runMigrations } from "../scripts/migrate";

// Recrea el esquema de la base de pruebas en cada corrida.
export default async function setup() {
  try { process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname); } catch {}
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/repi_test/.test(url)) throw new Error("TEST_DATABASE_URL debe apuntar a una base *_test");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await sql.end();
  await runMigrations(url);
}
