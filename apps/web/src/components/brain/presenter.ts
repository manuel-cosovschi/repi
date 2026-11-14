// Asistente REPI (D210) · presentador. Traduce lo que devuelve el servidor (mensajes, tarjetas, avisos, acciones) a modelos de
// vista neutros: texto ya localizado, procedencia («Dato registrado», «Calculado por REPI», «Sugerencia con IA», seguridad),
// tarjetas y acciones con su vista previa. La interfaz de hoy lo dibuja con componentes; más adelante el mismo modelo puede
// alimentar a un personaje animado o a una voz (`speak`, `mood`) sin tocar el núcleo ni el servidor. Puro: sin DOM ni red.
import { localizeWeights, type WeightUnit } from "@repi/domain";
import type { ActionKind, BrainRef, CardAction, Evidence, InterventionView, MessageView, ProposedAction, ReplyCard, Section, Via } from "./types";

// ── Procedencia ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type OriginKind = "data" | "rules" | "ai" | "safety";
export type Origin = { kind: OriginKind; label: string };
export const ORIGIN_LABEL: Record<OriginKind, string> = { data: "Dato registrado", rules: "Calculado por REPI", ai: "Sugerencia con IA", safety: "Seguridad" };
const origin = (kind: OriginKind): Origin => ({ kind, label: ORIGIN_LABEL[kind] });

/** De dónde sale una respuesta: seguridad (texto fijo), IA (redactada por el modelo) o reglas (calculada sin IA, también sin IA disponible). */
export function originOfVia(via: Via | null | undefined): Origin {
  if (via === "safety") return origin("safety");
  if (via === "ai") return origin("ai");
  return origin("rules");
}
/** Procedencia de una evidencia o de una tarjeta con datos (`data` = registrado por la persona). */
export const originOfEvidence = (via: Evidence["via"] | null | undefined): Origin => origin(via === "data" ? "data" : via === "ai" ? "ai" : "rules");

// ── Fechas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
export function dayLabel(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : DAY.format(d);
}

// ── Tarjetas ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export type EvidenceVM = { basis: string; excluded: string | null; sessions: string[]; origin: Origin };
export type CardVM =
  | { type: "fact"; title: string; rows: { label: string; value: string }[]; origin: Origin }
  | { type: "evidence"; evidence: EvidenceVM }
  | { type: "alternatives"; options: { id: string; name: string; why: string; approvedByCoach: boolean }[] }
  | { type: "plan"; keep: string[]; skip: string[]; note: string }
  | { type: "motion"; name: string; motion: { id: string; v: number; match: "exact" | "compatible"; difference?: string } };

export function presentEvidence(e: Evidence, unit: WeightUnit = "kg"): EvidenceVM {
  return {
    basis: localizeWeights(e.basis, unit), excluded: e.excluded ? localizeWeights(e.excluded, unit) : null,
    sessions: (e.sessions ?? []).map((s) => (s.label ? `${dayLabel(s.at)} · ${s.label}` : dayLabel(s.at))), origin: originOfEvidence(e.via),
  };
}
export function presentCard(c: ReplyCard, unit: WeightUnit = "kg"): CardVM | null {
  switch (c.type) {
    case "fact": return { type: "fact", title: localizeWeights(c.title, unit), rows: c.rows.map((r) => ({ label: r.label, value: localizeWeights(r.value, unit) })), origin: originOfEvidence(c.via) };
    case "evidence": return c.evidence ? { type: "evidence", evidence: presentEvidence(c.evidence, unit) } : null;
    case "alternatives": return { type: "alternatives", options: c.options.slice(0, 3).map((o) => ({ id: o.exerciseId, name: o.name, why: localizeWeights(o.why, unit), approvedByCoach: !!o.approvedByCoach })) };
    case "plan": return { type: "plan", keep: c.keep, skip: c.skip, note: localizeWeights(c.note, unit) };
    case "motion": return { type: "motion", name: c.name, motion: c.motion }; // D220
    default: return null;
  }
}

// ── Acciones ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Qué tipo de acción es, para diferenciarla visualmente de una respuesta (y para avisar cuando toca salud o la sesión). */
export type ActionTone = "health" | "session" | "coach" | "pref" | "nav" | "food";
const TONE: Record<ActionKind, ActionTone> = {
  open_workout: "nav", show_history: "nav", propose_substitution: "nav", propose_short_session: "nav", draft_coach_message: "coach",
  apply_substitution: "session", apply_short_session: "session", floor_help: "session", report_discomfort: "health", propose_to_coach: "coach",
  save_preference: "pref", delete_memory: "pref", update_prefs: "pref", record_feedback: "pref", log_food: "food",
};
const KICKER: Record<ActionTone, string> = { health: "Registro de salud · privado", session: "Cambio sólo por hoy", coach: "Para tu entrenador", pref: "Preferencia", nav: "Atajo", food: "Diario de comidas · privado" };
export type ActionVM = {
  key: string; kind: ActionKind; label: string; preview: string; mode: ProposedAction["mode"]; reason: string | null; tone: ActionTone; kicker: string;
  /** Botón principal: «Confirmar» cuando la acción cambia algo; el nombre de la acción cuando sólo navega o deja un borrador. */
  confirmLabel: string;
  /** Pide intensidad y zona antes de confirmar (molestias). */
  needsDetails: boolean;
};
export function presentAction(a: ProposedAction, unit: WeightUnit = "kg"): ActionVM {
  const tone = TONE[a.kind] ?? "nav";
  return {
    key: a.key, kind: a.kind, label: localizeWeights(a.label || "Acción", unit), preview: localizeWeights(a.preview || "", unit), mode: a.mode, reason: a.reason, tone,
    kicker: KICKER[tone], confirmLabel: a.mode === "auto" ? localizeWeights(a.label || "Hacerlo", unit) : "Confirmar", needsDetails: a.kind === "report_discomfort",
  };
}

// ── Mensajes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Mood = "neutral" | "safety" | "celebrate";
export type ReplyVM = {
  id: string; role: "user" | "repi"; text: string; origin: Origin | null; cards: CardVM[]; actions: ActionVM[]; feedback: -1 | 1 | null; at: string;
  /** Texto plano para leer en voz alta (respuesta + datos de las tarjetas). */
  speak: string;
  /** Tono para un futuro personaje: seguridad, celebración (marca) o neutro. */
  mood: Mood;
};
export function presentMessage(m: MessageView, unit: WeightUnit = "kg"): ReplyVM {
  const text = localizeWeights(m.text, unit);
  if (m.role === "user") return { id: m.id, role: "user", text: m.text, origin: null, cards: [], actions: [], feedback: null, at: m.createdAt, speak: m.text, mood: "neutral" };
  const cards = (m.cards ?? []).map((c) => presentCard(c, unit)).filter((c): c is CardVM => !!c);
  const facts = cards.flatMap((c) => (c.type === "fact" ? [`${c.title}: ${c.rows.map((r) => `${r.label} ${r.value}`).join(", ")}`] : []));
  const mood: Mood = m.via === "safety" ? "safety" : /\b(r[eé]cord|mejor marca|igualaste)\b/i.test(m.text) ? "celebrate" : "neutral";
  return {
    id: m.id, role: "repi", text, origin: originOfVia(m.via), cards, actions: (m.actions ?? []).map((a) => presentAction(a, unit)),
    feedback: m.feedback ?? null, at: m.createdAt, speak: [text, ...facts].join(". "), mood,
  };
}

// ── Tarjeta de Inicio ──────────────────────────────────────────────────────────────────────────────────────────────────
export type HomeCardVM = {
  id: string; kind: string; title: string; body: string; origin: Origin; evidence: EvidenceVM | null;
  /** Acciones principales (botones) y secundarias (enlaces), siempre con «Hablar con REPI», descartar y «No mostrar algo parecido». */
  primary: CardAction[]; secondary: CardAction[];
};
const PRIMARY_IDS: readonly CardAction["id"][] = ["start", "accept", "open", "modify"];
export function presentIntervention(i: InterventionView, unit: WeightUnit = "kg"): HomeCardVM {
  const acts = [...(i.actions ?? [])];
  const has = (id: CardAction["id"]) => acts.some((a) => a.id === id);
  if (i.evidence && !has("why")) acts.push({ id: "why", label: "Ver por qué" });
  if (!has("chat")) acts.push({ id: "chat", label: "Hablar con REPI" });
  if (!has("dismiss")) acts.push({ id: "dismiss", label: "Descartar" });
  if (!has("never") && i.category !== "safety") acts.push({ id: "never", label: "No mostrar algo parecido" });
  // Un descarte que dice «Listo» se lee como confirmación de algo hecho: se nombra por lo que hace.
  const named = acts.map((a) => (a.id === "dismiss" && /^listo$/i.test(a.label.trim()) ? { ...a, label: "Entendido" } : a));
  const primary = named.filter((a) => PRIMARY_IDS.includes(a.id)).slice(0, 1);
  const rest = named.filter((a) => !primary.includes(a));
  // «Ver por qué» y «Hablar con REPI» como botones; el resto, enlaces discretos.
  const second = rest.filter((a) => a.id === "why" || a.id === "chat");
  return {
    id: i.id, kind: i.kind, title: localizeWeights(i.title, unit), body: localizeWeights(i.body, unit), origin: originOfEvidence(i.evidence?.via ?? "rules"),
    evidence: i.evidence ? presentEvidence(i.evidence, unit) : null,
    primary: [...primary, ...second].slice(0, 3), secondary: rest.filter((a) => !second.includes(a)),
  };
}

// ── Sugerencias rápidas por sección ────────────────────────────────────────────────────────────────────────────────────
export type Chip = { label: string; text: string };
const c = (label: string, text = label): Chip => ({ label, text });
/** Atajos del entrenamiento (pedido del titular): máquina ocupada, poco tiempo, molestia y poca energía. */
export const WORKOUT_CHIPS: Chip[] = [
  c("Máquina ocupada", "La máquina está ocupada"), c("Tengo poco tiempo"), c("Me molesta", "Siento una molestia en este ejercicio"), c("Poca energía", "Tengo poca energía"),
];
export const SECTION_CHIPS: Record<Section, Chip[]> = {
  home: [c("¿Qué me toca hoy?"), c("¿Estoy progresando?"), c("¿Cuántas veces entrené esta semana?")],
  workout: WORKOUT_CHIPS,
  review: [c("¿Cómo me fue respecto de la anterior?"), c("¿Qué hago la próxima?")],
  progress: [c("¿Estoy progresando?"), c("¿En qué ejercicio mejoré más?")],
  body: [c("¿Cómo viene mi objetivo de peso?"), c("¿Cuánto cambié desde que empecé?")],
  history: [c("¿Cuál fue mi última marca?"), c("¿Cuántas veces entrené este mes?")],
  routines: [c("Explicame esta rutina"), c("¿Qué es un drop set?")],
  messages: [c("Preparar una consulta para mi entrenador")],
  gym: [c("Necesito ayuda en sala")],
  profile: [c("Hablame más corto"), c("Mandame menos avisos")],
  club: [c("¿Qué me toca hoy?")],
};
/** Sugerencias del servidor (por el último turno) o, si no hay, las de la sección. Sin repetir. */
export function chipsFor(section: Section, server: string[] | null | undefined, custom?: Chip[] | null): Chip[] {
  const base = custom?.length ? custom : SECTION_CHIPS[section] ?? SECTION_CHIPS.home;
  const list = server?.length ? server.map((s) => c(s)) : base;
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true))).slice(0, 4);
}

// ── Contexto de la pantalla ────────────────────────────────────────────────────────────────────────────────────────────
const SECTION_NAME: Record<Section, string> = {
  home: "Inicio", workout: "Entrenamiento", review: "Cierre", progress: "Progreso", body: "Mi cuerpo", history: "Historial",
  routines: "Mis rutinas", messages: "Mensajes", gym: "Gimnasio", profile: "Perfil", club: "Club",
};
/** «Desde Entrenamiento · Press banca»: dice desde dónde se abrió, sin prometer nada. */
export function contextLine(section: Section, subject?: string | null): string {
  return `Desde ${SECTION_NAME[section] ?? "Inicio"}${subject ? ` · ${subject}` : ""}`;
}
/** Sólo identificadores con formato válido; lo vacío no se manda (el servidor valida el resto). */
export function cleanRef(ref: BrainRef | null | undefined): BrainRef | null {
  if (!ref) return null;
  const out: BrainRef = {};
  const id = (x: unknown) => (typeof x === "string" && /^[\w-]{1,64}$/.test(x) ? x : null);
  for (const k of ["exerciseId", "programExerciseId", "sessionId", "routineId"] as const) { const v = id(ref[k]); if (v) out[k] = v; }
  if (typeof ref.setIndex === "number" && Number.isInteger(ref.setIndex) && ref.setIndex >= 0 && ref.setIndex <= 39) out.setIndex = ref.setIndex;
  return Object.keys(out).length ? out : null;
}

/** Texto del aviso sin conexión (no alarmante; nada se bloquea). */
export const OFFLINE_NOTE = "REPI responde cuando vuelva la conexión.";

/**
 * Cierre de la sesión · «Para la próxima»: la propuesta, salvo que el texto del cierre ya la diga. Cuando decide el profe, el
 * dominio ya le agrega «Lo decide tu profe.»: la interfaz no lo repite (revisión AC3 #14).
 */
export function reviewNextLine(v: { text: string; next: { text: string } | null }): string | null {
  const t = v.next?.text?.trim();
  return t && !v.text.includes(t) ? t : null;
}

// ── Panel ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Aire entre el panel de arriba y el dock (y el borde superior). */
export const PANEL_GAP = 20;
/** Por debajo de este alto libre el panel de arriba queda compacto: sin presentación y con atajos sólo antes de la charla. */
export const PANEL_FULL_MIN = 300;
/**
 * Por debajo de este alto libre el panel arriba no se puede usar (encabezado + conversación mínima + campo ≈ 120–160 px): pasa a
 * hoja de abajo, compacta, encima del dock mientras está abierta (revisión AC3: teléfono apaisado, o 320×568 con un dock alto).
 */
export const PANEL_USABLE_MIN = 150;
export type PanelPlace = { top: boolean; max: number | null; compact: boolean; wide: boolean };
/**
 * Dónde va el panel (revisión AC3 #24/#25). Con un dock a la vista (registrar la serie) y pantalla angosta: arriba, con un alto
 * máximo que NUNCA pasa el espacio libre sobre el dock (antes se forzaba un mínimo de 240 px y en 320×568 tapaba los botones de
 * peso). Con el teclado abierto (la parte visible se achica y el dock queda debajo del teclado) se escribe en el panel: usa lo
 * visible. Sin dock: abajo (o al costado en pantallas anchas).
 */
export function panelPlace(p: { dockH: number | null; vh: number; layoutH: number; wide: boolean }): PanelPlace {
  const top = p.dockH != null && !p.wide;
  if (!top) return { top: false, max: null, compact: false, wide: p.wide };
  const keyboard = p.layoutH - p.vh > 120;
  const free = Math.max(0, Math.floor(p.vh - (keyboard ? 0 : p.dockH!) - PANEL_GAP));
  if (free < PANEL_USABLE_MIN) return { top: false, max: null, compact: true, wide: false };
  return { top: true, max: free, compact: free < PANEL_FULL_MIN, wide: false };
}
/**
 * Al cambiar de pantalla, ¿sigue abierto el panel? Entrar o salir del entrenamiento lo cierra (lo abierto en Progreso quedaba
 * abajo tapando el dock; los atajos del entrenamiento no tienen sentido fuera de él). La conversación no se pierde.
 */
export const panelSurvives = (from: string, to: string) => from === to || (from !== "workout" && to !== "workout");

/**
 * Pedidos de a uno y en orden; sólo la respuesta del último pedido se aplica (revisión AC3 #26: dos cambios seguidos de las
 * preferencias no se pisan en el servidor y una respuesta vieja que llega tarde no deshace lo nuevo). Un pedido que falla no
 * frena a los siguientes; el error vuelve a quien lo pidió.
 */
export function serialLatest<T>(apply: (r: T) => void): (req: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  let seq = 0;
  return (req) => {
    const mine = ++seq;
    const run = chain.catch(() => {}).then(req);
    chain = run;
    return run.then((r) => { if (mine === seq) apply(r); return r; });
  };
}
