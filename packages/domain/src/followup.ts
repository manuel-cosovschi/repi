// Seguimiento (Etapa 4): check-in, molestias, lesiones, pedidos y solicitudes de acceso.
// Fuente: REPI App Alumno v4.dc.html (hojas checkin/pain/help/healthAdd) y REPI Desktop Coach.dc.html (bandeja, Salud).

export const PAIN_ZONES = ["Hombro der.", "Hombro izq.", "Codo", "Muñeca", "Cuello", "Lumbar", "Cadera", "Rodilla der.", "Rodilla izq.", "Tobillo", "Otra"] as const;
export const INJURY_ZONES = ["Hombro", "Codo", "Muñeca", "Columna", "Cadera", "Rodilla", "Tobillo", "Otra"] as const;
export const INJURY_STATUS = { active: "Activa", monitoring: "En seguimiento", resolved: "Resuelta" } as const;
export type InjuryStatus = keyof typeof INJURY_STATUS;
export const PAIN_CONTEXT = { now: "Durante el entrenamiento", after: "Después de entrenar", out: "Fuera del entrenamiento" } as const;
export const REQUEST_KIND = { rutina: "Cambiar rutina", tecnica: "Revisar técnica", consulta: "Consulta", programa: "Pedir programa" } as const;
export type RequestKind = keyof typeof REQUEST_KIND;

/** Tipos de dato que el coach puede pedir (los que el alumno controla en Privacidad). */
export const ACCESS_ITEMS = {
  health: { label: "Salud", phrase: "información de salud (lesiones y molestias)", reason: "Para adaptar ejercicios a tus molestias." },
  nutrition: { label: "Nutrición", phrase: "registro de nutrición", reason: "Para ajustar tu alimentación al bloque actual." },
  measurements: { label: "Medidas corporales", phrase: "medidas corporales", reason: "Para seguir tu progreso corporal." },
  progress_photos: { label: "Fotos de progreso", phrase: "fotos de progreso", reason: "Para comparar tu evolución." },
} as const;
export type AccessItem = keyof typeof ACCESS_ITEMS;
export const isAccessItem = (x: string): x is AccessItem => x in ACCESS_ITEMS;
export const ACCESS_REQUEST_TTL_DAYS = 14;
/** D38 (confirmada 26/10/2026): tras un rechazo, el mismo dato se puede volver a pedir recién a los 7 días. */
export const ACCESS_RETRY_DAYS = 7;
export function accessRetryAt(lastDeniedAt: Date | null, now: Date): Date | null {
  if (!lastDeniedAt) return null;
  const at = new Date(lastDeniedAt.getTime() + ACCESS_RETRY_DAYS * 86_400_000);
  return at > now ? at : null;
}
/** D39 (confirmada 26/10/2026): video de técnica se borra 90 días después de resolver el pedido; sin pedido, a las 24 h. */
export const VIDEO_RETENTION_DAYS = 90;
export const ORPHAN_VIDEO_HOURS = 24;

export const scale5 = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
export const scale10 = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10;

/** El coach ve una molestia si tiene acceso a Salud o si el alumno compartió ese reporte con esa relación. */
export const coachSeesPain = (p: { sharedWithRelationId: string | null }, relationId: string, healthGranted: boolean) =>
  healthGranted || p.sharedWithRelationId === relationId;

/** Molestia alta: se muestra el aviso de seguridad (no diagnóstico). */
export const PAIN_WARN_LEVEL = 7;

// Video de técnica: límites aplicados en servidor (el tamaño y tipo se verifican; la duración sólo en el cliente).
export const VIDEO_LIMITS = { maxBytes: 60 * 1024 * 1024, mimes: ["video/mp4", "video/quicktime", "video/webm"] } as const;
export const videoOk = (mime: string, size: number) => (VIDEO_LIMITS.mimes as readonly string[]).includes(mime) && size > 0 && size <= VIDEO_LIMITS.maxBytes;
