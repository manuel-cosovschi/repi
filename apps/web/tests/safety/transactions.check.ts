// Incidente 07/11 (pedido de /api/admin colgado 300 s). Suite independiente de Vitest: no conecta a ninguna base.
// Falla si dentro de un db.transaction se usa el db global (directo o en una función que se llama desde adentro), otra
// db.transaction o auth.api: con el pool de 3 conexiones de Vercel, 3 pedidos así a la vez se traban para siempre.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { formatFinding, scanApp, scanTransactions } from "../../scripts/lib/tx-scan";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("el detector encuentra cada forma de pedir otra conexión dentro de una transacción y nada más", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "repi-txscan-"));
  try {
    const src = path.join(dir, "src");
    mkdirSync(path.join(src, "db"), { recursive: true });
    mkdirSync(path.join(src, "server"), { recursive: true });
    const files: Record<string, string> = {
      "db/index.ts": `type Q = { select(): Promise<number[]> };
export const sqlClient = { end: async () => {} };
export const db = { select: async () => [1], transaction: async <T>(cb: (tx: Q) => Promise<T>) => cb({ select: async () => [1] }) };
export type Tx = Q;`,
      "server/auth.ts": `export const auth = { api: { getSession: async () => null } };`,
      "server/helpers.ts": `import { db, type Tx } from "../db";
export async function viaGlobal() { return db.select(); }
export async function withHandle(id: string, q: Tx | typeof db = db) { return q.select(); }
export function after(job: () => unknown) { void job; }`,
      "server/svc.ts": `import { db, sqlClient, type Tx } from "../db";
import { auth } from "./auth";
import { after, viaGlobal, withHandle } from "./helpers";
export const direct = () => db.transaction(async (tx) => { await tx.select(); return db.select(); });
export const transitive = () => db.transaction(async () => viaGlobal());
export const omitted = () => db.transaction(async () => withHandle("x"));
export const explicitUndefined = () => db.transaction(async () => withHandle("x", undefined));
export const passesTx = () => db.transaction(async (tx) => withHandle("x", tx));
export const deferred = () => db.transaction(async (tx) => { after(() => viaGlobal()); return tx.select(); });
export const nested = () => db.transaction(async () => db.transaction(async (t2) => t2.select()));
export const session = () => db.transaction(async () => auth.api.getSession());
export const client = () => db.transaction(async () => sqlClient.end());
async function work(tx: Tx) { await tx.select(); return viaGlobal(); }
export const named = () => db.transaction(work);
export const typeOnly = () => db.transaction(async (tx) => { const q: Tx | typeof db = tx; return q.select(); });
export const outside = async () => { await db.select(); return db.transaction(async (tx) => tx.select()); };
export const dynamic = () => db.transaction(async () => { const m = await import("./helpers"); return m.viaGlobal(); });`,
    };
    for (const [f, body] of Object.entries(files)) writeFileSync(path.join(src, f), body);
    const fileNames = Object.keys(files).map((f) => path.join(src, f));
    const program = ts.createProgram(fileNames, { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true, types: [] });
    const r = scanTransactions(program, { root: dir, srcDir: src, dbFile: path.join(src, "db/index.ts"), authFile: path.join(src, "server/auth.ts"), include: (f) => f.startsWith(src) });
    assert.equal(r.transactions, 14);
    const flagged = [...new Set(r.findings.map((f) => f.fn))].sort();
    assert.deepEqual(flagged, ["client", "direct", "dynamic", "explicitUndefined", "named", "nested", "omitted", "session", "transitive"].sort(), r.findings.map(formatFinding).join("\n"));
    assert.ok(r.findings.some((f) => f.fn === "omitted" && f.kind.includes("falta pasar 'q' a withHandle")));
    assert.ok(r.findings.some((f) => f.fn === "nested" && f.kind === "abre otra db.transaction"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ninguna transacción de la app pide otra conexión del pool mientras retiene la suya", () => {
  const r = scanApp(ROOT);
  assert.ok(r.transactions > 50, `el detector encontró sólo ${r.transactions} transacciones: revisá que siga reconociendo db.transaction`);
  assert.deepEqual(r.findings.map(formatFinding), [], "Dentro de db.transaction usá el `tx` (pasalo a las funciones que consultan) o mové la lectura antes/después de la transacción.");
});
