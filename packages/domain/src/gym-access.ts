// REPI Gym Access Control (D127): membresía, política del gimnasio y check-in presencial. Reglas puras.
// Un check-in sólo demuestra que el socio validó un mecanismo en un momento y una sede: no prueba presencia continua,
// no impide que alguien retransmita un QR vigente ni que falsifique su ubicación. Protege funciones del servidor.

// ── Membresía ───────────────────────────────────────────────────────────────
/** Estado institucional evaluado en el servidor a partir de gym_member (no lo declara el cliente). */
export type MembershipState = "pending" | "active" | "paused" | "expired" | "cancelled";
export const MEMBERSHIP_LABEL: Record<MembershipState, string> = { pending: "Pendiente", active: "Activa", paused: "Pausada", expired: "Vencida", cancelled: "Dada de baja" };
/** gym_member.status (pending_consent | active | suspended | ended) + vigencia opcional (AAAA-MM-DD, hora AR). */
export function membershipState(status: string, accessUntil: string | null | undefined, today: string): MembershipState {
  if (status === "pending_consent") return "pending";
  if (status === "suspended") return "paused";
  if (status !== "active") return "cancelled";
  if (accessUntil && accessUntil < today) return "expired";
  return "active";
}

// ── Política del gimnasio ───────────────────────────────────────────────────
export type AccessMode = "open" | "hybrid" | "strict";
export const ACCESS_MODES: Record<AccessMode, { label: string; what: string }> = {
  open: { label: "Abierto", what: "No pide validar el ingreso. Todo lo que incluye la membresía se usa desde cualquier lugar." },
  hybrid: { label: "Híbrido (recomendado)", what: "Rutina, historial, progreso e indicaciones desde cualquier lugar. Para iniciar y registrar un entrenamiento del programa del gimnasio hay que validar el ingreso." },
  strict: { label: "Estricto", what: "Como híbrido, y además exige validar el ingreso para las funciones presenciales que elijas. Revisalo con tu contrato y con tus socios antes de activarlo." },
};
/** Acciones protegibles. Leer rutina, historial, progreso, privacidad, soporte y exportar datos nunca se protegen. */
export const GYM_ACTIONS = {
  "gym.workout.start": "Iniciar un entrenamiento del programa del gimnasio",
  "gym.workout.log_set": "Registrar series de ese entrenamiento",
  "gym.assistance.request": "Pedir ayuda al equipo de sala (REPI Connect)",
  "gym.challenge.attempt": "Cargar un intento de desafío del gimnasio",
} as const;
export type GymAction = keyof typeof GYM_ACTIONS;
const HYBRID_ACTIONS: GymAction[] = ["gym.workout.start", "gym.workout.log_set"];
/** Extras que STRICT puede sumar a lo de HYBRID. */
export const STRICT_OPTIONAL: GymAction[] = ["gym.assistance.request", "gym.challenge.attempt"];

export type AccessPolicy = { enabled: boolean; mode: AccessMode; strictActions: GymAction[]; qrTtlSec: number; passHours: number; geoMode: GeoMode };
export const ACCESS_DEFAULTS: Omit<AccessPolicy, "enabled"> = { mode: "hybrid", strictActions: [], qrTtlSec: 30, passHours: 3, geoMode: "off" };
export const QR_TTL_RANGE = [15, 120] as const;
export const PASS_HOURS_RANGE = [1, 6] as const;
/**
 * Sincronización tardía: series registradas sin conexión dentro de la vigencia del ingreso se aceptan hasta estas horas después
 * de que venció. Límite fijo del servidor; nunca extiende la vigencia para series nuevas.
 */
export const LATE_SYNC_HOURS = 12;

/** ¿Esta acción necesita un ingreso validado con esta política? Con el módulo apagado u OPEN, nunca. */
export function actionNeedsPresence(p: Pick<AccessPolicy, "enabled" | "mode" | "strictActions">, action: GymAction) {
  if (!p.enabled || p.mode === "open") return false;
  if (HYBRID_ACTIONS.includes(action)) return true;
  return p.mode === "strict" && p.strictActions.includes(action);
}

/**
 * ¿El ingreso cubre esta operación? Tiempo de servidor dentro de la vigencia; o una operación hecha sin conexión dentro de la
 * vigencia (hora del dispositivo, ya acotada por el servidor) que llega a lo sumo LATE_SYNC_HOURS después del vencimiento.
 */
export function passCovers(pass: { issuedAt: Date; expiresAt: Date; revokedAt: Date | null }, now: Date, clientAt?: Date | null) {
  if (pass.revokedAt) return false;
  if (now >= pass.issuedAt && now < pass.expiresAt) return true;
  if (!clientAt) return false;
  return clientAt >= pass.issuedAt && clientAt < pass.expiresAt && now.getTime() - pass.expiresAt.getTime() <= LATE_SYNC_HOURS * 3_600_000;
}

// ── Check-in ────────────────────────────────────────────────────────────────
export type CheckinMethod = "qr" | "qr_geo" | "staff" | "desk";
export const CHECKIN_METHOD_LABEL: Record<CheckinMethod, string> = { qr: "QR de la sede", qr_geo: "QR + ubicación", staff: "Validado por el equipo", desk: "Carnet en recepción" };
export type CheckinFailure =
  | "invalid_token" | "expired_token" | "module_off" | "no_membership" | "membership_inactive" | "branch_not_allowed"
  | "geo_denied" | "geo_far" | "geo_inaccurate" | "geo_stale" | "rate_limited";
/** Mensajes para el socio: claros y sin datos de otras personas ni del gimnasio. */
export const CHECKIN_MESSAGE: Record<CheckinFailure, string> = {
  invalid_token: "Ese código no es un QR de ingreso válido de REPI. Escaneá el que muestra la pantalla del gimnasio.",
  expired_token: "El QR ya venció. Se renueva solo cada pocos segundos: escaneá el que se ve ahora en la pantalla.",
  module_off: "Este gimnasio no pide validar el ingreso. Podés entrenar normalmente.",
  no_membership: "No tenés una membresía en este gimnasio. Si sos socio, pedí acceso en recepción.",
  membership_inactive: "Tu membresía en este gimnasio no está activa. Consultá en recepción.",
  branch_not_allowed: "Tu membresía no incluye esta sede. Consultá en recepción.",
  geo_denied: "No pudimos usar tu ubicación. Pedí en recepción o a un profesor que validen tu ingreso.",
  geo_far: "Tu ubicación aparece lejos de la sede. Si estás en el gimnasio, pedí en recepción que validen tu ingreso.",
  geo_inaccurate: "La ubicación del teléfono no es precisa ahora. Probá de nuevo o pedí en recepción que validen tu ingreso.",
  geo_stale: "La ubicación del teléfono está desactualizada. Probá de nuevo o pedí en recepción que validen tu ingreso.",
  rate_limited: "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.",
};
export const CHECKIN_FAILURE_LABEL: Record<CheckinFailure, string> = {
  invalid_token: "Código inválido", expired_token: "QR vencido", module_off: "Módulo apagado", no_membership: "Sin membresía", membership_inactive: "Membresía inactiva",
  branch_not_allowed: "Sede no incluida", geo_denied: "Sin ubicación", geo_far: "Lejos de la sede", geo_inaccurate: "Ubicación imprecisa", geo_stale: "Ubicación vieja", rate_limited: "Demasiados intentos",
};
/** Un pase con más de esto por delante se reutiliza: escanear dos veces no crea pases contradictorios. */
export const PASS_REUSE_MIN = 30;

// ── Ubicación (opcional, complementaria) ────────────────────────────────────
export type GeoMode = "off" | "optional" | "required";
export const GEO_MODES: Record<GeoMode, string> = {
  off: "No se usa la ubicación",
  optional: "Se pide la ubicación como dato extra; si no está disponible, el QR alcanza",
  required: "QR + ubicación cerca de la sede; sin ubicación, valida el equipo",
};
export const GEO_MAX_ACCURACY_M = 150;
export const GEO_MAX_AGE_SEC = 120;
export const GEO_RADIUS_RANGE = [50, 1000] as const;
export type GeoResult = "inside" | "outside" | "inaccurate" | "stale" | "unavailable";
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/**
 * Lectura única del navegador comparada con la sede. Imprecisa o vieja no cuenta como prueba; fuera del radio + precisión,
 * «outside». No se guardan coordenadas: sólo este resultado.
 */
export function evaluateGeo(site: { lat: number; lng: number; radiusM: number }, read: { lat: number; lng: number; accuracyM: number; ageSec: number } | null): GeoResult {
  if (!read || !Number.isFinite(read.lat) || !Number.isFinite(read.lng)) return "unavailable";
  if (read.ageSec > GEO_MAX_AGE_SEC || read.ageSec < -30) return "stale";
  if (!(read.accuracyM > 0) || read.accuracyM > GEO_MAX_ACCURACY_M) return "inaccurate";
  return distanceM(site, read) <= site.radiusM + read.accuracyM ? "inside" : "outside";
}
/** Con la política de ubicación y el resultado, ¿se acepta? Devuelve el motivo del rechazo. */
export function geoDecision(mode: GeoMode, siteHasGeo: boolean, r: GeoResult | null): { ok: true; method: "qr" | "qr_geo" } | { ok: false; reason: CheckinFailure } {
  if (mode === "off" || !siteHasGeo) return { ok: true, method: "qr" };
  if (r === "inside") return { ok: true, method: "qr_geo" };
  if (mode === "optional") return { ok: true, method: "qr" };
  if (r === "outside") return { ok: false, reason: "geo_far" };
  if (r === "inaccurate") return { ok: false, reason: "geo_inaccurate" };
  if (r === "stale") return { ok: false, reason: "geo_stale" };
  return { ok: false, reason: "geo_denied" };
}

export function validPolicy(p: Partial<AccessPolicy>): { ok: true } | { ok: false; error: string } {
  if (p.mode && !(p.mode in ACCESS_MODES)) return { ok: false, error: "Modo inválido." };
  if (p.qrTtlSec != null && (!Number.isInteger(p.qrTtlSec) || p.qrTtlSec < QR_TTL_RANGE[0] || p.qrTtlSec > QR_TTL_RANGE[1])) return { ok: false, error: `El QR dura entre ${QR_TTL_RANGE[0]} y ${QR_TTL_RANGE[1]} segundos.` };
  if (p.passHours != null && (!Number.isInteger(p.passHours) || p.passHours < PASS_HOURS_RANGE[0] || p.passHours > PASS_HOURS_RANGE[1])) return { ok: false, error: `El ingreso vale entre ${PASS_HOURS_RANGE[0]} y ${PASS_HOURS_RANGE[1]} horas.` };
  if (p.geoMode && !(p.geoMode in GEO_MODES)) return { ok: false, error: "Opción de ubicación inválida." };
  if (p.strictActions && p.strictActions.some((a) => !STRICT_OPTIONAL.includes(a))) return { ok: false, error: "Acción no configurable." };
  return { ok: true };
}
