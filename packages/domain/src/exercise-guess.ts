// D186: al crear un ejercicio propio, REPI propone el grupo muscular y cómo se registra a partir del nombre («Remo en Smith» →
// Espalda, con peso). Es sólo una sugerencia visible que la persona cambia con un toque; si no reconoce el nombre, no propone.
// También la búsqueda por palabras: «remo smith» encuentra «Remo en máquina Smith» (antes había que escribir el nombre exacto).
// Ejercicios por tiempo (07/11/2026): `guessProfile` deduce del nombre si es una actividad (cinta, bici, remo ergómetro, elíptico,
// escaladora, sólo duración) o un aguante en segundos, y los sinónimos hacen que «cinta caminadora» encuentre «Cinta (caminata)».
import type { MetricsProfile } from "./activity";
import { exerciseKey, type EXERCISE_GROUPS } from "./exercise-catalog";

type Group = (typeof EXERCISE_GROUPS)[number];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Orden importa: lo más específico primero («remo ergómetro» es cardio, «remo» a secas es espalda).
const GROUP_RULES: [RegExp, Group][] = [
  [/\bbicicleta abdominal/, "Core"],
  [/\b(cinta|caminadora|treadmill|trotadora|bici|bicicleta|assault|air ?bike|eliptic|escaladora|stair|stepper|remo ergometro|remoergometro|rower|rowing|skierg|ski erg|jumping jack|soga de saltar|saltar la (soga|cuerda)|correr|trote|spinning|cardio)|^soga\b/, "Cardio"],
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

/**
 * Musculación con nombre de máquina de cardio: «Abdominales bicicleta», «Crunch bicicleta», «Bike crunch», «Abducción con cinta
 * elástica», «Sentadilla con banda», «Tríceps con soga», «Remo con soga». Nunca son una actividad (cinta, bici, soga…) ni van a Cardio.
 * «Banda caminadora» (o «banda sin fin») sí es la cinta.
 */
const CARDIO_LOOKALIKE = /\b(abdominal|crunch|elastic|banda(?!\s+(?:caminadora|sin\s?fin|para correr|de correr))|con cinta)|\b(triceps|polea|curl|jalon|face pull|extension|remo)\b.*\bsoga\b/;

/** Grupo muscular probable por el nombre, o null si no lo reconoce. */
export function guessExerciseGroup(name: string): Group | null {
  const t = fold(name);
  const lookalike = CARDIO_LOOKALIKE.test(t);
  for (const [re, g] of GROUP_RULES) if (!(g === "Cardio" && lookalike) && re.test(t)) return g;
  return null;
}

// Orden importa: lo más específico primero. «Remo» a secas, «Remo en máquina», «Bicicleta abdominal», «Tríceps con soga»,
// «Caminata lateral con banda» o «Step up» NO son actividades (ver también `CARDIO_LOOKALIKE`).
const PROFILE_RULES: [RegExp, MetricsProfile][] = [
  [/\b(cinta|caminadora|treadmill|trotadora)\b/, "treadmill"],
  [/\b(ciclo ?ergometro|bici|bicicleta|bike|airbike|assault|spinning|cycle)/, "bike"],
  [/\b(remo ?ergometro|ergometro de remo|remo indoor|maquina de remo|rower|rowing|concept ?2)/, "rower"],
  [/\beliptic|\belliptical/, "elliptical"],
  [/\b(escaladora|stair ?(climber|master|mill)?|stepper|simulador de escaleras?)\b/, "stair"],
  [/\b(saltar (la )?(soga|cuerda)|soga de saltar|salto(s)? (a|con|de) (la )?(soga|cuerda)|comba|jump ?rope|jumping jacks?|skierg|ski erg|correr|trote|running)|^soga\b/, "duration"],
  [/\b(plancha|isometric|wall sit|hollow hold|sentadilla (isometrica|en pared)|dead hang|aguante)/, "hold"],
];
/**
 * Perfil de métricas por el nombre: una actividad (cinta, bici, remo ergómetro, elíptico, escaladora, sólo duración) o un aguante
 * en segundos («Plancha»). null si el nombre no lo dice (lo decide el tipo de registro). Los nombres de musculación que se parecen
 * («Remo con barra», «Bicicleta abdominal», «Tríceps con soga») no son actividades.
 */
export function guessProfile(name: string): MetricsProfile | null {
  const t = fold(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const lookalike = CARDIO_LOOKALIKE.test(t); // «Abdominales bicicleta» no es una bici; «Plancha con banda» sigue siendo aguante
  for (const [re, p] of PROFILE_RULES) if (!(lookalike && p !== "hold") && re.test(t)) return p;
  return null;
}

/** Cómo se registra, por el nombre: por tiempo (plancha, cinta), peso corporal (dominadas, flexiones) o con peso. */
export function guessExerciseKind(name: string): "load_reps" | "bodyweight" | "time" {
  const t = fold(name);
  if (guessProfile(name)) return "time"; // actividades y aguante (cinta, bici, remo ergómetro, soga, plancha…)
  if (/\b(dominada|flexiones|lagartija|fondos|burpee|abdominal|crunch|pull ?up|chin ?up|puente)/.test(t) && !/\b(lastrad|con peso|con disco|maquina|asistid)/.test(t)) return "bodyweight";
  return "load_reps";
}

/**
 * Otros nombres con que se busca un ejercicio del catálogo («Cinta caminadora» es la «Cinta (caminata)»). Sólo para buscar y
 * reconocer: el ejercicio sigue siendo uno solo, con su historial, progreso y reemplazos.
 */
export const EXERCISE_SYNONYMS: Record<string, readonly string[]> = {
  "Cinta (caminata)": ["Cinta caminadora", "Caminadora", "Cinta para caminar", "Caminata en cinta", "Treadmill"],
  "Cinta (trote)": ["Cinta para correr", "Cinta de correr", "Trote en cinta", "Trotadora"],
  "Bicicleta fija": ["Bici fija", "Bicicleta estática", "Bici estática", "Spinning", "Bike"],
  "Bicicleta de aire": ["Assault bike", "Air bike", "Airbike"],
  "Remo ergómetro": ["Remo indoor", "Máquina de remo", "Remoergómetro", "Rower", "Concept 2"],
  "Elíptico": ["Elíptica", "Bicicleta elíptica"],
  "Escaladora": ["Stair climber", "Stairmaster", "Escalera", "Stepper"],
  "Soga (saltar la cuerda)": ["Saltar la soga", "Comba", "Jump rope"],
};
const synonymsByKey = new Map(Object.entries(EXERCISE_SYNONYMS).map(([n, xs]) => [exerciseKey(n), xs]));
/** Sinónimos de un ejercicio del catálogo (vacío si no tiene). */
export const exerciseSynonyms = (name: string): readonly string[] => synonymsByKey.get(exerciseKey(name)) ?? [];

/**
 * Búsqueda por palabras, sin tildes ni mayúsculas: todas las palabras de la búsqueda tienen que estar en el nombre o en sus
 * sinónimos («cinta caminadora» encuentra «Cinta (caminata)»; «treadmill» también).
 */
export function matchesExerciseQuery(name: string, query: string): boolean {
  const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !["en", "de", "del", "la", "el", "con", "al", "a"].includes(w));
  const n = [name, ...exerciseSynonyms(name)].map(fold).join(" | ");
  if (!words.length) return !fold(query).trim() || n.includes(fold(query).trim());
  return words.every((w) => n.includes(w));
}
