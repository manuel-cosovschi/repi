// Historial anterior a REPI (D132). La persona sube una planilla, texto, foto o PDF; una planilla con columnas reconocibles se
// lee sin IA y el resto lo lee OpenAI. Todo pasa por `normalizeImport`, se muestra como vista previa y sólo se guarda cuando la
// persona confirma. El archivo no se guarda. Lo importado aparece en Progreso («Antes de REPI») y sugiere pesos iniciales.
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { exerciseEvolution, exerciseKey, localDate, normalizeImport, parseHistoryCsv, type ImportSet, type NormalizedSet } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiJson, aiModel, aiOn, type AiPart } from "../ai/openai";
import { ensureExerciseCatalog } from "./library";

const { historyImport, historyEntry, exercise, coachClient, gymMember } = schema;

export type ImportFile = { fileName: string; kind: "text" | "image" | "pdf"; text?: string; dataUrl?: string };
type Parsed = { sets: NormalizedSet[]; matches: Record<string, { id: string; name: string } | null>; notes: string[]; dropped: number; capped: boolean };

const AI_SCHEMA = {
  type: "object", additionalProperties: false, required: ["sessions", "notes"],
  properties: {
    sessions: { type: "array", items: { type: "object", additionalProperties: false, required: ["date", "exercises"], properties: {
      date: { type: "string", description: "AAAA-MM-DD" },
      exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "sets"], properties: {
        name: { type: "string" },
        sets: { type: "array", items: { type: "object", additionalProperties: false, required: ["weight_kg", "reps", "seconds"], properties: {
          weight_kg: { type: ["number", "null"] }, reps: { type: ["integer", "null"] }, seconds: { type: ["integer", "null"] },
        } } },
      } } },
    } } },
    notes: { type: "array", items: { type: "string" } },
  },
};
type AiOut = { sessions: { date: string; exercises: { name: string; sets: { weight_kg: number | null; reps: number | null; seconds: number | null }[] }[] }[]; notes: string[] };

const SYSTEM = (today: string) => `Sos un asistente que transcribe registros de entrenamiento de fuerza (planillas, notas, cuadernos fotografiados, PDF) a datos.
Hoy es ${today}. Reglas:
- Devolvé cada día entrenado con su fecha en formato AAAA-MM-DD. Las fechas escritas DD/MM son de Argentina (día primero). Si falta el año, usá el de las fechas cercanas del mismo registro; sólo si no hay ninguna, el año más reciente que no quede en el futuro.
- Cada serie va por separado: «3x10 con 60» son 3 series de 10 repeticiones con 60 kg. Libras a kilos (× 0,4536). Peso corporal o sin peso: weight_kg null.
- Ejercicios por tiempo (plancha, cardio): seconds. Sin dato, null.
- Nombres de ejercicios en español, como los escribió la persona (corregí sólo errores evidentes de tipeo).
- No inventes nada. Si algo no se lee o es ambiguo, omitilo y explicalo brevemente en notes (en español). Sin fecha legible, no se incluye.`;

async function readWithAi(f: ImportFile, today: string): Promise<{ sets: ImportSet[]; notes: string[] }> {
  const parts: AiPart[] = [{ type: "text", text: `Archivo: ${f.fileName.slice(0, 120)}. Transcribí el historial de entrenamiento.` }];
  if (f.kind === "text") parts.push({ type: "text", text: (f.text ?? "").slice(0, 60_000) });
  else if (f.kind === "image") parts.push({ type: "image_url", image_url: { url: f.dataUrl!, detail: "high" } });
  else parts.push({ type: "file", file: { filename: f.fileName.slice(0, 120) || "historial.pdf", file_data: f.dataUrl! } });
  const out = await aiJson<AiOut>({ name: "historial_entrenamiento", system: SYSTEM(today), parts, schema: AI_SCHEMA, maxTokens: 16_000 });
  const sets: ImportSet[] = [];
  for (const s of out.sessions ?? []) for (const e of s.exercises ?? []) for (const x of e.sets ?? []) {
    sets.push({ day: s.date, exercise: e.name, weightKg: x.weight_kg, reps: x.reps, seconds: x.seconds });
  }
  return { sets, notes: (out.notes ?? []).map((n) => String(n).slice(0, 300)).slice(0, 10) };
}

/** Biblioteca visible para la persona: catálogo base y ejercicios propios de sus coaches y gimnasios. */
async function libraryFor(userId: string) {
  await ensureExerciseCatalog();
  const orgs = [
    ...(await db.select({ o: coachClient.coachOrgId }).from(coachClient).where(eq(coachClient.userId, userId))).map((r) => r.o),
    ...(await db.select({ o: gymMember.orgId }).from(gymMember).where(eq(gymMember.userId, userId))).map((r) => r.o),
  ];
  return db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(orgs.length ? or(isNull(exercise.orgId), inArray(exercise.orgId, orgs)) : isNull(exercise.orgId));
}

/** Sin conectores ni abreviaturas comunes: «Press banca» = «Press de banca», «Remo c/ barra» = «Remo con barra». */
const looseKey = (s: string) => exerciseKey(s.replace(/\bc\//gi, "con ")).split(" ").filter((w) => !["de", "del", "con", "en", "la", "el", "los", "las", "a", "al"].includes(w)).join(" ");

const MAP_SCHEMA = {
  type: "object", additionalProperties: false, required: ["map"],
  properties: { map: { type: "array", items: { type: "object", additionalProperties: false, required: ["written", "catalog"], properties: { written: { type: "string" }, catalog: { type: ["string", "null"] } } } } },
};

/** Empareja los nombres escritos con la biblioteca: igual sin tildes; si no, la IA propone el equivalente (o ninguno). */
async function matchExercises(names: string[], lib: { id: string; name: string }[]) {
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
  if (f.kind === "text" && !(f.text ?? "").trim()) throw new AccessError("invalid", "El archivo está vacío.");
  if (f.kind !== "text" && !/^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/.test(f.dataUrl ?? "")) throw new AccessError("invalid", "Subí una foto (JPG o PNG), un PDF o una planilla CSV.");
  let raw: ImportSet[] | null = f.kind === "text" ? parseHistoryCsv(f.text!) : null;
  let notes: string[] = [];
  const source: "csv" | "ai" = raw ? "csv" : "ai";
  if (!raw) {
    if (!aiOn()) throw new AccessError("ai_unavailable", "Por ahora sólo podemos leer planillas con columnas Fecha, Ejercicio, Series, Reps y Peso.", 503);
    ({ sets: raw, notes } = await readWithAi(f, today));
  }
  const n = normalizeImport(raw, today);
  if (!n.sets.length) throw new AccessError("empty", "No encontramos entrenamientos con fecha, ejercicio y peso o repeticiones. Probá con otra foto o una planilla.", 422);
  const names = [...new Set(n.sets.map((s) => s.exercise))];
  const matches = await matchExercises(names, await libraryFor(userId));
  const parsed: Parsed = { sets: n.sets, matches, notes, dropped: n.dropped, capped: n.capped };
  const [row] = await db.insert(historyImport).values({
    userId, source, fileName: f.fileName.slice(0, 200), parsed, sessions: n.summary.sessions, sets: n.summary.sets, fromDay: n.summary.from, toDay: n.summary.to, model: source === "ai" ? aiModel() : null,
  }).returning();
  await audit(db, { actorUserId: userId, action: "history_import.previewed", resourceType: "history_import", resourceId: row.id, meta: { source, sets: n.summary.sets } });
  return previewOut(row.id, source, parsed, n.summary);
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

export async function confirmHistoryImport(userId: string, id: string) {
  const r = await mine(userId, id);
  if (r.status === "confirmed") return { ok: true, sets: r.sets };
  if (r.status !== "draft") throw new AccessError("closed", "Esa importación se descartó. Subí el archivo de nuevo.", 409);
  const p = r.parsed as Parsed;
  await db.transaction(async (tx) => {
    // DATA-3 (QA 29/10): pasar a «confirmada» primero y sólo si seguía en borrador. Un doble toque o un reintento espera a
    // la otra transacción y no encuentra el borrador: no duplica el historial ni pisa un descarte simultáneo.
    const [claimed] = await tx.update(historyImport).set({ status: "confirmed", confirmedAt: new Date() })
      .where(and(eq(historyImport.id, r.id), eq(historyImport.status, "draft"))).returning({ id: historyImport.id });
    if (!claimed) return;
    const rows = p.sets.map((s) => ({ importId: r.id, userId, day: s.day, exerciseId: p.matches[s.exercise]?.id ?? null, exerciseName: p.matches[s.exercise]?.name ?? s.exercise, setIndex: s.setIndex,
      weightKg: s.weightKg == null ? null : String(s.weightKg), reps: s.reps, seconds: s.seconds }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(historyEntry).values(rows.slice(i, i + 500));
    await audit(tx, { actorUserId: userId, action: "history_import.confirmed", resourceType: "history_import", resourceId: r.id, meta: { sets: rows.length } });
  });
  return { ok: true, sets: p.sets.length };
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

