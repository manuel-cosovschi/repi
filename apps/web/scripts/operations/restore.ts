// Ensayo de restauración: carga un respaldo de backup.ts en la base local descartable repi_restore_check y comprueba
// hashes y cantidades. Nunca escribe en dev, test ni en el entorno hospedado (guards.ts lo impide antes de conectar).
//
// Uso (desde apps/web):
//   createdb -h localhost repi_restore_check   # una vez
//   RESTORE_DATABASE_URL=postgresql://<usuario>@localhost:5432/repi_restore_check npx tsx scripts/operations/restore.ts <carpeta del respaldo>
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import postgres from "postgres";
import { checkedManifest, localTarget } from "./guards";
import { assertLocalDatabaseIdentity } from "../lib/database-target";
import { runMigrations } from "../migrate";

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
type Table = { schema: string; name: string; rows: number; columns: string[]; file: string; sha256: string };

async function sha256File(path: string) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

async function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error("Indicá la carpeta del respaldo.");
  const dir = resolve(folder);
  // 1) Manifiesto y archivos se validan antes de conectar a ninguna base.
  const raw = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const manifest = checkedManifest(raw);
  const tables = raw.tables as Table[];
  const all = createHash("sha256");
  let bytes = 0;
  for (const t of tables) {
    if (!/^db\/[a-z_]+\.[a-z0-9_]+\.copy$/.test(t.file) || !Array.isArray(t.columns) || !t.columns.every((c) => /^[a-z_][a-z0-9_]*$/.test(c))) throw new Error("Manifiesto alterado.");
    const h = createHash("sha256");
    for await (const chunk of createReadStream(join(dir, t.file))) { h.update(chunk as Buffer); all.update(chunk as Buffer); bytes += (chunk as Buffer).length; }
    if (h.digest("hex") !== t.sha256) throw new Error(`El archivo de ${t.schema}.${t.name} no coincide con el manifiesto.`);
  }
  if (all.digest("hex") !== manifest.database.sha256 || bytes !== manifest.database.bytes) throw new Error("El respaldo de la base no coincide con el manifiesto.");
  for (const f of manifest.storage.files) {
    if (await sha256File(join(dir, "storage", f.key)) !== f.sha256) throw new Error(`El archivo ${f.key} no coincide con el manifiesto.`);
  }

  // 2) Destino: sólo repi_restore_check local, confirmado también por el servidor.
  const url = localTarget(process.env.RESTORE_DATABASE_URL, "restore").href;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [identity] = await sql<{ database: string; serverAddress: string }[]>`select current_database() as database, host(inet_server_addr()) as "serverAddress"`;
    assertLocalDatabaseIdentity(identity, "repi_restore_check");
    await sql`drop schema if exists public cascade`;
    await sql`drop schema if exists drizzle cascade`;
    await sql`create schema public`;
  } finally { await sql.end(); }

  // 3) Esquema desde las migraciones del código; el respaldo no puede venir de una versión más nueva.
  await runMigrations(url);
  const load = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [{ n: known }] = await load<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`;
    const migrations = Number(raw.migrations ?? 0);
    if (migrations > known) throw new Error(`El respaldo tiene ${migrations} migraciones y este código ${known}: actualizá el código antes de restaurar.`);
    await load.begin(async (tx) => {
      // Carga sin disparar claves foráneas por orden de tablas (base local descartable, usuario dueño).
      await tx`set local session_replication_role = replica`;
      for (const t of tables.filter((x) => x.schema === "public")) {
        const target = await tx.unsafe(`copy ${ident(t.schema)}.${ident(t.name)} (${t.columns.map(ident).join(", ")}) from stdin`).writable();
        await pipeline(createReadStream(join(dir, t.file)), new Transform({ transform(c, _e, done) { done(null, c); } }), target);
      }
      // Secuencias al máximo cargado, para que nuevos registros no choquen.
      const seqs = await tx<{ t: string; c: string; s: string }[]>`
        select c.table_name as t, c.column_name as c, pg_get_serial_sequence('public.' || quote_ident(c.table_name), c.column_name) as s
        from information_schema.columns c where c.table_schema = 'public' and c.column_default like 'nextval(%'`;
      for (const q of seqs) if (q.s) await tx.unsafe(`select setval('${q.s.replace(/'/g, "''")}', coalesce((select max(${ident(q.c)}) from public.${ident(q.t)}), 0) + 1, false)`);
    });
    // 4) Comprobación: misma cantidad de filas por tabla.
    let ok = 0;
    for (const t of tables.filter((x) => x.schema === "public")) {
      const [{ n }] = await load.unsafe<{ n: number }[]>(`select count(*)::int as n from public.${ident(t.name)}`);
      if (n !== t.rows) throw new Error(`${t.name}: se esperaban ${t.rows} filas y hay ${n}.`);
      ok++;
    }
    console.log(`Restauración verificada en repi_restore_check: ${ok} tablas, ${tables.reduce((a, t) => a + (t.schema === "public" ? t.rows : 0), 0)} filas, ${manifest.storage.files.length} archivos con hash correcto (no se suben a ningún almacenamiento).`);
  } finally { await load.end(); }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "<url>") : "No se pudo restaurar.");
  process.exitCode = 1;
});
