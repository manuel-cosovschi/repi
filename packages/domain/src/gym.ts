// Operación del gym (Etapa 5). Fuente: REPI Desktop Gym.dc.html, 05_BUSINESS_RULES, 06_ROLE_PERMISSION_MATRIX y MASTER_PROMPT §8.
// Reglas marcadas [S] en el handoff siguen siendo supuestos: ver docs/DECISIONS.md (D07–D11, D42–D47).
import type { GymRole } from "./access";
import { TZ, localDate } from "./training";

// ── Capacidades por rol (matriz 06; política inicial) ───────────────────────
export const GYM_CAPS = [
  "floor.work", // turno, cola, tomar/completar, traspaso, socios de su sede
  "member.read", // ficha institucional del socio (sin salud ni app privada)
  "program.edit", // programa institucional del socio
  "task.create",
  "task.reassign",
  "team.read", // equipo, detalle de entrenador, desempeño del equipo
  "shifts.plan",
  "reviews.read_named", // reseñas con nombre del socio
  "reviews.moderate",
  "perf.own",
  "gym.config", // políticas y puesta en marcha
  "members.approve", // pedidos de alta fuera de padrón (Acceso)
  "messages.floor", // mensajería del equipo de sala con socios (D40)
  "community.publish", // novedades, descuentos y desafíos (F-GC-01/02)
  "catalog.publish", // catálogo informativo de recepción (F-GC-04)
  "challenges.validate", // validar intentos de récord con video (F-GC-03)
  "reception.desk", // validar carnet, registrar ingreso y entregar premios (F-GC-06/07/08)
  "club.moderate", // moderación de Repi Club del gym (F-RC-05)
  "members.validate", // validar altas de socios por QR (anexo 26/10): piso sólo con turno efectivo en la sede
  "challenges.witness", // validar en persona un intento de récord sin video (F-HX-12, D165): piso sólo con turno en la sede
] as const;
export type GymCap = (typeof GYM_CAPS)[number];

const CAPS: Record<GymRole, GymCap[]> = {
  owner: ["member.read", "task.reassign", "team.read", "shifts.plan", "reviews.read_named", "reviews.moderate", "gym.config", "members.approve",
    "community.publish", "catalog.publish", "challenges.validate", "reception.desk", "club.moderate"],
  manager: ["member.read", "task.create", "task.reassign", "team.read", "shifts.plan", "reviews.read_named", "reviews.moderate", "members.approve",
    "community.publish", "catalog.publish", "challenges.validate", "reception.desk", "club.moderate"],
  coordinator: ["floor.work", "member.read", "program.edit", "task.create", "task.reassign", "team.read", "shifts.plan", "perf.own", "messages.floor", "members.validate", "challenges.witness"],
  floor_trainer: ["floor.work", "member.read", "program.edit", "task.create", "perf.own", "messages.floor", "members.validate", "challenges.witness"],
  reception: ["task.create", "members.approve", "catalog.publish", "reception.desk"],
};
export const gymCan = (roles: readonly string[], cap: GymCap) => roles.some((r) => (CAPS[r as GymRole] ?? []).includes(cap));
export const gymCaps = (roles: readonly string[]) => GYM_CAPS.filter((c) => gymCan(roles, c));

// ── Tareas y cola de asistencia ──────────────────────────────────────────────
export const TASK_CATEGORY = {
  programa_nuevo: "Programa nuevo",
  actualizar_programa: "Actualizar programa",
  tecnica: "Revisión de técnica",
  onboarding: "Onboarding socio nuevo",
  seguimiento: "Seguimiento",
  consulta: "Consulta",
} as const;
export type TaskCategory = keyof typeof TASK_CATEGORY;
export const isTaskCategory = (x: string): x is TaskCategory => x in TASK_CATEGORY;
export const TASK_PRIORITY = { alta: "Alta", media: "Media", baja: "Baja" } as const;
export type TaskPriority = keyof typeof TASK_PRIORITY;
/** Interacciones que habilitan una invitación a reseñar (prototipo: ELIGIBLE). */
export const REVIEW_ELIGIBLE: TaskCategory[] = ["programa_nuevo", "actualizar_programa", "tecnica", "onboarding"];
/** Pedido del socio desde la app → categoría de tarea. */
export const REQUEST_TO_TASK: Record<string, TaskCategory> = { rutina: "actualizar_programa", tecnica: "tecnica", consulta: "consulta", programa: "programa_nuevo" };
/** [S] Traspaso sin aceptar a los 30 min del inicio del turno del destinatario → se marca para coordinación. */
export const HANDOFF_ESCALATE_MIN = 30;
/** [S] Un seguimiento sin fecha propia vence a los 7 días. */
export const FOLLOWUP_DUE_DAYS = 7;

/**
 * D08 (pendiente): el prototipo exige turno activo para tomar, completar y editar. MASTER_PROMPT pide no bloquear el trabajo
 * remoto autorizado. Tratamiento: turno activo O permiso de trabajo fuera de turno dado por gerencia (queda marcado en la atribución).
 */
export function floorActionAllowed(p: { shiftActive: boolean; afterHoursAccess: boolean }): { ok: true; offShift: boolean } | { ok: false } {
  if (p.shiftActive) return { ok: true, offShift: false };
  if (p.afterHoursAccess) return { ok: true, offShift: true };
  return { ok: false };
}

/** Advertencia (no bloqueo): resúmenes y notas institucionales no deben llevar datos de salud ni de chats privados. */
const HEALTH_WORDS = /\b(lesi[oó]n|lesionad|dolor|molestia|diagn[oó]stic|medicaci[oó]n|medicament|embaraz|cirug[ií]a|operad[oa]|hernia|tendinitis|contractura|presi[oó]n arterial|diabet|ansiedad|depresi[oó]n)/i;
export const mentionsHealth = (text: string) => HEALTH_WORDS.test(text);

// ── Turnos ──────────────────────────────────────────────────────────────────
/** Códigos de la grilla del prototipo (SH_LBL). Horas en hora local AR. D158: el gimnasio abre de 6 a 22 (titular, 29/10). */
export const SHIFT_CODES = {
  M: { label: "Mañana", from: "06:00", to: "12:00" },
  T: { label: "Tarde", from: "12:00", to: "17:00" },
  N: { label: "Noche", from: "17:00", to: "22:00" },
  P: { label: "Mañana parcial", from: "09:00", to: "13:00" },
  F: { label: "Fin de semana", from: "09:00", to: "15:00" },
} as const;
export type ShiftCode = keyof typeof SHIFT_CODES;
export const SHIFT_CYCLE: (ShiftCode | null)[] = ["M", "T", "N", null];
export const isShiftCode = (x: unknown): x is ShiftCode => typeof x === "string" && x in SHIFT_CODES;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const shiftHours = (c: ShiftCode) => (toMin(SHIFT_CODES[c].to) - toMin(SHIFT_CODES[c].from)) / 60;

/** D158: horario del gimnasio (titular, 29/10/2026): de 6 a 22, hora AR. Fuera de ese horario nadie del equipo figura en turno. */
export const GYM_HOURS = { open: "06:00", close: "22:00" } as const;
const localMin = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).split(":").map(Number);
  return h * 60 + m;
};
export const gymOpenAt = (now: Date) => { const m = localMin(now); return m >= toMin(GYM_HOURS.open) && m < toMin(GYM_HOURS.close); };
/**
 * Cuándo termina solo un turno que quedó abierto: al cierre del día en que empezó (o ahora, si se abrió fuera de horario y
 * todavía no llegó ese cierre). Nunca antes del inicio. null: sigue abierto.
 */
export function shiftAutoEnd(startedAt: Date, now: Date): Date | null {
  const close = new Date(`${localDate(startedAt)}T${GYM_HOURS.close}:00-03:00`); // Argentina no tiene horario de verano
  if (now < close && gymOpenAt(now)) return null;
  const end = now < close ? now : close;
  return end > startedAt ? end : startedAt;
}

/** D160: tras 20 minutos sin tocar nada con el entrenamiento en curso, la app pregunta «¿Seguís entrenando?». */
export const WORKOUT_IDLE_PROMPT_MS = 20 * 60_000;
/** D160: un entrenamiento abierto sin actividad durante 6 horas se cierra solo. */
export const WORKOUT_IDLE_CLOSE_MS = 6 * 3_600_000;
/**
 * D160: ¿se cierra solo este entrenamiento abierto? Sí con 6 horas sin actividad y, si es del gimnasio, fuera del horario
 * (a las 22 o si quedó de otro día, igual que los turnos).
 */
export function workoutAutoClose(p: { startedAt: Date; lastActivityAt: Date; gymHours: boolean }, now: Date) {
  if (now.getTime() - p.lastActivityAt.getTime() >= WORKOUT_IDLE_CLOSE_MS) return true;
  return p.gymHours && shiftAutoEnd(p.startedAt, now) != null;
}

/** Franja (mañana/tarde/noche) que cubre cada código: cuenta si cubre al menos la mitad de la franja. */
const BANDS = { M: ["06:00", "12:00"], T: ["12:00", "17:00"], N: ["17:00", "22:00"] } as const;
export type Band = keyof typeof BANDS;
export function bandsCovered(c: ShiftCode): Band[] {
  const [a, b] = [toMin(SHIFT_CODES[c].from), toMin(SHIFT_CODES[c].to)];
  return (Object.keys(BANDS) as Band[]).filter((k) => {
    const [x, y] = [toMin(BANDS[k][0]), toMin(BANDS[k][1])];
    return Math.max(0, Math.min(b, y) - Math.max(a, x)) * 2 >= y - x;
  });
}
/**
 * Cobertura por día y franja. [S] Requisito mínimo: 1 persona por franja; la noche de domingo no se exige (el prototipo no la cubre).
 * Devuelve conteos y huecos legibles.
 */
export function coverage(rows: (ShiftCode | null)[][], days: string[]) {
  const cells = days.map((_, d) => {
    const c: Record<Band, number> = { M: 0, T: 0, N: 0 };
    for (const r of rows) { const v = r[d]; if (v) for (const b of bandsCovered(v)) c[b]++; }
    return c;
  });
  const required = (d: number, b: Band) => !(b === "N" && d === 6);
  const gaps: string[] = [];
  cells.forEach((c, d) => (["M", "T", "N"] as Band[]).forEach((b) => { if (required(d, b) && !c[b]) gaps.push(`${days[d]} ${b === "M" ? "mañana" : b === "T" ? "tarde" : "noche"}`); }));
  return { cells, gaps, required };
}

// ── Reseñas ─────────────────────────────────────────────────────────────────
/**
 * DEC-07: promedio oculto con muestra chica. INC-01: el handoff legacy usaba 10. Se toma 5 (versión vigente) como supuesto (D45).
 * No se muestra "rango 95 %": falta método validado (MASTER_PROMPT §8).
 */
export const REVIEW_MIN_N = 5;
/** [S] ≤1 invitación cada 14 días por socio; la invitación vence a los 14 días. */
export const REVIEW_INVITE_COOLDOWN_DAYS = 14;
export const REVIEW_INVITE_TTL_DAYS = 14;
/** [S] Apelación de una decisión de moderación dentro de 14 días. */
export const REVIEW_APPEAL_DAYS = 14;
export const REVIEW_DIMS = ["Claridad", "Atención", "Trato profesional"] as const;
export type ReviewStatus = "published" | "reported" | "edit_requested" | "removed";

export function reviewAggregate(rows: { stars: number; dims: (number | null)[]; status: ReviewStatus }[]) {
  const counted = rows.filter((r) => r.status !== "removed"); // retiradas por moderación no cuentan
  const n = counted.length;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ stars: s, n: counted.filter((r) => r.stars === s).length }));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const show = n >= REVIEW_MIN_N;
  return {
    n,
    avg: show ? avg(counted.map((r) => r.stars)) : null,
    lowSample: !show,
    dist,
    dims: REVIEW_DIMS.map((label, i) => {
      const xs = counted.map((r) => r.dims[i]).filter((x): x is number => typeof x === "number");
      return { label, n: xs.length, avg: xs.length >= REVIEW_MIN_N ? avg(xs) : null };
    }),
  };
}
export const starsOk = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

// ── Métricas (Performance Center) ───────────────────────────────────────────
export const PERIODS = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type Period = keyof typeof PERIODS;
export const isPeriod = (x: unknown): x is Period => typeof x === "string" && x in PERIODS;

/** Mediana; sin datos → null (no se convierte ausente en cero). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Cociente con denominador cero → null. */
export const ratio = (num: number, den: number) => (den > 0 ? num / den : null);
/** Con menos de 1 h registrada el cociente se dispara: no se calcula (muestra insuficiente). */
export const MIN_HOURS_PER10 = 1;
export const per10h = (count: number, hours: number) => (hours >= MIN_HOURS_PER10 ? Math.round((count / hours) * 100) / 10 : null);

/** Definiciones visibles (F-GP-02). Texto del prototipo (DEFS) ajustado a lo que hoy se calcula. */
export const METRIC_DEFS = {
  op: [
    ["Horas de turno", "Horas entre inicio y cierre de turno registrados en el período. Es la base para normalizar."],
    ["Solicitudes atendidas", "Tareas completadas por esta persona. Se atribuyen a quien las completa, aunque las haya creado otra."],
    ["Por 10 h de turno", "Solicitudes atendidas ÷ horas de turno × 10. Con menos de 1 h de turno registrada no se calcula."],
    ["Respuesta mediana", "Minutos entre que se crea una tarea y alguien la toma. Sin tareas tomadas no se calcula."],
    ["Tareas vencidas", "Tareas asignadas abiertas que superaron su fecha objetivo. Las traspasadas cuentan para quien las aceptó."],
  ],
  svc: [
    ["Seguimientos a tiempo", "Seguimientos completados antes de su fecha objetivo ÷ seguimientos con fecha que vencieron o se completaron en el período."],
    ["Programas nuevos / actualizados", "Revisiones del programa institucional registradas por esta persona."],
    ["Onboardings", "Tareas de onboarding de socio nuevo completadas."],
  ],
  eng: [
    ["Socios atendidos", "Socios únicos con al menos una tarea completada por esta persona."],
    ["Programas en uso", "Programas institucionales revisados por esta persona con al menos un entrenamiento del socio en 14 días. Depende de factores ajenos al entrenador: usar sólo como contexto."],
  ],
  out: [
    ["Resultados de entrenamiento", "Sólo a nivel sede: no se atribuyen a personas. Los resultados no prueban causalmente la calidad de un entrenador."],
  ],
  sat: [
    ["Reseñas", "Reseñas verificadas vinculadas a una interacción elegible real. Las retiradas por moderación no cuentan."],
    ["Promedio", `Con menos de ${REVIEW_MIN_N} reseñas no se muestra promedio comparable. No se informa rango de confianza hasta validar el método (D45).`],
  ],
} as const;

// ── Mensajería (D40) ────────────────────────────────────────────────────────
export const MESSAGE_MAX = 2000;
export type DeliveryState = "sent" | "delivered" | "read";
/** Estado de un mensaje propio según los marcadores del resto de participantes (el mejor estado entre ellos). */
export function deliveryState(sentAt: Date, others: { deliveredAt: Date | null; readAt: Date | null }[]): DeliveryState {
  if (others.some((o) => o.readAt && o.readAt >= sentAt)) return "read";
  if (others.some((o) => o.deliveredAt && o.deliveredAt >= sentAt)) return "delivered";
  return "sent";
}
export const DELIVERY_LABEL: Record<DeliveryState, string> = { sent: "Enviado", delivered: "Entregado", read: "Leído" };

/**
 * D170: horario habitual del profesor (días de la semana y franja, hora AR). Con él el turno empieza y termina solo: no
 * hace falta «Iniciar turno». `days`: 0 = domingo … 6 = sábado.
 */
export type WeeklyHours = { days: number[]; from: string; to: string };
export const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function weeklyHoursOk(h: WeeklyHours) {
  return Array.isArray(h.days) && h.days.length > 0 && h.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(h.days).size === h.days.length
    && HHMM.test(h.from) && HHMM.test(h.to) && toMin(h.from) < toMin(h.to);
}
export const localWeekday = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d));
/** Instante en que empieza y termina la franja del día local de `at` (Argentina no tiene horario de verano). */
export function slotOn(h: WeeklyHours, at: Date) {
  const day = localDate(at);
  return { start: new Date(`${day}T${h.from}:00-03:00`), end: new Date(`${day}T${h.to}:00-03:00`) };
}
/** ¿`now` cae dentro del horario? */
export function inWeeklyHours(h: WeeklyHours, now: Date) {
  if (!h.days.includes(localWeekday(now))) return false;
  const { start, end } = slotOn(h, now);
  return now >= start && now < end;
}
/** «Lun a vie · 16 a 20 h», «Lun, mié y vie · 6:30 a 12 h». */
export function fmtWeeklyHours(h: WeeklyHours) {
  const d = [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // la semana empieza el lunes
  const run = d.length > 2 && d.every((x, i) => i === 0 || (x === (d[i - 1] + 1) % 7));
  const days = d.length === 7 ? "Todos los días" : run ? `${WEEKDAYS[d[0]]} a ${WEEKDAYS[d.at(-1)!].toLowerCase()}` : d.map((x, i) => (i === 0 ? WEEKDAYS[x] : WEEKDAYS[x].toLowerCase())).join(", ").replace(/, ([^,]+)$/, " y $1");
  const t = (s: string) => (s.endsWith(":00") ? String(Number(s.slice(0, 2))) : `${Number(s.slice(0, 2))}:${s.slice(3)}`);
  return `${days} · ${t(h.from)} a ${t(h.to)} h`;
}
