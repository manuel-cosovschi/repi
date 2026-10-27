// Adaptive Coach — núcleo determinístico (fase 1, D108). Antes de cualquier IA: datos existentes y reglas. Nada de esto
// genera rutinas nuevas: decide si alcanza con la rutina asignada, con continuar la sesión abierta o con no sumar otra
// sesión intensa. El validador de propuestas es el filtro que toda propuesta futura (plantilla o IA) tiene que pasar.

// ── Niveles de autonomía (§9 del pedido) ───────────────────────────────────
export const AUTONOMY_LEVELS = {
  0: "Desactivado: sólo rutinas creadas o asignadas por personas autorizadas",
  1: "Asistencia: explica y sugiere, no modifica sesiones",
  2: "Adaptación supervisada: propuestas que aprueba el entrenador",
  3: "Autonomía limitada: el alumno acepta adaptaciones dentro de límites del entrenador",
  4: "Contingencia configurada: sesiones alternativas conservadoras bajo política aprobada",
} as const;
export type AutonomyLevel = keyof typeof AUTONOMY_LEVELS;
export const DEFAULT_AUTONOMY: AutonomyLevel = 1;
export const isAutonomyLevel = (x: unknown): x is AutonomyLevel => x === 0 || x === 1 || x === 2 || x === 3 || x === 4;

export type AdaptiveAction = "explain" | "show_assigned" | "session_change" | "propose" | "apply_without_coach" | "generate_contingency";
/** Qué permite cada nivel. Ningún nivel saltea seguridad, consentimientos ni permisos: eso se valida aparte. */
export function autonomyAllows(level: AutonomyLevel, action: AdaptiveAction): boolean {
  if (action === "show_assigned") return true; // mostrar lo que ya asignó una persona siempre está permitido
  if (level === 0) return false;
  if (action === "explain" || action === "session_change") return level >= 1; // saltar/reemplazar en la sesión (D106) es decisión de la persona
  if (action === "propose") return level >= 2;
  if (action === "apply_without_coach") return level >= 3;
  return level >= 4;
}

// ── «Quiero entrenar por mi cuenta» / «No vino el profe» (§2) ──────────────
export type SoloVariant = "solo" | "coach_absent";
export type SoloContext = {
  now: Date; today: string; // AAAA-MM-DD hora AR
  relation: { kind: "coach" | "gym"; name: string } | null;
  state: "no_program" | "scheduled" | "ready"; startsOn?: string;
  open: { id: string; dayName: string; startedAt: Date; setsDone: number; setsTotal: number } | null;
  next: { id: string; name: string; exercises: number } | null;
  doneToday: { dayName: string }[];
  checkin: { energy: number; sleep: number; mood: number } | null;
};
export type SoloOption = { action: "continue" | "start" | "rest" | "ask_help" | "message"; label: string; dayId?: string; sessionId?: string; caution?: boolean };
export type SoloPlan = {
  mode: "continue" | "original" | "extra_day" | "scheduled" | "no_program";
  adp: "ADP-01" | "ADP-03" | "ADP-08" | null;
  title: string; reasons: string[]; warnings: string[]; options: SoloOption[];
  usesAI: false; // fase 1: siempre resuelto con datos y reglas
};
export const OPEN_SESSION_FRESH_HOURS = 6;

const lowReadiness = (c: SoloContext["checkin"]) => !!c && (c.energy <= 2 || c.sleep <= 2);

export function planSolo(ctx: SoloContext, variant: SoloVariant): SoloPlan {
  const who = ctx.relation?.kind === "gym" ? "el equipo de sala" : ctx.relation?.name ?? "tu coach";
  const warnings: string[] = [];
  if (lowReadiness(ctx.checkin)) warnings.push("Hoy marcaste poca energía o mal descanso: podés bajar la carga, saltar ejercicios desde la sesión o descansar. Si te sentís mal, no entrenes.");
  const help: SoloOption[] = variant === "coach_absent" && ctx.relation?.kind === "gym" ? [{ action: "ask_help", label: "Pedir ayuda a otro entrenador de sala" }] : [];
  const msg: SoloOption = { action: "message", label: ctx.relation?.kind === "gym" ? "Escribir al gimnasio" : `Escribirle a ${who}` };

  // Caso C: sesión empezada y no cerrada.
  if (ctx.open) {
    const hours = (ctx.now.getTime() - ctx.open.startedAt.getTime()) / 3_600_000;
    const fresh = hours < OPEN_SESSION_FRESH_HOURS;
    return {
      mode: "continue", adp: "ADP-08", title: fresh ? `Seguí con ${ctx.open.dayName}` : `${ctx.open.dayName} quedó abierto`,
      reasons: [`Hiciste ${ctx.open.setsDone} de ${ctx.open.setsTotal} series. Lo hecho queda guardado: no se repite.`],
      warnings: fresh ? warnings : [...warnings, `Lo empezaste hace ${Math.floor(hours)} h. Retomarlo puede no ser lo mejor: al abrirlo podés finalizarlo con lo que hiciste y empezar el de hoy.`],
      options: [{ action: "continue", label: fresh ? "Continuar donde lo dejé" : "Abrirlo para continuar o finalizar", sessionId: ctx.open.id }, ...help],
      usesAI: false,
    };
  }
  if (ctx.state === "no_program") {
    return { mode: "no_program", adp: null, title: "Todavía no tenés una rutina asignada", warnings,
      reasons: [`Las rutinas las arma ${who}. Por ahora REPI no genera una por su cuenta.`], options: [msg, ...help], usesAI: false };
  }
  if (ctx.state === "scheduled") {
    return { mode: "scheduled", adp: null, title: `Tu programa empieza el ${ctx.startsOn}`, warnings,
      reasons: ["Hasta esa fecha no hay sesión asignada."], options: [msg, ...help], usesAI: false };
  }
  // Caso B: ya entrenó hoy (día extra). No suma otra sesión intensa por defecto.
  if (ctx.doneToday.length) {
    return {
      mode: "extra_day", adp: "ADP-03", title: "Hoy ya entrenaste",
      reasons: [`Completaste ${ctx.doneToday.map((d) => d.dayName).join(" y ")}. Otra sesión intensa el mismo día no está en tu plan: descansar también es parte del entrenamiento.`],
      warnings,
      options: [
        { action: "rest", label: "Descansar hoy" },
        ...(ctx.next && ctx.next.exercises > 0 ? [{ action: "start" as const, label: `Hacer igual ${ctx.next.name}`, dayId: ctx.next.id, caution: true }] : []),
        msg, ...help,
      ],
      usesAI: false,
    };
  }
  // Caso A: hay rutina para hoy. Se muestra la asignada, sin generar otra.
  return {
    mode: "original", adp: "ADP-01", title: ctx.next ? `Hoy te toca ${ctx.next.name}` : "Sin ejercicios para hoy",
    reasons: [ctx.next ? `Es la rutina que dejó ${who}, en el orden del programa. Si una máquina está ocupada o te falta tiempo, cambiás o salteás ejercicios desde la sesión.` : "Tu programa no tiene ejercicios cargados."],
    warnings,
    options: [...(ctx.next && ctx.next.exercises > 0 ? [{ action: "start" as const, label: `Empezar ${ctx.next.name}`, dayId: ctx.next.id }] : []), ...help],
    usesAI: false,
  };
}

// ── Contrato de propuesta y validación (§18–19) ────────────────────────────
// Toda propuesta (plantilla, regla o, más adelante, modelo) es un dato, nunca una instrucción ejecutable. Se valida contra
// la biblioteca y los límites antes de mostrarla; si falla, se descarta entera.
export const PROPOSAL_VERSION = 1;
export type ProposalExercise = { exerciseId: string; sets: number; reps: string; restSec: number; note?: string | null };
export type AdaptationProposal = {
  version: typeof PROPOSAL_VERSION; intent: string; sourceDayId: string | null;
  exercises: ProposalExercise[]; changes: string[]; warnings: string[];
  requiresCoachApproval: boolean; requiresUserConfirmation: boolean;
};
export const PROPOSAL_LIMITS = { exercises: 15, sets: 10, restSec: 600, text: 300 };
const REPS_RE = /^(\d{1,3}(-\d{1,3})?|\d{1,3}s|AMRAP)$/;

export function validateProposal(p: unknown, library: ReadonlySet<string>): { ok: true; proposal: AdaptationProposal } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const x = p as Partial<AdaptationProposal> | null;
  if (!x || typeof x !== "object") return { ok: false, errors: ["La propuesta no es un objeto."] };
  if (x.version !== PROPOSAL_VERSION) errors.push("Versión de propuesta desconocida.");
  if (typeof x.intent !== "string" || !x.intent) errors.push("Falta la intención.");
  if (!Array.isArray(x.exercises) || !x.exercises.length) errors.push("La propuesta no tiene ejercicios.");
  else if (x.exercises.length > PROPOSAL_LIMITS.exercises) errors.push("Demasiados ejercicios.");
  else x.exercises.forEach((e, i) => {
    const n = `Ejercicio ${i + 1}`;
    if (!e || typeof e.exerciseId !== "string" || !library.has(e.exerciseId)) errors.push(`${n}: no existe en la biblioteca.`);
    if (!Number.isInteger(e?.sets) || e.sets < 1 || e.sets > PROPOSAL_LIMITS.sets) errors.push(`${n}: series fuera de rango (1 a ${PROPOSAL_LIMITS.sets}).`);
    if (typeof e?.reps !== "string" || !REPS_RE.test(e.reps)) errors.push(`${n}: repeticiones inválidas.`);
    if (!Number.isInteger(e?.restSec) || e.restSec < 0 || e.restSec > PROPOSAL_LIMITS.restSec) errors.push(`${n}: descanso fuera de rango.`);
    if (e?.note != null && (typeof e.note !== "string" || e.note.length > PROPOSAL_LIMITS.text)) errors.push(`${n}: nota inválida.`);
    if ("weightKg" in (e ?? {})) errors.push(`${n}: las cargas no se proponen en esta etapa.`);
  });
  for (const k of ["changes", "warnings"] as const) {
    if (!Array.isArray(x[k]) || x[k]!.some((s) => typeof s !== "string" || s.length > PROPOSAL_LIMITS.text)) errors.push(`«${k}» inválido.`);
  }
  if (typeof x.requiresCoachApproval !== "boolean" || typeof x.requiresUserConfirmation !== "boolean") errors.push("Faltan las marcas de aprobación.");
  if (x.sourceDayId !== null && typeof x.sourceDayId !== "string") errors.push("Día de origen inválido.");
  return errors.length ? { ok: false, errors } : { ok: true, proposal: x as AdaptationProposal };
}
