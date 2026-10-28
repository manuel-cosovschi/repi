// REPI Connect · Seguimiento de sala (D126). Reglas puras del circuito socio → profesor → continuidad → gestión.
// Se monta sobre la cola de asistencia existente (gym_task, F-GT-02): no es un sistema paralelo. Todo es determinístico:
// prioridad por reglas visibles, sin IA y sin niveles clínicos de urgencia.
import { median, type TaskCategory, type TaskPriority } from "./gym";

// ── Motivos del socio ────────────────────────────────────────────────────────
/** Motivos que elige el socio. Cada uno cae en una categoría de tarea existente; la etiqueta es la que ve el equipo. */
export const CONNECT_REASONS = {
  ejercicio: { label: "Ayuda con un ejercicio", category: "tecnica" },
  revisar_rutina: { label: "Revisar mi rutina", category: "actualizar_programa" },
  cambiar_ejercicio: { label: "Cambiar un ejercicio", category: "actualizar_programa" },
  actualizar_pesos: { label: "Actualizar mis pesos", category: "actualizar_programa" },
  duda: { label: "Duda sobre mi entrenamiento", category: "consulta" },
  rutina_nueva: { label: "Necesito una rutina nueva", category: "programa_nuevo" },
  hablar: { label: "Hablar con un profesor", category: "consulta" },
  otro: { label: "Otro motivo", category: "consulta" },
} as const satisfies Record<string, { label: string; category: TaskCategory }>;
export type ConnectReason = keyof typeof CONNECT_REASONS;
export const isConnectReason = (x: unknown): x is ConnectReason => typeof x === "string" && x in CONNECT_REASONS;
/** Motivos que tienen sentido desde un ejercicio de la sesión. */
export const CONNECT_EXERCISE_REASONS: ConnectReason[] = ["ejercicio", "cambiar_ejercicio", "actualizar_pesos", "duda"];
export const CONNECT_COMMENT_MAX = 300;
export const CONNECT_NOTE_MAX = 500;

/** Orientación fija de seguridad: Connect no es un servicio médico ni de emergencias. */
export const CONNECT_SAFETY =
  "REPI no es un servicio médico ni de emergencias. Si tenés dolor, mareo o te sentís mal, frená y avisá en persona a un profesor o a recepción; si es una urgencia, llamá al 107 o al servicio de emergencias de tu zona.";
/** Palabras que disparan la orientación reforzada en el pedido del socio. No diagnostica ni decide nada. */
const RISK_WORDS = /\b(dolor|duele|me duele|mare[oa]|mareado|desmay|lesi[oó]n|lesionad|pecho|falta de aire|ahog|n[aá]usea|v[oó]mit|palpitaci|presi[oó]n)/i;
export const mentionsRisk = (text: string) => RISK_WORDS.test(text);

// ── Estados ──────────────────────────────────────────────────────────────────
/** Estados guardados en gym_task.status. "open" se muestra como Pendiente o Asignada según tenga responsable. */
export type ConnectStatus = "open" | "pending_acceptance" | "in_progress" | "follow_up" | "done" | "cancelled";
export const CONNECT_ACTIVE: ConnectStatus[] = ["open", "pending_acceptance", "in_progress", "follow_up"];
export type ConnectState = "pendiente" | "asignada" | "transferida" | "en_atencion" | "seguimiento" | "resuelta" | "cancelada";
export const CONNECT_STATE_LABEL: Record<ConnectState, string> = {
  pendiente: "Pendiente", asignada: "Asignada", transferida: "Transferida", en_atencion: "En atención",
  seguimiento: "Pendiente de seguimiento", resuelta: "Resuelta", cancelada: "Cancelada",
};
export function connectState(t: { status: string; assigneeUserId: string | null }): ConnectState {
  switch (t.status) {
    case "open": return t.assigneeUserId ? "asignada" : "pendiente";
    case "pending_acceptance": return "transferida";
    case "in_progress": return "en_atencion";
    case "follow_up": return "seguimiento";
    case "done": return "resuelta";
    default: return "cancelada";
  }
}

export type ConnectAction = "take" | "start" | "note" | "follow_up" | "transfer" | "accept" | "decline" | "resolve" | "cancel" | "member_cancel";
/**
 * Máquina de estados. Devuelve el estado siguiente o el motivo del rechazo. `mine` = la tarea está asignada a quien actúa.
 * - Tomar sólo lo que no tiene responsable (pendiente o seguimiento libre).
 * - Atender, registrar, dejar seguimiento, transferir y resolver sólo lo propio.
 * - Aceptar o rechazar un traspaso sólo quien lo recibe.
 * - El socio cancela sólo mientras nadie lo está atendiendo; el personal con permiso cancela cualquier activa.
 * Abrir o ver una solicitud nunca cambia su estado.
 */
export function connectNext(
  t: { status: string; assigneeUserId: string | null },
  action: ConnectAction,
  actorId: string,
): { ok: true; status: ConnectStatus } | { ok: false; code: "closed" | "taken" | "not_mine" | "invalid" } {
  const s = t.status as ConnectStatus;
  const mine = t.assigneeUserId === actorId;
  if (s === "done" || s === "cancelled") return { ok: false, code: "closed" };
  switch (action) {
    case "take":
      if (s === "pending_acceptance") return { ok: false, code: "invalid" };
      if (t.assigneeUserId) return { ok: false, code: mine ? "invalid" : "taken" };
      return { ok: true, status: s === "follow_up" ? "follow_up" : s === "in_progress" ? "in_progress" : "open" };
    case "start":
      if (!mine) return { ok: false, code: "not_mine" };
      return s === "pending_acceptance" ? { ok: false, code: "invalid" } : { ok: true, status: "in_progress" };
    case "note":
      if (!mine) return { ok: false, code: "not_mine" };
      return s === "pending_acceptance" ? { ok: false, code: "invalid" } : { ok: true, status: s };
    case "follow_up":
    case "resolve":
    case "transfer":
      if (!mine) return { ok: false, code: "not_mine" };
      if (s === "pending_acceptance") return { ok: false, code: "invalid" };
      return { ok: true, status: action === "follow_up" ? "follow_up" : action === "resolve" ? "done" : "pending_acceptance" };
    case "accept":
      return s === "pending_acceptance" && mine ? { ok: true, status: "open" } : { ok: false, code: "invalid" };
    case "decline":
      return s === "pending_acceptance" && mine ? { ok: true, status: "open" } : { ok: false, code: "invalid" };
    case "cancel":
      return { ok: true, status: "cancelled" };
    case "member_cancel":
      return s === "open" ? { ok: true, status: "cancelled" } : { ok: false, code: "invalid" };
  }
}

// ── Prioridad operativa (reglas visibles, sin IA) ────────────────────────────
/** Alta si el socio está entrenando ahora (pidió desde la sesión) o necesita una rutina nueva; el resto, media. */
export function connectPriority(p: { reason: ConnectReason; fromSession: boolean }): TaskPriority {
  if (p.fromSession || p.reason === "rutina_nueva") return "alta";
  return "media";
}
export const CONNECT_PRIORITY_RULE = "Alta: el socio la pidió durante su entrenamiento o necesita una rutina nueva. Media: el resto.";

const STATE_RANK: Record<ConnectState, number> = { transferida: 0, en_atencion: 1, asignada: 2, seguimiento: 3, pendiente: 4, resuelta: 5, cancelada: 6 };
const PRI_RANK: Record<TaskPriority, number> = { alta: 0, media: 1, baja: 2 };
/**
 * Orden de la bandeja: primero lo que espera una acción tuya (traspasos, en atención, asignadas), después seguimientos
 * (los vencidos o más próximos primero) y la cola libre; dentro de cada grupo, prioridad y antigüedad.
 */
export function connectSort<T extends { status: string; assigneeUserId: string | null; priority: TaskPriority; createdAt: Date | string; dueAt?: Date | string | null }>(rows: T[]): T[] {
  const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : Number.MAX_SAFE_INTEGER);
  return [...rows].sort((a, b) =>
    STATE_RANK[connectState(a)] - STATE_RANK[connectState(b)]
    || (connectState(a) === "seguimiento" ? ms(a.dueAt) - ms(b.dueAt) : 0)
    || PRI_RANK[a.priority] - PRI_RANK[b.priority]
    || ms(a.createdAt) - ms(b.createdAt));
}

// ── Reglas proactivas básicas ────────────────────────────────────────────────
/** Pedido sin tomar después de estos minutos → aviso a quienes están en turno en la sede (una vez por pedido). */
export const CONNECT_WAIT_ALERT_MIN = 15;
/** Seguimiento que vence dentro de estas horas (o ya vencido) → aviso a su responsable (uno por día). */
export const CONNECT_DUE_SOON_HOURS = 24;
/** Seguimiento sin fecha propia: vence a los 7 días (igual que FOLLOWUP_DUE_DAYS). */
export const CONNECT_FOLLOWUP_DEFAULT_DAYS = 7;
/** Disponibilidad declarada por el profesor durante su turno. No es ubicación ni presencia comprobada. */
export const CONNECT_AVAILABILITY = { available: "Disponible", busy: "Ocupado" } as const;
export type ConnectAvailability = keyof typeof CONNECT_AVAILABILITY;

// ── Métricas del servicio ────────────────────────────────────────────────────
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null) => (x == null ? null : Math.round(x));

export type ConnectMetricRow = {
  status: string; createdAt: Date; takenAt: Date | null; completedAt: Date | null; gymMemberId: string | null;
  feedback: string | null; transfers: number; followUps: number;
};
/**
 * Indicadores del período con datos reales. Tiempos en minutos; null cuando no hay casos para medir (nunca 0 inventado).
 * Primera atención = desde el pedido hasta que alguien lo toma. Resolución = desde el pedido hasta que se marca resuelto.
 */
export function connectMetrics(rows: ConnectMetricRow[]) {
  const mins = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;
  const resolved = rows.filter((r) => r.status === "done");
  const first = rows.filter((r) => r.takenAt).map((r) => mins(r.createdAt, r.takenAt!));
  const solve = resolved.filter((r) => r.completedAt).map((r) => mins(r.createdAt, r.completedAt!));
  const fb = rows.filter((r) => r.feedback);
  return {
    received: rows.length,
    resolved: resolved.length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    open: rows.filter((r) => CONNECT_ACTIVE.includes(r.status as ConnectStatus)).length,
    resolvedPct: rows.length ? Math.round((resolved.length / rows.length) * 100) : null,
    firstResponseMedianMin: round(median(first)), firstResponseAvgMin: round(mean(first)),
    resolutionMedianMin: round(median(solve)), resolutionAvgMin: round(mean(solve)),
    followUps: rows.reduce((a, r) => a + r.followUps, 0),
    transfers: rows.reduce((a, r) => a + r.transfers, 0),
    membersHelped: new Set(resolved.map((r) => r.gymMemberId).filter(Boolean)).size,
    feedback: { answered: fb.length, helpful: fb.filter((r) => r.feedback === "yes").length, helpfulPct: fb.length ? Math.round((fb.filter((r) => r.feedback === "yes").length / fb.length) * 100) : null },
  };
}

/** Texto de duración legible para tiempos medidos («12 min», «3 h 5 min», «2 días»). */
export function fmtMinutes(m: number | null) {
  if (m == null) return "Sin datos";
  if (m < 60) return `${Math.max(0, Math.round(m))} min`;
  if (m < 60 * 24) { const h = Math.floor(m / 60), r = Math.round(m % 60); return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.round(m / (60 * 24));
  return `${d} día${d === 1 ? "" : "s"}`;
}
