// REPI Exercise Motion: músculos que se marcan en las demostraciones y en el mapa muscular. Es una guía didáctica general:
// no representa la anatomía de la persona ni porcentajes de activación (no se inventan).
export const MUSCLES = {
  pectoral: { label: "Pectoral mayor", view: "front" },
  pectoral_superior: { label: "Pectoral (porción clavicular)", view: "front" },
  deltoide_anterior: { label: "Deltoides anterior", view: "front" },
  deltoide_lateral: { label: "Deltoides lateral", view: "both" },
  deltoide_posterior: { label: "Deltoides posterior", view: "back" },
  biceps: { label: "Bíceps", view: "front" },
  triceps: { label: "Tríceps", view: "back" },
  antebrazo: { label: "Antebrazo", view: "both" },
  serrato: { label: "Serrato anterior", view: "front" },
  recto_abdominal: { label: "Recto abdominal", view: "front" },
  oblicuos: { label: "Oblicuos", view: "front" },
  flexores_cadera: { label: "Flexores de cadera", view: "front" },
  trapecio: { label: "Trapecio superior", view: "back" },
  espalda_media: { label: "Romboides y trapecio medio", view: "back" },
  dorsal: { label: "Dorsal ancho", view: "back" },
  infraespinoso: { label: "Manguito rotador (infraespinoso)", view: "back" },
  lumbar: { label: "Erectores espinales", view: "back" },
  gluteo_mayor: { label: "Glúteo mayor", view: "back" },
  gluteo_medio: { label: "Glúteo medio", view: "back" },
  cuadriceps: { label: "Cuádriceps", view: "front" },
  aductores: { label: "Aductores", view: "front" },
  isquiotibiales: { label: "Isquiotibiales", view: "back" },
  gemelos: { label: "Gemelos", view: "back" },
  soleo: { label: "Sóleo", view: "back" },
} as const satisfies Record<string, { label: string; view: "front" | "back" | "both" }>;
export type MuscleId = keyof typeof MUSCLES;
export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];
