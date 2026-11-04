// Ensayo de restauración: carga un respaldo de backup.ts en la base local descartable repi_restore_check y comprueba
// hashes y cantidades. Nunca escribe en dev, test ni en el entorno hospedado (guards.ts lo impide antes de conectar).
//
// Uso (desde apps/web):
//   createdb -h localhost repi_restore_check   # una vez
//   RESTORE_DATABASE_URL=postgresql://<usuario>@localhost:5432/repi_restore_check npx tsx scripts/operations/restore.ts <carpeta del respaldo> [--report=<archivo.json>]
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
  const folder = process.argv.slice(2).find((a) => !a.startsWith("--"));
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

  if (process.argv.includes("--solo-hashes")) {
    const pub = tables.filter((t) => t.schema === "public");
    console.log(`Respaldo íntegro: ${pub.length} tablas (${pub.reduce((a, t) => a + t.rows, 0)} filas) más el registro de ${raw.migrations ?? "?"} migraciones, ${manifest.storage.files.length} archivos; base SHA-256 ${manifest.database.sha256}. No se restauró en ninguna base.`);
    return;
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
    // 5) D190: integridad relacional. La carga desactiva las claves foráneas, así que se comprueban una por una:
    // ninguna fila hija sin su fila madre y ninguna restricción marcada como no validada.
    const fks = await load<{ name: string; child: string; parent: string; cols: string[]; refs: string[] }[]>`
      select con.conname as name, ch.relname as child, pa.relname as parent,
        array(select a.attname::text from unnest(con.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as cols,
        array(select a.attname::text from unnest(con.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as refs
      from pg_constraint con join pg_class ch on ch.oid = con.conrelid join pg_class pa on pa.oid = con.confrelid
      join pg_namespace ns on ns.oid = ch.relnamespace where con.contype = 'f' and ns.nspname = 'public' order by 1`;
    let orphans = 0;
    for (const fk of fks) {
      const notNull = fk.cols.map((c) => `c.${ident(c)} is not null`).join(" and ");
      const match = fk.cols.map((c, i) => `p.${ident(fk.refs[i])} = c.${ident(c)}`).join(" and ");
      const [{ n }] = await load.unsafe<{ n: number }[]>(`select count(*)::int as n from public.${ident(fk.child)} c where ${notNull} and not exists (select 1 from public.${ident(fk.parent)} p where ${match})`);
      if (n) { orphans += n; console.error(`${fk.child} → ${fk.parent} (${fk.name}): ${n} filas sin referencia.`); }
    }
    const [{ n: invalid }] = await load<{ n: number }[]>`select count(*)::int as n from pg_constraint c join pg_namespace ns on ns.oid = c.connamespace where ns.nspname = 'public' and not c.convalidated`;
    if (orphans || invalid) throw new Error(`Integridad: ${orphans} filas huérfanas y ${invalid} restricciones sin validar.`);
    const rows = tables.reduce((a, t) => a + (t.schema === "public" ? t.rows : 0), 0);
    console.log(`Restauración verificada en repi_restore_check: ${ok} tablas, ${rows} filas, ${fks.length} claves foráneas sin huérfanos, 0 restricciones sin validar, ${manifest.storage.files.length} archivos con hash correcto (no se suben a ningún almacenamiento).`);
    // Informe sin datos personales (cantidades y hashes) para las notas del respaldo publicado.
    const report = process.argv.find((a) => a.startsWith("--report="))?.slice("--report=".length);
    if (report) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(report, JSON.stringify({ tables: ok, rows, foreignKeys: fks.length, orphans, invalidConstraints: invalid, migrations: Number(raw.migrations ?? 0),
        storageFiles: manifest.storage.files.length, storageBytes: manifest.storage.files.reduce((a, f) => a + f.bytes, 0),
        databaseSha256: manifest.database.sha256, databaseBytes: manifest.database.bytes, createdAt: raw.createdAt, source: raw.source }, null, 2));
    }
  } finally { await load.end(); }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "<url>") : "No se pudo restaurar.");
  process.exitCode = 1;
});
