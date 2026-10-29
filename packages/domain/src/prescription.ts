// Prescripción avanzada de un ejercicio (D134). Pedido de entrenadores de sala y personal trainers: combinar ejercicios,
// drop sets, top sets, peso por serie y editar cada serie (subir, bajar, descanso, intensidad), tempo, variantes y rangos.
// Todo es opcional: sin `detail` el ejercicio sigue siendo «N series × reps» como antes. Un drop set o un top set es una
// serie más del plan (con su tipo), así el registro del socio, la sincronización y las métricas no cambian.

export type SetKind = "warmup" | "work" | "top" | "backoff" | "drop" | "amrap" | "failure" | "rest_pause" | "cluster";
export const SET_KIND_LABEL: Record<SetKind, string> = {
  warmup: "Aproximación", work: "Efectiva", top: "Top set", backoff: "Back-off", drop: "Drop", amrap: "AMRAP", failure: "Al fallo", rest_pause: "Rest-pause", cluster: "Cluster",
};
export type SetSpec = {
  kind: SetKind; reps: string; weightKg: number | null; pct1rm: number | null; rir: number | null; rpe: number | null; restSec: number | null; note: string | null;
};

export type Technique = "straight" | "top_backoff" | "drop_set" | "pyramid" | "reverse_pyramid" | "rest_pause" | "myo_reps" | "cluster" | "amrap_last" | "emom" | "custom";
export const TECHNIQUES: Record<Technique, { label: string; what: string }> = {
  straight: { label: "Series rectas", what: "Mismas repeticiones y carga en todas las series." },
  top_backoff: { label: "Top set + back-off", what: "Una serie pesada y después series más livianas con más repeticiones." },
  drop_set: { label: "Drop set", what: "Al terminar la serie se baja la carga y se sigue sin descanso." },
  pyramid: { label: "Pirámide", what: "Sube la carga y bajan las repeticiones serie a serie." },
  reverse_pyramid: { label: "Pirámide invertida", what: "Primero la serie más pesada; después baja la carga y suben las repeticiones." },
  rest_pause: { label: "Rest-pause", what: "Serie efectiva, pausa corta y mini series con la misma carga." },
  myo_reps: { label: "Myo-reps", what: "Serie de activación y mini series con 5 segundos de pausa." },
  cluster: { label: "Cluster", what: "Bloques de pocas repeticiones con pausas de 15 a 30 segundos." },
  amrap_last: { label: "Última AMRAP", what: "La última serie, todas las repeticiones posibles con buena técnica." },
  emom: { label: "EMOM", what: "Una serie al empezar cada minuto." },
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
};

export const emptyDetail = (): ExerciseDetail => ({ technique: "straight", setPlan: null, group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null });
const S = (kind: SetKind, reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });

/** Plan serie por serie para una técnica, a partir de lo cargado (series, repeticiones y peso opcional). El coach lo ajusta después. */
export function presetPlan(t: Technique, base: { sets: number; reps: string; weightKg?: number | null }): SetSpec[] | null {
  const n = Math.max(1, Math.min(10, base.sets));
  const w = base.weightKg ?? null;
  const round = (x: number) => Math.round(x * 2) / 2;
  switch (t) {
    case "straight": return null;
    case "top_backoff": return [S("top", "3-5", { weightKg: w, rpe: 8 }), ...Array.from({ length: Math.max(1, n - 1) }, () => S("backoff", "6-8", { weightKg: w ? round(w * 0.85) : null, note: "−15 % del top set" }))];
    case "drop_set": return [S("work", base.reps, { weightKg: w, rir: 0 }), S("drop", "al fallo", { weightKg: w ? round(w * 0.8) : null, restSec: 0, note: "−20 %" }), S("drop", "al fallo", { weightKg: w ? round(w * 0.6) : null, restSec: 0, note: "−20 %" })];
    case "pyramid": return Array.from({ length: n }, (_, i) => S("work", String(Math.max(4, 12 - i * 2)), { weightKg: w ? round(w * (1 + i * 0.07)) : null }));
    case "reverse_pyramid": return Array.from({ length: n }, (_, i) => S(i === 0 ? "top" : "backoff", String(Math.min(15, 6 + i * 2)), { weightKg: w ? round(w * (1 - i * 0.1)) : null }));
    case "rest_pause": return [S("work", base.reps, { weightKg: w, rir: 1 }), S("rest_pause", "3-5", { weightKg: w, restSec: 15 }), S("rest_pause", "2-4", { weightKg: w, restSec: 15 })];
    case "myo_reps": return [S("work", "12-15", { weightKg: w, rir: 1 }), ...Array.from({ length: 4 }, () => S("rest_pause", "3-5", { weightKg: w, restSec: 5 }))];
    case "cluster": return Array.from({ length: n }, () => S("cluster", "2-3", { weightKg: w, restSec: 20 }));
    case "amrap_last": return Array.from({ length: n }, (_, i) => (i === n - 1 ? S("amrap", "AMRAP", { weightKg: w }) : S("work", base.reps, { weightKg: w })));
    case "emom": return Array.from({ length: n }, () => S("work", base.reps, { weightKg: w, note: "Al empezar cada minuto" }));
    case "custom": return Array.from({ length: n }, () => S("work", base.reps, { weightKg: w }));
  }
}

const KINDS = Object.keys(SET_KIND_LABEL) as SetKind[];
const TECHS = Object.keys(TECHNIQUES) as Technique[];
const txt = (s: unknown, max: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);
const numIn = (x: unknown, min: number, max: number) => (x == null || x === "" ? null : Number.isFinite(Number(x)) && Number(x) >= min && Number(x) <= max ? Number(x) : NaN);

/** Valida y normaliza el detalle. Devuelve el texto del error en español, o el detalle limpio (null si no aporta nada). */
export function validateDetail(d: Partial<ExerciseDetail> | null | undefined, sets: number): { ok: true; detail: ExerciseDetail | null; sets: number } | { ok: false; error: string } {
  if (!d) return { ok: true, detail: null, sets };
  const technique = TECHS.includes(d.technique as Technique) ? (d.technique as Technique) : "straight";
  let setPlan: SetSpec[] | null = null;
  if (Array.isArray(d.setPlan) && d.setPlan.length) {
    if (d.setPlan.length > 20) return { ok: false, error: "Máximo 20 series por ejercicio." };
    setPlan = [];
    for (const [i, s] of d.setPlan.entries()) {
      const kind = KINDS.includes(s.kind) ? s.kind : "work";
      const reps = txt(s.reps, 20);
      if (!reps) return { ok: false, error: `Serie ${i + 1}: indicá las repeticiones (o «AMRAP», «al fallo», «40 s»).` };
      const weightKg = numIn(s.weightKg, 0, 1000), pct1rm = numIn(s.pct1rm, 1, 120), rir = numIn(s.rir, 0, 5), rpe = numIn(s.rpe, 1, 10), restSec = numIn(s.restSec, 0, 900);
      if ([weightKg, pct1rm, rir, rpe, restSec].some((x) => Number.isNaN(x))) return { ok: false, error: `Serie ${i + 1}: revisá peso (0–1000 kg), % del 1RM (1–120), RIR (0–5), RPE (1–10) o descanso (0–15 min).` };
      setPlan.push({ kind, reps, weightKg: weightKg == null ? null : Math.round(weightKg * 4) / 4, pct1rm, rir: rir == null ? null : Math.round(rir), rpe: rpe == null ? null : Math.round(rpe * 2) / 2, restSec: restSec == null ? null : Math.round(restSec), note: txt(s.note, 80) });
    }
  }
  const group = d.group && (GROUP_LETTERS as readonly string[]).includes(d.group) ? d.group : null;
  const groupKind = group ? (d.groupKind === "circuit" ? "circuit" : "superset") : null;
  const rounds = group && d.rounds != null ? numIn(d.rounds, 1, 20) : null;
  if (Number.isNaN(rounds)) return { ok: false, error: "Las vueltas van de 1 a 20." };
  const tempo = txt(d.tempo, 12);
  if (tempo && !/^[0-9xX]{1,2}([-–][0-9xX]{1,2}){2,3}$/.test(tempo)) return { ok: false, error: "El tempo se escribe como excéntrica-pausa-concéntrica-pausa, por ejemplo 3-1-1-0 (X = explosivo)." };
  const detail: ExerciseDetail = {
    technique, setPlan, group, groupKind, rounds: rounds ?? null, tempo: tempo?.replace(/–/g, "-").toUpperCase() ?? null,
    variant: txt(d.variant, 60), unilateral: !!d.unilateral, progression: txt(d.progression, 120),
  };
  const empty = technique === "straight" && !setPlan && !group && !detail.tempo && !detail.variant && !detail.unilateral && !detail.progression;
  return { ok: true, detail: empty ? null : detail, sets: setPlan ? setPlan.length : sets };
}

/** Objetivo de la serie `i` para mostrarle al socio y precargar su registro. */
export function setTarget(e: { sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail | null }, i: number) {
  const s = e.detail?.setPlan?.[i];
  if (!s) return { kind: "work" as SetKind, label: null as string | null, reps: e.reps, weightKg: null as number | null, pct1rm: null as number | null, rir: e.rir, rpe: null as number | null, restSec: e.restSec, note: null as string | null };
  return { kind: s.kind, label: s.kind === "work" ? null : SET_KIND_LABEL[s.kind], reps: s.reps, weightKg: s.weightKg, pct1rm: s.pct1rm, rir: s.rir ?? null, rpe: s.rpe, restSec: s.restSec ?? e.restSec, note: s.note };
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
