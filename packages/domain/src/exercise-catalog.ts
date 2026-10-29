// Catálogo base de ejercicios (D129). Global: lo ven todos los coaches y gimnasios. Cada organización suma los suyos
// («ejercicio propio») cuando algo no está acá. Nombres en español rioplatense, sin marcas. Sin videos todavía.

import type { ExerciseKind } from "./session-changes";
export const EXERCISE_KIND_LABEL: Record<ExerciseKind, string> = { load_reps: "Peso y repeticiones", bodyweight: "Peso corporal (repeticiones)", time: "Tiempo" };
export const EXERCISE_GROUPS = ["Pecho", "Espalda", "Hombros", "Brazos", "Piernas", "Glúteos", "Core", "Cuerpo completo", "Cardio", "Movilidad"] as const;
export type ExerciseGroup = (typeof EXERCISE_GROUPS)[number];

type Row = [string, ExerciseGroup, ExerciseKind];
const L = "load_reps", B = "bodyweight", T = "time";

export const EXERCISE_CATALOG: Row[] = [
  // Pecho
  ["Press de banca", "Pecho", L], ["Press de banca con mancuernas", "Pecho", L], ["Press inclinado con barra", "Pecho", L], ["Press inclinado mancuernas", "Pecho", L],
  ["Press declinado con barra", "Pecho", L], ["Press declinado con mancuernas", "Pecho", L], ["Press en máquina", "Pecho", L], ["Press inclinado en máquina", "Pecho", L],
  ["Press en multipower", "Pecho", L], ["Aperturas con mancuernas", "Pecho", L], ["Aperturas inclinadas con mancuernas", "Pecho", L], ["Aperturas en máquina (pec deck)", "Pecho", L],
  ["Cruce de poleas", "Pecho", L], ["Cruce de poleas bajas", "Pecho", L], ["Pullover con mancuerna", "Pecho", L], ["Flexiones", "Pecho", B], ["Flexiones inclinadas", "Pecho", B],
  ["Flexiones declinadas", "Pecho", B], ["Flexiones diamante", "Pecho", B], ["Fondos para pecho", "Pecho", B], ["Press con banda elástica", "Pecho", L],
  // Espalda
  ["Dominadas", "Espalda", B], ["Dominadas supinas", "Espalda", B], ["Dominadas asistidas", "Espalda", L], ["Jalón al pecho", "Espalda", L], ["Jalón al pecho agarre cerrado", "Espalda", L],
  ["Jalón al pecho supino", "Espalda", L], ["Jalón tras nuca", "Espalda", L], ["Remo con barra", "Espalda", L], ["Remo Pendlay", "Espalda", L], ["Remo con mancuerna a una mano", "Espalda", L],
  ["Remo en polea", "Espalda", L], ["Remo en máquina", "Espalda", L], ["Remo en T", "Espalda", L], ["Remo invertido", "Espalda", B], ["Remo con apoyo en banco inclinado", "Espalda", L],
  ["Pullover en polea", "Espalda", L], ["Face pull", "Espalda", L], ["Encogimientos con barra", "Espalda", L], ["Encogimientos con mancuernas", "Espalda", L],
  ["Peso muerto", "Espalda", L], ["Peso muerto con barra hexagonal", "Espalda", L], ["Rack pull", "Espalda", L], ["Hiperextensiones", "Espalda", B], ["Hiperextensiones con peso", "Espalda", L],
  ["Buenos días", "Espalda", L],
  // Hombros
  ["Press militar", "Hombros", L], ["Press militar sentado con barra", "Hombros", L], ["Press de hombros con mancuernas", "Hombros", L], ["Press Arnold", "Hombros", L],
  ["Press de hombros en máquina", "Hombros", L], ["Press landmine", "Hombros", L], ["Elevaciones laterales", "Hombros", L], ["Elevaciones laterales en polea", "Hombros", L],
  ["Elevaciones laterales en máquina", "Hombros", L], ["Elevaciones frontales", "Hombros", L], ["Elevaciones frontales con disco", "Hombros", L], ["Pájaros con mancuernas", "Hombros", L],
  ["Vuelos posteriores en máquina", "Hombros", L], ["Remo al mentón", "Hombros", L], ["Rotación externa en polea", "Hombros", L], ["Rotación interna en polea", "Hombros", L],
  ["Y-T-W en banco inclinado", "Hombros", L], ["Pino contra la pared", "Hombros", T], ["Flexiones pike", "Hombros", B],
  // Brazos
  ["Curl con barra", "Brazos", L], ["Curl con barra Z", "Brazos", L], ["Curl con mancuernas", "Brazos", L], ["Curl alternado con mancuernas", "Brazos", L], ["Curl martillo", "Brazos", L],
  ["Curl concentrado", "Brazos", L], ["Curl en banco Scott", "Brazos", L], ["Curl inclinado con mancuernas", "Brazos", L], ["Curl en polea", "Brazos", L], ["Curl spider", "Brazos", L],
  ["Curl invertido", "Brazos", L], ["Curl de muñeca", "Brazos", L], ["Extensión de muñeca", "Brazos", L], ["Fondos en paralelas", "Brazos", B], ["Fondos en banco", "Brazos", B],
  ["Press francés", "Brazos", L], ["Press francés con mancuernas", "Brazos", L], ["Extensión de tríceps en polea", "Brazos", L], ["Extensión de tríceps con soga", "Brazos", L],
  ["Extensión de tríceps sobre la cabeza", "Brazos", L], ["Extensión de tríceps en polea sobre la cabeza", "Brazos", L], ["Patada de tríceps", "Brazos", L], ["Press de banca agarre cerrado", "Brazos", L],
  ["Extensión de tríceps en máquina", "Brazos", L],
  // Piernas
  ["Sentadilla", "Piernas", L], ["Sentadilla frontal", "Piernas", L], ["Sentadilla goblet", "Piernas", L], ["Sentadilla en multipower", "Piernas", L], ["Sentadilla hack", "Piernas", L],
  ["Sentadilla búlgara", "Piernas", L], ["Sentadilla sumo", "Piernas", L], ["Sentadilla con peso corporal", "Piernas", B], ["Sentadilla con salto", "Piernas", B], ["Sentadilla a una pierna (pistol)", "Piernas", B],
  ["Sentadilla en pared", "Piernas", T], ["Prensa", "Piernas", L], ["Prensa a una pierna", "Piernas", L], ["Estocadas", "Piernas", L], ["Estocadas caminando", "Piernas", L],
  ["Estocadas hacia atrás", "Piernas", L], ["Estocadas laterales", "Piernas", L], ["Step up al cajón", "Piernas", L], ["Extensión de cuádriceps", "Piernas", L], ["Curl femoral", "Piernas", L],
  ["Curl femoral sentado", "Piernas", L], ["Curl femoral acostado", "Piernas", L], ["Curl nórdico", "Piernas", B], ["Peso muerto rumano", "Piernas", L], ["Peso muerto rumano con mancuernas", "Piernas", L],
  ["Peso muerto a una pierna", "Piernas", L], ["Peso muerto sumo", "Piernas", L], ["Gemelos de pie", "Piernas", L], ["Gemelos sentado", "Piernas", L], ["Gemelos en prensa", "Piernas", L],
  ["Aductores en máquina", "Piernas", L], ["Abductores en máquina", "Piernas", L], ["Saltos al cajón", "Piernas", B],
  // Glúteos
  ["Hip thrust", "Glúteos", L], ["Hip thrust en máquina", "Glúteos", L], ["Hip thrust a una pierna", "Glúteos", B], ["Puente de glúteos", "Glúteos", B], ["Puente de glúteos con peso", "Glúteos", L],
  ["Patada de glúteo en polea", "Glúteos", L], ["Patada de glúteo en máquina", "Glúteos", L], ["Abducción de cadera con banda", "Glúteos", B], ["Caminata lateral con banda", "Glúteos", B],
  ["Frog pump", "Glúteos", B], ["Pull through en polea", "Glúteos", L], ["Clamshell con banda", "Glúteos", B],
  // Core
  ["Plancha", "Core", T], ["Plancha lateral", "Core", T], ["Plancha con toque de hombros", "Core", B], ["Abdominales (crunch)", "Core", B], ["Crunch en polea", "Core", L],
  ["Crunch inverso", "Core", B], ["Elevación de piernas colgado", "Core", B], ["Elevación de rodillas colgado", "Core", B], ["Elevación de piernas acostado", "Core", B],
  ["Rueda abdominal", "Core", B], ["Pallof press", "Core", L], ["Leñador en polea", "Core", L], ["Giro ruso", "Core", B], ["Dead bug", "Core", B], ["Bird dog", "Core", B],
  ["Hollow hold", "Core", T], ["Mountain climbers", "Core", T], ["Bicicleta abdominal", "Core", B], ["Paseo del granjero", "Core", L], ["Paseo con carga a un lado", "Core", L],
  ["Superman", "Core", B], ["Sit-up", "Core", B],
  // Cuerpo completo / funcional
  ["Burpees", "Cuerpo completo", B], ["Swing con kettlebell", "Cuerpo completo", L], ["Cargada de potencia", "Cuerpo completo", L], ["Arranque", "Cuerpo completo", L],
  ["Envión", "Cuerpo completo", L], ["Thruster", "Cuerpo completo", L], ["Clean con mancuerna", "Cuerpo completo", L], ["Turkish get-up", "Cuerpo completo", L],
  ["Wall ball", "Cuerpo completo", L], ["Lanzamiento de balón medicinal", "Cuerpo completo", L], ["Empuje de trineo", "Cuerpo completo", T], ["Arrastre de trineo", "Cuerpo completo", T],
  ["Battle ropes", "Cuerpo completo", T], ["Salto de rana", "Cuerpo completo", B], ["Oso (bear crawl)", "Cuerpo completo", T],
  // Cardio
  ["Cinta (caminata)", "Cardio", T], ["Cinta (trote)", "Cardio", T], ["Bicicleta fija", "Cardio", T], ["Bicicleta de aire", "Cardio", T], ["Remo ergómetro", "Cardio", T],
  ["Elíptico", "Cardio", T], ["Escaladora", "Cardio", T], ["Soga (saltar la cuerda)", "Cardio", T], ["Jumping jacks", "Cardio", T], ["Skierg", "Cardio", T],
  // Movilidad
  ["Movilidad de cadera 90/90", "Movilidad", T], ["Estiramiento de isquiotibiales", "Movilidad", T], ["Estiramiento de flexores de cadera", "Movilidad", T],
  ["Movilidad de tobillo", "Movilidad", T], ["Movilidad torácica", "Movilidad", T], ["Gato-vaca", "Movilidad", T], ["Postura del niño", "Movilidad", T],
  ["Dislocaciones de hombro con palo", "Movilidad", B], ["Rotaciones de cadera", "Movilidad", B], ["Foam roller", "Movilidad", T],
];

/** Nombre de un ejercicio propio: espacios normalizados, 2 a 60 caracteres, primera letra en mayúscula. */
export function cleanExerciseName(raw: string): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 60 || !/\p{L}/u.test(s)) return null;
  return s[0].toLocaleUpperCase("es-AR") + s.slice(1);
}

/** Clave para detectar duplicados: sin mayúsculas, tildes ni signos («Jalón al pecho» = «jalon al pecho»). */
export const exerciseKey = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
