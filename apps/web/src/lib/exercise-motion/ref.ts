// Lo liviano de REPI Exercise Motion: lo que viaja en las respuestas del servidor y el orden de las fuentes. Sin poses ni
// dibujo (eso se carga bajo demanda con `import("@/lib/exercise-motion/bundle")`).

/** Demostración oficial para un ejercicio: exacta o variante compatible (con la diferencia escrita). */
export type MotionRef = { id: string; v: number; match: "exact" | "compatible"; difference?: string };
/** Video o enlace del gimnasio o del coach (D164). */
export type OrgMedia = { kind: "video" | "link"; url: string } | null;

export type MotionSource =
  | { kind: "official"; ref: MotionRef }
  | { kind: "org"; media: NonNullable<OrgMedia> }
  | { kind: "search"; url: string };

/**
 * Fuentes para mostrar «cómo se hace» un ejercicio, en orden: demostración oficial exacta → variante compatible (avisando
 * la diferencia) → video del gimnasio o del coach → búsqueda externa. La técnica escrita viene con la demostración oficial.
 * El video institucional nunca se oculta: si existe, se ofrece además de la demostración.
 */
export function getExerciseMediaForContext(p: { motion?: MotionRef | null; media?: OrgMedia; name: string; motionOn: boolean; searchOn?: boolean }): MotionSource[] {
  const out: MotionSource[] = [];
  if (p.motionOn && p.motion) out.push({ kind: "official", ref: p.motion });
  if (p.media) out.push({ kind: "org", media: p.media });
  if (p.searchOn !== false && !out.length) out.push({ kind: "search", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${p.name} técnica`)}` });
  return out;
}
