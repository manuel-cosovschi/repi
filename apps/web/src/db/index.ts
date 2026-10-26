import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está configurada (ver .env.example)");

// Una sola conexión por proceso, también con el recargado en caliente de Next.
const g = globalThis as unknown as { __repiSql?: ReturnType<typeof postgres> };
export const sqlClient = g.__repiSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") g.__repiSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export { schema };
