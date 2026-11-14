// Interruptores por módulo (docs/FEATURE_FLAGS.md). Un módulo apagado no se muestra: nada de botones que llevan a
// pantallas vacías ni capacidades anunciadas antes de estar listas. Los datos no se borran al apagar un módulo.
// Override sin tocar código: NEXT_PUBLIC_REPI_FEATURES="body,-club" (enciende body, apaga club). Se fija en el build,
// así que cambiarlo en Vercel requiere un redeploy.
export const FEATURES = {
  adaptive: { on: true, what: "«No vino el profe» / «Entrenar por mi cuenta» y reemplazos aprobados (reglas, sin IA)" },
  connect: { on: true, what: "REPI Connect · seguimiento de sala. Interruptor general: además cada gimnasio lo activa REPI Admin (piloto)" },
  gym_access: { on: true, what: "Control de acceso del gimnasio (membresía, QR dinámico de ingreso, pase presencial). Interruptor general: además cada gimnasio lo activa REPI Admin" },
  club: { on: true, what: "Repi Club del gimnasio: publicaciones voluntarias, ranking y moderación" },
  nutrition: { on: false, what: "REPI Nutrition Intelligence 1.0 (D221): diario de comidas, biblioteca de alimentos, recetas, progreso nutricional, asistente y vista del coach con permiso. Apagado para personas reales hasta completar la activación (docs/nutrition/NUTRITION_INTELLIGENCE_1.md §Activación); las cuentas de la demo guiada lo tienen como piloto" },
  nutrition_scan: { on: true, what: "Nutrición: consulta de productos envasados por código de barras en Open Food Facts (ODbL, caché aparte). Sólo actúa donde Nutrición está encendida" },
  nutrition_photo: { on: false, what: "Nutrición: interpretación de fotos de platos con IA. No construida en 1.0: requiere validar exactitud, costos y privacidad" },
  body: { on: false, what: "Mi cuerpo (Body Intelligence): faltan registro de medidas y fotos, y el visor" },
  progress: { on: true, what: "Progreso 1.0: resumen del período y evolución por ejercicio (fuerza, cargas, repeticiones, volumen y récords) desde el historial (D199)" },
  body_weight: { on: true, what: "Mi cuerpo: peso corporal, objetivo y su gráfico. Privado del alumno; no se ofrece a menores (D199)" },
  calories: { on: true, what: "Calorías estimadas por entrenamiento (rango con MET del Compendium), sólo adultos confirmados y con peso registrado (D199, D203)" },
  progress_photos: { on: true, what: "Fotos de progreso privadas con comparador, sólo adultos confirmados; tope de Storage 800 MB y 150 MB por persona (D200, LB-11)" },
  announcements: { on: true, what: "Novedades de REPI en la campanita y en coach/gimnasio, publicadas desde REPI Admin (D202)" },
  assistant: { on: true, what: "Asistente REPI (Adaptive Coaching 3.0, D210): tarjeta de Inicio, conversación, briefing en el entrenamiento, cierre y preferencias. El servidor decide y valida todo; sin IA responde por reglas" },
  exercise_motion: { on: true, what: "REPI Exercise Motion 1.0 (D220): demostraciones oficiales animadas, técnica escrita y músculos de los ejercicios más usados, en el entrenamiento, el kiosco y el panel del coach. Revisión interna de REPI; el video del gimnasio o del coach se sigue ofreciendo" },
  exercise_video: { on: true, what: "Cómo se hace cada ejercicio en la sesión: video o enlace del gimnasio o del coach (D164); si no hay, búsqueda en YouTube" },
} as const;
export type Feature = keyof typeof FEATURES;

export function parseFeatures(raw: string | undefined): Partial<Record<Feature, boolean>> {
  const out: Partial<Record<Feature, boolean>> = {};
  for (const t of (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const off = t.startsWith("-");
    const k = (off ? t.slice(1) : t) as Feature;
    if (k in FEATURES) out[k] = !off;
  }
  return out;
}
// Se lee en cada consulta (en el navegador Next la reemplaza por el valor del build; en el servidor y en las pruebas sigue
// la variable de entorno vigente).
let memo: { raw: string | undefined; o: Partial<Record<Feature, boolean>> } | null = null;
export const featureOn = (f: Feature) => {
  const raw = process.env.NEXT_PUBLIC_REPI_FEATURES;
  if (!memo || memo.raw !== raw) memo = { raw, o: parseFeatures(raw) };
  return memo.o[f] ?? FEATURES[f].on;
};

// Consentimientos que dependen de un módulo (D117): con el módulo apagado no se ofrecen. Lo ya compartido se sigue mostrando
// donde el alumno administra su privacidad, para que pueda revocarlo.
const CONSENT_FEATURE: Partial<Record<string, Feature>> = { measurements: "body", progress_photos: "body", nutrition: "nutrition", nutrition_journal: "nutrition" };
export const consentOffered = (key: string) => { const f = CONSENT_FEATURE[key]; return !f || featureOn(f); };
