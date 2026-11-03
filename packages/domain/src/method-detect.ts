// D184: métodos avanzados escritos en una rutina importada («drop set en la última», «rest-pause», «EMOM 10'», «A1/A2»), en
// rutinas propias del alumno y en las que arma REPI. Un solo camino para todos los orígenes: se detecta qué dice el texto
// (sin inventar) y se arma el plan con `applyMethod` (stages.ts), igual que en el constructor del coach.
//  · `confident`: el texto nombra el método sin dudas («drop set», «rest-pause», «myo-reps», «cluster», «EMOM», «top set +
//    back-off», «AMRAP 10 min»). Se aplica en la vista previa, a la vista y con «Dejar como nota» para revertirlo.
//  · Ambiguo («drop» suelto, «pirámide», «superserie» sin pareja clara): no se transforma; se pregunta.
//  · El texto original nunca se borra: queda en la nota del ejercicio.
import { applyMethod, defaultSelection, DEFAULT_STAGES, MAX_STAGES } from "./stages";
import { emptyDetail, GROUP_LETTERS, TECHNIQUES, type ExerciseDetail, type GroupKind, type Technique } from "./prescription";

export type DetectedMethod = {
  technique: Technique;
  confident: boolean;
  matched: string; // el fragmento del texto que lo nombra, tal como estaba
  selection: "last" | "all" | "first" | null; // a qué series («en la última», «en todas»); null = la de siempre del método
  stages: number | null; // drops o mini series pedidos («doble drop», «3 mini series»)
  emomSec: number | null;
  durationSec: number | null; // AMRAP por tiempo
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Busca un método en los textos de un ejercicio (columna Técnica, nota, repeticiones). null si no nombra ninguno. */
export function detectMethod(...texts: (string | null | undefined)[]): DetectedMethod | null {
  const raw = texts.filter((t): t is string => !!t && !!t.trim()).join(" · ");
  if (!raw) return null;
  const t = fold(raw);
  const pick = (re: RegExp) => { const m = re.exec(t); return m ? raw.slice(m.index, m.index + m[0].length) : null; };
  const selection: DetectedMethod["selection"] = /\b(ultima|ultimas|last)\b/.test(t) ? "last" : /\b(todas|cada serie|all)\b/.test(t) ? "all" : /\bprimera\b/.test(t) ? "first" : null;
  const n = /\b(\d)\s*(drops?|bajadas|mini ?series|minis)\b/.exec(t);
  const stages = n ? Math.min(MAX_STAGES, Math.max(1, Number(n[1]))) : /\bdoble drop\b/.test(t) ? 2 : /\btriple drop\b/.test(t) ? 3 : null;
  const base = { selection, stages, emomSec: null, durationSec: null };
  let m: string | null;
  if ((m = pick(/\bemom\b[^·,;]*/))) {
    const sec = /cada\s*(\d{1,3})\s*(s|seg|segundos|")\b/.exec(t);
    const minEach = /cada\s*(\d)\s*(min|minutos|')/.exec(t);
    const emomSec = sec ? Number(sec[1]) : minEach ? Number(minEach[1]) * 60 : 60;
    return { ...base, technique: "emom", confident: emomSec >= 10 && emomSec <= 300, matched: m.trim(), emomSec };
  }
  if ((m = pick(/\bamrap\b[^·,;]*/))) {
    const min = /\b(\d{1,3})\s*(min|minutos|')/.exec(t);
    if (min) return { ...base, technique: "amrap_time", confident: true, matched: m.trim(), durationSec: Math.min(7200, Number(min[1]) * 60) };
    return { ...base, technique: "amrap_last", confident: selection != null, matched: m.trim() };
  }
  if ((m = pick(/\b(drop ?sets?|dropsets?)\b/))) return { ...base, technique: "drop_set", confident: true, matched: m };
  if ((m = pick(/\brest[ -]?pause\b/))) return { ...base, technique: "rest_pause", confident: true, matched: m };
  if ((m = pick(/\bmyo[ -]?reps?\b/))) return { ...base, technique: "myo_reps", confident: true, matched: m };
  if ((m = pick(/\bcluster\b/))) return { ...base, technique: "cluster", confident: true, matched: m };
  const top = pick(/\btop ?set\b/), back = pick(/\bback[ -]?offs?\b/);
  if (top || back) return { ...base, technique: "top_backoff", confident: !!(top && back), matched: [top, back].filter(Boolean).join(" + ") };
  if ((m = pick(/\b(doble |triple )?drops?\b/))) return { ...base, technique: "drop_set", confident: false, matched: m };
  if ((m = pick(/\bpiramide (invertida|inversa)\b/))) return { ...base, technique: "reverse_pyramid", confident: false, matched: m };
  if ((m = pick(/\bpiramide\b/))) return { ...base, technique: "pyramid", confident: false, matched: m };
  return null;
}

/** «A1», «b2.», «A1)» al principio del nombre o en una columna Grupo: combinado explícito. */
export function detectGroupLabel(...texts: (string | null | undefined)[]): { letter: string; order: number; matched: string } | null {
  for (const x of texts) {
    const m = /^\s*([a-h])\s*([1-6])\s*[.)\-:·]?\s/i.exec(`${x ?? ""} `);
    if (m) return { letter: m[1].toUpperCase(), order: Number(m[2]), matched: m[0].trim() };
  }
  return null;
}

/** «superserie», «biserie», «circuito»… sin letras: se pregunta con qué ejercicio va. */
export function detectGroupWord(...texts: (string | null | undefined)[]): { kind: GroupKind; matched: string } | null {
  const raw = texts.filter(Boolean).join(" · ");
  const t = fold(raw);
  const m = /\b(super ?series?|biseries?|bi-series?|triseries?|series? gigantes?|circuitos?)\b/.exec(t);
  if (!m) return null;
  return { kind: /circuito/.test(m[0]) ? "circuit" : "superset", matched: raw.slice(m.index, m.index + m[0].length) };
}

/** Plan con el método detectado sobre N series rectas (mismo `applyMethod` que el constructor). Nunca cambia cargas. */
export function methodDetail(det: DetectedMethod, base: { sets: number; reps: string; weightKg?: number | null; rir?: number | null }, current?: ExerciseDetail | null): { detail: ExerciseDetail; changes: string[] } {
  const n = Math.max(1, Math.min(20, base.sets));
  const start: ExerciseDetail = current?.setPlan ? current : { ...(current ?? emptyDetail()), setPlan: Array.from({ length: n }, () => ({ kind: "work" as const, reps: base.reps, weightKg: base.weightKg ?? null, pct1rm: null, rir: base.rir ?? null, rpe: null, restSec: null, note: null })) };
  const sel = det.selection === "all" ? Array.from({ length: n }, (_, i) => i) : det.selection === "first" ? [0] : det.selection === "last" ? [n - 1] : defaultSelection(det.technique, n);
  const r = applyMethod(start, { sets: n, reps: base.reps, rir: base.rir ?? null }, det.technique, sel, {
    stages: det.stages ?? DEFAULT_STAGES[det.technique], emomSec: det.emomSec ?? undefined, durationSec: det.durationSec ?? undefined,
  });
  return r;
}

/** Texto corto para la vista previa: «Drop set en la última serie (2 drops)». */
export function detectedLabel(det: DetectedMethod): string {
  const where = det.selection === "all" ? " en todas las series" : det.selection === "first" ? " en la primera serie" : det.selection === "last" ? " en la última serie" : "";
  const extra = det.technique === "emom" ? ` cada ${det.emomSec ?? 60} s` : det.technique === "amrap_time" && det.durationSec ? ` de ${Math.round(det.durationSec / 60)} min` : det.stages ? ` (${det.stages})` : "";
  return `${TECHNIQUES[det.technique].label}${where}${extra}`;
}

export const firstFreeGroup = (used: Iterable<string | null | undefined>) => { const u = new Set(used); return GROUP_LETTERS.find((l) => !u.has(l)) ?? null; };
