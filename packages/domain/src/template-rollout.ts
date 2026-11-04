// D194 · Actualizar los programas de los alumnos desde una plantilla (surgió del caso de Urko, D193): el profe editó la
// plantilla creyendo que sus alumnos recibían los cambios. Cada alumno entrena con su copia; esto calcula, sin tocar nada,
// qué cambió en la plantilla desde la versión de la que salió cada copia y qué cambió el profe en la copia de ese alumno
// (comparación de tres vías: base → plantilla, base → alumno). El profe elige qué aplicar; nada se aplica solo.
//
// Unidades de cambio: datos del programa (nombre, semanas, nota), días (nombre, agregado, quitado, orden de ejercicios) y
// ejercicios (agregado, quitado, modificado). Un ejercicio se identifica dentro del día por su ejercicio de la biblioteca y
// su ocurrencia («Sentadilla hack» #0, #1…); reemplazarlo por otro es quitar uno y agregar otro.
// Regla de seguridad: si la copia del alumno tiene una modificación propia en la misma unidad, es un conflicto y por defecto
// se conserva lo del alumno (sus cargas, métodos, descansos e indicaciones particulares no se pisan sin que el profe lo elija).
import { TECHNIQUES } from "./prescription";
import type { ProgramDayDoc, ProgramDoc, ProgramExerciseDoc } from "./training";

export type RolloutChange = {
  key: string;
  scope: "program" | "day" | "exercise";
  kind: "modify" | "add" | "remove" | "rename" | "order";
  day: number | null;
  /** Texto para el profe: «Día 1 · Sentadilla hack: 3 × 8-12 → top set + back-off (45, 40, 35 kg)». */
  text: string;
  /** La copia del alumno también cambió esto (distinto de la plantilla): por defecto se conserva lo del alumno. */
  conflict: boolean;
  /** Qué tiene hoy el alumno en esa unidad cuando hay conflicto. */
  student?: string | null;
};
export type RolloutPlan = { changes: RolloutChange[]; ownChanges: boolean; noBase: boolean };

const strip = (e: ProgramExerciseDoc) => {
  const d = e.detail ? JSON.parse(JSON.stringify(e.detail)) : null;
  if (d?.setPlan) for (const r of d.setPlan) delete r.id; // la identidad de la fila no es un cambio de programación
  return JSON.stringify({ sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, note: e.note ?? null, detail: d && Object.keys(d).length ? d : null });
};
const keyed = (d: ProgramDayDoc | undefined) => {
  const n = new Map<string, number>();
  return (d?.exercises ?? []).map((e) => { const k = n.get(e.exerciseId) ?? 0; n.set(e.exerciseId, k + 1); return { key: `${e.exerciseId}#${k}`, e }; });
};
const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}`;
/** «3 × 8-12 · RIR 1» o «Top set + back-off · 3 series (45, 40, 35 kg)». */
export function exerciseLine(e: ProgramExerciseDoc) {
  const t = e.detail?.technique && e.detail.technique !== "straight" ? TECHNIQUES[e.detail.technique]?.label : null;
  const loads = (e.detail?.setPlan ?? []).filter((r) => (r.stage ?? 0) === 0).map((r) => r.weightKg);
  const w = loads.some((x) => x != null) ? ` (${loads.map((x) => (x == null ? "—" : kg(x))).join(", ")} kg)` : "";
  const base = t ? `${t} · ${e.sets} series` : `${e.sets} × ${e.reps}${e.rir != null ? ` · RIR ${e.rir}` : ""}`;
  return `${base}${w}${e.restSec ? ` · descanso ${e.restSec} s` : ""}${e.note ? " · con indicación" : ""}`;
}
const dayLabel = (d: ProgramDayDoc | undefined, i: number) => d?.name?.trim() || `Día ${i + 1}`;

/**
 * Qué cambiaría en la copia de un alumno. `base` es la versión de la que salió su copia (o la última que se le aplicó); sin
 * base (programas anteriores), toda diferencia se trata como posible personalización.
 */
export function rolloutPlan(base: ProgramDoc | null, template: ProgramDoc, student: ProgramDoc): RolloutPlan {
  const changes: RolloutChange[] = [];
  const b = base ?? student; // sin base: se compara contra el alumno y cada diferencia queda como conflicto
  const noBase = !base;
  const conflictOf = (studentChanged: boolean) => noBase || studentChanged;
  let own = false;
  for (const f of ["name", "weeks", "note"] as const) {
    const tChanged = template[f] !== b[f], sChanged = student[f] !== b[f];
    if (sChanged) own = true;
    if (tChanged && template[f] !== student[f]) {
      const label = f === "name" ? "Nombre del programa" : f === "weeks" ? "Semanas" : "Nota del programa";
      changes.push({ key: `meta:${f}`, scope: "program", kind: "modify", day: null, conflict: conflictOf(sChanged),
        text: f === "note" ? `${label}: se actualiza` : `${label}: ${b[f]} → ${template[f]}`, student: sChanged ? String(student[f]) : null });
    }
  }
  const days = Math.max(b.days.length, template.days.length, student.days.length);
  for (let i = 0; i < days; i++) {
    const bd = b.days[i], td = template.days[i], sd = student.days[i];
    if (!bd && td) { if (!sd || JSON.stringify(sd) !== JSON.stringify(td)) changes.push({ key: `day:${i}:add`, scope: "day", kind: "add", day: i, conflict: false, text: `${dayLabel(td, i)}: día nuevo con ${td.exercises.length} ejercicios` }); continue; }
    if (bd && !td) {
      const sChanged = !sd || JSON.stringify(sd) !== JSON.stringify(bd);
      if (sd) { if (sChanged) own = true; changes.push({ key: `day:${i}:remove`, scope: "day", kind: "remove", day: i, conflict: conflictOf(sChanged), text: `${dayLabel(bd, i)}: se quita el día`, student: sChanged ? `${sd.exercises.length} ejercicios, con cambios propios` : null }); }
      continue;
    }
    if (!bd || !td) { if (sd && !bd) own = true; continue; }
    if (!sd) { own = true; continue; }
    if (td.name !== bd.name && td.name !== sd.name) {
      const sChanged = sd.name !== bd.name; if (sChanged) own = true;
      changes.push({ key: `day:${i}:rename`, scope: "day", kind: "rename", day: i, conflict: conflictOf(sChanged), text: `${dayLabel(bd, i)}: se llama «${td.name}»`, student: sChanged ? sd.name : null });
    } else if (sd.name !== bd.name) own = true;
    const kb = keyed(bd), kt = keyed(td), ks = keyed(sd);
    const mb = new Map(kb.map((x) => [x.key, x.e])), mt = new Map(kt.map((x) => [x.key, x.e])), ms = new Map(ks.map((x) => [x.key, x.e]));
    for (const { key, e } of kt) {
      const be = mb.get(key), se = ms.get(key);
      if (!be) { if (!se || strip(se) !== strip(e)) changes.push({ key: `ex:${i}:${key}:add`, scope: "exercise", kind: "add", day: i, conflict: !!se, text: `${dayLabel(td, i)} · ${e.name}: se agrega (${exerciseLine(e)})`, student: se ? exerciseLine(se) : null }); continue; }
      if (strip(be) === strip(e)) continue;
      if (se && strip(se) === strip(e)) continue; // el alumno ya lo tiene así
      const sChanged = !se || strip(se) !== strip(be);
      changes.push({ key: `ex:${i}:${key}:modify`, scope: "exercise", kind: "modify", day: i, conflict: conflictOf(sChanged),
        text: `${dayLabel(td, i)} · ${e.name}: ${exerciseLine(be)} → ${exerciseLine(e)}`, student: sChanged ? (se ? exerciseLine(se) : "lo quitaste de su programa") : null });
    }
    for (const { key, e } of kb) {
      if (mt.has(key)) continue;
      const se = ms.get(key);
      if (!se) continue; // el alumno tampoco lo tiene
      const sChanged = strip(se) !== strip(e);
      changes.push({ key: `ex:${i}:${key}:remove`, scope: "exercise", kind: "remove", day: i, conflict: conflictOf(sChanged), text: `${dayLabel(bd, i)} · ${e.name}: se quita`, student: sChanged ? exerciseLine(se) : null });
    }
    for (const { key, e } of ks) { const be = mb.get(key); if (!be || strip(be) !== strip(e)) own = true; }
    for (const { key } of kb) if (!ms.has(key)) own = true;
    // Orden: sólo entre los ejercicios que están en los tres.
    const common = (xs: { key: string }[]) => xs.map((x) => x.key).filter((k) => mb.has(k) && mt.has(k) && ms.has(k)).join(",");
    const ob = common(kb), ot = common(kt), os = common(ks);
    if (ot !== ob && ot !== os) { if (os !== ob) own = true; changes.push({ key: `day:${i}:order`, scope: "day", kind: "order", day: i, conflict: conflictOf(os !== ob), text: `${dayLabel(td, i)}: nuevo orden de los ejercicios`, student: os !== ob ? "el alumno tiene otro orden" : null }); }
    else if (os !== ob) own = true;
  }
  if (student.days.length > b.days.length) own = true;
  return { changes, ownChanges: noBase ? JSON.stringify(student) !== JSON.stringify(template) : own, noBase };
}

/** Selección por defecto: todo lo que no es conflicto. Los conflictos se aplican sólo si el profe los marca. */
export const rolloutDefaults = (p: RolloutPlan) => p.changes.filter((c) => !c.conflict).map((c) => c.key);

/**
 * Aplica sobre la copia del alumno los cambios elegidos de la plantilla. Lo que no se elige queda como lo tiene el alumno.
 * Nunca toca resultados: sólo arma el documento de la versión nueva.
 */
export function applyRollout(base: ProgramDoc | null, template: ProgramDoc, student: ProgramDoc, selected: Iterable<string>): ProgramDoc {
  const sel = new Set(selected);
  const b = base ?? student;
  const out: ProgramDoc = JSON.parse(JSON.stringify(student));
  for (const f of ["name", "weeks", "note"] as const) if (sel.has(`meta:${f}`)) (out as Record<string, unknown>)[f] = template[f];
  const removeDays = new Set<number>();
  const addDays: ProgramDayDoc[] = [];
  const days = Math.max(b.days.length, template.days.length, student.days.length);
  for (let i = 0; i < days; i++) {
    const bd = b.days[i], td = template.days[i];
    if (!bd && td) { if (sel.has(`day:${i}:add`)) { if (out.days[i]) addDays.push(JSON.parse(JSON.stringify(td))); else out.days[i] = JSON.parse(JSON.stringify(td)); } continue; }
    if (bd && !td) { if (sel.has(`day:${i}:remove`) && out.days[i]) removeDays.add(i); continue; }
    if (!bd || !td || !out.days[i]) continue;
    const od = out.days[i];
    if (sel.has(`day:${i}:rename`)) od.name = td.name;
    const kt = keyed(td);
    const mt = new Map(kt.map((x) => [x.key, x.e]));
    let cur = keyed(od);
    // Quitar y modificar.
    cur = cur.filter((x) => !sel.has(`ex:${i}:${x.key}:remove`)).map((x) => (sel.has(`ex:${i}:${x.key}:modify`) && mt.has(x.key) ? { key: x.key, e: JSON.parse(JSON.stringify(mt.get(x.key)!)) } : x));
    // Agregar: después del ejercicio que lo precede en la plantilla (si el alumno lo tiene), si no, al final.
    for (const [ti, { key, e }] of kt.entries()) {
      const k = `ex:${i}:${key}:add`;
      if (!sel.has(k)) continue;
      const at = cur.findIndex((x) => x.key === key);
      if (at >= 0) { cur[at] = { key, e: JSON.parse(JSON.stringify(e)) }; continue; }
      let pos = cur.length;
      for (let j = ti - 1; j >= 0; j--) { const p = cur.findIndex((x) => x.key === kt[j].key); if (p >= 0) { pos = p + 1; break; } }
      cur.splice(pos, 0, { key, e: JSON.parse(JSON.stringify(e)) });
    }
    if (sel.has(`day:${i}:order`)) {
      const order = kt.map((x) => x.key);
      const inT = cur.filter((x) => order.includes(x.key)).sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key));
      const res: typeof cur = [];
      let t = 0;
      for (const x of cur) res.push(order.includes(x.key) ? inT[t++] : x); // los propios del alumno quedan en su lugar
      cur = res;
    }
    od.exercises = cur.map((x) => x.e);
  }
  out.days = out.days.filter((_, i) => !removeDays.has(i)).concat(addDays);
  return out;
}
