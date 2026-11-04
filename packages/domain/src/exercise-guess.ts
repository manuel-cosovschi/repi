// D186: al crear un ejercicio propio, REPI propone el grupo muscular y cómo se registra a partir del nombre («Remo en Smith» →
// Espalda, con peso). Es sólo una sugerencia visible que la persona cambia con un toque; si no reconoce el nombre, no propone.
// También la búsqueda por palabras: «remo smith» encuentra «Remo en máquina Smith» (antes había que escribir el nombre exacto).
import type { EXERCISE_GROUPS } from "./exercise-catalog";

type Group = (typeof EXERCISE_GROUPS)[number];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Orden importa: lo más específico primero («remo ergómetro» es cardio, «remo» a secas es espalda).
const GROUP_RULES: [RegExp, Group][] = [
  [/\b(cinta|caminadora|bici|bicicleta|eliptic|escaladora|remo ergometro|remoergometro|soga|saltar la cuerda|correr|trote|spinning|cardio)/, "Cardio"],
  [/\b(movilidad|estiramiento|elongacion|foam|rodillo)/, "Movilidad"],
  [/\b(burpee|thruster|clean|snatch|arranque|envion|kettlebell swing|cuerpo completo|full body)/, "Cuerpo completo"],
  [/\b(hip thrust|gluteo|patada|abduccion|abductor|puente)/, "Glúteos"],
  [/\b(plancha|abdominal|crunch|core|rueda|pallof|elevacion de piernas|russian|bicho muerto|dead bug)/, "Core"],
  [/\b(sentadilla|prensa|zancada|estocada|bulgara|cuadriceps|isquio|femoral|camilla|sillon|gemelo|pantorrilla|aductor|peso muerto rumano|piernas)/, "Piernas"],
  [/\b(remo|jalon|dominada|pull ?down|pull ?up|polea al pecho|espalda|dorsal|pullover|peso muerto|hiperextension)/, "Espalda"],
  [/\b(press (de )?banca|banco plano|banco inclinado|pecho|pectoral|apertura|cruce|peck|pec deck|flexiones|lagartija|fondos)/, "Pecho"],
  [/\b(militar|hombro|deltoide|elevacion(es)? lateral|elevacion(es)? frontal|face pull|vuelos|pajaros|press arnold|press de hombros)/, "Hombros"],
  [/\b(curl|biceps|triceps|martillo|frances|patada de triceps|antebrazo|press cerrado)/, "Brazos"],
];

/** Grupo muscular probable por el nombre, o null si no lo reconoce. */
export function guessExerciseGroup(name: string): Group | null {
  const t = fold(name);
  for (const [re, g] of GROUP_RULES) if (re.test(t)) return g;
  return null;
}

/** Cómo se registra, por el nombre: por tiempo (plancha, cinta), peso corporal (dominadas, flexiones) o con peso. */
export function guessExerciseKind(name: string): "load_reps" | "bodyweight" | "time" {
  const t = fold(name);
  if (/\b(plancha|cinta|caminadora|bici|bicicleta|eliptic|escaladora|soga|correr|trote|spinning|isometric|wall sit)/.test(t)) return "time";
  if (/\b(dominada|flexiones|lagartija|fondos|burpee|abdominal|crunch|pull ?up|chin ?up|puente)/.test(t) && !/\b(lastrad|con peso|con disco|maquina|asistid)/.test(t)) return "bodyweight";
  return "load_reps";
}

/** Búsqueda por palabras, sin tildes ni mayúsculas: todas las palabras de la búsqueda tienen que estar en el nombre. */
export function matchesExerciseQuery(name: string, query: string): boolean {
  const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !["en", "de", "del", "la", "el", "con", "al", "a"].includes(w));
  if (!words.length) return !fold(query).trim() || fold(name).includes(fold(query).trim());
  const n = fold(name);
  return words.every((w) => n.includes(w));
}
