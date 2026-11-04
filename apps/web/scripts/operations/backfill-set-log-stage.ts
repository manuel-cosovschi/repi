// D184: relleno opcional de las columnas de etapa de set_log (migración 0040: spec_id, set_kind, block_index, stage_index) en
// registros anteriores a D183. NO es necesario para que la app funcione: con las columnas nulas todo se deduce de la versión
// congelada (`rowRef`, `rowFlags`). Sirve para consultas y para Training Intelligence 2.0 (resultado por `spec_id`).
//
// Garantías:
//  · Sólo escribe columnas nulas (`where spec_id is null`): idempotente, se puede cortar y volver a correr.
//  · Nunca cambia peso, repeticiones, RIR, fechas, revisión ni `updated_at` (la sincronización no lo ve como una edición).
//  · Ambiguos (clusters anteriores a D183: ¿serie o bloque?) y filas fuera del plan quedan nulos y se informan.
//  · Validación antes/después: cantidad de filas, Σ reps, Σ peso × reps y una huella de (id, peso, reps). Si algo difiere, la
//    tanda se revierte (cada tanda es una transacción) y se corta.
//  · Registro de ids rellenados (JSONL, fuera del repo) para revertir exactamente: `--rollback=<archivo>`.
//
// Uso (desde apps/web). Por defecto es simulación (no escribe):
//   npx tsx scripts/operations/backfill-set-log-stage.ts --source=local                 # repi_dev, simulación
//   npx tsx scripts/operations/backfill-set-log-stage.ts --source=local --apply [--batch=500]
//   npx tsx scripts/operations/backfill-set-log-stage.ts --source=local --rollback=<archivo.jsonl>
// En una base alojada exige `--source=hosted --apply --confirm=hosted` y la ejecuta la persona responsable, con respaldo
// previo (scripts/operations/backup.ts). Nunca imprime la URL ni datos personales: sólo cantidades.
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { rowRef, type ExerciseDetail } from "@repi/domain";

type Sql = postgres.Sql;
export type BackfillRow = { id: string; setIndex: number; sets: number; detail: ExerciseDetail | null };
export type BackfillUpdate = { id: string; specId: string; setKind: string; blockIndex: number; stageIndex: number };

/** Decide qué escribir en cada fila. Pura: la prueban los tests sin base. */
export function planBackfill(rows: BackfillRow[]) {
  const updates: BackfillUpdate[] = [], ambiguous: string[] = [], outOfPlan: string[] = [];
  for (const r of rows) {
    const ref = rowRef(r.detail, r.sets, r.setIndex);
    if (!ref) { outOfPlan.push(r.id); continue; }
    if (ref.review) { ambiguous.push(r.id); continue; } // no se inventa si era serie o bloque
    updates.push({ id: r.id, specId: ref.id, setKind: ref.kind, blockIndex: ref.block, stageIndex: ref.stage });
  }
  return { updates, ambiguous, outOfPlan };
}

/** Huella de lo que no se puede tocar. */
export async function snapshot(sql: Sql | postgres.TransactionSql) {
  const [r] = await sql<{ rows: number; reps: string; tonnage: string; hash: string; missing: number }[]>`
    select count(*)::int as rows, coalesce(sum(reps), 0)::text as reps,
      coalesce(sum(coalesce(nullif(weight_kg, '')::numeric, 0) * coalesce(reps, 0)), 0)::text as tonnage,
      md5(coalesce(string_agg(id || ':' || coalesce(weight_kg, '-') || ':' || coalesce(reps::text, '-') || ':' || coalesce(rir::text, '-') || ':' || revision::text, ',' order by id), '')) as hash,
      count(*) filter (where spec_id is null)::int as missing
    from set_log`;
  return r;
}

export type BackfillReport = { mode: "dry-run" | "apply"; scanned: number; filled: number; ambiguous: number; outOfPlan: number; batches: number; before: Awaited<ReturnType<typeof snapshot>>; after: Awaited<ReturnType<typeof snapshot>>; unchanged: boolean };

export async function runBackfill(sql: Sql, o: { apply: boolean; batch?: number; log?: (u: BackfillUpdate[]) => Promise<void> }): Promise<BackfillReport> {
  const batch = Math.max(1, Math.min(5000, o.batch ?? 500));
  const before = await snapshot(sql);
  let cursor = "", scanned = 0, filled = 0, ambiguous = 0, outOfPlan = 0, batches = 0;
  for (;;) {
    const rows = await sql<{ id: string; set_index: number; sets: number; detail: ExerciseDetail | null }[]>`
      select l.id, l.set_index, pe.sets, pe.detail from set_log l join program_exercise pe on pe.id = l.program_exercise_id
      where l.spec_id is null and l.id > ${cursor} order by l.id limit ${batch}`;
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    batches++; scanned += rows.length;
    const p = planBackfill(rows.map((r) => ({ id: r.id, setIndex: r.set_index, sets: r.sets, detail: r.detail })));
    ambiguous += p.ambiguous.length; outOfPlan += p.outOfPlan.length;
    if (!o.apply || !p.updates.length) { filled += o.apply ? 0 : p.updates.length; continue; }
    await sql.begin(async (tx) => {
      const pre = await snapshot(tx);
      for (const u of p.updates) {
        await tx`update set_log set spec_id = ${u.specId}, set_kind = ${u.setKind}, block_index = ${u.blockIndex}, stage_index = ${u.stageIndex}
          where id = ${u.id} and spec_id is null`;
      }
      const post = await snapshot(tx);
      if (pre.rows !== post.rows || pre.reps !== post.reps || pre.tonnage !== post.tonnage || pre.hash !== post.hash) throw new Error("Validación fallida: cambiarían resultados. Tanda revertida.");
    });
    await o.log?.(p.updates);
    filled += p.updates.length;
  }
  const after = await snapshot(sql);
  const unchanged = before.rows === after.rows && before.reps === after.reps && before.tonnage === after.tonnage && before.hash === after.hash;
  return { mode: o.apply ? "apply" : "dry-run", scanned, filled, ambiguous, outOfPlan, batches, before, after, unchanged };
}

/** Deja nulas exactamente las filas que rellenó una corrida (registro JSONL). Lo registrado después por la app no se toca. */
export async function rollbackBackfill(sql: Sql, ids: string[]) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    n += (await sql`update set_log set spec_id = null, set_kind = null, block_index = null, stage_index = null where id = any(${chunk})`).count;
  }
  return n;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const arg = (name: string) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split("=")[1] ?? (process.argv.includes(`--${name}`) ? "true" : undefined);

async function targetUrl(source: string | undefined) {
  if (process.env.VERCEL || process.env.REPI_DEPLOY) throw new Error("Bloqueado: no se corre desde un despliegue.");
  if (source === "local" || source === "test") {
    try { process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url))); } catch { /* */ }
    const url = source === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
    const u = new URL(url ?? "postgres://x/none");
    const db = source === "test" ? "repi_test" : "repi_dev";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.pathname !== `/${db}`) throw new Error(`Bloqueado: --source=${source} exige ${db} en localhost.`);
    return url!;
  }
  if (source === "hosted") {
    if (arg("apply") && arg("confirm") !== "hosted") throw new Error("En una base alojada, escribir exige --confirm=hosted (y un respaldo previo).");
    const env = await readFile(join(homedir(), ".repi-secrets", "supabase.env"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL_SESSION="));
    if (!line) throw new Error("Falta DATABASE_URL_SESSION en ~/.repi-secrets/supabase.env.");
    return line.slice("DATABASE_URL_SESSION=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("Indicá --source=local, --source=test o --source=hosted.");
}

async function main() {
  const sql = postgres(await targetUrl(arg("source")), { max: 1, onnotice: () => {} });
  try {
    const rb = arg("rollback");
    if (rb) {
      const ids = (await readFile(rb, "utf8")).split("\n").filter(Boolean).map((l) => (JSON.parse(l) as BackfillUpdate).id);
      console.log(JSON.stringify({ mode: "rollback", rows: await rollbackBackfill(sql, ids) }));
      return;
    }
    const apply = arg("apply") === "true";
    const dir = join(homedir(), ".repi-secrets", "backfills");
    const file = join(dir, `set-log-stage-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
    if (apply) await mkdir(dir, { recursive: true, mode: 0o700 });
    const r = await runBackfill(sql, { apply, batch: Number(arg("batch") ?? 500), log: apply ? (u) => appendFile(file, u.map((x) => JSON.stringify(x)).join("\n") + "\n", { mode: 0o600 }) : undefined });
    console.log(JSON.stringify({ ...r, log: apply ? file : null }, null, 2));
    if (!r.unchanged) process.exitCode = 1;
  } finally { await sql.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error((e as Error).message); process.exit(1); });
