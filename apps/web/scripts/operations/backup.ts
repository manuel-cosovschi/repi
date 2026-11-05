// Respaldo lógico de la base (y opcionalmente de los archivos privados) a una carpeta fuera del repositorio.
// Sólo lee: COPY de cada tabla de `public` y del registro de migraciones. No usa pg_dump (la versión local puede no
// coincidir con la del servidor). Nunca imprime la URL ni datos: sólo nombres de tabla y cantidades.
//
// Uso (desde apps/web):
//   npx tsx scripts/operations/backup.ts --source=local            # repi_dev de .env.local
//   npx tsx scripts/operations/backup.ts --source=hosted [--storage] # Supabase (~/.repi-secrets/supabase.env, sesión 5432)
//   … --out=/Volumes/<SSD>/REPI/Backups                               # destino alternativo (debe existir; fuera del repo)
// GitHub Actions (D190, .github/workflows/backup.yml): la URL llega en REPI_BACKUP_DATABASE_URL (rol de sólo lectura
// repi_backup) y los archivos se leen con el token OIDC del job (--storage-auth=github-oidc), sin secretos de Storage.
// Salida: ~/.repi-secrets/backups/<fecha>/ (0700) con manifest.json, db/*.copy y storage/ si se pidió.
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import postgres from "postgres";
import { backupRoot, localTarget, safeStorageKey, type BackupManifest } from "./guards";

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const arg = (name: string) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split("=")[1] ?? (process.argv.includes(`--${name}`) ? "true" : undefined);

async function hostedUrl() {
  if (process.env.REPI_BACKUP_DATABASE_URL) return process.env.REPI_BACKUP_DATABASE_URL;
  const env = await readFile(join(homedir(), ".repi-secrets", "supabase.env"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL_SESSION="));
  if (!line) throw new Error("Falta DATABASE_URL_SESSION en ~/.repi-secrets/supabase.env.");
  return line.slice("DATABASE_URL_SESSION=".length).trim().replace(/^"|"$/g, "");
}
async function localUrl() {
  try { process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url))); } catch { /* */ }
  return localTarget(process.env.DATABASE_URL, "backup").href;
}

const STORAGE_PROXY = "https://qiamewdridgdvsyysmog.supabase.co/functions/v1/repi-storage";
/**
 * D190: lectura de archivos con el token OIDC del job de GitHub. La Edge Function sólo acepta ese token para firmar
 * lecturas del workflow de respaldo en main. El token se pide de nuevo cada 4 min (vence a los pocos minutos).
 */
function githubOidcReader() {
  const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!reqUrl || !reqToken) throw new Error("--storage-auth=github-oidc requiere GitHub Actions con permiso id-token: write.");
  let token: { value: string; at: number } | null = null;
  const fresh = async () => {
    if (token && Date.now() - token.at < 240_000) return token.value;
    const r = await fetch(`${reqUrl}&audience=repi-storage-backup`, { headers: { Authorization: `bearer ${reqToken}` } });
    if (!r.ok) throw new Error(`No se obtuvo el token OIDC de GitHub (${r.status}).`);
    token = { value: ((await r.json()) as { value: string }).value, at: Date.now() };
    return token.value;
  };
  return async (key: string) => {
    const sign = await fetch(`${process.env.SUPABASE_STORAGE_PROXY_URL ?? STORAGE_PROXY}?op=sign_read&key=${encodeURIComponent(key)}`, { method: "POST", headers: { "x-repi-github-oidc": await fresh() } });
    if (!sign.ok) throw new Error(`almacenamiento: firma de lectura falló (${sign.status})`);
    const r = await fetch(((await sign.json()) as { url: string }).url);
    if (!r.ok || !r.body) throw new Error(`almacenamiento: lectura falló (${r.status})`);
    return { stream: r.body };
  };
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
  // D187: `--out=<carpeta existente>` (p. ej. /Volumes/SSD/REPI/Backups) cambia sólo dónde se escribe.
  const out = arg("out");
  const root = backupRoot(out === "true" ? "" : out, homedir(), fileURLToPath(new URL("../../../../", import.meta.url)), existsSync);
  const dir = join(root, `${stamp}-${source}`);
  await mkdir(join(dir, "db"), { recursive: true, mode: 0o700 });
  // En un disco externo (exFAT, por ejemplo) los permisos pueden no aplicarse: se avisa y el respaldo sigue.
  try { await chmod(root, 0o700); } catch (e) { if (!out) throw e; console.warn("Aviso: el disco de destino no guarda permisos de carpeta (0700)."); }

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
        // D187: el COPY se lee entero sin pausar el stream. Con contrapresión, postgres.js a veces no recibe el fin del COPY
        // y la consulta siguiente queda esperando para siempre (se colgaba con tablas de unos cientos de KB).
        const data = await new Promise<Buffer>((ok, ko) => { const parts: Buffer[] = []; out.on("data", (b: Buffer) => parts.push(b)); out.on("end", () => ok(Buffer.concat(parts))); out.on("error", ko); });
        await pipeline(Readable.from([data]), digest(h, c), digest(dbHash, dbBytes), createWriteStream(join(dir, file), { mode: 0o600 }));
        tables.push({ schema: t.schema, name: t.name, rows: n, columns, file, sha256: h.digest("hex") });
        console.log(`${t.schema}.${t.name}: ${n}`);
      }
    });

    const files: BackupManifest["storage"]["files"] = [];
    if (withStorage) {
      let readObject: (key: string) => Promise<{ stream: unknown }>;
      if (arg("storage-auth") === "github-oidc") readObject = githubOidcReader();
      else {
        // Las credenciales de Storage están en Vercel, no acá: se leen del archivo local del titular si existe.
        try { process.loadEnvFile(join(homedir(), ".repi-secrets", "vercel.env")); } catch { /* */ }
        process.env.SUPABASE_STORAGE_PROXY_URL ??= STORAGE_PROXY;
        if (!process.env.STORAGE_PROXY_SECRET) throw new Error("Falta STORAGE_PROXY_SECRET en ~/.repi-secrets/vercel.env.");
        readObject = (await import("../../src/server/storage")).readObject;
      }
      // Sólo archivos vigentes: los marcados con deleted_at ya se borraron de Storage a propósito (purga) y pedirlos da 404.
      // La fila queda en la tabla (y en el respaldo) como registro; el archivo no existe más.
      const keys = await sql<{ k: string }[]>`select storage_key as k from media_object where deleted_at is null order by storage_key`;
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
