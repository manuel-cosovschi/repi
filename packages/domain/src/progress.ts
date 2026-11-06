// Personal Progress & Body Tracking 1.0 (D199–D202). Funciones puras: rangos de tiempo, peso corporal y objetivo,
// calorías estimadas y destinos de las novedades de REPI. Nada de esto es Body Intelligence: no hay análisis corporal, ni
// estimación de grasa, ni recomendaciones de dieta; el peso y las fotos son registros de la propia persona.
import { LB_PER_KG, type WeightUnit } from "./units";

// ── Rangos de tiempo de los gráficos ────────────────────────────────────────
export const PROGRESS_RANGES = { "30d": "30 días", "90d": "90 días", "6m": "6 meses", "1y": "1 año", all: "Todo" } as const;
export type ProgressRange = keyof typeof PROGRESS_RANGES;
export const isProgressRange = (x: unknown): x is ProgressRange => typeof x === "string" && x in PROGRESS_RANGES;
const RANGE_DAYS: Record<ProgressRange, number | null> = { "30d": 30, "90d": 90, "6m": 183, "1y": 365, all: null };
/** Fecha local (AAAA-MM-DD) desde la que se muestran datos; null = todo el historial. */
export function rangeStart(range: ProgressRange, todayIso: string): string | null {
  const d = RANGE_DAYS[range];
  if (d == null) return null;
  const [y, m, dd] = todayIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd - d + 1)).toISOString().slice(0, 10);
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Fecha calendario válida (no «2026-02-31»). */
export const isIsoDay = (s: unknown): s is string => typeof s === "string" && DAY_RE.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

// ── Peso corporal ───────────────────────────────────────────────────────────
/** Límites de una medición (20 a 400 kg): fuera de eso es un error de carga, no un peso. */
export const BODY_WEIGHT_MIN_G = 20_000, BODY_WEIGHT_MAX_G = 400_000;
export const bodyWeightOk = (g: unknown): g is number => Number.isInteger(g) && (g as number) >= BODY_WEIGHT_MIN_G && (g as number) <= BODY_WEIGHT_MAX_G;
/** Texto en la unidad de la persona («80,4» kg o «177,2» lb) → gramos, o null. Hasta 1 decimal (balanzas comunes). */
export function parseBodyWeight(s: string, unit: WeightUnit): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  const g = Math.round(unit === "kg" ? n * 1000 : (n / LB_PER_KG) * 1000);
  return bodyWeightOk(g) ? g : null;
}
/** Gramos → número en la unidad de la persona, con 1 decimal. */
export const bodyWeightIn = (g: number, unit: WeightUnit) => Math.round((unit === "kg" ? g / 1000 : (g / 1000) * LB_PER_KG) * 10) / 10;
/** «80,4 kg» / «177,2 lb». */
export const fmtBodyWeight = (g: number, unit: WeightUnit) => `${bodyWeightIn(g, unit).toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${unit}`;
/** Diferencia con signo explícito («−4 kg», «+1,5 kg», «0 kg»). */
export function fmtWeightDelta(g: number, unit: WeightUnit) {
  const v = bodyWeightIn(Math.abs(g), unit);
  if (v === 0) return `0 ${unit}`;
  return `${g < 0 ? "−" : "+"}${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${unit}`;
}

/** Medio kilo: por debajo, la meta es mantener (una variación de 300 g es ruido de la balanza, no un objetivo). */
export const MAINTAIN_BELOW_G = 500;
/** Banda de mantenimiento: ±1,5 % del objetivo, mínimo 1 kg. */
export const maintainBandG = (targetG: number) => Math.max(1000, Math.round(targetG * 0.015));

export type BodyGoalProgress =
  | { state: "insufficient"; missing: "start" | "current" | "target" }
  | { state: "maintain"; targetG: number; currentG: number; diffG: number; bandG: number; inBand: boolean }
  | { state: "toward" | "reached" | "away"; direction: "down" | "up"; startG: number; currentG: number; targetG: number;
      wantedG: number; changeG: number; alongG: number; remainingG: number; pct: number };

/**
 * Progreso hacia el objetivo de peso. Distingue el cambio de peso (`changeG`, con signo) del recorrido hacia la meta
 * (`alongG`: positivo si fue hacia la meta). `pct` va de 0 a 100: si retrocedió no se muestra un porcentaje negativo
 * (estado «away», con cuánto se alejó), y si superó la meta queda en 100 con lo que la pasó (`remainingG` negativo).
 */
export function bodyGoalProgress(p: { startG: number | null; currentG: number | null; targetG: number | null }): BodyGoalProgress {
  if (p.targetG == null) return { state: "insufficient", missing: "target" };
  if (p.startG == null) return { state: "insufficient", missing: "start" };
  if (p.currentG == null) return { state: "insufficient", missing: "current" };
  const wanted = p.targetG - p.startG;
  if (Math.abs(wanted) < MAINTAIN_BELOW_G) {
    const bandG = maintainBandG(p.targetG), diffG = p.currentG - p.targetG;
    return { state: "maintain", targetG: p.targetG, currentG: p.currentG, diffG, bandG, inBand: Math.abs(diffG) <= bandG };
  }
  const dir = wanted < 0 ? -1 : 1;
  const change = p.currentG - p.startG, along = change * dir, need = Math.abs(wanted);
  const remaining = need - along;
  const base = { direction: dir < 0 ? "down" as const : "up" as const, startG: p.startG, currentG: p.currentG, targetG: p.targetG, wantedG: wanted, changeG: change, alongG: along, remainingG: remaining };
  if (along < 0) return { ...base, state: "away", pct: 0 };
  if (remaining <= 0) return { ...base, state: "reached", pct: 100 };
  return { ...base, state: "toward", pct: Math.min(99, Math.floor((along / need) * 100)) }; // 100 sólo al llegar
}

/** Texto del progreso hacia la meta («8 kg de cambio buscado · 4 kg recorridos · 50 % del recorrido»). */
export function bodyGoalText(g: BodyGoalProgress, unit: WeightUnit): string {
  const w = (x: number) => fmtBodyWeight(Math.abs(x), unit);
  switch (g.state) {
    case "insufficient": return g.missing === "target" ? "Definí un objetivo para ver tu recorrido." : g.missing === "start" ? "Registrá tu peso para tener un punto de partida." : "Registrá tu peso actual para ver tu recorrido.";
    case "maintain": return g.inBand ? `Objetivo: mantener ${w(g.targetG)}. Estás dentro del rango (±${w(g.bandG)}).` : `Objetivo: mantener ${w(g.targetG)}. Hoy estás ${w(g.diffG)} ${g.diffG > 0 ? "por encima" : "por debajo"}.`;
    case "away": return `${w(g.wantedG)} de cambio buscado · por ahora ${w(g.alongG)} en sentido contrario. El recorrido se cuenta desde tu punto de partida.`;
    case "reached": return g.remainingG < 0 ? `Llegaste a tu objetivo y lo pasaste por ${w(g.remainingG)}.` : "Llegaste a tu objetivo.";
    case "toward": return `${w(g.wantedG)} de cambio buscado · ${w(g.alongG)} recorridos · ${g.pct} % del recorrido hacia la meta.`;
  }
}

export type WeightPoint = { day: string; weightG: number };
/** Resumen de las mediciones de un período (ordenadas por día): primera, última y variación neta. Sin datos, null. */
export function weightSummary(points: readonly WeightPoint[]) {
  if (!points.length) return null;
  const s = [...points].sort((a, b) => a.day.localeCompare(b.day));
  const first = s[0], last = s[s.length - 1];
  return { first, last, count: s.length, netG: last.weightG - first.weightG, minG: Math.min(...s.map((x) => x.weightG)), maxG: Math.max(...s.map((x) => x.weightG)) };
}
/** Peso válido para una fecha: la última medición de ese día o anterior, hasta `maxAgeDays` antes. Si no hay, null. */
export function weightAt(points: readonly WeightPoint[], day: string, maxAgeDays = 60): WeightPoint | null {
  const [y, m, d] = day.split("-").map(Number);
  const oldest = new Date(Date.UTC(y, m - 1, d - maxAgeDays)).toISOString().slice(0, 10);
  let best: WeightPoint | null = null;
  for (const p of points) if (p.day <= day && p.day >= oldest && (!best || p.day > best.day)) best = p;
  return best;
}

// ── Calorías estimadas (D199, ver docs/PERSONAL_PROGRESS_BODY_TRACKING_1.md §Calorías) ──────────────────
// Método: equivalentes metabólicos (MET) del Compendium of Physical Activities (Ainsworth et al. 2011; actualización para
// adultos de Herrmann et al. 2024). 1 MET ≈ 1 kcal por kg de peso por hora, así que kcal ≈ MET × kg × horas. Es el gasto
// TOTAL de ese tiempo (incluye lo que se gasta en reposo), para adultos. No usa series, tonelaje ni frecuencia cardíaca: no
// hay base para convertirlos en calorías. Se muestra como rango redondeado a 10 kcal, nunca como valor exacto.
// Musculación: 3,5 MET (varios ejercicios, 8–15 reps, cargas variadas) a 6,0 MET (esfuerzo vigoroso). El tiempo activo de
// REPI incluye los descansos entre series, como las sesiones que mide el Compendium.
// Cardio sin datos de velocidad ni potencia: 3,5 MET (caminata o bici suave) a 10 MET (trote o remo exigente).
// El RPE de la sesión (1–10), si se registró, achica el rango; no se inventa si falta.
export const CALORIE_MET = {
  strength: { any: [3.5, 6.0], light: [3.5, 4.3], moderate: [3.5, 5.0], hard: [5.0, 6.0] },
  cardio: { any: [3.5, 10.0], light: [3.5, 5.0], moderate: [5.0, 7.0], hard: [7.0, 10.0] },
} as const;
export const CALORIE_MIN_SEC = 5 * 60, CALORIE_MAX_SEC = 4 * 3600;
export type CalorieInput = { activeSec: number; cardioSec: number; bodyWeightG: number | null; rpe: number | null; minor: boolean; voided?: boolean };
export type CalorieEstimate =
  | { ok: true; low: number; high: number; kind: "strength" | "cardio" | "mixed"; minutes: number; bodyWeightG: number; mets: { strength: readonly [number, number] | null; cardio: readonly [number, number] | null } }
  | { ok: false; reason: "no_weight" | "too_short" | "too_long" | "minor" | "voided" | "age_unknown" };

const band = (rpe: number | null) => (rpe == null || !Number.isFinite(rpe) ? "any" : rpe <= 5 ? "light" : rpe <= 7 ? "moderate" : "hard");
export function estimateCalories(p: CalorieInput): CalorieEstimate {
  if (p.voided) return { ok: false, reason: "voided" };
  if (p.minor) return { ok: false, reason: "minor" }; // los MET de adultos no valen para menores (hay un compendio juvenil aparte)
  if (!(p.activeSec >= CALORIE_MIN_SEC)) return { ok: false, reason: "too_short" };
  if (p.activeSec > CALORIE_MAX_SEC) return { ok: false, reason: "too_long" }; // atípico: probablemente quedó abierta
  if (p.bodyWeightG == null || !bodyWeightOk(p.bodyWeightG)) return { ok: false, reason: "no_weight" };
  const cardio = Math.min(Math.max(0, p.cardioSec), p.activeSec), strength = p.activeSec - cardio;
  const kg = p.bodyWeightG / 1000, b = band(p.rpe);
  const sm = strength > 0 ? CALORIE_MET.strength[b] : null, cm = cardio > 0 ? CALORIE_MET.cardio[b] : null;
  const lo = (sm ? sm[0] * kg * (strength / 3600) : 0) + (cm ? cm[0] * kg * (cardio / 3600) : 0);
  const hi = (sm ? sm[1] * kg * (strength / 3600) : 0) + (cm ? cm[1] * kg * (cardio / 3600) : 0);
  const kind = cardio === 0 ? "strength" : strength < 0.1 * p.activeSec ? "cardio" : "mixed";
  return { ok: true, low: Math.floor(lo / 10) * 10, high: Math.ceil(hi / 10) * 10, kind, minutes: Math.round(p.activeSec / 60), bodyWeightG: p.bodyWeightG, mets: { strength: sm, cardio: cm } };
}
export const CALORIE_REASON: Record<Exclude<CalorieEstimate, { ok: true }>["reason"], string> = {
  no_weight: "Registrá tu peso corporal para estimar el gasto de tus entrenamientos.",
  too_short: "Sesión demasiado corta para estimar el gasto.",
  too_long: "Duración atípica: no estimamos el gasto de esta sesión.",
  minor: "La estimación de calorías no está disponible para menores de 18 años.",
  age_unknown: "Confirmá tu fecha de nacimiento para ver el gasto estimado (es sólo para adultos).",
  voided: "Entrenamiento anulado: no se estima.",
};
export const CALORIE_NOTE = "Estimación aproximada con valores MET de referencia, tu peso y el tiempo activo. Puede diferir bastante de tu gasto real.";

// ── Novedades de REPI (D202) ────────────────────────────────────────────────
export const ANNOUNCEMENT_KINDS = { feature: "Nueva función", improvement: "Mejora", important: "Actualización importante", guide: "Guía de uso", notice: "Aviso" } as const;
export type AnnouncementKind = keyof typeof ANNOUNCEMENT_KINDS;
/** Audiencias. «member»: alumnos y socios; «floor»: equipo de sala y recepción; «gym_admin»: dueños, gerentes y coordinación. */
export const ANNOUNCEMENT_AUDIENCES = { all: "Todas las personas", member: "Alumnos y socios", coach: "Entrenadores independientes", floor: "Equipo de sala", gym_admin: "Dueños y gerentes", admin: "REPI Admin" } as const;
export type AnnouncementAudience = keyof typeof ANNOUNCEMENT_AUDIENCES;
/** Destinos permitidos (lista cerrada: no hay enlaces libres). `area` dice en qué espacio tiene sentido. */
export const ANNOUNCEMENT_DESTS = {
  none: { area: "any", label: "Sin destino" },
  "member.progress": { area: "member", label: "Alumno · Progreso" },
  "member.progress.body": { area: "member", label: "Alumno · Progreso › Mi cuerpo" },
  "member.progress.photos": { area: "member", label: "Alumno · Progreso › Fotos" },
  "member.train": { area: "member", label: "Alumno · Entrenar" },
  "member.perfil": { area: "member", label: "Alumno · Perfil" },
  "coach.builder": { area: "coach", label: "Coach · Programas" },
  "coach.clients": { area: "coach", label: "Coach · Clientes" },
  "gym.members": { area: "gym", label: "Gimnasio · Socios" },
  "gym.equipment": { area: "gym", label: "Gimnasio · Equipamiento" },
} as const;
export type AnnouncementDest = keyof typeof ANNOUNCEMENT_DESTS;
export const isAnnouncementDest = (x: unknown): x is AnnouncementDest => typeof x === "string" && x in ANNOUNCEMENT_DESTS;
const AREA_AUDIENCE: Record<string, AnnouncementAudience[]> = { member: ["all", "member"], coach: ["all", "coach"], gym: ["all", "floor", "gym_admin"], any: Object.keys(ANNOUNCEMENT_AUDIENCES) as AnnouncementAudience[] };
export const ANNOUNCEMENT_LIMITS = { title: 80, summary: 280, cta: 30 } as const;

/** Problemas de un anuncio antes de guardarlo o publicarlo (texto plano, sin enlaces, destino coherente con la audiencia). */
export function announcementIssues(a: { title: string; summary: string; ctaLabel?: string | null; destination: string; audience: readonly string[] }): string[] {
  const out: string[] = [];
  const t = a.title.trim(), s = a.summary.trim(), c = a.ctaLabel?.trim() ?? "";
  if (t.length < 4 || t.length > ANNOUNCEMENT_LIMITS.title) out.push(`El título tiene que tener entre 4 y ${ANNOUNCEMENT_LIMITS.title} caracteres.`);
  if (s.length < 10 || s.length > ANNOUNCEMENT_LIMITS.summary) out.push(`El resumen tiene que tener entre 10 y ${ANNOUNCEMENT_LIMITS.summary} caracteres.`);
  if (c.length > ANNOUNCEMENT_LIMITS.cta) out.push(`El botón admite hasta ${ANNOUNCEMENT_LIMITS.cta} caracteres.`);
  const all = `${t} ${s} ${c}`;
  if (/[<>]/.test(all)) out.push("Sin HTML: escribí texto plano.");
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ar|net|org|io|app|ly)\b)/i.test(all)) out.push("Sin enlaces: elegí un destino dentro de REPI.");
  if (!a.audience.length || a.audience.some((x) => !(x in ANNOUNCEMENT_AUDIENCES))) out.push("Elegí al menos una audiencia válida.");
  if (!isAnnouncementDest(a.destination)) out.push("Elegí un destino de la lista.");
  else {
    const ok = AREA_AUDIENCE[ANNOUNCEMENT_DESTS[a.destination].area];
    if (a.audience.some((x) => !ok.includes(x as AnnouncementAudience))) out.push("El destino no corresponde a todas las audiencias elegidas: usá «Sin destino» o ajustá la audiencia.");
  }
  if (c && a.destination === "none") out.push("El botón necesita un destino.");
  return out;
}
/** ¿El anuncio le corresponde a alguien con estos roles? «all» le llega a todos; si tiene varios roles, una sola vez. */
export const announcementFor = (audience: readonly string[], roles: ReadonlySet<AnnouncementAudience>) => audience.includes("all") || audience.some((a) => roles.has(a as AnnouncementAudience));
