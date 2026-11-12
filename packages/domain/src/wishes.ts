// Perfil de entrenamiento (D139 → D217 «Training Profile»). UNA sola fuente de verdad: `user_pref.wishes`. Lo usan Adaptive
// Coaching (contexto del cerebro), Training Intelligence (sólo dentro de sus reglas), «No vino el profe», rutinas propias, el
// asistente de programas, el pedido de programa, Progreso y las metas semanales. No es un dato de salud: las molestias y
// lesiones van por «Molestia» y sus consentimientos; acá no se guarda nada médico.
//
// D217: además de lo que la persona busca (objetivo, días, minutos, gustos), guarda experiencia declarada, distribución semanal,
// ejercicios preferidos y que no le gustan, equipamiento y restricciones NO médicas. Cada valor lleva su procedencia (`meta.fields`:
// por dónde se declaró y cuándo), el perfil una versión que sube con cada cambio real y un estado de completitud explícito
// (completo, parcial o sin información). Nada se completa solo con valores genéricos: lo que falta, falta.

export const TRAINING_WISH_GOALS = {
  muscle: "Ganar músculo",
  strength: "Ganar fuerza",
  sport: "Rendir en un deporte",
  endurance: "Mejorar la resistencia",
  health: "Salud y condición física",
  habit: "Sostener el hábito",
  fat_loss: "Bajar grasa",
} as const;
export type TrainingWishGoal = keyof typeof TRAINING_WISH_GOALS;
/** Ayuda breve de cada objetivo (en palabras simples). */
export const GOAL_HELP: Record<TrainingWishGoal, string> = {
  muscle: "Aumentar masa muscular (hipertrofia).",
  strength: "Poder levantar más en los ejercicios principales.",
  sport: "Entrenar para rendir mejor en tu deporte.",
  endurance: "Aguantar más tiempo o más repeticiones.",
  health: "Sentirte mejor y mantener una buena condición general.",
  habit: "Moverte con regularidad y que entrenar sea parte de tu semana.",
  fat_loss: "Bajar grasa corporal entrenando.",
};
/** Objetivos que hablan del cuerpo: sólo personas adultas con edad confirmada (política de menores). */
export const ADULT_ONLY_GOALS: readonly TrainingWishGoal[] = ["fat_loss"];
export const goalAllowed = (g: TrainingWishGoal, age: "adult" | "minor" | "unknown") => age === "adult" || !ADULT_ONLY_GOALS.includes(g);

/** Experiencia DECLARADA (nunca inferida de las cargas ni de años que no se declararon). */
export const EXPERIENCE_LEVELS = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
} as const;
export type Experience = keyof typeof EXPERIENCE_LEVELS;
export const EXPERIENCE_HELP: Record<Experience, string> = {
  beginner: "Empezás o volvés después de mucho tiempo. Todavía estás aprendiendo la técnica de los ejercicios.",
  intermediate: "Entrenás con regularidad hace unos meses y ya conocés la técnica de los ejercicios básicos.",
  advanced: "Entrenás hace años de forma constante, seguís una planificación y sabés regular tu esfuerzo.",
};

export const SPLIT_PREFS = {
  full_body: "Cuerpo completo",
  upper_lower: "Tren superior e inferior",
  by_muscle: "Por grupos musculares",
  any: "Me da igual",
} as const;
export type SplitPref = keyof typeof SPLIT_PREFS;

export const PROFILE_EQUIPMENT = {
  full_gym: "Gimnasio completo",
  machines: "Máquinas",
  barbell: "Barra y discos",
  dumbbells: "Mancuernas",
  cables: "Poleas",
  bands: "Bandas elásticas",
  bodyweight: "Sólo mi peso corporal",
} as const;
export type ProfileEquipment = keyof typeof PROFILE_EQUIPMENT;

/** Días de la semana (0 = lunes … 6 = domingo). */
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export type ExerciseNameRef = { id: string; name: string };
export type ProfileField = "goal" | "experience" | "daysPerWeek" | "minutes" | "weekdays" | "split" | "equipment" | "favorites" | "dislikes" | "likes" | "avoid" | "limits" | "shareWithTrainers";
/** Por dónde se declaró un valor (procedencia). Todo lo de este perfil lo declara la persona; nunca otra persona ni la IA. */
export type ProfileVia = "profile" | "onboarding" | "routines" | "import" | "solo" | "coach_absent" | "brain" | "program_request" | "progress";
export const PROFILE_VIAS: readonly ProfileVia[] = ["profile", "onboarding", "routines", "import", "solo", "coach_absent", "brain", "program_request", "progress"];
export type ProfileMeta = { version: number; updatedAt: string; fields: Partial<Record<ProfileField, { via: ProfileVia; at: string }>> };

export type TrainingWishes = {
  goal: TrainingWishGoal | null; daysPerWeek: number | null; minutes: number | null; likes: string | null; avoid: string | null;
  /** D147: que lo vea quien arma la rutina (coach o equipo del gym). Apagado si no lo eligió; datos guardados antes no lo traen. */
  shareWithTrainers?: boolean;
  // ── D217 (opcionales: perfiles guardados antes no los traen) ──
  experience?: Experience | null;
  weekdays?: number[] | null;
  split?: SplitPref | null;
  equipment?: ProfileEquipment[] | null;
  favorites?: ExerciseNameRef[] | null;
  dislikes?: ExerciseNameRef[] | null;
  /** Restricciones NO médicas («los martes no puedo», «no hay barra en mi gym»). */
  limits?: string | null;
  meta?: ProfileMeta | null;
};
export const WISH_TEXT_MAX = 200;
export const PROFILE_LIST_MAX = 12;
export const emptyWishes = (): TrainingWishes => ({
  goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null, shareWithTrainers: false,
  experience: null, weekdays: null, split: null, equipment: null, favorites: null, dislikes: null, limits: null, meta: null,
});

const text = (v: unknown) => {
  if (v == null) return null;
  if (typeof v !== "string") throw new Error("Texto inválido.");
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > WISH_TEXT_MAX) throw new Error(`Hasta ${WISH_TEXT_MAX} caracteres.`);
  return t || null;
};
const int = (v: unknown, min: number, max: number, what: string) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what}: entre ${min} y ${max}.`);
  return n;
};
const oneOf = <K extends string>(v: unknown, keys: Record<K, unknown>, msg: string): K | null => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !(v in keys)) throw new Error(msg);
  return v as K;
};
const someOf = <K extends string>(v: unknown, keys: Record<K, unknown>, msg: string): K[] | null => {
  if (v == null) return null;
  if (!Array.isArray(v)) throw new Error(msg);
  const out = [...new Set(v.map((x) => oneOf(x, keys, msg)).filter((x): x is K => x != null))];
  return out.length ? out : null;
};
const days = (v: unknown): number[] | null => {
  if (v == null) return null;
  if (!Array.isArray(v) || v.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Días de la semana inválidos.");
  const out = [...new Set(v as number[])].sort((a, b) => a - b);
  return out.length ? out : null;
};
const ID_RE = /^[\w-]{1,64}$/;
const refs = (v: unknown): ExerciseNameRef[] | null => {
  if (v == null) return null;
  if (!Array.isArray(v)) throw new Error("Lista de ejercicios inválida.");
  if (v.length > PROFILE_LIST_MAX) throw new Error(`Hasta ${PROFILE_LIST_MAX} ejercicios.`);
  const out: ExerciseNameRef[] = [];
  for (const x of v) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !ID_RE.test(o.id) || typeof o.name !== "string") throw new Error("Lista de ejercicios inválida.");
    if (!out.some((e) => e.id === o.id)) out.push({ id: o.id, name: o.name.replace(/\s+/g, " ").trim().slice(0, 80) });
  }
  return out.length ? out : null;
};

/** Campos que se pueden declarar (todo menos `meta`). */
export const TRAINING_PROFILE_FIELDS: readonly ProfileField[] = ["goal", "experience", "daysPerWeek", "minutes", "weekdays", "split", "equipment", "favorites", "dislikes", "likes", "avoid", "limits", "shareWithTrainers"];
const CLEAN: Record<ProfileField, (v: unknown) => unknown> = {
  goal: (v) => oneOf(v, TRAINING_WISH_GOALS, "Elegí un objetivo de la lista."),
  experience: (v) => oneOf(v, EXPERIENCE_LEVELS, "Elegí tu experiencia de la lista."),
  daysPerWeek: (v) => int(v, 1, 7, "Días por semana"),
  minutes: (v) => int(v, 15, 240, "Minutos por entrenamiento"),
  weekdays: days,
  split: (v) => oneOf(v, SPLIT_PREFS, "Elegí una distribución de la lista."),
  equipment: (v) => someOf(v, PROFILE_EQUIPMENT, "Equipamiento inválido."),
  favorites: refs,
  dislikes: refs,
  likes: text,
  avoid: text,
  limits: text,
  shareWithTrainers: (v) => v === true,
};

/**
 * Valida y normaliza un perfil COMPLETO (lo que manda la pantalla de Perfil). Campos ausentes quedan vacíos. Devuelve
 * `{ ok: false, error }` con un mensaje para mostrar.
 */
export function cleanWishes(input: unknown): { ok: true; wishes: TrainingWishes } | { ok: false; error: string } {
  const x = (input ?? {}) as Record<string, unknown>;
  try {
    const w = {
      goal: CLEAN.goal(x.goal), daysPerWeek: CLEAN.daysPerWeek(x.daysPerWeek), minutes: CLEAN.minutes(x.minutes),
      likes: CLEAN.likes(x.likes), avoid: CLEAN.avoid(x.avoid), shareWithTrainers: x.shareWithTrainers === true,
    } as TrainingWishes;
    // D217: los campos nuevos sólo aparecen si se mandaron (los perfiles anteriores conservan su forma).
    for (const f of ["experience", "weekdays", "split", "equipment", "favorites", "dislikes", "limits"] as const) if (f in x) (w as Record<string, unknown>)[f] = CLEAN[f](x[f]);
    return { ok: true, wishes: w };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Valida un cambio PARCIAL (sólo los campos presentes). Para los formularios contextuales que preguntan lo que falta. */
export function cleanProfilePatch(input: unknown): { ok: true; patch: Partial<TrainingWishes> } | { ok: false; error: string } {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Datos inválidos." };
  const x = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  try {
    for (const k of Object.keys(x)) {
      if (!(TRAINING_PROFILE_FIELDS as readonly string[]).includes(k)) throw new Error("Campo desconocido.");
      patch[k] = CLEAN[k as ProfileField](x[k]);
    }
    return { ok: true, patch: patch as Partial<TrainingWishes> };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Normaliza lo guardado (jsonb de cualquier época) sin lanzar: lo inválido se descarta. */
export function readWishes(raw: unknown): TrainingWishes | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const x = raw as Record<string, unknown>;
  const out = emptyWishes();
  for (const f of TRAINING_PROFILE_FIELDS) {
    try { (out as Record<string, unknown>)[f] = CLEAN[f](x[f]); } catch { /* valor viejo inválido: queda vacío */ }
  }
  const m = x.meta as ProfileMeta | null | undefined;
  out.meta = m && typeof m === "object" && Number.isInteger(m.version) && typeof m.updatedAt === "string" ? { version: m.version, updatedAt: m.updatedAt, fields: m.fields && typeof m.fields === "object" ? m.fields : {} } : null;
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/**
 * Aplica un cambio (validado) sobre el perfil actual: sólo cambia lo que llega, registra la procedencia de cada campo que
 * cambió y sube la versión si cambió algo. `changed` vacío = nada nuevo (no hay que invalidar nada).
 */
export function mergeProfile(cur: TrainingWishes | null, patch: Partial<TrainingWishes>, via: ProfileVia, now = new Date()): { wishes: TrainingWishes; changed: ProfileField[] } {
  const base = cur ? { ...emptyWishes(), ...cur } : emptyWishes();
  const changed: ProfileField[] = [];
  const next = { ...base } as Record<string, unknown>;
  for (const f of TRAINING_PROFILE_FIELDS) {
    if (!(f in patch)) continue;
    const v = (patch as Record<string, unknown>)[f];
    if (same(v, (base as Record<string, unknown>)[f])) continue;
    next[f] = v;
    changed.push(f);
  }
  if (!changed.length) return { wishes: base, changed };
  const at = now.toISOString();
  const fields = { ...(base.meta?.fields ?? {}) };
  for (const f of changed) fields[f] = { via, at };
  next.meta = { version: (base.meta?.version ?? 0) + 1, updatedAt: at, fields } satisfies ProfileMeta;
  return { wishes: next as TrainingWishes, changed };
}

export const hasWishes = (w: TrainingWishes | null | undefined) =>
  !!w && [w.goal, w.daysPerWeek, w.minutes, w.likes, w.avoid, w.experience, w.limits].some((v) => v != null)
    || !!w?.weekdays?.length || !!w?.split || !!w?.equipment?.length || !!w?.favorites?.length || !!w?.dislikes?.length;

// ── Completitud ────────────────────────────────────────────────────────────
/** Lo esencial para presentar una recomendación como personalizada: objetivo, experiencia, días y minutos. */
export const ESSENTIAL_FIELDS: readonly ProfileField[] = ["goal", "experience", "daysPerWeek", "minutes"];
export type ProfileStatus = "complete" | "partial" | "none";
export const PROFILE_STATUS_TEXT: Record<ProfileStatus, string> = {
  complete: "Perfil completo para recomendaciones personalizadas",
  partial: "Perfil parcial",
  none: "Sin información suficiente",
};
export const FIELD_TEXT: Record<ProfileField, string> = {
  goal: "tu objetivo", experience: "tu experiencia", daysPerWeek: "cuántos días por semana querés entrenar", minutes: "cuánto tiempo tenés por sesión",
  weekdays: "qué días preferís", split: "cómo preferís repartir la semana", equipment: "con qué equipamiento contás", favorites: "tus ejercicios preferidos",
  dislikes: "los ejercicios que no te gustan", likes: "cómo te gusta entrenar", avoid: "qué preferís evitar", limits: "tus restricciones", shareWithTrainers: "si se comparte",
};
export function profileStatus(w: TrainingWishes | null | undefined, age: "adult" | "minor" | "unknown" = "adult"): { status: ProfileStatus; missing: ProfileField[]; filled: ProfileField[] } {
  const usable = (f: ProfileField) => {
    if (!w) return false;
    if (f === "goal") return w.goal != null && goalAllowed(w.goal, age);
    return (w as Record<string, unknown>)[f] != null;
  };
  const missing = ESSENTIAL_FIELDS.filter((f) => !usable(f));
  const filled = ESSENTIAL_FIELDS.filter(usable);
  return { status: !missing.length ? "complete" : filled.length ? "partial" : "none", missing, filled };
}

/** Lo que usa el motor (sin textos libres ni datos que no aportan a la decisión). */
export type PersonalProfile = {
  goal: TrainingWishGoal | null; experience: Experience | null; daysPerWeek: number | null; minutes: number | null;
  equipment: ProfileEquipment[]; status: ProfileStatus; version: number;
};
export function personalProfile(w: TrainingWishes | null | undefined, age: "adult" | "minor" | "unknown" = "adult"): PersonalProfile {
  const st = profileStatus(w, age);
  return {
    goal: w?.goal && goalAllowed(w.goal, age) ? w.goal : null, experience: w?.experience ?? null, daysPerWeek: w?.daysPerWeek ?? null, minutes: w?.minutes ?? null,
    equipment: w?.equipment ?? [], status: st.status, version: w?.meta?.version ?? 0,
  };
}

/** Lo que ve quien arma la rutina (D147): sólo si la persona lo compartió y completó algo. Nunca la preferencia en sí. */
export function sharedWishes(w: TrainingWishes | null | undefined) {
  if (!w || w.shareWithTrainers !== true || !hasWishes(w)) return null;
  const base = { goal: w.goal ? TRAINING_WISH_GOALS[w.goal] : null, daysPerWeek: w.daysPerWeek, minutes: w.minutes, likes: w.likes, avoid: w.avoid };
  // D217: lo nuevo se agrega sólo si está declarado (los pedidos ya armados no cambian de forma).
  const extra: Record<string, unknown> = {};
  if (w.experience) extra.experience = EXPERIENCE_LEVELS[w.experience];
  if (w.weekdays?.length) extra.weekdays = w.weekdays.map((d) => WEEKDAYS_SHORT[d]).join(", ");
  if (w.split) extra.split = SPLIT_PREFS[w.split];
  if (w.equipment?.length) extra.equipment = w.equipment.map((e) => PROFILE_EQUIPMENT[e]).join(", ");
  if (w.favorites?.length) extra.favorites = w.favorites.map((e) => e.name).join(", ");
  if (w.dislikes?.length) extra.dislikes = w.dislikes.map((e) => e.name).join(", ");
  if (w.limits) extra.limits = w.limits;
  return { ...base, ...extra } as typeof base & { experience?: string; weekdays?: string; split?: string; equipment?: string; favorites?: string; dislikes?: string; limits?: string };
}
