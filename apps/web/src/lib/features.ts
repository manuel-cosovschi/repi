// Interruptores por módulo (docs/FEATURE_FLAGS.md). Un módulo apagado no se muestra: nada de botones que llevan a
// pantallas vacías ni capacidades anunciadas antes de estar listas. Los datos no se borran al apagar un módulo.
// Override sin tocar código: NEXT_PUBLIC_REPI_FEATURES="body,-club" (enciende body, apaga club). Se fija en el build,
// así que cambiarlo en Vercel requiere un redeploy.
export const FEATURES = {
  adaptive: { on: true, what: "«No vino el profe» / «Entrenar por mi cuenta» y reemplazos aprobados (reglas, sin IA)" },
  connect: { on: true, what: "REPI Connect · seguimiento de sala. Interruptor general: además cada gimnasio lo activa REPI Admin (piloto)" },
  gym_access: { on: true, what: "Control de acceso del gimnasio (membresía, QR dinámico de ingreso, pase presencial). Interruptor general: además cada gimnasio lo activa REPI Admin" },
  club: { on: true, what: "Repi Club del gimnasio: publicaciones voluntarias, ranking y moderación" },
  nutrition: { on: false, what: "Pestaña Nutrición en la ficha del coach: falta la carga desde la app del alumno" },
  body: { on: false, what: "Mi cuerpo (Body Intelligence): faltan registro de medidas y fotos, y el visor" },
  exercise_video: { on: false, what: "Video demostración del ejercicio en la sesión: faltan medios licenciados" },
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
const OVERRIDES = parseFeatures(process.env.NEXT_PUBLIC_REPI_FEATURES);
export const featureOn = (f: Feature) => OVERRIDES[f] ?? FEATURES[f].on;

// Consentimientos que dependen de un módulo (D117): con el módulo apagado no se ofrecen. Lo ya compartido se sigue mostrando
// donde el alumno administra su privacidad, para que pueda revocarlo.
const CONSENT_FEATURE: Partial<Record<string, Feature>> = { measurements: "body", progress_photos: "body", nutrition: "nutrition" };
export const consentOffered = (key: string) => { const f = CONSENT_FEATURE[key]; return !f || featureOn(f); };
