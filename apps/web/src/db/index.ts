import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está configurada (ver .env.example)");

// Una sola conexión por proceso, también con el recargado en caliente de Next.
// El pooler de Supabase en modo transacción (puerto 6543) no admite sentencias preparadas; en funciones
// serverless cada instancia abre pocas conexiones porque el pooler ya multiplexa (D68).
const pooled = /:6543\//.test(url) || process.env.DATABASE_POOLED === "1";
const g = globalThis as unknown as { __repiSql?: ReturnType<typeof postgres> };
export const sqlClient = g.__repiSql ?? postgres(url, { max: process.env.VERCEL ? 3 : 10, prepare: !pooled });
if (process.env.NODE_ENV !== "production") g.__repiSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export { schema };
