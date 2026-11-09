// AC3 · Catálogo de acciones y política de autonomía. REPI sólo puede hacer lo que está en este catálogo, con la entrada
// validada contra el contexto real (ids que existen, números acotados, nada de texto libre ejecutable) y según la autonomía
// que eligió la persona: 0 informa, 1 propone y pide confirmación (por defecto), 2 ejecuta sólo lo de bajo riesgo habilitado.
// Ningún nivel toca datos de salud sin confirmación explícita ni el programa del entrenador: lo de hoy vale sólo por hoy y lo
// demás queda como borrador o propuesta.
import type { ActionKind, ActionProposal, ActionSpec, AgeBand, Autonomy, BrainPrefs } from "./types";
import { isHm } from "./quiet";
import { EXERCISE_CHANGE_REASONS } from "../session-changes";
import { forbiddenInference, normalizeKey } from "./memory";
import { BODY_AREAS } from "./safety";
import { hashHex, stableStringify } from "./util";

export const ACTIONS: Record<ActionKind, ActionSpec> = {
  open_workout: { kind: "open_workout", risk: "none", autoAt: 0, scope: "nav" },
  show_history: { kind: "show_history", risk: "none", autoAt: 0, scope: "nav" },
  record_feedback: { kind: "record_feedback", risk: "none", autoAt: 0, scope: "record" },
  propose_substitution: { kind: "propose_substitution", risk: "none", autoAt: 1, inSession: true, scope: "nav", operational: true },
  propose_short_session: { kind: "propose_short_session", risk: "none", autoAt: 1, inSession: true, scope: "nav", operational: true },
  apply_substitution: { kind: "apply_substitution", risk: "low", autoAt: 2, inSession: true, scope: "today", operational: true },
  apply_short_session: { kind: "apply_short_session", risk: "medium", autoAt: null, inSession: true, scope: "today", operational: true },
  draft_coach_message: { kind: "draft_coach_message", risk: "low", autoAt: 1, scope: "draft" },
  propose_to_coach: { kind: "propose_to_coach", risk: "low", autoAt: null, scope: "draft", operational: true },
  save_preference: { kind: "save_preference", risk: "low", autoAt: null, scope: "pref" },
  delete_memory: { kind: "delete_memory", risk: "low", autoAt: null, scope: "pref" },
  update_prefs: { kind: "update_prefs", risk: "low", autoAt: null, scope: "pref" },
  floor_help: { kind: "floor_help", risk: "medium", autoAt: null, scope: "record" },
  report_discomfort: { kind: "report_discomfort", risk: "medium", autoAt: null, health: true, scope: "record" },
};
export const isActionKind = (x: unknown): x is ActionKind => typeof x === "string" && Object.prototype.hasOwnProperty.call(ACTIONS, x);

/** Acciones que cambian lo prescrito (aunque sea sólo por hoy): en un gimnasio supervisado no se proponen ni se ejecutan. */
export const SUPERVISED_BLOCKED: ReadonlySet<ActionKind> = new Set<ActionKind>(["propose_substitution", "propose_short_session", "apply_substitution", "apply_short_session"]);

export type ExecContext = {
  age: AgeBand;
  sessionOpen: boolean;
  /** Dueño del programa vigente: con entrenador o sede, lo de hoy siempre se confirma y las propuestas van a esa persona. */
  programOwner: "coach" | "gym" | "own" | null;
  /** Acciones que la persona (y la política de su organización) habilitó para ejecutar solas con autonomía 2. */
  allowAuto?: readonly ActionKind[];
  /** Preferencia declarada «consultame antes de cambiar»: nada operativo se ejecuta solo. */
  confirmFirst?: boolean;
  /** REPI Control (D213): el gimnasio supervisa la planificación; REPI no cambia lo prescrito, ni por hoy. */
  supervised?: boolean;
};
export type ExecDecision = {
  mode: "auto" | "confirm" | "blocked";
  code: "ok" | "supervised" | "autonomy_info" | "minor" | "out_of_session" | "health" | "coach_program" | "no_coach" | "risk" | "confirm_pref" | "default";
  /** Motivo en palabras (para la persona). */
  reason: string | null;
};

/**
 * ¿Cómo se ejecuta una acción? Primero lo que la bloquea (edad, sesión cerrada, autonomía informativa, propuesta sin
 * entrenador), después lo que obliga a confirmar (salud, riesgo medio, programa del entrenador, preferencia) y recién entonces
 * la autonomía. «auto» sólo con autonomía suficiente y, en el nivel 2, si la acción está habilitada.
 */
export function decideExecution(spec: ActionSpec, autonomy: Autonomy, ctx: ExecContext): ExecDecision {
  if (spec.adultOnly && ctx.age !== "adult") return { mode: "blocked", code: "minor", reason: "Esta acción es sólo para personas adultas." };
  if (spec.inSession && !ctx.sessionOpen) return { mode: "blocked", code: "out_of_session", reason: "Sirve sólo con un entrenamiento abierto." };
  if (ctx.supervised && SUPERVISED_BLOCKED.has(spec.kind))
    return { mode: "blocked", code: "supervised", reason: "En tu gimnasio la rutina la decide el equipo de sala: no la cambio, ni por hoy. Si querés, les aviso." };
  if (autonomy === 0 && spec.operational) return { mode: "blocked", code: "autonomy_info", reason: "Con la asistencia en modo informativo no preparo cambios. Podés cambiarlo en Perfil → Asistente REPI." };
  if (spec.kind === "propose_to_coach" && ctx.programOwner !== "coach" && ctx.programOwner !== "gym")
    return { mode: "blocked", code: "no_coach", reason: "Tu rutina no es de un entrenador: la podés editar vos en Mis rutinas." };
  if (spec.health) return { mode: "confirm", code: "health", reason: "Es un dato de salud: lo guardo sólo si lo confirmás." };
  if (spec.risk === "medium" || spec.risk === "high") return { mode: "confirm", code: "risk", reason: null };
  if (spec.scope === "today" && (ctx.programOwner === "coach" || ctx.programOwner === "gym"))
    return { mode: "confirm", code: "coach_program", reason: "Es la rutina de tu entrenador: el cambio vale sólo por hoy y te lo confirmo antes." };
  if (ctx.confirmFirst && spec.operational) return { mode: "confirm", code: "confirm_pref", reason: "Me pediste que te consulte antes de cambiar algo." };
  if (spec.autoAt == null || autonomy < spec.autoAt) return { mode: "confirm", code: "default", reason: null };
  if (autonomy === 2 && spec.autoAt === 2 && !(ctx.allowAuto ?? []).includes(spec.kind)) return { mode: "confirm", code: "default", reason: null };
  return { mode: "auto", code: "ok", reason: null };
}

/** Clave idempotente estable: la misma acción con la misma entrada (y sal, p. ej. el id del mensaje) da la misma clave. */
export const makeKey = (kind: ActionKind, input: Record<string, unknown>, salt = "") => `${kind}:${hashHex(`${kind}|${salt}|${stableStringify(input)}`)}`;
export const KEY_RE = /^[a-z_]+:[0-9a-f]{16}$/;

// ── Validación estricta ────────────────────────────────────────────────────────────────────────────────────────────────
export type ValidationCtx = {
  sessionOpen: boolean;
  /** Ejercicios de la sesión abierta. `done` = con alguna serie registrada (nunca se omiten ni se reemplazan). */
  session?: { pending: string[]; done: string[] } | null;
  /** Reemplazos válidos por ejercicio (los mismos que se ofrecieron: aprobados y biblioteca compatible). */
  alternatives?: Record<string, string[]>;
  /** Ejercicios que la persona puede ver (programa, historial, biblioteca visible). */
  exercises?: string[];
  /** Días del programa vigente. */
  days?: string[];
  /** Ids de memoria de la persona. */
  memoryIds?: string[];
};
export type Validation = { ok: true; input: Record<string, unknown> } | { ok: false; errors: string[] };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const isId = (x: unknown): x is string => typeof x === "string" && ID_RE.test(x);
const isInt = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const isNum = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
/** Texto corto mostrable: sin caracteres de control, recortado. Nunca se ejecuta: sólo se muestra o se guarda como dato. */
const cleanText = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "").slice(0, max);
const PREF_FIELDS = ["proactive", "push", "categories", "quietStart", "quietEnd", "maxPerDay", "autonomy", "tone"] as const;
const CATEGORY_KEYS = ["training", "progress", "performance", "motivation", "weekly"] as const;

/** Validador de la entrada de cada acción: campos permitidos, tipos, rangos y pertenencia al contexto. */
const SCHEMAS: Record<ActionKind, { fields: string[]; check: (i: Record<string, unknown>, c: ValidationCtx, err: (m: string) => void) => Record<string, unknown> }> = {
  open_workout: { fields: ["dayKey"], check: (i, c, err) => {
    if (i.dayKey != null && (!isId(i.dayKey) || !(c.days ?? []).includes(i.dayKey))) err("El día no existe en tu programa.");
    return i.dayKey != null ? { dayKey: i.dayKey } : {};
  } },
  show_history: { fields: ["exerciseId"], check: (i, c, err) => {
    if (!isId(i.exerciseId) || !(c.exercises ?? []).includes(i.exerciseId)) err("El ejercicio no está entre los tuyos.");
    return { exerciseId: i.exerciseId };
  } },
  record_feedback: { fields: ["target", "id", "value"], check: (i, _c, err) => {
    if (i.target !== "message" && i.target !== "intervention") err("Destino de la opinión inválido.");
    if (!isId(i.id)) err("Falta la referencia.");
    if (i.value !== 1 && i.value !== -1) err("La opinión es 1 o −1.");
    return { target: i.target, id: i.id, value: i.value };
  } },
  propose_substitution: { fields: ["exerciseId"], check: (i, c, err) => {
    if (!isId(i.exerciseId) || !(c.session?.pending ?? []).includes(i.exerciseId)) err("El ejercicio no está pendiente en tu sesión.");
    return { exerciseId: i.exerciseId };
  } },
  apply_substitution: { fields: ["exerciseId", "substituteId", "reason"], check: (i, c, err) => {
    if (!isId(i.exerciseId) || !(c.session?.pending ?? []).includes(i.exerciseId)) err("El ejercicio no está pendiente en tu sesión.");
    if ((c.session?.done ?? []).includes(i.exerciseId as string)) err("Ese ejercicio ya tiene series registradas: no se reemplaza.");
    if (!isId(i.substituteId) || !(c.alternatives?.[i.exerciseId as string] ?? []).includes(i.substituteId)) err("El reemplazo no está entre las alternativas válidas.");
    if (typeof i.reason !== "string" || !(i.reason in EXERCISE_CHANGE_REASONS)) err("Motivo de cambio inválido.");
    return { exerciseId: i.exerciseId, substituteId: i.substituteId, reason: i.reason };
  } },
  propose_short_session: { fields: ["minutes"], check: (i, _c, err) => {
    if (!isInt(i.minutes, 5, 180)) err("Los minutos tienen que ser un entero entre 5 y 180.");
    return { minutes: i.minutes };
  } },
  apply_short_session: { fields: ["minutes", "skip"], check: (i, c, err) => {
    if (!isInt(i.minutes, 5, 180)) err("Los minutos tienen que ser un entero entre 5 y 180.");
    const pending = c.session?.pending ?? [], done = new Set(c.session?.done ?? []);
    const skip = Array.isArray(i.skip) ? i.skip : null;
    if (!skip || !skip.length) err("No hay ejercicios para omitir.");
    else {
      if (new Set(skip).size !== skip.length) err("Hay ejercicios repetidos.");
      if (skip.some((x) => !isId(x) || !pending.includes(x))) err("Sólo se pueden omitir ejercicios pendientes de tu sesión.");
      if (skip.some((x) => done.has(x as string))) err("Nunca se omite un ejercicio con series registradas.");
      // Queda al menos uno: alguno sin tocar o el que está en curso (pendiente con series registradas, que nunca se omite).
      // Así se pueden dejar para otro día todos los que no empezaste mientras terminás el que tenés a medias.
      if (skip.length >= pending.length) err("Tiene que quedar al menos un ejercicio.");
    }
    return { minutes: i.minutes, skip };
  } },
  draft_coach_message: { fields: ["text", "exerciseId"], check: (i, c, err) => {
    const text = cleanText(i.text, 500);
    if (text.length < 3) err("El borrador está vacío.");
    if (i.exerciseId != null && (!isId(i.exerciseId) || !(c.exercises ?? []).includes(i.exerciseId))) err("El ejercicio no está entre los tuyos.");
    return { text, ...(i.exerciseId != null ? { exerciseId: i.exerciseId } : {}) };
  } },
  propose_to_coach: { fields: ["exerciseId", "kind", "weightKg", "reps", "note"], check: (i, c, err) => {
    if (!isId(i.exerciseId) || !(c.exercises ?? []).includes(i.exerciseId)) err("El ejercicio no está en tu programa.");
    if (!["load", "reps", "hold", "review", "rest"].includes(i.kind as string)) err("Tipo de propuesta inválido.");
    if (i.weightKg != null && !isNum(i.weightKg, 0, 500)) err("La carga propuesta está fuera de rango.");
    if (i.reps != null && !isInt(i.reps, 1, 50)) err("Las repeticiones propuestas están fuera de rango.");
    return { exerciseId: i.exerciseId, kind: i.kind, weightKg: i.weightKg ?? null, reps: i.reps ?? null, note: cleanText(i.note, 200) || null };
  } },
  save_preference: { fields: ["key", "value", "text"], check: (i, _c, err) => {
    const key = typeof i.key === "string" ? normalizeKey(i.key) : "";
    if (!/^[a-z0-9_:]{2,64}$/.test(key)) err("Clave de preferencia inválida.");
    if (/^(pain|injury|health|lesion|molestia|dolor)/.test(key)) err("Los datos de salud no se guardan como preferencia.");
    const v = i.value;
    const okValue = typeof v === "boolean" || isNum(v, -1e6, 1e6) || (typeof v === "string" && v.length <= 80)
      || (v != null && typeof v === "object" && !Array.isArray(v) && stableStringify(v).length <= 200);
    if (!okValue) err("Valor de preferencia inválido.");
    const text = cleanText(i.text, 120);
    if (text.length < 3) err("Falta el texto de la preferencia.");
    if (forbiddenInference(text) || forbiddenInference(key.replace(/[_:]/g, " "))) err("Eso no lo guardo: es información sensible.");
    return { key, value: v, text };
  } },
  delete_memory: { fields: ["memoryId"], check: (i, c, err) => {
    if (!isId(i.memoryId) || !(c.memoryIds ?? []).includes(i.memoryId)) err("Ese recuerdo no existe.");
    return { memoryId: i.memoryId };
  } },
  update_prefs: { fields: ["patch"], check: (i, _c, err) => {
    const p = i.patch;
    if (!p || typeof p !== "object" || Array.isArray(p)) { err("Faltan los cambios."); return {}; }
    const patch = p as Record<string, unknown>;
    const out: Partial<BrainPrefs> = {};
    for (const k of Object.keys(patch)) if (!(PREF_FIELDS as readonly string[]).includes(k)) err(`Campo desconocido: ${k}.`);
    if ("proactive" in patch) typeof patch.proactive === "boolean" ? (out.proactive = patch.proactive) : err("«proactive» es sí o no.");
    if ("push" in patch) typeof patch.push === "boolean" ? (out.push = patch.push) : err("«push» es sí o no.");
    if ("quietStart" in patch) isHm(patch.quietStart) ? (out.quietStart = patch.quietStart) : err("Hora de inicio inválida (HH:MM).");
    if ("quietEnd" in patch) isHm(patch.quietEnd) ? (out.quietEnd = patch.quietEnd) : err("Hora de fin inválida (HH:MM).");
    if ("maxPerDay" in patch) isInt(patch.maxPerDay, 0, 10) ? (out.maxPerDay = patch.maxPerDay) : err("El máximo diario va de 0 a 10.");
    if ("autonomy" in patch) patch.autonomy === 0 || patch.autonomy === 1 || patch.autonomy === 2 ? (out.autonomy = patch.autonomy) : err("La autonomía es 0, 1 o 2.");
    if ("tone" in patch) patch.tone === "normal" || patch.tone === "breve" ? (out.tone = patch.tone) : err("Tono inválido.");
    if ("categories" in patch) {
      const cs = patch.categories as Record<string, unknown> | null;
      if (!cs || typeof cs !== "object" || Array.isArray(cs)) err("Categorías inválidas.");
      else {
        const cats: Partial<BrainPrefs["categories"]> = {};
        for (const [k, v] of Object.entries(cs)) {
          if (!(CATEGORY_KEYS as readonly string[]).includes(k) || typeof v !== "boolean") err(`Categoría inválida: ${k}.`);
          else cats[k as keyof BrainPrefs["categories"]] = v;
        }
        (out as Record<string, unknown>).categories = cats;
      }
    }
    if (!Object.keys(patch).length) err("Faltan los cambios.");
    return { patch: out };
  } },
  floor_help: { fields: ["exerciseId", "note"], check: (i, c, err) => {
    if (i.exerciseId != null && (!isId(i.exerciseId) || ![...(c.session?.pending ?? []), ...(c.session?.done ?? [])].includes(i.exerciseId))) err("El ejercicio no está en tu sesión.");
    return { exerciseId: i.exerciseId ?? null, note: cleanText(i.note, 120) || null };
  } },
  report_discomfort: { fields: ["exerciseId", "area", "note"], check: (i, c, err) => {
    if (i.exerciseId != null && (!isId(i.exerciseId) || !(c.exercises ?? []).includes(i.exerciseId))) err("El ejercicio no está entre los tuyos.");
    if (i.area != null && !Object.values(BODY_AREAS).includes(i.area as string)) err("Zona inválida.");
    return { exerciseId: i.exerciseId ?? null, area: i.area ?? null, note: cleanText(i.note, 200) || null };
  } },
};

/**
 * Valida una propuesta de acción (venga de las reglas o de la IA) antes de mostrarla o ejecutarla: acción del catálogo, clave
 * idempotente con formato válido, sólo campos permitidos, tipos y rangos, y referencias que existen en el contexto. Devuelve la
 * entrada normalizada para ejecutar (nunca la original).
 */
export function validateAction(proposal: Pick<ActionProposal, "kind" | "input" | "key">, ctx: ValidationCtx): Validation {
  const errors: string[] = [];
  const err = (m: string) => { errors.push(m); };
  if (!isActionKind(proposal?.kind)) return { ok: false, errors: ["Acción desconocida."] };
  if (typeof proposal.key !== "string" || !KEY_RE.test(proposal.key) || !proposal.key.startsWith(`${proposal.kind}:`)) err("Clave idempotente inválida.");
  const input = proposal.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: [...errors, "Entrada inválida."] };
  const schema = SCHEMAS[proposal.kind];
  for (const k of Object.keys(input)) if (!schema.fields.includes(k)) err(`Campo no permitido: ${k}.`);
  if (ACTIONS[proposal.kind].inSession && !ctx.sessionOpen) err("No hay un entrenamiento abierto.");
  const out = schema.check(input, ctx, err);
  return errors.length ? { ok: false, errors } : { ok: true, input: out };
}

/** Arma una propuesta con su clave idempotente (la entrada se valida igual antes de ejecutar). */
export const propose = (kind: ActionKind, input: Record<string, unknown>, label: string, preview: string, salt = ""): ActionProposal =>
  ({ kind, input, label, preview, key: makeKey(kind, input, salt) });
