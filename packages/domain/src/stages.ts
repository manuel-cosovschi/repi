// D183: series principales (bloques) y etapas conectadas. Un drop set, un rest-pause, un myo-reps o un cluster no son
// «series de más»: son etapas de una serie principal. El plan sigue siendo una lista plana de filas registrables (cada fila
// es un `setIndex` de `set_log`), y cada fila dice a qué bloque pertenece y qué etapa es. Este módulo:
//  · lee cualquier plan, nuevo o anterior, como bloques y etapas (`normalizePlan`, `planBlocks`) sin migrar nada;
//  · aplica un método a las series elegidas sin reemplazar la programación (`applyMethod`), con la lista de cambios para
//    que el profe los revise antes de guardar;
//  · da la referencia estable de cada fila (`rowRef`) para el registro, el historial y Training Intelligence;
//  · ordena superseries y circuitos por vueltas (`comboStep`, `circuitIssues`, `resizeBlocks`).
import { SET_KIND_LABEL, TECHNIQUES, emptyDetail, type ExerciseDetail, type SetKind, type SetSpec, type Technique } from "./prescription";
import { parseReps } from "./training";

/** Tipos que, en un plan anterior sin bloques, continúan la serie de arriba (siempre fueron etapas de esa serie). */
export const LEGACY_STAGE_KINDS: readonly SetKind[] = ["drop", "rest_pause"];
/** Tipos que puede tener una etapa conectada (stage > 0). */
export const STAGE_KINDS: readonly SetKind[] = ["drop", "rest_pause", "cluster"];
/** Máximo de filas registrables por ejercicio (series principales + etapas) y de series principales. */
export const MAX_PLAN_ROWS = 40;
export const MAX_BLOCKS = 20;
/** Máximo de etapas conectadas a una serie principal. */
export const MAX_STAGES = 8;

export type PlanRow = SetSpec & { id: string; block: number; stage: number };
export type Block = {
  index: number;
  /** Filas del plan (setIndex) de este bloque, en orden: la primera es la serie principal. */
  rows: number[];
  main: number;
  kind: SetKind;
  /** Cantidad de etapas conectadas (sin contar la principal). */
  stages: number;
  /** Agrupación heredada ambigua: pendiente de clasificación por el profe. */
  review: boolean;
};

const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
/** Identidad nueva para una fila (no depende de la posición). */
export const newSpecId = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return `s${(c?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 10)}`;
};
/** Identidad de una fila sin `id` (planes anteriores o «N series × reps»): su posición. Es determinista: siempre la misma. */
export const legacySpecId = (i: number) => `r${i}`;

/**
 * Plan → filas con bloque, etapa e identidad. Si el plan ya trae bloques coherentes, se respetan. Si no (planes anteriores),
 * se deducen sin inventar: un drop o un rest-pause continúa la serie de arriba (así se armaban siempre); el resto abre una
 * serie nueva. Los clusters anteriores son ambiguos (no se sabe si cada fila era una serie o un bloque de la misma): quedan
 * como series separadas, igual que antes, y marcados `review` para que el profe los confirme. Nunca cambia pesos ni reps.
 */
export function normalizePlan(plan: SetSpec[] | null | undefined): { rows: PlanRow[]; derived: boolean; review: boolean } {
  if (!plan?.length) return { rows: [], derived: false, review: false };
  const explicit = plan.every((s) => Number.isInteger(s.block) && Number.isInteger(s.stage)) && plan.every((s, i) => {
    if (i === 0) return s.block === 0 && s.stage === 0;
    const p = plan[i - 1];
    return (s.block === p.block && s.stage === p.stage! + 1 && STAGE_KINDS.includes(s.kind)) || (s.block === p.block! + 1 && s.stage === 0);
  });
  const seen = new Set<string>();
  const idFor = (s: SetSpec, i: number) => {
    let id = typeof s.id === "string" && ID_RE.test(s.id) && !seen.has(s.id) ? s.id : legacySpecId(i);
    while (seen.has(id)) id = newSpecId();
    seen.add(id);
    return id;
  };
  let block = -1, stage = 0, review = false;
  const rows: PlanRow[] = plan.map((s, i) => {
    let r = s.review === true;
    if (explicit) { block = s.block!; stage = s.stage!; }
    else if (i > 0 && LEGACY_STAGE_KINDS.includes(s.kind)) stage++;
    else {
      block++; stage = 0;
      if (s.kind === "cluster") r = true; // cluster anterior: no se sabe cómo se agrupaba
    }
    review ||= r;
    const out: PlanRow = { ...s, id: idFor(s, i), block, stage };
    if (r) out.review = true; else delete out.review;
    return out;
  });
  return { rows, derived: !explicit, review };
}

/** Bloques (series principales) de un ejercicio. Sin plan: «N series × reps» son N bloques de una fila. */
export function planBlocks(detail: ExerciseDetail | null | undefined, sets: number): Block[] {
  const { rows } = normalizePlan(detail?.setPlan);
  if (!rows.length) return Array.from({ length: Math.max(0, sets) }, (_, i) => ({ index: i, rows: [i], main: i, kind: "work" as SetKind, stages: 0, review: false }));
  const out: Block[] = [];
  rows.forEach((r, i) => {
    if (r.stage === 0) out.push({ index: r.block, rows: [i], main: i, kind: r.kind, stages: 0, review: !!r.review });
    else { const b = out[out.length - 1]; b.rows.push(i); b.stages++; }
  });
  return out;
}

/** Cantidad de series principales (lo que el profe programó como «N series»). */
export const mainSets = (detail: ExerciseDetail | null | undefined, sets: number) => planBlocks(detail, sets).length;

/** Nombre de una etapa para mostrar: «Drop 1», «Mini serie 2», «Bloque 3». La principal no lleva nombre (null). */
export function stageLabel(kind: SetKind, stage: number): string | null {
  if (stage === 0) return kind === "cluster" ? "Bloque 1" : null;
  if (kind === "drop") return `Drop ${stage}`;
  if (kind === "rest_pause") return `Mini serie ${stage}`;
  if (kind === "cluster") return `Bloque ${stage + 1}`;
  return `Etapa ${stage}`;
}

/**
 * Referencia estable de la fila `i` (D183): con qué se guarda cada registro (`set_log.spec_id`, `set_kind`, `block_index`,
 * `stage_index`) para el historial y para comparar resultados equivalentes entre versiones del programa.
 */
export type RowRef = { id: string; block: number; stage: number; kind: SetKind; review: boolean };
export function rowRef(detail: ExerciseDetail | null | undefined, sets: number, i: number): RowRef | null {
  if (!Number.isInteger(i) || i < 0) return null;
  const { rows } = normalizePlan(detail?.setPlan);
  if (!rows.length) return i < sets ? { id: legacySpecId(i), block: i, stage: 0, kind: "work", review: false } : null;
  const r = rows[i];
  return r ? { id: r.id, block: r.block, stage: r.stage, kind: r.kind, review: !!r.review } : null;
}

// ── Aplicar un método sin destruir la programación ─────────────────────────
export type MethodOptions = {
  /** Etapas por serie: drops, mini series o bloques de cluster (según el método). */
  stages?: number;
  /** AMRAP por tiempo: duración (s) y qué se cuenta. */
  durationSec?: number; countUnit?: "reps" | "rounds";
  /** EMOM: intervalo (s). */
  emomSec?: number;
  /** Top set + back-off: qué serie es el top set (por defecto, la primera elegida). */
  topBlock?: number;
};
type Base = { sets: number; reps: string; rir: number | null };
const blankRow = (p: Partial<SetSpec> & { kind: SetKind; reps: string }): SetSpec => ({ weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(n)));

/** Filas del ejercicio como bloques editables. Sin plan, «N series × reps» se materializan como N series iguales. */
export function materialize(detail: ExerciseDetail | null | undefined, base: Base): PlanRow[][] {
  const { rows } = normalizePlan(detail?.setPlan);
  const flat: PlanRow[] = rows.length ? rows
    : Array.from({ length: clamp(base.sets, 1, MAX_BLOCKS) }, (_, i) => ({ ...blankRow({ kind: "work", reps: base.reps, rir: base.rir }), id: legacySpecId(i), block: i, stage: 0 }));
  const out: PlanRow[][] = [];
  for (const r of flat) (r.stage === 0 ? out.push([r]) : out[out.length - 1].push(r));
  return out;
}
/** Bloques → plan plano con bloque y etapa renumerados (las identidades se conservan). */
export function flatten(blocks: PlanRow[][]): PlanRow[] {
  return blocks.flatMap((b, bi) => b.map((r, si) => ({ ...r, block: bi, stage: si })));
}

/** Series que el editor propone por defecto al elegir un método (el profe las cambia antes de aplicar). */
export function defaultSelection(m: Technique, nBlocks: number): number[] {
  const all = Array.from({ length: nBlocks }, (_, i) => i);
  if (m === "drop_set" || m === "rest_pause" || m === "myo_reps" || m === "amrap_last") return nBlocks ? [nBlocks - 1] : [];
  if (m === "amrap_time") return nBlocks ? [0] : [];
  return all;
}
/** Cantidad de etapas por defecto para cada método. */
export const DEFAULT_STAGES: Partial<Record<Technique, number>> = { drop_set: 2, rest_pause: 2, myo_reps: 3, cluster: 3 };

const repsMax = (reps: string) => { const t = parseReps(reps); return t.kind === "reps" ? t.max : null; };
const repsMin = (reps: string) => { const t = parseReps(reps); return t.kind === "reps" ? t.min : null; };
const fmtKg = (n: number) => `${n.toLocaleString("es-AR")} kg`;

/**
 * Aplica un método a las series principales elegidas (`selected`, índices de bloque) y deja el resto como estaba. No crea ni
 * borra series principales, no cambia cargas del profe y conserva las identidades. Devuelve el detalle nuevo y la lista de
 * cambios en español para revisar antes de guardar (lo que modifica reps, quita etapas o deja una carga para revisar).
 */
export function applyMethod(detail: ExerciseDetail | null | undefined, base: Base, method: Technique, selected: number[], o: MethodOptions = {}): { detail: ExerciseDetail; changes: string[] } {
  const d = detail ?? emptyDetail();
  const blocks = materialize(d, base);
  const sel = new Set(selected.filter((i) => i >= 0 && i < blocks.length));
  const changes: string[] = [];
  const name = (bi: number) => `Serie ${bi + 1}`;
  const stagesOf = (m: Technique) => clamp(o.stages ?? DEFAULT_STAGES[m] ?? 2, 1, m === "cluster" ? MAX_STAGES + 1 : MAX_STAGES);
  const dropStages = (bi: number, b: PlanRow[]) => { if (b.length > 1) changes.push(`${name(bi)}: se quitan ${b.length - 1 === 1 ? "1 etapa conectada" : `${b.length - 1} etapas conectadas`}.`); return [b[0]]; };
  const setReps = (bi: number, r: PlanRow, reps: string) => { if (r.reps !== reps) changes.push(`${name(bi)}: repeticiones ${r.reps} → ${reps}.`); return { ...r, reps }; };
  const setKind = (bi: number, r: PlanRow, kind: SetKind) => { if (r.kind !== kind && !(r.kind === "work" && kind === "work")) changes.push(`${name(bi)}: pasa a ${SET_KIND_LABEL[kind].toLowerCase()}.`); return { ...r, kind }; };
  const top = method === "top_backoff" ? (o.topBlock != null && sel.has(o.topBlock) ? o.topBlock : Math.min(...sel)) : -1;
  const ordered = [...sel].sort((a, b) => a - b);
  const next = blocks.map((b, bi) => {
    if (!sel.has(bi)) return b;
    const main = b[0];
    switch (method) {
      case "straight": case "custom": {
        const rest = method === "straight" ? dropStages(bi, b) : b;
        return [main.kind === "warmup" || method === "custom" ? rest[0] : setKind(bi, { ...rest[0], durationSec: null, countUnit: null }, "work"), ...rest.slice(1)];
      }
      case "drop_set": {
        const k = stagesOf(method);
        const old = b.slice(1).filter((r) => r.kind === "drop");
        if (b.length - 1 > old.length) changes.push(`${name(bi)}: las etapas que no eran drops se reemplazan.`);
        const fresh = Array.from({ length: k }, (_, j) => old[j] ?? { ...blankRow({ kind: "drop", reps: "al fallo", restSec: 0 }), id: newSpecId(), block: bi, stage: j + 1 });
        if (k !== old.length) changes.push(`${name(bi)}: ${k} ${k === 1 ? "drop conectado" : "drops conectados"}${old.length ? ` (antes ${old.length})` : ""}. La carga de cada drop la elige el alumno con una referencia, salvo que la indiques.`);
        return [main, ...fresh];
      }
      case "rest_pause": case "myo_reps": {
        const k = stagesOf(method);
        const old = b.slice(1).filter((r) => r.kind === "rest_pause");
        const pause = method === "myo_reps" ? 5 : 20;
        const fresh = Array.from({ length: k }, (_, j) => old[j] ?? { ...blankRow({ kind: "rest_pause", reps: method === "myo_reps" ? "3-5" : "máx.", restSec: pause, weightKg: main.weightKg }), id: newSpecId(), block: bi, stage: j + 1 });
        if (k !== old.length) changes.push(`${name(bi)}: ${k} ${k === 1 ? "mini serie conectada" : "mini series conectadas"} con la misma carga y ${pause} s de pausa.`);
        if (b.length - 1 > old.length) changes.push(`${name(bi)}: las etapas que no eran mini series se reemplazan.`);
        return [main.kind === "warmup" ? setKind(bi, main, "work") : main, ...fresh];
      }
      case "cluster": {
        const k = stagesOf(method); // bloques totales de la serie
        const old = b.slice(1).filter((r) => r.kind === "cluster");
        const mx = repsMax(main.reps);
        const per = mx ? String(Math.max(1, Math.ceil(mx / k))) : main.reps;
        const head = setReps(bi, setKind(bi, main, "cluster"), per);
        if (b.length - 1 > old.length) changes.push(`${name(bi)}: las etapas que no eran bloques se reemplazan.`);
        const fresh = Array.from({ length: k - 1 }, (_, j) => old[j] ?? { ...blankRow({ kind: "cluster", reps: per, restSec: 20, weightKg: main.weightKg }), id: newSpecId(), block: bi, stage: j + 1 });
        if (k - 1 !== old.length) changes.push(`${name(bi)}: partida en ${k} bloques de ${per} con 20 s de pausa.`);
        const { review: _r, ...clean } = head;
        return [clean as PlanRow, ...fresh];
      }
      case "top_backoff": {
        const r = bi === top ? setKind(bi, main, "top") : setKind(bi, main, "backoff");
        const t = blocks[top]?.[0];
        if (bi !== top && t?.weightKg != null && r.weightKg != null && r.weightKg >= t.weightKg) changes.push(`${name(bi)}: el back-off tiene ${fmtKg(r.weightKg)}, igual o más que el top set: revisá la carga.`);
        return [r, ...b.slice(1)];
      }
      case "amrap_last": {
        const r = setKind(bi, { ...main, durationSec: null, countUnit: null }, "amrap");
        const withNote = r.reps !== "AMRAP" && !r.note ? { ...r, note: `Mínimo ${r.reps}`.slice(0, 80) } : r;
        return [setReps(bi, withNote, "AMRAP"), ...dropStages(bi, b).slice(1)];
      }
      case "amrap_time": {
        const sec = clamp(o.durationSec ?? 600, 30, 7200);
        const unit = o.countUnit ?? "rounds";
        const min = sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
        const r = setReps(bi, setKind(bi, main, "amrap"), `AMRAP ${min}`);
        changes.push(`${name(bi)}: AMRAP de ${min}; se registran ${unit === "rounds" ? "las rondas" : "las repeticiones totales"}.`);
        return [{ ...r, durationSec: sec, countUnit: unit }, ...dropStages(bi, b).slice(1)];
      }
      case "pyramid": case "reverse_pyramid": {
        const pos = ordered.indexOf(bi);
        const hi = repsMax(main.reps), lo = repsMin(main.reps);
        if (hi == null || lo == null) return b;
        const reps = method === "pyramid" ? Math.max(1, hi + 2 - pos * 2) : Math.max(1, lo - 2 + pos * 2);
        return [setReps(bi, setKind(bi, main, main.kind === "warmup" ? "warmup" : "work"), String(reps)), ...b.slice(1)];
      }
      case "emom": return b;
    }
  });
  const flat = flatten(next);
  const emomSec = method === "emom" ? clamp(o.emomSec ?? 60, 10, 300) : d.technique === "emom" && method === "custom" ? d.emomSec ?? null : null;
  if (method === "emom") changes.push(`Cada serie empieza al comienzo de un intervalo de ${emomSec} s (${flat.filter((r) => r.stage === 0).length} intervalos).`);
  else if (d.emomSec && method !== "custom") changes.push("Deja de ser EMOM.");
  const technique: Technique = method === "straight" && flat.some((r) => r.stage > 0 || r.kind !== flat[0].kind) ? "custom" : method;
  const out: ExerciseDetail = { ...d, technique, setPlan: flat, emomSec };
  if (!emomSec) delete out.emomSec;
  return { detail: out, changes };
}

/** Resumen corto de la estructura: «4 series · la 4.ª con 2 drops». */
export function structureText(detail: ExerciseDetail | null | undefined, sets: number) {
  const bs = planBlocks(detail, sets);
  const main = bs.filter((b) => b.kind !== "warmup").length, warm = bs.length - main;
  const withStages = bs.filter((b) => b.stages > 0);
  const parts = [`${main} ${main === 1 ? "serie" : "series"}`];
  if (warm) parts.push(`${warm} de aproximación`);
  if (withStages.length) {
    const kinds = new Set(withStages.map((b) => detail!.setPlan![b.rows[1]].kind));
    const what = kinds.size === 1 ? ({ drop: "drops", rest_pause: "mini series", cluster: "bloques" } as Record<string, string>)[[...kinds][0]] ?? "etapas" : "etapas";
    const n = withStages.reduce((a, b) => a + b.stages, 0);
    parts.push(withStages.length === main ? `todas con etapas (${n} ${what})` : `${withStages.map((b) => `${bs.filter((x) => x.kind !== "warmup").indexOf(b) + 1}.ª`).join(", ")} con ${what} (${n})`);
  }
  return parts.join(" · ");
}

/** Para comparar: técnicas del catálogo. */
export const methodLabel = (t: Technique) => TECHNIQUES[t].label;

// ── Grupos: superseries, triseries, series gigantes y circuitos ───────────
type ComboEx = { sets: number; detail?: ExerciseDetail | null; change?: { kind: string } | null };

/**
 * D183 (reemplaza la alternancia por índice de fila de D137): cada vuelta de un grupo es una serie principal (bloque) de cada
 * ejercicio, con sus etapas. Al terminar una fila de `idx`: si quedan etapas de ese bloque, se sigue ahí (sin cambiar de
 * ejercicio); si el bloque terminó, va al siguiente del grupo con ese bloque pendiente (sin descanso); al cerrar la vuelta,
 * vuelve al primero con algo pendiente y corresponde el descanso. Sin grupo, con un solo miembro o todo hecho, null.
 * `done(i, k)` dice si la fila k del ejercicio i está resuelta (hecha u omitida).
 */
export function comboStep(exs: ComboEx[], done: (i: number, k: number) => boolean, idx: number, setIdx: number):
  { idx: number; endOfRound: boolean; round: number; rounds: number } | null {
  const g = exs[idx]?.detail?.group;
  if (!g) return null;
  const members = exs.map((_, i) => i).filter((i) => exs[i].detail?.group === g && exs[i].change?.kind !== "skip");
  if (members.length < 2) return null;
  const blocks = new Map(members.map((i) => [i, planBlocks(exs[i].detail, exs[i].sets)]));
  const blockOpen = (i: number, b: number) => { const bl = blocks.get(i)![b]; return !!bl && bl.rows.some((k) => !done(i, k)); };
  const mine = blocks.get(idx)!;
  const round = Math.max(0, mine.findIndex((b) => b.rows.includes(setIdx)));
  const rounds = Math.max(...members.map((i) => blocks.get(i)!.length));
  if (blockOpen(idx, round)) return null; // quedan etapas de esta serie: se sigue con este ejercicio
  const later = members.slice(members.indexOf(idx) + 1).find((i) => blockOpen(i, round));
  if (later != null) return { idx: later, endOfRound: false, round, rounds };
  const first = members.find((i) => blocks.get(i)!.some((_, b) => blockOpen(i, b)));
  if (first == null) return null;
  const nextRound = blocks.get(first)!.findIndex((_, b) => blockOpen(first, b));
  return { idx: first, endOfRound: true, round: nextRound, rounds };
}

/** Vueltas programadas de un grupo: las del circuito si están indicadas; si no, la mayor cantidad de series de sus ejercicios. */
export function groupRounds(exs: ComboEx[], group: string) {
  const members = exs.filter((e) => e.detail?.group === group);
  const set = members.map((e) => e.detail?.rounds).find((r) => r != null);
  return { programmed: set ?? null, max: Math.max(0, ...members.map((e) => planBlocks(e.detail, e.sets).length)) };
}

/** Circuitos cuyas vueltas no coinciden con las series de algún ejercicio (las vueltas tienen que gobernar la ejecución). */
export function circuitIssues(exs: (ComboEx & { name: string })[]): { group: string; rounds: number; exercise: string; blocks: number }[] {
  const out: { group: string; rounds: number; exercise: string; blocks: number }[] = [];
  for (const g of new Set(exs.map((e) => e.detail?.group).filter(Boolean) as string[])) {
    const members = exs.filter((e) => e.detail?.group === g);
    if (!members.some((e) => e.detail?.groupKind === "circuit")) continue;
    const r = groupRounds(exs, g).programmed;
    if (r == null) continue;
    for (const e of members) { const n = planBlocks(e.detail, e.sets).length; if (n !== r) out.push({ group: g, rounds: r, exercise: e.name, blocks: n }); }
  }
  return out;
}

/**
 * Lleva un ejercicio a `n` series principales (para igualar las vueltas de un circuito). Agregar repite la última serie con
 * sus etapas (identidades nuevas); quitar saca las últimas y lo devuelve en `removed` para confirmarlo antes. Sin plan, sólo
 * cambia la cantidad de series.
 */
export function resizeBlocks(e: { sets: number; reps: string; rir: number | null; detail?: ExerciseDetail | null }, n: number): { sets: number; detail: ExerciseDetail | null; removed: number } {
  const target = clamp(n, 1, MAX_BLOCKS);
  if (!e.detail?.setPlan?.length) return { sets: target, detail: e.detail ?? null, removed: Math.max(0, e.sets - target) };
  const blocks = materialize(e.detail, e);
  const removed = Math.max(0, blocks.length - target);
  const next = blocks.slice(0, target);
  while (next.length < target) next.push(next[next.length - 1].map((r) => ({ ...r, id: newSpecId() })));
  const flat = flatten(next);
  return { sets: flat.length, detail: { ...e.detail, setPlan: flat }, removed };
}

/**
 * Después de editar el ejercicio `idx` de un día: si es parte de un circuito con vueltas, las vueltas pasan a todos sus
 * ejercicios y cada uno queda con una serie principal por vuelta (`resizeBlocks`). Devuelve también qué series se quitarían
 * para confirmarlo antes; sin circuito, el día no cambia.
 */
export function syncCircuit<T extends { name: string; sets: number; reps: string; rir: number | null; detail?: ExerciseDetail | null }>(exs: T[], idx: number): { exs: T[]; removed: { exercise: string; blocks: number }[]; rounds: number | null } {
  const d = exs[idx]?.detail;
  if (!d?.group || d.groupKind !== "circuit" || d.rounds == null) return { exs, removed: [], rounds: null };
  const rounds = d.rounds;
  const removed: { exercise: string; blocks: number }[] = [];
  const next = exs.map((e) => {
    if (e.detail?.group !== d.group) return e;
    const withRounds = { ...e, detail: { ...e.detail!, groupKind: "circuit" as const, rounds } };
    const r = resizeBlocks(withRounds, rounds);
    if (r.removed) removed.push({ exercise: e.name, blocks: r.removed });
    return { ...withRounds, sets: r.sets, detail: r.detail };
  });
  return { exs: next, removed, rounds };
}
