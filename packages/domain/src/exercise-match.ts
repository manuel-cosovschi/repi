// Nombres frecuentes escritos en notas. Sólo equivalencias explícitas: un nombre incompleto
// como «Polea» o «Press inclinado» no alcanza para elegir un implemento o una variante.
import { exerciseKey } from "./exercise-catalog";

const looseKey = (s: string) => exerciseKey(s.replace(/\bc\//gi, "con ")).split(" ")
  .filter((w) => !["de", "del", "con", "en", "la", "el", "los", "las", "a", "al"].includes(w)).join(" ");

const ALIASES: [string[], string][] = [
  [["Press plano", "Press plano con barra", "Press de banca plano", "Banco plano", "Bench press", "Flat bench press"], "Press de banca"],
  [["Press plano con mancuernas", "Press plano con mancuerna", "Press banca con mancuerna", "Dumbbell bench press"], "Press de banca con mancuernas"],
  [["Sentadillas", "Squat", "Barbell squat"], "Sentadilla"],
  [["Peso muerto convencional", "Deadlift", "Conventional deadlift"], "Peso muerto"],
  [["Romanian deadlift", "RDL"], "Peso muerto rumano"],
  [["Lat pulldown", "Jalon al pecho en polea"], "Jalón al pecho"],
  [["Triceps en polea", "Extensiones de triceps en polea"], "Extensión de tríceps en polea"],
];
const aliases = new Map(ALIASES.flatMap(([written, name]) => written.map((s) => [looseKey(s), name] as const)));

/** Resuelve nombres en memoria. La coincidencia de la biblioteca tiene prioridad sobre los alias. */
export function makeExerciseMatcher<T extends { id: string; name: string }>(library: T[]): (written: string) => T | null {
  const exact = new Map<string, T | null>();
  const loose = new Map<string, T | null>();
  const add = (map: Map<string, T | null>, key: string, row: T) => {
    if (!map.has(key)) map.set(key, row);
    else if (map.get(key)?.id !== row.id) map.set(key, null); // nombres iguales con distinta identidad: no adivinar
  };
  for (const row of library) { add(exact, exerciseKey(row.name), row); add(loose, looseKey(row.name), row); }
  return (written) => {
    const key = exerciseKey(written), lk = looseKey(written);
    if (exact.has(key)) return exact.get(key) ?? null;
    if (loose.has(lk)) return loose.get(lk) ?? null;
    const canonical = aliases.get(lk);
    return canonical ? exact.get(exerciseKey(canonical)) ?? null : null;
  };
}
