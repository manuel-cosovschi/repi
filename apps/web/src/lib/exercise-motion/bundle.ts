// Todo lo pesado de REPI Exercise Motion en un solo trozo que las pantallas cargan bajo demanda (import dinámico): la
// biblioteca, el dibujo y el mapa muscular. El service worker lo guarda como cualquier archivo de /_next/static/, así que
// después de abrirse una vez funciona sin conexión.
export { getMotionEntry, getExerciseDemonstration, getExerciseTechnique, getExerciseMuscleMap, getExerciseVariants } from "./resolve";
export { renderFrame, framing, frameTransform } from "./render";
export { MUSCLES } from "./muscles";
export { ZONES, SILHOUETTE, MAP_VIEWBOX, sidesOf } from "./musclemap";
