// Reglas de sincronización offline (Etapa 3). Cada registro lleva `revision` en el servidor; el cliente
// envía la revisión que conocía (`baseRevision`, 0 = registro nuevo). Nunca se sobrescribe en silencio:
// si el servidor cambió desde la base y los valores difieren, es conflicto y se conservan ambas versiones.

export type SetValues = { weightKg: number | null; reps: number | null; rir: number | null; feel?: string | null; note?: string | null };
export type ServerSet = SetValues & { id: string; revision: number };
export type IncomingSet = SetValues & { id: string; baseRevision: number };

export const sameSetValues = (a: SetValues, b: SetValues) =>
  (a.weightKg ?? null) === (b.weightKg ?? null) && (a.reps ?? null) === (b.reps ?? null) && (a.rir ?? null) === (b.rir ?? null) && (a.feel ?? null) === (b.feel ?? null)
  && (a.note || null) === (b.note || null);

export type SetDecision =
  | { kind: "insert" }
  | { kind: "update" }
  | { kind: "noop" } // reintento de algo ya aplicado, o mismo valor
  | { kind: "conflict"; reason: "other_device" | "stale_base" };

export function decideSetWrite(existing: ServerSet | null, incoming: IncomingSet): SetDecision {
  if (!existing) return { kind: "insert" };
  if (sameSetValues(existing, incoming)) return { kind: "noop" };
  if (existing.id !== incoming.id) return { kind: "conflict", reason: "other_device" };
  if (existing.revision === incoming.baseRevision) return { kind: "update" };
  return { kind: "conflict", reason: "stale_base" };
}

export type SessionStatus = "in_progress" | "paused" | "completed" | "abandoned";

/** Transiciones de sesión con timestamp de cliente acotado. Devuelve null si la transición no aplica. */
export function applySessionAction(
  s: { status: SessionStatus; activeMs: number; lastResumedAt: Date | null; startedAt: Date },
  action: "pause" | "resume" | "finish",
  at: Date,
  hasSets: boolean,
): { status: SessionStatus; activeMs: number; lastResumedAt: Date | null; endedAt: Date | null } | null {
  const t = new Date(Math.max(at.getTime(), s.startedAt.getTime(), s.lastResumedAt?.getTime() ?? 0));
  const run = s.status === "in_progress" && s.lastResumedAt ? t.getTime() - s.lastResumedAt.getTime() : 0;
  if (action === "pause") return s.status === "in_progress" ? { status: "paused", activeMs: s.activeMs + run, lastResumedAt: null, endedAt: null } : null;
  if (action === "resume") return s.status === "paused" ? { status: "in_progress", activeMs: s.activeMs, lastResumedAt: t, endedAt: null } : null;
  if (s.status === "completed" || s.status === "abandoned") return null;
  return { status: hasSets ? "completed" : "abandoned", activeMs: s.activeMs + run, lastResumedAt: null, endedAt: t };
}

/** Timestamp de cliente aceptable: no futuro (tolerancia de reloj) ni más viejo que la ventana offline. */
export const OFFLINE_WINDOW_MS = 72 * 3_600_000;
export const CLOCK_SKEW_MS = 5 * 60_000;
export function clampClientTime(at: string | undefined | null, now: Date): Date | "invalid" {
  if (!at) return now;
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return "invalid";
  if (t.getTime() > now.getTime() + CLOCK_SKEW_MS || t.getTime() < now.getTime() - OFFLINE_WINDOW_MS) return "invalid";
  return t.getTime() > now.getTime() ? now : t;
}
