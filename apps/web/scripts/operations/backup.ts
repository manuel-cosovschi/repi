// Respaldo lógico de la base (y opcionalmente de los archivos privados) a una carpeta fuera del repositorio.
// Sólo lee: COPY de cada tabla de `public` y del registro de migraciones. No usa pg_dump (la versión local puede no
// coincidir con la del servidor). Nunca imprime la URL ni datos: sólo nombres de tabla y cantidades.
//
// Uso (desde apps/web):
//   npx tsx scripts/operations/backup.ts --source=local            # repi_dev de .env.local
//   npx tsx scripts/operations/backup.ts --source=hosted [--storage] # Supabase (~/.repi-secrets/supabase.env, sesión 5432)
// Salida: ~/.repi-secrets/backups/<fecha>/ (0700) con manifest.json, db/*.copy y storage/ si se pidió.
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import postgres from "postgres";
import { localTarget, safeStorageKey, type BackupManifest } from "./guards";

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const arg = (name: string) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split("=")[1] ?? (process.argv.includes(`--${name}`) ? "true" : undefined);

async function hostedUrl() {
  const env = await readFile(join(homedir(), ".repi-secrets", "supabase.env"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL_SESSION="));
  if (!line) throw new Error("Falta DATABASE_URL_SESSION en ~/.repi-secrets/supabase.env.");
  return line.slice("DATABASE_URL_SESSION=".length).trim().replace(/^"|"$/g, "");
}
async function localUrl() {
  try { process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url))); } catch { /* */ }
  return localTarget(process.env.DATABASE_URL, "backup").href;
}

/** Cuenta bytes y calcula el hash de lo que pasa, sin retenerlo en memoria. */
function digest(hash: ReturnType<typeof createHash>, counter: { bytes: number }) {
  return new Transform({ transform(chunk: Buffer, _e, done) { hash.update(chunk); counter.bytes += chunk.length; done(null, chunk); } });
}

async function main() {
  const source = arg("source");
  if (source !== "local" && source !== "hosted") throw new Error("Indicá --source=local o --source=hosted.");
  const withStorage = arg("storage") === "true";
  if (withStorage && source !== "hosted") throw new Error("--storage sólo aplica al entorno hospedado.");
  const url = source === "hosted" ? await hostedUrl() : await localUrl();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = join(homedir(), ".repi-secrets", "backups");
  const dir = join(root, `${stamp}-${source}`);
  await mkdir(join(dir, "db"), { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const dbHash = createHash("sha256"), dbBytes = { bytes: 0 };
  const tables: (BackupManifest["tables"][number] & { columns: string[]; file: string; sha256: string })[] = [];
  let migrations = 0;
  try {
    // Una sola transacción REPEATABLE READ: todas las tablas salen del mismo instante.
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const list = await tx<{ schema: string; name: string }[]>`
        select schemaname as schema, tablename as name from pg_tables
        where schemaname = 'public' or (schemaname = 'drizzle' and tablename = '__drizzle_migrations') order by schemaname = 'drizzle' desc, tablename`;
      for (const t of list) {
        const columns = (await tx<{ c: string }[]>`select column_name as c from information_schema.columns where table_schema = ${t.schema} and table_name = ${t.name} order by ordinal_position`).map((r) => r.c);
        const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from ${ident(t.schema)}.${ident(t.name)}`);
        if (t.schema === "drizzle") migrations = n;
        const file = `db/${t.schema}.${t.name}.copy`;
        const h = createHash("sha256"), c = { bytes: 0 };
        const out = await tx.unsafe(`copy ${ident(t.schema)}.${ident(t.name)} (${columns.map(ident).join(", ")}) to stdout`).readable();
        await pipeline(out, digest(h, c), digest(dbHash, dbBytes), createWriteStream(join(dir, file), { mode: 0o600 }));
        tables.push({ schema: t.schema, name: t.name, rows: n, columns, file, sha256: h.digest("hex") });
        console.log(`${t.schema}.${t.name}: ${n}`);
      }
    });

    const files: BackupManifest["storage"]["files"] = [];
    if (withStorage) {
      // Las credenciales de Storage están en Vercel, no acá: se leen del archivo local del titular si existe.
      try { process.loadEnvFile(join(homedir(), ".repi-secrets", "vercel.env")); } catch { /* */ }
      process.env.SUPABASE_STORAGE_PROXY_URL ??= "https://qiamewdridgdvsyysmog.supabase.co/functions/v1/repi-storage";
      if (!process.env.STORAGE_PROXY_SECRET) throw new Error("Falta STORAGE_PROXY_SECRET en ~/.repi-secrets/vercel.env.");
      const { readObject } = await import("../../src/server/storage");
      const keys = await sql<{ k: string }[]>`select storage_key as k from media_object order by storage_key`;
      for (const { k } of keys) {
        const key = safeStorageKey(k), h = createHash("sha256"), c = { bytes: 0 };
        const target = join(dir, "storage", key);
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        const o = await readObject(key);
        await pipeline(o.stream as unknown as NodeJS.ReadableStream, digest(h, c), createWriteStream(target, { mode: 0o600 }));
        files.push({ key, sha256: h.digest("hex"), bytes: c.bytes });
      }
      console.log(`archivos: ${files.length}`);
    }

    const manifest = {
      version: 1, status: "complete", createdAt: new Date().toISOString(), source, migrations,
      database: { sha256: dbHash.digest("hex"), bytes: dbBytes.bytes }, tables, storage: { included: withStorage, files },
    };
    // Se escribe al final y por renombre: un respaldo cortado nunca queda con un manifiesto «complete».
    await writeFile(join(dir, "manifest.tmp"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await rename(join(dir, "manifest.tmp"), join(dir, "manifest.json"));
    console.log(`Respaldo completo: ${dir}`);
  } finally { await sql.end(); }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "<url>") : "No se pudo completar el respaldo.");
  process.exitCode = 1;
});
