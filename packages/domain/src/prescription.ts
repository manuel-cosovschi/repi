// Prescripción avanzada de un ejercicio (D134). Pedido de entrenadores de sala y personal trainers: combinar ejercicios,
// drop sets, top sets, peso por serie y editar cada serie (subir, bajar, descanso, intensidad), tempo, variantes y rangos.
// Todo es opcional: sin `detail` el ejercicio sigue siendo «N series × reps» como antes.
// D183 (bloques y etapas): el plan sigue siendo una lista plana de filas registrables (cada fila es un `setIndex`, así el
// registro, la sincronización y la cola offline no cambian), pero cada fila dice a qué serie principal pertenece (`block`)
// y qué etapa es dentro de ella (`stage`: 0 = la serie principal; 1..K = drops, mini series o bloques de cluster
// conectados). `id` es la identidad estable de la fila entre versiones. Los planes anteriores sin esos datos se leen con
// `normalizePlan` (stages.ts) sin migrar nada. `program_exercise.sets` sigue siendo la cantidad de filas registrables; las
// series principales se cuentan con `planBlocks`.
import { MAX_BLOCKS, MAX_PLAN_ROWS, MAX_STAGES, applyMethod, comboStep, defaultSelection, newSpecId, normalizePlan, stageLabel } from "./stages";

export type SetKind = "warmup" | "work" | "top" | "backoff" | "drop" | "amrap" | "failure" | "rest_pause" | "cluster";
export const SET_KIND_LABEL: Record<SetKind, string> = {
  warmup: "Aproximación", work: "Efectiva", top: "Top set", backoff: "Back-off", drop: "Drop", amrap: "AMRAP", failure: "Al fallo", rest_pause: "Rest-pause", cluster: "Cluster",
};
export type SetSpec = {
  kind: SetKind; reps: string; weightKg: number | null; pct1rm: number | null; rir: number | null; rpe: number | null;
  /** En una serie principal: descanso al terminar la serie (null = el del ejercicio). En una etapa: pausa antes de la etapa (un drop, 0). */
  restSec: number | null;
  note: string | null;
  /** D183: identidad estable de la fila (no cambia al reordenar ni al agregar etapas). Las filas anteriores usan `r<índice>`. */
  id?: string;
  /** D183: serie principal (bloque) a la que pertenece la fila, desde 0. */
  block?: number;
  /** D183: 0 = serie principal; 1..K = etapa conectada (drop, mini serie, bloque de cluster). */
  stage?: number;
  /** D183: AMRAP por tiempo: duración en segundos (sin duración, el AMRAP es por repeticiones en una serie). */
  durationSec?: number | null;
  /** D183: qué se registra en un AMRAP por tiempo: repeticiones totales o rondas. */
  countUnit?: "reps" | "rounds" | null;
  /** D183: agrupación heredada que no se puede deducir con certeza (clusters anteriores): pendiente de que la confirme el profe. */
  review?: boolean;
};

export type Technique = "straight" | "top_backoff" | "drop_set" | "pyramid" | "reverse_pyramid" | "rest_pause" | "myo_reps" | "cluster" | "amrap_last" | "amrap_time" | "emom" | "custom";
export const TECHNIQUES: Record<Technique, { label: string; what: string }> = {
  straight: { label: "Series rectas", what: "Mismas repeticiones y carga en todas las series." },
  top_backoff: { label: "Top set + back-off", what: "Una serie pesada y después series más livianas con más repeticiones." },
  drop_set: { label: "Drop set", what: "Al terminar la serie se baja la carga y se sigue sin descanso: cada drop es una etapa de esa serie." },
  pyramid: { label: "Pirámide", what: "Sube la carga y bajan las repeticiones serie a serie." },
  reverse_pyramid: { label: "Pirámide invertida", what: "Primero la serie más pesada; después baja la carga y suben las repeticiones." },
  rest_pause: { label: "Rest-pause", what: "Serie efectiva, pausa corta y mini series con la misma carga, conectadas a esa serie." },
  myo_reps: { label: "Myo-reps", what: "Serie de activación y mini series con pausas muy cortas, conectadas a esa serie." },
  cluster: { label: "Cluster", what: "Una serie partida en bloques de pocas repeticiones con pausas de 15 a 30 segundos." },
  amrap_last: { label: "AMRAP por repeticiones", what: "En las series elegidas, todas las repeticiones posibles con buena técnica." },
  amrap_time: { label: "AMRAP por tiempo", what: "Todas las repeticiones o rondas posibles en un tiempo fijo (por ejemplo, 10 minutos)." },
  emom: { label: "EMOM", what: "Cada serie se empieza al comienzo de un intervalo (por defecto, cada minuto)." },
  custom: { label: "Personalizada", what: "Cada serie como la armes." },
};

export type GroupKind = "superset" | "circuit";
export const GROUP_KIND_LABEL: Record<GroupKind, string> = { superset: "Superserie / biserie / triserie", circuit: "Circuito" };
export const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type ExerciseDetail = {
  technique: Technique;
  setPlan: SetSpec[] | null; // null = todas iguales (sets × reps del ejercicio)
  group: string | null; // A–H: los ejercicios con la misma letra en el día se hacen combinados (A1, A2…)
  groupKind: GroupKind | null;
  rounds: number | null; // vueltas del circuito (en el primero del grupo)
  tempo: string | null; // excéntrica-pausa-concéntrica-pausa, p. ej. «3-1-1-0»; X = explosivo
  variant: string | null; // agarre, implemento, rango («agarre cerrado», «con pausa»)
  unilateral: boolean;
  progression: string | null; // «+2,5 kg por semana si completás todo»
  /** D183: EMOM: cada cuántos segundos empieza una serie (cada serie principal es un intervalo). */
  emomSec?: number | null;
  /** D191: equipo y menor salto de carga disponible. Sin esto, la carga calculada es una referencia a ajustar. */
  load?: LoadSetup | null;
};

// ── D191 · Saltos de carga por equipo ─────────────────────────────────────
// Se configuran en el ejercicio del programa (quien lo edita con permiso, versionado como siempre). No es un inventario:
// no dice qué discos o mancuernas hay, sólo el menor salto real con el que se arma la carga en ese ejercicio.
export const EQUIPMENT = { dumbbell: "Mancuernas", barbell: "Barra con discos", plate_loaded: "Máquina de discos", machine: "Máquina de placas (pin)", cable: "Polea", kettlebell: "Pesa rusa", other: "Otro" } as const;
export type Equipment = keyof typeof EQUIPMENT;
/** `perSide`: el salto se carga de cada lado (barra, máquina de discos); el salto total es el doble. */
export type LoadSetup = { equipment: Equipment; incrementKg: number; perSide?: boolean };
/** Salto total en kg (null si no se configuró). */
export const loadIncrement = (d: { load?: LoadSetup | null } | null | undefined): number | null =>
  d?.load && d.load.incrementKg > 0 ? Math.round(d.load.incrementKg * (d.load.perSide ? 2 : 1) * 100) / 100 : null;
const EQUIP_KEYS = Object.keys(EQUIPMENT) as Equipment[];

export const emptyDetail = (): ExerciseDetail => ({ technique: "straight", setPlan: null, group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null });
const S = (kind: SetKind, reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });

/**
 * Propuesta de plan para una técnica sobre «N series × reps» (compatibilidad con D134). D183: ya no reemplaza la programación:
 * aplica el método a las series que corresponden por defecto (drop, rest-pause y myo en la última; top set en la primera y
 * back-off en el resto; cluster y pirámide en todas) conservando series, repeticiones y pesos. El editor usa `applyMethod`.
 */
export function presetPlan(t: Technique, base: { sets: number; reps: string; weightKg?: number | null; rir?: number | null }): SetSpec[] | null {
  const n = Math.max(1, Math.min(MAX_BLOCKS, base.sets));
  const w = base.weightKg ?? null;
  // D173: series rectas con peso = N series iguales con ese peso (antes el peso se perdía al guardar).
  if (t === "straight") return w == null || !Number.isFinite(w) ? null : Array.from({ length: n }, () => S("work", base.reps, { weightKg: w, rir: base.rir ?? null }));
  const start: ExerciseDetail = { ...emptyDetail(), setPlan: Array.from({ length: n }, () => S("work", base.reps, { weightKg: w, rir: base.rir ?? null })) };
  return applyMethod(start, { sets: n, reps: base.reps, rir: base.rir ?? null }, t, defaultSelection(t, n)).detail.setPlan;
}

const KINDS = Object.keys(SET_KIND_LABEL) as SetKind[];
const TECHS = Object.keys(TECHNIQUES) as Technique[];
const txt = (s: unknown, max: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);
const numIn = (x: unknown, min: number, max: number) => (x == null || x === "" ? null : Number.isFinite(Number(x)) && Number(x) >= min && Number(x) <= max ? Number(x) : NaN);

/**
 * Valida y normaliza el detalle. Devuelve el texto del error en español, o el detalle limpio (null si no aporta nada).
 * D183: cada fila sale con identidad, bloque y etapa (los planes anteriores se deducen con `normalizePlan`, sin cambiar pesos
 * ni repeticiones). `sets` sigue siendo la cantidad de filas registrables; `blocks`, la de series principales.
 */
export function validateDetail(d: Partial<ExerciseDetail> | null | undefined, sets: number): { ok: true; detail: ExerciseDetail | null; sets: number; blocks?: number } | { ok: false; error: string } {
  if (!d) return { ok: true, detail: null, sets };
  const technique = TECHS.includes(d.technique as Technique) ? (d.technique as Technique) : "straight";
  let setPlan: SetSpec[] | null = null;
  if (Array.isArray(d.setPlan) && d.setPlan.length) {
    if (d.setPlan.length > MAX_PLAN_ROWS) return { ok: false, error: `Máximo ${MAX_PLAN_ROWS} series y etapas por ejercicio.` };
    const raw: SetSpec[] = [];
    for (const [i, s] of d.setPlan.entries()) {
      const kind = KINDS.includes(s.kind) ? s.kind : "work";
      const reps = txt(s.reps, 20);
      if (!reps) return { ok: false, error: `Fila ${i + 1}: indicá las repeticiones (o «AMRAP», «al fallo», «40 s»).` };
      const weightKg = numIn(s.weightKg, 0, 1000), pct1rm = numIn(s.pct1rm, 1, 120), rir = numIn(s.rir, 0, 5), rpe = numIn(s.rpe, 1, 10), restSec = numIn(s.restSec, 0, 900);
      if ([weightKg, pct1rm, rir, rpe, restSec].some((x) => Number.isNaN(x))) return { ok: false, error: `Fila ${i + 1}: revisá peso (0–1000 kg), % del 1RM (1–120), RIR (0–5), RPE (1–10) o descanso (0–15 min).` };
      const durationSec = kind === "amrap" ? numIn(s.durationSec, 30, 7200) : null;
      if (Number.isNaN(durationSec)) return { ok: false, error: `Fila ${i + 1}: el AMRAP por tiempo va de 30 segundos a 2 horas.` };
      const row: SetSpec = { kind, reps, weightKg: weightKg == null ? null : Math.round(weightKg * 4) / 4, pct1rm, rir: rir == null ? null : Math.round(rir), rpe: rpe == null ? null : Math.round(rpe * 2) / 2, restSec: restSec == null ? null : Math.round(restSec), note: txt(s.note, 80) };
      if (typeof s.id === "string") row.id = s.id;
      if (Number.isInteger(s.block) && Number.isInteger(s.stage)) { row.block = s.block; row.stage = s.stage; }
      if (durationSec != null) { row.durationSec = Math.round(durationSec); row.countUnit = s.countUnit === "reps" ? "reps" : "rounds"; }
      if (s.review === true) row.review = true;
      raw.push(row);
    }
    const norm = normalizePlan(raw);
    const nBlocks = norm.rows.filter((r) => r.stage === 0).length;
    if (nBlocks > MAX_BLOCKS) return { ok: false, error: `Máximo ${MAX_BLOCKS} series principales por ejercicio.` };
    const tooMany = norm.rows.find((r) => r.stage > MAX_STAGES);
    if (tooMany) return { ok: false, error: `Serie ${tooMany.block + 1}: máximo ${MAX_STAGES} etapas conectadas.` };
    setPlan = norm.rows;
  }
  const group = d.group && (GROUP_LETTERS as readonly string[]).includes(d.group) ? d.group : null;
  const groupKind = group ? (d.groupKind === "circuit" ? "circuit" : "superset") : null;
  const rounds = group && d.rounds != null ? numIn(d.rounds, 1, 20) : null;
  if (Number.isNaN(rounds)) return { ok: false, error: "Las vueltas van de 1 a 20." };
  const tempo = txt(d.tempo, 12);
  if (tempo && !/^[0-9xX]{1,2}([-–][0-9xX]{1,2}){2,3}$/.test(tempo)) return { ok: false, error: "El tempo se escribe como excéntrica-pausa-concéntrica-pausa, por ejemplo 3-1-1-0 (X = explosivo)." };
  const emomSec = technique === "emom" ? numIn(d.emomSec ?? 60, 10, 300) : null;
  if (Number.isNaN(emomSec)) return { ok: false, error: "El intervalo del EMOM va de 10 segundos a 5 minutos." };
  let load: LoadSetup | null = null;
  if (d.load) {
    const inc = numIn(d.load.incrementKg, 0.1, 25);
    if (inc == null) return { ok: false, error: "Indicá el menor salto de carga del equipo (o elegí «Sin indicar»)." };
    if (Number.isNaN(inc)) return { ok: false, error: "El salto de carga va de 0,1 a 25 kg." };
    const equipment = EQUIP_KEYS.includes(d.load.equipment) ? d.load.equipment : "other";
    load = { equipment, incrementKg: Math.round(inc * 100) / 100, ...(d.load.perSide && (equipment === "barbell" || equipment === "plate_loaded") ? { perSide: true } : {}) };
  }
  const detail: ExerciseDetail = {
    technique, setPlan, group, groupKind, rounds: rounds ?? null, tempo: tempo?.replace(/–/g, "-").toUpperCase() ?? null,
    variant: txt(d.variant, 60), unilateral: !!d.unilateral, progression: txt(d.progression, 120),
  };
  if (emomSec != null) detail.emomSec = Math.round(emomSec);
  if (load) detail.load = load;
  const empty = technique === "straight" && !setPlan && !group && !detail.tempo && !detail.variant && !detail.unilateral && !detail.progression && !load;
  return { ok: true, detail: empty ? null : detail, sets: setPlan ? setPlan.length : sets, ...(setPlan ? { blocks: setPlan.filter((r) => r.stage === 0).length } : {}) };
}

/** D173: series rectas con un plan de series iguales (con peso). Lo que se cambia en la fila del constructor se copia al plan. */
export const isStraightPlan = (d: ExerciseDetail | null | undefined) => d?.technique === "straight" && !!d.setPlan?.length;
export function straightRow(detail: ExerciseDetail | null | undefined, patch: { sets?: number; reps?: string; rir?: number | null }) {
  if (!detail || !isStraightPlan(detail)) return patch;
  const first = detail.setPlan![0];
  const one: SetSpec = { ...first, reps: patch.reps ?? first.reps, rir: patch.rir !== undefined ? patch.rir : first.rir };
  const n = Math.max(1, Math.min(20, patch.sets ?? detail.setPlan!.length));
  // D183: cada serie conserva su identidad; las nuevas reciben una propia.
  return { ...patch, sets: n, detail: { ...detail, setPlan: Array.from({ length: n }, (_, i) => ({ ...one, id: detail.setPlan![i]?.id ?? newSpecId(), block: i, stage: 0 })) } };
}
// D183: la identidad y la posición (id, bloque, etapa) no cuentan para decidir si dos series son iguales.
const SAME_KEYS: (keyof SetSpec)[] = ["kind", "reps", "weightKg", "pct1rm", "rir", "rpe", "restSec", "note", "durationSec", "countUnit"];
const sameSet = (a: SetSpec, b: SetSpec) => SAME_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
/** Todas las series del plan son iguales (siguen siendo «series rectas»). */
export const uniformPlan = (plan: SetSpec[] | null | undefined) => !!plan?.length && plan.every((x) => sameSet(x, plan[0]));

/**
 * Objetivo de la fila `i` para mostrarle al socio y precargar su registro. D183: dice también a qué serie principal pertenece
 * (`block`), qué etapa es (`stage`, 0 = principal) y su nombre («Drop 1», «Mini serie 2»).
 */
export function setTarget(e: { sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail | null }, i: number) {
  const { rows } = normalizePlan(e.detail?.setPlan);
  const s = rows[i];
  if (!s) return { kind: "work" as SetKind, label: null as string | null, reps: e.reps, weightKg: null as number | null, pct1rm: null as number | null, rir: e.rir, rpe: null as number | null, restSec: e.restSec, note: null as string | null,
    block: i, stage: 0, durationSec: null as number | null, countUnit: null as "reps" | "rounds" | null };
  const label = s.stage > 0 ? stageLabel(s.kind, s.stage) : s.kind === "work" ? null : s.kind === "amrap" && s.durationSec ? "AMRAP por tiempo" : SET_KIND_LABEL[s.kind];
  return { kind: s.kind, label, reps: s.reps, weightKg: s.weightKg, pct1rm: s.pct1rm, rir: s.rir ?? null, rpe: s.rpe, restSec: s.restSec ?? (s.stage > 0 ? 0 : e.restSec), note: s.note,
    block: s.block, stage: s.stage, durationSec: s.durationSec ?? null, countUnit: s.countUnit ?? null };
}

/** Texto corto de la serie: «Top set · 3-5 · 100 kg · RPE 8». */
export function setTargetText(t: ReturnType<typeof setTarget>) {
  return [t.label, t.reps, t.weightKg != null ? `${t.weightKg.toLocaleString("es-AR")} kg` : null, t.pct1rm != null ? `${t.pct1rm} % 1RM` : null,
    t.rpe != null ? `RPE ${t.rpe}` : t.rir != null ? `RIR ${t.rir}` : null].filter(Boolean).join(" · ");
}

/** Etiquetas de combinación por día: A1, A2, B1… según el orden. Sin grupo, null. */
export function groupLabels(exs: { detail?: ExerciseDetail | null }[]) {
  const count = new Map<string, number>();
  return exs.map((e) => { const g = e.detail?.group; if (!g) return null; const n = (count.get(g) ?? 0) + 1; count.set(g, n); return `${g}${n}`; });
}

/**
 * D137: siguiente ejercicio de la combinación (misma letra) al terminar la fila `setIdx` del ejercicio `idx`. D183: las
 * vueltas son series principales (con sus etapas): ver `comboStep`. Sin grupo, con un solo miembro o todo hecho, null.
 */
export function comboNext(exs: { sets: number; detail?: ExerciseDetail | null; change?: { kind: string } | null }[], done: (i: number, k: number) => boolean, idx: number, setIdx: number) {
  const r = comboStep(exs, done, idx, setIdx);
  return r ? { idx: r.idx, endOfRound: r.endOfRound } : null;
}
