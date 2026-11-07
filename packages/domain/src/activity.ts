// Ejercicios por tiempo (pedido del titular, 07/11/2026). Cada ejercicio se configura según lo que es: la musculación sigue
// con series, repeticiones, carga y RIR; una cinta caminadora se configura SÓLO con duración (minutos), velocidad (km/h) e
// inclinación (un número, nunca «%»); otras actividades tienen sus propios campos (bici: nivel; remo: distancia y ritmo;
// elíptico: nivel; escaladora: nivel; sólo duración; aguante en segundos).
//
// Modelo (sin migrar programas): la duración sigue en `reps` («10 min» o «600 s») y lo propio de la actividad va en
// `detail.activity` ({ perfil, velocidad, inclinación, nivel… }), congelado en la versión como el resto del detalle. Así todo lo
// que ya entiende «por tiempo» (métricas, volumen, 1RM, objetivos, progreso, la app vieja en caché) sigue funcionando: una app
// anterior muestra «1 × 10 min». Al registrar, los segundos siguen en `reps` y los valores reales de la actividad van aparte
// (`metrics`, validados con `cleanSetMetrics`).
//
// Perfil de un ejercicio (`profileOf`): el guardado en el ejercicio → el del catálogo → el que se deduce del nombre → el tipo de
// registro (`kind`). Funciones puras; las usan el servidor, los editores y el teléfono sin conexión.
import { EXERCISE_CATALOG, exerciseKey } from "./exercise-catalog";
import { guessProfile } from "./exercise-guess";
import type { ExerciseDetail } from "./prescription";
import type { ExerciseKind } from "./session-changes";
import { mainSets } from "./stages";
import { formatRest, parseReps, repsText } from "./training";

// ── Perfiles ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const METRICS_PROFILES = ["strength", "bodyweight", "hold", "treadmill", "bike", "rower", "elliptical", "stair", "duration"] as const;
export type MetricsProfile = (typeof METRICS_PROFILES)[number];
/** Actividades: se configuran por duración (y sus propios campos), sin series × repeticiones, carga ni RIR. */
export const ACTIVITY_PROFILES = ["treadmill", "bike", "rower", "elliptical", "stair", "duration"] as const;
export type ActivityProfile = (typeof ACTIVITY_PROFILES)[number];
export const isMetricsProfile = (x: unknown): x is MetricsProfile => typeof x === "string" && (METRICS_PROFILES as readonly string[]).includes(x);
export const isActivityProfile = (x: unknown): x is ActivityProfile => typeof x === "string" && (ACTIVITY_PROFILES as readonly string[]).includes(x);

export const METRICS_PROFILE_LABEL: Record<MetricsProfile, string> = {
  strength: "Peso y repeticiones", bodyweight: "Peso corporal (repeticiones)", hold: "Aguante en segundos",
  treadmill: "Cinta", bike: "Bici", rower: "Remo", elliptical: "Elíptico", stair: "Escaladora", duration: "Sólo duración",
};
/** Qué se configura con cada perfil (ayuda breve para el editor y el alta de un ejercicio propio). */
export const METRICS_PROFILE_HINT: Record<MetricsProfile, string> = {
  strength: "Series, repeticiones, carga y RIR.",
  bodyweight: "Series, repeticiones y RIR, sin carga.",
  hold: "Series de segundos (plancha, sentadilla en pared).",
  treadmill: "Duración, velocidad (km/h) e inclinación.",
  bike: "Duración y nivel; cadencia opcional.",
  rower: "Duración o distancia; ritmo cada 500 m y nivel opcionales.",
  elliptical: "Duración y nivel; inclinación opcional.",
  stair: "Duración y nivel.",
  duration: "Sólo la duración.",
};
/** Cómo se registra un perfil: las actividades y el aguante son «por tiempo». */
export const kindOfProfile = (p: MetricsProfile): ExerciseKind => (p === "strength" ? "load_reps" : p === "bodyweight" ? "bodyweight" : "time");
/** Perfil por defecto de un tipo de registro: «por tiempo» en Cardio es sólo duración; en el resto, aguante (series de segundos). */
export const profileFromKind = (kind: string | null | undefined, group?: string | null): MetricsProfile =>
  kind === "bodyweight" ? "bodyweight" : kind === "time" ? (group === "Cardio" ? "duration" : "hold") : "strength";

let catalogMap: Map<string, MetricsProfile> | null = null;
/** Perfil de un ejercicio del catálogo de REPI por su nombre (sin tildes ni mayúsculas); null si no es del catálogo. */
export function catalogProfile(name: string | null | undefined): MetricsProfile | null {
  if (!name) return null;
  catalogMap ??= new Map(EXERCISE_CATALOG.map(([n, , , p]) => [exerciseKey(n), p]));
  return catalogMap.get(exerciseKey(name)) ?? null;
}

export type ProfileSource = { profile?: string | null; metricsProfile?: string | null; name?: string | null; kind?: string | null; muscleGroup?: string | null; group?: string | null };
/**
 * Perfil de métricas de un ejercicio: el guardado en el ejercicio → el del catálogo → el que se deduce del nombre (una «Cinta
 * caminadora» propia creada como «peso y repeticiones» se configura igual como cinta) → el tipo de registro. El aguante por nombre
 * («Plancha con peso») sólo se usa si el ejercicio se registra por tiempo.
 */
export function profileOf(ex: ProfileSource): MetricsProfile {
  const stored = ex.profile ?? ex.metricsProfile;
  if (isMetricsProfile(stored)) return stored;
  const cat = catalogProfile(ex.name);
  if (cat) return cat;
  const g = ex.name ? guessProfile(ex.name) : null;
  if (g && (isActivityProfile(g) || ex.kind == null || ex.kind === "time")) return g;
  return profileFromKind(ex.kind, ex.muscleGroup ?? ex.group);
}
/** Perfil sugerido al crear un ejercicio propio, sólo por el nombre (la persona lo cambia con un toque). */
export function guessMetricsProfile(name: string, kind?: ExerciseKind | null): MetricsProfile {
  return guessProfile(name) ?? profileFromKind(kind ?? null);
}

// ── Campos de cada actividad ───────────────────────────────────────────────────────────────────────────────────────────
export type ActivityField = "speedKmh" | "incline" | "level" | "distanceM" | "pace500Sec" | "cadenceRpm";
export type ActivityValues = Partial<Record<ActivityField, number | null>>;
/** Lo que indica el profe en una actividad (dentro de `detail.activity`). La duración sigue en `reps`. */
export type ActivityDetail = { profile: ActivityProfile } & ActivityValues;
/** Lo que registró la persona en una actividad (`set_log.metrics`). La duración real sigue en `reps`, en segundos. */
export type SetMetrics = ActivityValues;

export const ACTIVITY_FIELDS: readonly ActivityField[] = ["speedKmh", "incline", "level", "distanceM", "pace500Sec", "cadenceRpm"];
/** Rangos y pasos de cada campo. La inclinación es un número (1, 2, 3…), sin «%». */
export const ACTIVITY_FIELD_SPEC: Record<ActivityField, { label: string; unit: string | null; min: number; max: number; step: number; error: string }> = {
  speedKmh: { label: "Velocidad", unit: "km/h", min: 0.5, max: 25, step: 0.1, error: "La velocidad va de 0,5 a 25 km/h." },
  incline: { label: "Inclinación", unit: null, min: -5, max: 40, step: 0.5, error: "La inclinación es un número de -5 a 40 (sin %)." },
  level: { label: "Nivel", unit: null, min: 1, max: 30, step: 1, error: "El nivel va de 1 a 30." },
  distanceM: { label: "Distancia", unit: "m", min: 10, max: 42195, step: 1, error: "La distancia va de 10 a 42195 m." },
  pace500Sec: { label: "Ritmo cada 500 m", unit: null, min: 60, max: 600, step: 1, error: "El ritmo cada 500 m va de 1:00 a 10:00." },
  cadenceRpm: { label: "Cadencia", unit: "rpm", min: 20, max: 200, step: 1, error: "La cadencia va de 20 a 200 rpm." },
};
/** Campos que muestra cada actividad, además de la duración. */
export const PROFILE_FIELDS: Record<ActivityProfile, readonly ActivityField[]> = {
  treadmill: ["speedKmh", "incline"],
  bike: ["level", "cadenceRpm"],
  rower: ["distanceM", "pace500Sec", "level"],
  elliptical: ["level", "incline"],
  stair: ["level"],
  duration: [],
};
/** Tope de una actividad registrada o indicada: 4 horas (una serie por tiempo común, como una plancha, sigue en 1 hora). */
export const ACTIVITY_MAX_SEC = 4 * 3600;

/** Redondea al paso (0,1 · 0,5 · 1) multiplicando por su inversa: 5,55 → 5,6 (dividir por 0,1 da 55,4999… y bajaría a 5,5). */
const toStep = (v: number, step: number) => { const k = Math.round(1 / step); return Math.round(v * k) / k; };
/** Número escrito o tipeado: 5, «5», «5,5». Vacío = null; texto que no es un número = NaN. */
function numOf(x: unknown): number | null {
  if (x == null || x === "") return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : NaN;
  if (typeof x === "string") {
    const s = x.trim().replace(",", ".");
    if (!s) return null;
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }
  return NaN;
}

/** Valores de los campos del perfil, en rango y redondeados a su paso. Los campos de otro perfil se descartan. */
export function cleanActivityValues(profile: ActivityProfile, raw: unknown): { ok: true; values: ActivityValues } | { ok: false; field: ActivityField; error: string } {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values: ActivityValues = {};
  for (const f of PROFILE_FIELDS[profile]) {
    const spec = ACTIVITY_FIELD_SPEC[f];
    const v = numOf(src[f]);
    if (v == null) continue;
    if (Number.isNaN(v) || v < spec.min || v > spec.max) return { ok: false, field: f, error: spec.error };
    values[f] = toStep(v, spec.step);
  }
  return { ok: true, values };
}

/**
 * Distancia escrita en las repeticiones («500 m», «2 km», «750 metros») en metros; null si no es una distancia. Una «m» sola
 * con menos de 100 es ambigua y se lee como minutos («20 m» = 20 minutos, como en `parseReps`).
 */
export function parseDistance(text: string | null | undefined): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(m|mts|metros?|km|kms|kil[oó]metros?)$/i.exec((text ?? "").trim());
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (m[2].toLowerCase() === "m" && n < 100) return null;
  const meters = Math.round(/^k/i.test(m[2]) ? n * 1000 : n);
  return meters > 0 ? meters : null;
}
/** Distancia indicada en `reps` para esa actividad (sólo el remo se indica por distancia); null si es una duración. */
export const repsDistance = (profile: ActivityProfile, reps: string | null | undefined) => (profile === "rower" ? parseDistance(reps) : null);

/**
 * Valida y normaliza lo que indica el profe en una actividad. Con `reps`, revisa también la duración: tiene que ser un tiempo
 * («10 min», «600 s», «90 min») de hasta 4 horas; en el remo vale también una distancia («500 m», «2 km»), que queda como la
 * distancia indicada.
 */
export function validateActivity(raw: unknown, o: { reps?: string | null } = {}): { ok: true; activity: ActivityDetail } | { ok: false; error: string } {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!src || !isActivityProfile(src.profile)) return { ok: false, error: "Elegí el tipo de actividad (cinta, bici, remo, elíptico, escaladora o sólo duración)." };
  const profile = src.profile;
  const v = cleanActivityValues(profile, src);
  if (!v.ok) return { ok: false, error: v.error };
  const activity: ActivityDetail = { profile, ...v.values };
  if (o.reps != null) {
    // Remo por distancia primero: «500 m» son metros (no 500 minutos).
    const d = repsDistance(profile, o.reps);
    const t = parseReps(o.reps);
    if (d != null) {
      if (d < ACTIVITY_FIELD_SPEC.distanceM.min || d > ACTIVITY_FIELD_SPEC.distanceM.max) return { ok: false, error: ACTIVITY_FIELD_SPEC.distanceM.error };
      activity.distanceM = d;
    } else if (t.kind === "time") {
      if (t.seconds < 1 || t.seconds > ACTIVITY_MAX_SEC) return { ok: false, error: "La duración va de 1 segundo a 4 horas." };
    } else {
      return { ok: false, error: profile === "rower" ? "Indicá la duración (por ejemplo, 10 min) o la distancia (500 m)." : "Indicá la duración en minutos (por ejemplo, 10 min)." };
    }
  }
  return { ok: true, activity };
}

/** La actividad de un detalle (null si no tiene o si no es válida). */
export const activityOf = (d: { activity?: unknown } | null | undefined): ActivityDetail | null => {
  const a = d?.activity as ActivityDetail | null | undefined;
  return a && isActivityProfile(a.profile) ? a : null;
};

/**
 * Predicado único de «fila por tiempo»: sus `reps` son segundos (o una duración), no cuentan para volumen, 1RM ni récords, y
 * nunca se multiplican por kilos. Una actividad configurada cuenta como tiempo aunque `reps` diga «500 m» (remo por distancia).
 * Reemplaza las copias que deducían lo mismo del texto de las repeticiones en cada pantalla e informe.
 */
export function isTimedRow(e: { reps?: string | null; detail?: { activity?: unknown } | null }): boolean {
  if (activityOf(e.detail)) return true;
  return !!e.reps && parseReps(e.reps).kind === "time";
}

// ── Valores por defecto al agregar un ejercicio ────────────────────────────────────────────────────────────────────────
export type ProfileDefaults = { sets: number; reps: string; rir: number | null; restSec: number; activity: ActivityDetail | null };
/**
 * Lo que propone REPI al agregar un ejercicio con ese perfil. Musculación: 3 × 8-12, RIR 2; aguante: 3 × 40 s; una actividad:
 * un bloque de 10 minutos (5 en «sólo duración»), sin RIR ni descanso, con valores de partida que el profe ajusta.
 */
export function defaultsFor(profile: MetricsProfile): ProfileDefaults {
  switch (profile) {
    case "strength": case "bodyweight": return { sets: 3, reps: "8-12", rir: 2, restSec: 90, activity: null };
    case "hold": return { sets: 3, reps: "40 s", rir: null, restSec: 90, activity: null };
    case "treadmill": return { sets: 1, reps: "10 min", rir: null, restSec: 0, activity: { profile, speedKmh: 5, incline: 0 } };
    case "bike": case "elliptical": case "stair": return { sets: 1, reps: "10 min", rir: null, restSec: 0, activity: { profile, level: 5 } };
    case "rower": return { sets: 1, reps: "10 min", rir: null, restSec: 0, activity: { profile } };
    case "duration": return { sets: 1, reps: "5 min", rir: null, restSec: 0, activity: { profile } };
  }
}

// ── Registro de la persona ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Valores reales de una actividad (velocidad, inclinación, nivel…) para guardar con la serie. Sólo los campos del perfil, en
 * rango y redondeados a su paso; vacío = null. Un ejercicio que no es una actividad no guarda métricas (null).
 */
export function cleanSetMetrics(profile: MetricsProfile | null | undefined, raw: unknown): { ok: true; metrics: SetMetrics | null } | { ok: false; field: ActivityField; error: string } {
  if (raw == null || !isActivityProfile(profile)) return { ok: true, metrics: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, field: PROFILE_FIELDS[profile][0] ?? "level", error: "Los datos de la actividad no son válidos." };
  const v = cleanActivityValues(profile, raw);
  if (!v.ok) return v;
  return { ok: true, metrics: Object.keys(v.values).length ? v.values : null };
}

const canon = (m: SetMetrics | null | undefined) => {
  const out: [string, number][] = [];
  for (const f of ACTIVITY_FIELDS) { const v = m?.[f]; if (v != null) out.push([f, v]); }
  return JSON.stringify(out);
};
/** Igualdad de métricas sin importar el orden de las claves; vacío, null y {} son lo mismo. */
export const sameMetrics = (a: SetMetrics | null | undefined, b: SetMetrics | null | undefined) => canon(a) === canon(b);

// ── Texto ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const dec = (n: number) => String(n).replace(".", ",");
/** Un valor con su unidad: «5,5 km/h», «incl. 3», «nivel 8», «2000 m», «2:05 /500 m», «80 rpm». */
export function activityFieldText(f: ActivityField, v: number): string {
  switch (f) {
    case "speedKmh": return `${dec(v)} km/h`;
    case "incline": return `incl. ${dec(v)}`;
    case "level": return `nivel ${dec(v)}`;
    case "distanceM": return `${v} m`;
    case "pace500Sec": return `${formatRest(v)} /500 m`;
    case "cadenceRpm": return `${v} rpm`;
  }
}
/** Valores de una actividad o de un registro, en el orden del perfil: «5 km/h · incl. 3». Sin valores, «». */
export function activityValuesText(v: ActivityValues | null | undefined, o: { skip?: ActivityField[] } = {}): string {
  return ACTIVITY_FIELDS.filter((f) => v?.[f] != null && !o.skip?.includes(f)).map((f) => activityFieldText(f, v![f]!)).join(" · ");
}

/**
 * La prescripción tal como se lee en las tarjetas, resúmenes y fichas. Actividad: «10 min · 5 km/h · incl. 3» (con varias
 * vueltas, «3 × 5 min · nivel 8»); remo por distancia: «500 m · 2:05 /500 m». Musculación y aguante: «3 × 8-12», «3 × 40 s»
 * (con `rir`, «3 × 8-12 · RIR 2»).
 */
export function prescriptionText(e: { sets: number; reps: string; rir?: number | null; detail?: ExerciseDetail | null }, o: { rir?: boolean } = {}): string {
  const a = activityOf(e.detail);
  if (a) {
    const dist = repsDistance(a.profile, e.reps);
    const head = `${e.sets > 1 ? `${e.sets} × ` : ""}${dist != null ? `${dist} m` : repsText(e.reps)}`;
    return [head, activityValuesText(a, { skip: dist != null ? ["distanceM"] : [] })].filter(Boolean).join(" · ");
  }
  const sets = e.detail ? mainSets(e.detail, e.sets) : e.sets;
  return `${sets} × ${repsText(e.reps)}${o.rir && e.rir != null ? ` · RIR ${e.rir}` : ""}`;
}
