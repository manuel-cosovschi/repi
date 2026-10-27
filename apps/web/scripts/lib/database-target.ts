// Guardas puras para tareas locales. Nunca imprimen URLs, usuarios ni contraseñas.
// Los tests destruyen esquemas; el seed crea credenciales conocidas. Ninguno puede apuntar a un despliegue.
export type DatabaseEnvironment = { NODE_ENV?: string; REPI_DEPLOY?: string; VERCEL?: string };
export type DatabaseIdentity = { database: string; serverAddress: string | null };
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function localEnvironment(env: DatabaseEnvironment) {
  if (env.NODE_ENV === "production" || env.REPI_DEPLOY || env.VERCEL) {
    throw new Error("Operación local bloqueada: el entorno corresponde a un despliegue.");
  }
}
function parse(value: string | undefined) {
  if (!value) throw new Error("Falta la URL de la base local.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("La URL de la base local no es válida."); }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("La base local debe usar PostgreSQL.");
  return url;
}
function localTarget(value: string | undefined, database: "repi_dev" | "repi_test") {
  const url = parse(value);
  // Los parámetros de conexión y fragmentos quedan prohibidos: no son necesarios para estas tareas y pueden alterar el destino.
  if (!LOCAL_HOSTS.has(url.hostname) || url.pathname !== `/${database}` || url.search || url.hash) {
    throw new Error(`Operación bloqueada: se requiere la base ${database} en localhost, 127.0.0.1 o ::1, sin parámetros.`);
  }
  return url;
}

export function assertTestDatabaseTarget(url: string | undefined, applicationUrl?: string, env: DatabaseEnvironment = {}) {
  localEnvironment(env);
  const target = localTarget(url, "repi_test");
  if (applicationUrl) {
    const app = parse(applicationUrl);
    // localhost/IPv4/IPv6 pueden ser el mismo servidor: jamás tratarlos como bases distintas por su alias o usuario.
    if (LOCAL_HOSTS.has(app.hostname) && app.pathname === target.pathname && (app.port || "5432") === (target.port || "5432")) {
      throw new Error("La base de pruebas debe ser distinta de DATABASE_URL.");
    }
  }
  return url!;
}

export function assertSeedDatabaseTarget(url: string | undefined, env: DatabaseEnvironment = {}) {
  localEnvironment(env);
  localTarget(url, "repi_dev");
  return url!;
}

/** Segunda barrera contra túneles, resoluciones inesperadas o un servidor diferente al indicado por la URL. */
export function assertLocalDatabaseIdentity(identity: DatabaseIdentity, database: "repi_dev" | "repi_test") {
  if (identity.database !== database || !identity.serverAddress || !LOCAL_ADDRESSES.has(identity.serverAddress)) {
    throw new Error(`Operación bloqueada: PostgreSQL no confirmó la base ${database} en una dirección local.`);
  }
}
