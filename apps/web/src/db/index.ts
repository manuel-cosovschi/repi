import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está configurada (ver .env.example)");

// Una sola conexión por proceso, también con el recargado en caliente de Next.
// El pooler de Supabase en modo transacción (puerto 6543) no admite sentencias preparadas; en funciones
// serverless cada instancia abre pocas conexiones porque el pooler ya multiplexa (D68).
const pooled = /:6543\//.test(url) || process.env.DATABASE_POOLED === "1";
/**
 * Incidente 07/11 (pedido de /api/admin cortado a los 300 s, base sin nada raro): postgres-js no pone tiempo máximo a una
 * consulta y por defecto guarda las conexiones ociosas para siempre. En Vercel la instancia se congela entre pedidos; si el
 * pooler o la red sueltan el socket sin avisar, la consulta siguiente se escribía en un socket muerto y esperaba ~15 min.
 * - idle_timeout: cierra la conexión ociosa a los 20 s; al descongelar, ese temporizador vencido corre antes que el pedido nuevo.
 * - max_lifetime: renueva cada conexión a los 5 min (por defecto, 30 a 60).
 * - connect_timeout: 10 s para conectar (por defecto, 30).
 * Los tiempos máximos de sentencia y de transacción ociosa van en el rol de la base (decisión de producción), no acá: el pooler
 * en modo transacción no garantiza los parámetros de arranque de cada cliente.
 */
export const POOL_OPTIONS = { max: process.env.VERCEL ? 3 : 10, idle_timeout: 20, max_lifetime: 5 * 60, connect_timeout: 10 } as const;
const g = globalThis as unknown as { __repiSql?: ReturnType<typeof postgres> };
export const sqlClient = g.__repiSql ?? postgres(url, { ...POOL_OPTIONS, prepare: !pooled });
if (process.env.NODE_ENV !== "production") g.__repiSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export { schema };
