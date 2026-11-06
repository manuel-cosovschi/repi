// Historial anterior a REPI (D132). La persona sube una planilla, texto, foto o PDF; una planilla con columnas reconocibles se
// lee sin IA y el resto lo lee OpenAI. Todo pasa por `normalizeImport`, se muestra como vista previa y sólo se guarda cuando la
// persona confirma. El archivo no se guarda. Lo importado aparece en Progreso («Antes de REPI») y sugiere pesos iniciales.
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { exerciseEvolution, exerciseKey, importCanonical, importOverlap, localDate, normalizeImport, parseHistoryCsv, IMPORT_MAX_TEXT_LENGTH, type ImportSet, type NormalizedSet } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiJson, aiModel, aiOn } from "../ai/openai";
import { readHistoryWithAi } from "./history-import-read";
import { catalogOnly, ensureExerciseCatalog } from "./library";

const { historyImport, historyEntry, exercise, coachClient, gymMember } = schema;

export type ImportFile = { fileName: string; kind: "text" | "image" | "pdf"; text?: string; dataUrl?: string };
type Parsed = { sets: NormalizedSet[]; matches: Record<string, { id: string; name: string } | null>; notes: string[]; dropped: number; capped: boolean; hash?: string };

// D182: lo que se guardaría (con el nombre de la biblioteca si coincidió), su huella y lo que ya está en el historial importado.
const toStored = (p: Parsed) => p.sets.map((s) => ({ day: s.day, exercise: p.matches[s.exercise]?.name ?? s.exercise, weightKg: s.weightKg, reps: s.reps, seconds: s.seconds }));
const fingerprint = (p: Parsed) => createHash("sha256").update(importCanonical(toStored(p))).digest("hex");
async function priorImport(userId: string, hash: string, exceptId?: string, tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db) {
  const [r] = await tx.select({ id: historyImport.id, fileName: historyImport.fileName, confirmedAt: historyImport.confirmedAt }).from(historyImport)
    .where(and(eq(historyImport.userId, userId), eq(historyImport.status, "confirmed"), sql`${historyImport.parsed}->>'hash' = ${hash}`, exceptId ? ne(historyImport.id, exceptId) : undefined)).limit(1);
  return r ?? null;
}
async function overlapOf(userId: string, p: Parsed, tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db) {
  const existing = await tx.select({ day: historyEntry.day, exercise: historyEntry.exerciseName, weightKg: historyEntry.weightKg, reps: historyEntry.reps, seconds: historyEntry.seconds })
    .from(historyEntry).where(eq(historyEntry.userId, userId));
  return importOverlap(toStored(p), existing);
}

/** Biblioteca visible para la persona: catálogo base y ejercicios propios de sus coaches y gimnasios. */
async function libraryFor(userId: string) {
  await ensureExerciseCatalog();
  const orgs = [
    ...(await db.select({ o: coachClient.coachOrgId }).from(coachClient).where(eq(coachClient.userId, userId))).map((r) => r.o),
    ...(await db.select({ o: gymMember.orgId }).from(gymMember).where(eq(gymMember.userId, userId))).map((r) => r.o),
  ];
  return db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(or(catalogOnly(), orgs.length ? inArray(exercise.orgId, orgs) : undefined, eq(exercise.ownerUserId, userId)));
}

/** Sin conectores ni abreviaturas comunes: «Press banca» = «Press de banca», «Remo c/ barra» = «Remo con barra». */
const looseKey = (s: string) => exerciseKey(s.replace(/\bc\//gi, "con ")).split(" ").filter((w) => !["de", "del", "con", "en", "la", "el", "los", "las", "a", "al"].includes(w)).join(" ");

const MAP_SCHEMA = {
  type: "object", additionalProperties: false, required: ["map"],
  properties: { map: { type: "array", items: { type: "object", additionalProperties: false, required: ["written", "catalog"], properties: { written: { type: "string" }, catalog: { type: ["string", "null"] } } } } },
};

/** Empareja los nombres escritos con la biblioteca: igual sin tildes; si no, la IA propone el equivalente (o ninguno). */
export async function matchExercises(names: string[], lib: { id: string; name: string }[]) {
  const byKey = new Map(lib.map((e) => [exerciseKey(e.name), e]));
  const byLoose = new Map(lib.map((e) => [looseKey(e.name), e]));
  const out: Parsed["matches"] = {};
  const pending: string[] = [];
  for (const n of names) { const hit = byKey.get(exerciseKey(n)) ?? byLoose.get(looseKey(n)); if (hit) out[n] = hit; else pending.push(n); }
  if (pending.length && aiOn()) {
    try {
      const catalog = [...new Set(lib.map((e) => e.name))];
      const r = await aiJson<{ map: { written: string; catalog: string | null }[] }>({
        name: "emparejar_ejercicios", fast: true, maxTokens: 3000, timeoutMs: 20_000,
        system: "Emparejás nombres de ejercicios escritos por una persona (con abreviaturas, sin tildes o en inglés) con un catálogo en español. Para cada nombre escrito devolvé el nombre exacto del catálogo si es el mismo ejercicio; si no dice el implemento, elegí la variante con barra o la más común. Si es otro ejercicio o dudás, null.",
        parts: [{ type: "text", text: `Catálogo:\n${catalog.join("\n")}\n\nEscritos:\n${pending.slice(0, 120).join("\n")}` }],
        schema: MAP_SCHEMA,
      });
      for (const m of r.map ?? []) {
        if (!pending.includes(m.written) || !m.catalog) continue;
        const hit = byKey.get(exerciseKey(m.catalog));
        if (hit) out[m.written] = hit;
      }
    } catch { /* sin emparejar: se guarda con el nombre escrito */ }
  }
  for (const n of names) out[n] ??= null;
  return out;
}

export async function previewHistoryImport(userId: string, f: ImportFile, now = new Date()) {
  const today = localDate(now);
  if (!["text", "image", "pdf"].includes(f.kind)) throw new AccessError("invalid", "Formato no admitido.");
  if (f.kind === "text" && (f.text ?? "").length > IMPORT_MAX_TEXT_LENGTH) throw new AccessError("too_large", "El historial supera los 400.000 caracteres. Dividilo en partes; no se cargó ningún dato.", 413);
  if (f.kind === "text" && !(f.text ?? "").trim()) throw new AccessError("invalid", "El archivo está vacío.");
  if (f.kind !== "text" && !/^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/.test(f.dataUrl ?? "")) throw new AccessError("invalid", "Subí una foto (JPG o PNG), un PDF o una planilla CSV.");
  let raw: ImportSet[] | null = f.kind === "text" ? parseHistoryCsv(f.text!) : null;
  let notes: string[] = [];
  const source: "csv" | "ai" = raw ? "csv" : "ai";
  if (!raw) {
    if (!aiOn()) throw new AccessError("ai_unavailable", "Por ahora sólo podemos leer planillas con columnas Fecha, Ejercicio, Series, Reps y Peso.", 503);
    ({ sets: raw, notes } = await readHistoryWithAi(f, today));
  }
  const n = normalizeImport(raw, today);
  if (!n.sets.length) throw new AccessError("empty", "No encontramos entrenamientos con fecha, ejercicio y peso o repeticiones. Probá con otra foto o una planilla.", 422);
  const names = [...new Set(n.sets.map((s) => s.exercise))];
  const matches = await matchExercises(names, await libraryFor(userId));
  const parsed: Parsed = { sets: n.sets, matches, notes, dropped: n.dropped, capped: n.capped };
  parsed.hash = fingerprint(parsed);
  const [row] = await db.insert(historyImport).values({
    userId, source, fileName: f.fileName.slice(0, 200), parsed, sessions: n.summary.sessions, sets: n.summary.sets, fromDay: n.summary.from, toDay: n.summary.to, model: source === "ai" ? aiModel() : null,
  }).returning();
  await audit(db, { actorUserId: userId, action: "history_import.previewed", resourceType: "history_import", resourceId: row.id, meta: { source, sets: n.summary.sets } });
  const [dup, ov] = await Promise.all([priorImport(userId, parsed.hash), overlapOf(userId, parsed)]);
  return { ...previewOut(row.id, source, parsed, n.summary), duplicateOf: dup ? { fileName: dup.fileName, confirmedAt: dup.confirmedAt } : null,
    overlap: { sets: ov.overlap, days: ov.days.length, from: ov.days[0] ?? null, to: ov.days.at(-1) ?? null } };
}

function previewOut(id: string, source: "csv" | "ai", p: Parsed, summary: ReturnType<typeof normalizeImport>["summary"]) {
  const exercises = Object.entries(p.matches).map(([name, m]) => ({ name, matched: m?.name ?? null, sets: p.sets.filter((s) => s.exercise === name).length }))
    .sort((a, b) => b.sets - a.sets);
  const days = [...new Set(p.sets.map((s) => s.day))].slice(-3).reverse();
  const sample = days.map((day) => ({ day, items: p.sets.filter((s) => s.day === day).slice(0, 8).map((s) => ({ exercise: s.exercise, weightKg: s.weightKg, reps: s.reps, seconds: s.seconds })) }));
  return { id, source, summary, exercises, sample, notes: p.notes, dropped: p.dropped, capped: p.capped };
}

async function mine(userId: string, id: string) {
  const [r] = await db.select().from(historyImport).where(and(eq(historyImport.id, id), eq(historyImport.userId, userId)));
  if (!r) throw new AccessError("not_found", "No encontramos esa importación.", 404);
  return r;
}

/**
 * Confirma una vista previa. D182: idempotente también entre archivos. El mismo contenido ya importado no se vuelve a cargar
 * (el borrador se descarta y se informa). Si parte coincide con lo importado antes, hay que elegir: `mode: "new_only"` carga sólo
 * lo que no estaba; `"all"` carga todo (dos series iguales pueden ser legítimas). Nada de lo ya guardado se borra ni se cambia.
 */
export async function confirmHistoryImport(userId: string, id: string, mode?: "all" | "new_only") {
  const r = await mine(userId, id);
  if (r.status === "confirmed") return { ok: true, sets: r.sets };
  if (r.status !== "draft") throw new AccessError("closed", "Esa importación se descartó. Subí el archivo de nuevo.", 409);
  const p = r.parsed as Parsed;
  const hash = p.hash ?? fingerprint(p); // borradores anteriores a D182 no traen la huella
  const res = await db.transaction(async (tx) => {
    // Una persona confirma de a una importación por vez (dos archivos iguales a la vez no se cargan dos veces).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`history-import:${userId}`}))`);
    const [cur] = await tx.select({ status: historyImport.status }).from(historyImport).where(eq(historyImport.id, r.id));
    if (cur?.status === "confirmed") return { ok: true, sets: r.sets };
    if (cur?.status !== "draft") throw new AccessError("closed", "Esa importación se descartó. Subí el archivo de nuevo.", 409);
    const dup = await priorImport(userId, hash, r.id, tx);
    if (dup) {
      await tx.update(historyImport).set({ status: "discarded", parsed: { ...p, sets: [], hash } }).where(eq(historyImport.id, r.id));
      await audit(tx, { actorUserId: userId, action: "history_import.duplicate", resourceType: "history_import", resourceId: r.id, meta: { duplicateOf: dup.id } });
      return { ok: true, sets: 0, duplicate: true };
    }
    const ov = await overlapOf(userId, p, tx);
    if (ov.overlap > 0 && !mode) throw new AccessError("overlap", `${ov.overlap} de estas series ya están en tu historial importado. Elegí si cargás sólo lo nuevo o todo.`, 409);
    const keep = mode === "new_only" ? new Set(ov.keep) : null;
    // DATA-3 (QA 29/10): pasar a «confirmada» primero y sólo si seguía en borrador. Un doble toque o un reintento espera a
    // la otra transacción y no encuentra el borrador: no duplica el historial ni pisa un descarte simultáneo.
    const [claimed] = await tx.update(historyImport).set({ status: "confirmed", confirmedAt: new Date(), parsed: { ...p, hash } })
      .where(and(eq(historyImport.id, r.id), eq(historyImport.status, "draft"))).returning({ id: historyImport.id });
    if (!claimed) return { ok: true, sets: r.sets };
    const rows = p.sets.filter((_, i) => !keep || keep.has(i)).map((s) => ({ importId: r.id, userId, day: s.day, exerciseId: p.matches[s.exercise]?.id ?? null, exerciseName: p.matches[s.exercise]?.name ?? s.exercise, setIndex: s.setIndex,
      weightKg: s.weightKg == null ? null : String(s.weightKg), reps: s.reps, seconds: s.seconds }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(historyEntry).values(rows.slice(i, i + 500));
    if (keep) await tx.update(historyImport).set({ sets: rows.length, sessions: new Set(rows.map((x) => x.day)).size }).where(eq(historyImport.id, r.id));
    await audit(tx, { actorUserId: userId, action: "history_import.confirmed", resourceType: "history_import", resourceId: r.id, meta: { sets: rows.length, overlap: ov.overlap, mode: mode ?? null } });
    return { ok: true, sets: rows.length, skipped: p.sets.length - rows.length };
  });
  return res;
}

/** Descartar un borrador o quitar una importación ya cargada (borra sus series; lo registrado en REPI no se toca). */
export async function removeHistoryImport(userId: string, id: string) {
  const r = await mine(userId, id);
  await db.transaction(async (tx) => {
    await tx.select({ id: historyImport.id }).from(historyImport).where(eq(historyImport.id, r.id)).for("update"); // espera a un confirmar en curso
    await tx.delete(historyEntry).where(eq(historyEntry.importId, r.id));
    await tx.update(historyImport).set({ status: "discarded", parsed: { sets: [], matches: {}, notes: [], dropped: 0, capped: false } }).where(eq(historyImport.id, r.id));
    await audit(tx, { actorUserId: userId, action: "history_import.removed", resourceType: "history_import", resourceId: r.id });
  });
  return { ok: true };
}

/** «Antes de REPI» en Progreso: importaciones cargadas y evolución por ejercicio. */
export async function myHistoryImports(userId: string) {
  const imports = await db.select({ id: historyImport.id, fileName: historyImport.fileName, source: historyImport.source, sessions: historyImport.sessions, sets: historyImport.sets,
    fromDay: historyImport.fromDay, toDay: historyImport.toDay, confirmedAt: historyImport.confirmedAt })
    .from(historyImport).where(and(eq(historyImport.userId, userId), eq(historyImport.status, "confirmed"))).orderBy(desc(historyImport.confirmedAt));
  if (!imports.length) return { imports, evolution: [] };
  const rows = await db.select().from(historyEntry).where(eq(historyEntry.userId, userId));
  const evolution = exerciseEvolution(rows.map((x) => ({ day: x.day, exercise: x.exerciseName, weightKg: x.weightKg == null ? null : Number(x.weightKg), reps: x.reps, seconds: x.seconds }))).slice(0, 40);
  return { imports, evolution };
}

/** Última marca importada por ejercicio (para sugerir el peso inicial si todavía no lo registró en REPI). */
export async function importedLastSets(userId: string, exerciseIds: string[]) {
  const m = new Map<string, { weightKg: number | null; reps: number | null; day: string }>();
  if (!exerciseIds.length) return m;
  const rows = await db.select().from(historyEntry).where(and(eq(historyEntry.userId, userId), inArray(historyEntry.exerciseId, exerciseIds))).orderBy(desc(historyEntry.day), desc(historyEntry.setIndex));
  for (const r of rows) if (r.exerciseId && !m.has(r.exerciseId)) m.set(r.exerciseId, { weightKg: r.weightKg == null ? null : Number(r.weightKg), reps: r.reps, day: r.day });
  return m;
}

