// El resolver único de REPI Exercise Motion: de un ejercicio del catálogo a su demostración, técnica, músculos y variantes.
// Lo usan el servidor (para avisar en cada respuesta qué demostración corresponde) y el visor (para dibujarla).
//
// Identidad: sólo los ejercicios del catálogo GLOBAL (sin organización ni dueño) se resuelven, y por nombre exacto. Un
// ejercicio propio de un gimnasio, de un coach o de un alumno puede llamarse igual y ser otra cosa: no se le asigna nada.
import { byId, LIBRARY } from "./library";
import type { MotionEntry } from "./library/types";
import type { MotionRef } from "./ref";

const index = new Map<string, MotionRef>();
for (const e of LIBRARY) for (const n of e.catalog) index.set(n, { id: e.id, v: e.version, match: "exact" });
for (const e of LIBRARY) for (const c of e.compatible ?? []) if (!index.has(c.name)) index.set(c.name, { id: e.id, v: e.version, match: "compatible", difference: c.difference });

/** Demostración para un ejercicio: exacta, compatible o ninguna. `global` = es del catálogo base. */
export function resolveExerciseMotion(ex: { name: string; global: boolean }): MotionRef | null {
  return ex.global ? index.get(ex.name) ?? null : null;
}
const entry = (id: string): MotionEntry | null => byId.get(id) ?? null;
export const getExerciseDemonstration = (id: string) => entry(id)?.motion ?? null;
export const getExerciseTechnique = (id: string) => entry(id)?.technique ?? null;
export const getExerciseMuscleMap = (id: string) => entry(id)?.anatomy ?? null;
/** Ejercicios del catálogo que muestra la demostración: exactos y compatibles (con la diferencia). */
export function getExerciseVariants(id: string) {
  const e = entry(id);
  return e ? { exact: e.catalog, compatible: e.compatible ?? [] } : null;
}
export { entry as getMotionEntry };

/** Cobertura del catálogo global: qué nombres tienen demostración exacta, compatible o ninguna. */
export function motionCoverage(globalNames: string[]) {
  const rows = globalNames.map((name) => ({ name, ref: index.get(name) ?? null }));
  return {
    total: rows.length,
    exact: rows.filter((r) => r.ref?.match === "exact").length,
    compatible: rows.filter((r) => r.ref?.match === "compatible").length,
    rows,
  };
}
