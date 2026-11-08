// AC3 · Política de memoria. REPI recuerda lo que la persona declaró (preferencias), lo que decidió (aceptó, rechazó,
// modificó), lo que pasó después (resultados) y el contexto del momento (temporal: máquina ocupada, minutos de hoy). Los hechos
// (marcas, programa, progreso) no se guardan acá: se leen de la base para que nunca queden desactualizados. Todo vence, se
// puede ver, corregir y borrar, y nunca se guardan inferencias psicológicas, médicas ni íntimas.
import type { MemoryItem, MemoryKind } from "./types";
import { endOfArDay } from "./quiet";
import { fold, norm, clip } from "./util";

export const MEMORY_KINDS: readonly MemoryKind[] = ["preference", "decision", "outcome", "temporal"];
/** Días de vigencia de decisiones y resultados. Preferencias: sin vencimiento hasta que se borren. Temporal: hasta fin del día o de la sesión. */
export const MEMORY_TTL_DAYS = { decision: 180, outcome: 180 } as const;
export const MEMORY_TEXT_MAX = 120;
const DAY_MS = 86_400_000;

/** Clave normalizada: minúsculas, sin tildes, `[a-z0-9_]` en segmentos separados por `:` («avoid_exercise:remo_en_maquina»). */
export function normalizeKey(key: string): string {
  return (key ?? "").split(":").map((seg) => fold(seg).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")).filter(Boolean).join(":").slice(0, 64);
}
export const isMemoryKind = (x: unknown): x is MemoryKind => typeof x === "string" && (MEMORY_KINDS as readonly string[]).includes(x);

/** Claves de salud: nunca van a la memoria del asistente (tienen su propio registro con consentimiento: molestias, lesiones). */
const HEALTH_KEY = /^(pain|injury|health|lesion|molestia|dolor|medical|medic)/;

/**
 * Vencimiento de un recuerdo nuevo. Temporal: fin del día local o fin de la sesión si llega antes; decisión y resultado: 180
 * días; preferencia: nunca (hasta que se borre).
 */
export function expiryFor(kind: MemoryKind, key: string, now: Date | string, session?: { endsAt?: string | null } | null): string | null {
  const t = typeof now === "string" ? new Date(now) : now;
  if (kind === "preference") return null;
  if (kind === "decision" || kind === "outcome") return new Date(t.getTime() + MEMORY_TTL_DAYS[kind] * DAY_MS).toISOString();
  const eod = endOfArDay(t).getTime();
  const end = session?.endsAt ? Math.min(Date.parse(session.endsAt), eod) : eod;
  void key; // reservado: hoy todas las claves temporales vencen igual
  return new Date(end).toISOString();
}

export const isExpired = (item: Pick<MemoryItem, "expiresAt">, now: Date | string) =>
  item.expiresAt != null && Date.parse(item.expiresAt) <= (typeof now === "string" ? Date.parse(now) : now.getTime());
/** Memoria vigente (no vencida), sin tocar la lista original. */
export const activeMemory = (items: MemoryItem[], now: Date | string) => items.filter((m) => !isExpired(m, now));

/** ¿Se puede guardar este recuerdo? Devuelve el motivo si no. */
export function memoryAllowed(item: Pick<MemoryItem, "kind" | "key" | "text">): { ok: true } | { ok: false; reason: "kind" | "key" | "health" | "sensitive" | "text" } {
  if (!isMemoryKind(item.kind)) return { ok: false, reason: "kind" };
  const key = normalizeKey(item.key);
  if (!key || key.length < 2) return { ok: false, reason: "key" };
  if (HEALTH_KEY.test(key)) return { ok: false, reason: "health" };
  if (typeof item.text !== "string" || !item.text.trim() || item.text.length > MEMORY_TEXT_MAX * 2) return { ok: false, reason: "text" };
  if (forbiddenInference(item.text) || forbiddenInference(key.replace(/[_:]/g, " "))) return { ok: false, reason: "sensitive" };
  return { ok: true };
}

/** Identidad de un recuerdo para deduplicar: tipo + clave (+ sesión para lo temporal). */
const identity = (m: MemoryItem) => `${m.kind}|${normalizeKey(m.key)}|${m.kind === "temporal" ? (m.ref?.sessionId ?? "") : ""}`;

/**
 * Une la memoria existente con la nueva: deduplica por tipo y clave (el más reciente gana), conserva la procedencia
 * (`source`, `ref`, `createdAt`) del que queda y descarta lo que no se puede guardar. Orden: más reciente primero.
 */
export function mergeMemory(existing: MemoryItem[], incoming: MemoryItem[]): MemoryItem[] {
  const by = new Map<string, MemoryItem>();
  for (const m of [...existing, ...incoming]) {
    if (!memoryAllowed(m).ok) continue;
    const item = { ...m, key: normalizeKey(m.key) };
    const id = identity(item);
    const cur = by.get(id);
    if (!cur || Date.parse(item.createdAt) >= Date.parse(cur.createdAt)) by.set(id, item);
  }
  return [...by.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Cambios del dato de origen que vuelven obsoleta parte de la memoria. */
export type MemoryChange =
  | { type: "program_version"; versionId: string }
  | { type: "session_closed"; sessionId: string }
  | { type: "session_voided"; sessionId: string }
  | { type: "exercise_changed"; exerciseId: string }
  | { type: "memory_deleted"; id: string };

/**
 * Qué recuerdos dejan de valer con un cambio. Versión nueva del programa: lo temporal y las decisiones atadas a otra versión.
 * Sesión cerrada: lo temporal de esa sesión. Sesión anulada (o datos borrados): todo lo que se apoyaba en ella, incluidos
 * resultados. Ejercicio cambiado: lo temporal y las decisiones de ese ejercicio. Las preferencias sólo se borran a pedido.
 */
export function invalidate(items: MemoryItem[], change: MemoryChange): { keep: MemoryItem[]; invalidated: MemoryItem[] } {
  const hit = (m: MemoryItem): boolean => {
    const ref = m.ref ?? {};
    switch (change.type) {
      case "program_version": return (m.kind === "temporal" || m.kind === "decision") && ref.programVersionId != null && ref.programVersionId !== change.versionId;
      case "session_closed": return m.kind === "temporal" && ref.sessionId === change.sessionId;
      case "session_voided": return m.kind !== "preference" && ref.sessionId === change.sessionId;
      case "exercise_changed": return (m.kind === "temporal" || m.kind === "decision") && ref.exerciseId === change.exerciseId;
      case "memory_deleted": return m.id === change.id;
    }
  };
  const keep: MemoryItem[] = [], invalidated: MemoryItem[] = [];
  for (const m of items) (hit(m) ? invalidated : keep).push(m);
  return { keep, invalidated };
}

// ── Inferencias prohibidas ─────────────────────────────────────────────────────────────────────────────────────────────
const SENSITIVE: [category: "psych" | "medical" | "intimate", re: RegExp][] = [
  ["psych", /\b(depresi\w*|deprimid[oa]s?|ansiedad|ansios[oa]s?|angustia\w*|trastorn\w*|bipolar\w*|tdah|autis\w*|anorexi\w*|bulimi\w*|atracon\w*|toc|panico|suicid\w*|autolesi\w*|psicolog\w*|psiquiatr\w*|terapia|antidepresiv\w*|adicci\w*|adict[oa]s?|alcoholi\w*|drogas?)\b/],
  ["medical", /\b(embaraz\w*|diabet\w*|hipertens\w*|cancer|tumor\w*|vih|hiv|epilep\w*|asma\w*|cardiopat\w*|enfermedad\w*|diagnostic\w*|medicacion|medicament\w*|cirugi\w*|operad[oa] de|hernia\w*|artrosis|artritis|fibromialgia|tiroides|lupus|esclerosis)\b/],
  ["intimate", /\b(orientacion sexual|sexual\w*|gay|gays|lesbiana\w*|bisexual\w*|transgenero\w*|trans|homosexual\w*|heterosexual\w*|pareja|novi[oa]s?|divorci\w*|religi\w*|politic\w*|sindica\w*|etnia|raza|inmigrante|deuda\w*)\b/],
];
/**
 * ¿El texto contiene una inferencia psicológica, médica o íntima que la memoria del asistente no debe guardar? Devuelve la
 * categoría o null. Es una lista de bloqueo conservadora: ante la duda, no se guarda (la persona puede escribirlo igual en el
 * chat; lo que no se hace es convertirlo en un perfil).
 */
export function forbiddenInference(text: string): "psych" | "medical" | "intimate" | null {
  const t = norm(text);
  for (const [cat, re] of SENSITIVE) if (re.test(t)) return cat;
  return null;
}

// ── Preferencias declaradas ────────────────────────────────────────────────────────────────────────────────────────────
export type MemoryDraft = Omit<MemoryItem, "id" | "createdAt">;
const pref = (key: string, value: unknown, text: string): MemoryDraft => ({ kind: "preference", key: normalizeKey(key), value, text: clip(text, MEMORY_TEXT_MAX), source: "user", ref: null, expiresAt: null });
const CATEGORY_WORDS: [RegExp, "motivation" | "weekly" | "progress" | "training" | "performance", string][] = [
  [/motivac\w*|motivador\w*|motivacional\w*|frases/, "motivation", "mensajes de motivación"],
  [/resumen\w* semanal\w*|resumen de la semana|semanal\w*/, "weekly", "resúmenes semanales"],
  [/progreso|logros?|marcas?/, "progress", "avisos de progreso"],
  [/rendimiento|recomendaciones/, "performance", "recomendaciones de rendimiento"],
  [/recordatorios? (?:de|para) entrena\w*|recordatorios?/, "training", "recordatorios de entrenamiento"],
];
const TIME_WORDS: [RegExp, "morning" | "afternoon" | "evening", string][] = [
  [/\b(temprano|a la manana|de manana|por la manana|a primera hora)\b/, "morning", "a la mañana"],
  [/\b(a la tarde|de tarde|por la tarde|despues del trabajo|al mediodia)\b/, "afternoon", "a la tarde"],
  [/\b(a la noche|de noche|por la noche|tarde a la noche|tardecita)\b/, "evening", "a la noche"],
];
/** Corta la frase en la explicación («el remo porque me aburre» → «el remo»). */
const cutClause = (raw: string) => raw.replace(/\s+(porque|ya que|pero|y no|cuando|asi que)\b.*$/, "").trim();
/** Sin artículo, para la clave («el remo en maquina» → «remo en maquina»). */
const thing = (raw: string) => cutClause(raw).replace(/^(el|la|los|las|hacer|un|una|usar)\s+/, "").trim();
/** La misma frase como la escribió la persona (con tildes y mayúsculas), buscando sus palabras en el texto original. */
function original(text: string, phraseNorm: string): string {
  const want = phraseNorm.split(" ").filter(Boolean);
  const words = (text ?? "").split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
  const normed = words.map((w) => norm(w));
  for (let i = 0; i + want.length <= normed.length; i++) {
    if (want.every((w, j) => normed[i + j] === w)) return words.slice(i, i + want.length).join(" ");
  }
  return phraseNorm;
}
const TEMPORAL = /\b(hoy|ahora|esta semana|este rato|por hoy)\b/;

/**
 * Lee una preferencia declarada y la devuelve como candidata (se guarda sólo si la persona confirma). Reconoce horario
 * preferido, ejercicios que no le gustan o que le gustan, tono breve o detallado, categorías de avisos que no quiere y «consultame
 * antes de cambiar». Si el texto trae algo sensible, no devuelve nada.
 */
export function parsePreference(text: string): MemoryDraft | null {
  if (forbiddenInference(text)) return null;
  const t = norm(text);
  if (!t) return null;
  // Tono.
  if (/\b(habl\w*|contest\w*|respond\w*|escrib\w*)\b.*\b(mas )?(corto|breve|cortito|resumido|al grano|forma breve|forma corta)\b|\bse (mas )?(breve|corto)\b|\brespuestas (cortas|breves)\b|\bmenos texto\b|\bmenos palabras\b/.test(t))
    return pref("tone", "breve", "Querés respuestas breves.");
  if (/\b(habl\w*|explic\w*|contest\w*)\b.*\b(con )?(mas detalle|mas largo|mas completo|detallado)\b|\brespuestas (largas|completas|detalladas)\b/.test(t))
    return pref("tone", "normal", "Preferís respuestas más completas.");
  // Consultar antes de cambiar.
  if (/\b(consulta|pregunta|avisa)\w*\b.*\bantes de (cambiar|recomendar|hacer|tocar|modificar)\b|\bno (cambies|toques|modifiques) nada sin (preguntar|consultar|avisar)\w*\b|\bprefiero que me (consultes|preguntes)\b/.test(t))
    return pref("confirm_before_change", true, "Querés que te consulte antes de cambiar algo.");
  // Categorías de avisos que no quiere.
  const off = /\bno (quiero|me mandes|me envies|necesito)\b.*\b(recordatorio|recordatorios|mensaje|mensajes|aviso|avisos|notificacion|notificaciones|frases|resumen|resumenes)\b|\bsin (mensajes|recordatorios|avisos|frases)\b/.test(t);
  if (off) {
    for (const [re, cat, label] of CATEGORY_WORDS) if (re.test(t)) return pref(`category_off:${cat}`, false, `No querés ${label}.`);
  }
  // Horario preferido.
  if (/\bprefiero entrenar\b|\bme gusta entrenar\b|\bentreno mejor\b|\bsuelo entrenar\b/.test(t)) {
    for (const [re, value, label] of TIME_WORDS) if (re.test(t)) return pref("prefers_time", value, `Preferís entrenar ${label}.`);
  }
  // Ejercicios que no le gustan (no «no me gusta que…», que es sobre REPI y no sobre un ejercicio).
  let m = /\b(?:no me (gusta|gustan)|odio|detesto|no quiero hacer|no me (?:copa|copan)|no me cae bien)\s+(?!que\b|cuando\b|como\b)(.{3,60})$/.exec(t);
  if (m && !TEMPORAL.test(m[2])) {
    const x = thing(m[2]);
    if (x.length >= 3) return pref(`avoid_exercise:${x}`, { name: original(text, x) }, `No te ${m[1] === "gustan" ? "gustan" : "gusta"} ${original(text, cutClause(m[2]))}.`);
  }
  m = /\b(?:me gustan? (?:mucho |mas )?|me encantan? |prefiero (?:hacer |usar )?)(?!entrenar\b|que\b|cuando\b|como\b)(.{3,60})$/.exec(t);
  if (m && !TEMPORAL.test(m[1])) {
    const x = thing(m[1]);
    if (x.length >= 3 && !/^(mas|menos|corto|breve)\b/.test(x)) return pref(`likes_exercise:${x}`, { name: original(text, x) }, `Preferís ${original(text, cutClause(m[1]))}.`);
  }
  return null;
}
