// D184: estado de ejecución que viaja entre dispositivos además de los resultados: etapas omitidas y el intervalo EMOM.
// Reglas puras (las usan el servidor y el teléfono) para que dos dispositivos lleguen al mismo estado sin tiempo real:
//  · Omisión de una etapa: gana el cambio más reciente (hora del dispositivo, acotada por el servidor). Un resultado
//    registrado siempre gana a una omisión: nunca se borra ni se pisa un resultado real.
//  · Intervalo EMOM: se guarda el inicio en hora del servidor. Cada dispositivo lo traduce a su reloj con la diferencia que
//    observó al hablar con el servidor. Si no se puede saber en qué momento del intervalo está, no se inventa: se informa.

// ── Etapas omitidas ──────────────────────────────────────────────────────────
export type SkipRecord = { skipped: boolean; changedAt: string };

/**
 * Qué hacer con un cambio de omisión que llega. `logged`: la etapa ya tiene un resultado registrado.
 * `apply`: si se guarda. `effective`: si la etapa queda omitida después de aplicar (lo que ve la persona).
 */
export function decideSkip(current: SkipRecord | null, logged: boolean, incoming: SkipRecord): { apply: boolean; effective: boolean; reason: "logged" | "older" | "same" | "ok" } {
  if (logged) return { apply: false, effective: false, reason: "logged" };
  if (current && Date.parse(incoming.changedAt) < Date.parse(current.changedAt)) return { apply: false, effective: current.skipped, reason: "older" };
  if (current && current.skipped === incoming.skipped && current.changedAt === incoming.changedAt) return { apply: false, effective: current.skipped, reason: "same" };
  return { apply: true, effective: incoming.skipped, reason: "ok" };
}

// ── Intervalo EMOM ───────────────────────────────────────────────────────────
/** Lo que guarda la sesión (`workout_session.interval_state`). Horas ISO del servidor. */
export type IntervalState = {
  peId: string; // ejercicio
  block: number; // serie principal (intervalo) que se está haciendo o que empieza
  startedAt: string; // inicio del intervalo (puede ser futuro: el próximo intervalo empieza al terminar el actual)
  emomSec: number; // duración programada del intervalo al empezarlo
  status: "running" | "interrupted"; // interrumpido: se pausó la sesión o se cortó; no corre más tiempo
  at: string; // cuándo se hizo el cambio (para elegir el más reciente entre dispositivos)
};
export const EMOM_MIN_SEC = 10, EMOM_MAX_SEC = 300;
/** Más allá de esto, un inicio en el pasado se considera un dato viejo y no se usa para calcular tiempo. */
export const INTERVAL_STALE_MS = 6 * 3600_000;

export type IntervalView =
  | { phase: "upcoming"; leftSec: number } // el próximo intervalo empieza en leftSec
  | { phase: "running"; leftSec: number } // en curso: faltan leftSec para el próximo
  | { phase: "expired" } // ya terminó y no se registró la serie: no se sabe en qué momento está (se vuelve a empezar)
  | { phase: "interrupted" }; // la sesión se pausó o se cortó con el intervalo abierto

/** Estado del intervalo en el reloj local (`nowMs` ya traducido a la hora del servidor, o `skewMs` = servidor − local). */
export function intervalView(st: IntervalState, localNowMs: number, skewMs = 0): IntervalView {
  if (st.status === "interrupted") return { phase: "interrupted" };
  const now = localNowMs + skewMs;
  const start = Date.parse(st.startedAt);
  if (!Number.isFinite(start)) return { phase: "expired" };
  if (start > now) return { phase: "upcoming", leftSec: Math.ceil((start - now) / 1000) };
  const end = start + st.emomSec * 1000;
  if (now <= end) return { phase: "running", leftSec: Math.max(0, Math.ceil((end - now) / 1000)) };
  return { phase: "expired" };
}

/**
 * Traduce una hora del dispositivo a la del servidor. `sentAtMs`: reloj del dispositivo al enviar; `serverNowMs`: reloj
 * del servidor al recibir. Funciona aunque el pedido haya esperado horas en la cola (las dos horas son del mismo reloj).
 */
export const toServerMs = (clientMs: number, sentAtMs: number, serverNowMs: number) => clientMs + (serverNowMs - sentAtMs);

/** Valida y traduce un intervalo que llega del dispositivo. null = inválido o viejo (no se guarda ni se inventa nada). */
export function acceptInterval(p: { peId: string; block: number; startedAt: string; emomSec: number; status: IntervalState["status"]; at: string; sentAt: string }, serverNowMs: number): IntervalState | null {
  const sent = Date.parse(p.sentAt), start = Date.parse(p.startedAt), at = Date.parse(p.at);
  if (![sent, start, at].every(Number.isFinite)) return null;
  if (!Number.isInteger(p.emomSec) || p.emomSec < EMOM_MIN_SEC || p.emomSec > EMOM_MAX_SEC) return null;
  if (!Number.isInteger(p.block) || p.block < 0 || p.block > 40) return null;
  const sStart = toServerMs(start, sent, serverNowMs), sAt = Math.min(toServerMs(at, sent, serverNowMs), serverNowMs);
  // El próximo intervalo puede empezar como mucho un intervalo después; un inicio de hace horas es un dato viejo.
  if (sStart > serverNowMs + p.emomSec * 1000 + 5_000 || sStart < serverNowMs - INTERVAL_STALE_MS) return null;
  return { peId: p.peId, block: p.block, startedAt: new Date(sStart).toISOString(), emomSec: p.emomSec, status: p.status === "interrupted" ? "interrupted" : "running", at: new Date(sAt).toISOString() };
}

/** Entre el estado guardado y un cambio hecho en `atMs` (hora del servidor), queda el más reciente. */
export const newerThan = (current: IntervalState | null, atMs: number) => !current || atMs >= Date.parse(current.at);

/** Al pausar o cortar la sesión, un intervalo en curso queda interrumpido (no sigue corriendo ni se descuenta después). */
export const interruptInterval = (st: IntervalState | null, atIso: string): IntervalState | null =>
  st && st.status === "running" ? { ...st, status: "interrupted", at: atIso } : st;
