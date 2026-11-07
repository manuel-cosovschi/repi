// REPI Intelligence Core («brain», Adaptive Coaching 3.0, D209). Tipos compartidos por el dominio, el servidor y la interfaz.
// Contrato: docs/adaptive/ADAPTIVE_COACHING_3.md. Todo lo de este directorio es puro (sin DOM ni Node) y determinístico.

/** De dónde sale un dato y cuánto vale. REPI distingue lo registrado de lo declarado, lo calculado y lo inferido. */
export type FactKind = "recorded" | "declared" | "calculated" | "inferred";
export type FactQuality = "high" | "medium" | "low" | "none";
export type Fact<T> = {
  value: T;
  /** Origen legible y estable: "session", "check_in", "user_pref", "training_intelligence", "own_routine.origin", "coach_program"… */
  source: string;
  /** ISO 8601 del dato (no de la consulta). */
  at: string | null;
  kind: FactKind;
  quality: FactQuality;
  /** Hasta cuándo vale (p. ej. el check-in de hoy, la máquina ocupada en esta sesión). */
  validUntil?: string | null;
  /** Consentimiento que lo habilita, si lo requiere (p. ej. "health"). */
  consent?: string | null;
  /** Limitación a decir en voz alta («pocas sesiones comparables», «carga estimada»). */
  note?: string | null;
};

export type Section = "home" | "workout" | "review" | "progress" | "body" | "history" | "routines" | "messages" | "gym" | "profile" | "club";

/** Relación de entrenamiento de la persona. */
export type Relation = "gym" | "coach" | "own" | "none";
export type AgeBand = "adult" | "minor" | "unknown";

export type ExerciseRef = { id: string; name: string; short: string };

/** Briefing de un ejercicio de la sesión, armado desde Training Intelligence y lo prescrito. */
export type ExerciseBriefInput = {
  exercise: ExerciseRef;
  /** `scheme`: repeticiones de cada serie de trabajo cuando cambian («12», «10», «8» en una pirámide). */
  prescribed: { sets: number; reps: string; rir: number | null; restSec: number; loadKg: number | null; coachLoad: boolean; method: string | null; scheme?: string[] };
  /** Última sesión comparable (series principales comparables). */
  last: { at: string; sets: { w: number | null; r: number | null; rir: number | null }[] } | null;
  /** Recomendación vigente de Training Intelligence para la primera serie principal. */
  recommendation: {
    weightKg: number | null; reps: number | null; repsMin: number | null; repsMax: number | null; action: string; why: string | null; status: string;
    /** Protecciones que frenaron la carga (códigos de `GuardCode`), para avisarlas sin repetir el `why` completo. */
    guards?: string[];
    /** Diferencia con la carga del profe que conviene revisar (nunca cambia el plan). */
    review?: string | null;
  } | null;
  restrictions: string[];
  missing: string[];
};

export type Evidence = {
  /** Qué se usó, en palabras: «Comparé las sesiones del 12/10, 19/10 y 26/10». */
  basis: string;
  /** Qué se dejó afuera: «Excluí las series anuladas y las de aproximación». */
  excluded?: string | null;
  sessions?: { at: string; label?: string }[];
  /** "rules" (calculado), "data" (registrado), "ai" (sugerencia redactada con IA). */
  via: "data" | "rules" | "ai";
};

// ── Contexto ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type BrainContext = {
  version: string;
  now: string;
  section: Section;
  person: {
    age: Fact<AgeBand>;
    unit: "kg" | "lb";
    experience: Fact<string | null>;
    goals: Fact<string[]>;
    weeklyTarget: Fact<number | null>;
    minutesAvailable: Fact<number | null>;
    likes: Fact<string[]>;
    avoids: Fact<string[]>;
  };
  relation: { kind: Relation; orgName: string | null; hasCoach: boolean };
  program: {
    name: string | null;
    versionId: string | null;
    owner: "coach" | "gym" | "own" | null;
    changedAt: string | null;
    days: { key: string; name: string; exercises: number }[];
    nextDay: { key: string; name: string } | null;
    imported: { unknown: number; suggested: number; completed: number } | null;
  };
  session: {
    open: boolean;
    id: string | null;
    dayName: string | null;
    startedAt: string | null;
    current: { exercise: ExerciseRef; setIndex: number; setsDone: number; setsPlanned: number } | null;
    pending: ExerciseRef[];
    done: ExerciseRef[];
    substitutions: number;
    offlinePending: boolean;
  };
  history: {
    sessions30d: number;
    sessions7d: number;
    lastSessionAt: string | null;
    daysSinceLast: number | null;
    voided30d: number;
  };
  readiness: { energy: Fact<number | null>; sleep: Fact<number | null>; mood: Fact<number | null>; lastRpe: Fact<number | null> };
  restrictions: Fact<{ label: string; exercise?: string | null; since: string }[]>;
  body: Fact<{ weightKg: number | null; goalKg: number | null; trendKgPer4w: number | null; entries: number } | null>;
  memory: MemoryItem[];
  /** Lo que falta para responder bien (se dice, no se inventa). */
  missing: string[];
};

// ── Eventos y proactividad ─────────────────────────────────────────────────────────────────────────────────────────────

export type BrainEventKind =
  | "app_open" | "session_start" | "set_logged" | "session_finished" | "session_resumed" | "exercise_changed"
  | "program_updated" | "routine_imported" | "pr" | "weekly_target_met" | "inactivity" | "plateau" | "progressing"
  | "declining" | "goal_reached" | "low_energy" | "pain_reported" | "body_logged" | "recommendation_rejected";

export type BrainEvent = { kind: BrainEventKind; at: string; ref?: Record<string, string | number | null>; data?: Record<string, unknown> };

/** Categoría para preferencias y prioridad. Orden = prioridad (safety primero). */
export type InterventionCategory = "safety" | "coach" | "session" | "progress" | "achievement" | "reminder" | "motivation" | "weekly";
export const CATEGORY_RANK: Record<InterventionCategory, number> = { safety: 0, coach: 1, session: 2, progress: 3, achievement: 4, reminder: 5, motivation: 6, weekly: 7 };

export type Channel = "card" | "inline" | "push";

export type Candidate = {
  kind: string;
  category: InterventionCategory;
  /** Clave de deduplicación estable (incluye el período o la versión cuando corresponde). */
  dedupeKey: string;
  title: string;
  body: string;
  evidence: Evidence | null;
  channel: Channel;
  /** Acciones que ofrece la tarjeta. */
  actions?: CardAction[];
  /** Vence (p. ej. al cerrar la sesión o al cambiar la versión del programa). */
  expiresAt?: string | null;
  programVersionId?: string | null;
  /** Requiere datos suficientes: si false, no se emite. */
  enoughEvidence: boolean;
  /** Información nueva respecto de lo ya dicho. */
  novel?: boolean;
};

export type CardAction = { id: "why" | "start" | "chat" | "accept" | "modify" | "dismiss" | "never" | "open"; label: string; target?: string | null };

export type InterventionStatus = "pending" | "shown" | "accepted" | "dismissed" | "never" | "expired" | "cancelled" | "suppressed";
export type RecentIntervention = { kind: string; category: InterventionCategory; dedupeKey: string; status: InterventionStatus; createdAt: string; channel: Channel };

export type SuppressReason =
  | "duplicate" | "cooldown" | "daily_cap" | "quiet_hours" | "category_off" | "proactive_off" | "never_again" | "insufficient_evidence"
  | "not_novel" | "minor" | "obsolete" | "lower_priority" | "push_off";

export type Decision = { emit: Candidate[]; suppressed: { candidate: Candidate; reason: SuppressReason }[] };

// ── Preferencias ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type Autonomy = 0 | 1 | 2;
export type BrainPrefs = {
  proactive: boolean;
  push: boolean;
  categories: Record<"training" | "progress" | "performance" | "motivation" | "weekly", boolean>;
  quietStart: string;
  quietEnd: string;
  maxPerDay: number;
  autonomy: Autonomy;
  tone: "normal" | "breve";
};
export const DEFAULT_PREFS: BrainPrefs = {
  proactive: true,
  push: false,
  categories: { training: true, progress: true, performance: true, motivation: false, weekly: true },
  quietStart: "22:00",
  quietEnd: "08:00",
  maxPerDay: 2,
  autonomy: 1,
  tone: "normal",
};

// ── Memoria ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type MemoryKind = "preference" | "decision" | "outcome" | "temporal";
export type MemoryItem = {
  id: string;
  kind: MemoryKind;
  /** Clave normalizada: "tone", "avoid_exercise", "prefers_time", "busy_equipment", "minutes_today", "rejected:<kind>"… */
  key: string;
  value: unknown;
  /** Texto para mostrarle a la persona («No te gusta el remo en máquina»). */
  text: string;
  source: "user" | "system" | "coach";
  ref?: Record<string, string | number | null> | null;
  createdAt: string;
  expiresAt: string | null;
};

// ── Conversación ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type IntentName =
  | "today" | "last_mark" | "why_weight" | "trend" | "count" | "busy_machine" | "short_time" | "pain" | "alarm" | "low_energy"
  | "explain_method" | "set_preference" | "forget" | "fewer_messages" | "ask_coach" | "floor_help" | "body_goal" | "import_explain"
  | "set_feedback" | "weekly_plan" | "change_exercise" | "progress_general" | "greeting" | "thanks" | "yes" | "no" | "unknown";
export type Intent = { name: IntentName; slots: Record<string, string | number | null>; confidence: number };

export type ReplyCard =
  | { type: "fact"; title: string; rows: { label: string; value: string }[]; via: Evidence["via"] }
  | { type: "evidence"; evidence: Evidence }
  | { type: "alternatives"; options: { exerciseId: string; name: string; why: string; approvedByCoach: boolean }[] }
  | { type: "plan"; keep: string[]; skip: string[]; note: string };

export type Reply = {
  text: string;
  cards: ReplyCard[];
  /** Acciones propuestas (requieren confirmación según autonomía). */
  actions: ActionProposal[];
  /** "rules" = calculado sin IA; "ai" = redactado con IA; "safety" = respuesta fija de seguridad; "fallback" = sin IA por límite/error. */
  via: "rules" | "ai" | "safety" | "fallback";
  /** Sugerencias rápidas para seguir. */
  suggestions?: string[];
  /** Memoria a proponer (se guarda sólo si la persona confirma). */
  remember?: Omit<MemoryItem, "id" | "createdAt"> | null;
};

// ── Acciones ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ActionKind =
  | "open_workout" | "show_history" | "propose_substitution" | "apply_substitution" | "propose_short_session" | "apply_short_session"
  | "save_preference" | "delete_memory" | "draft_coach_message" | "floor_help" | "report_discomfort" | "record_feedback"
  | "propose_to_coach" | "update_prefs";
export type Risk = "none" | "low" | "medium" | "high";
export type ActionProposal = {
  kind: ActionKind;
  /** Texto para el botón y la confirmación («Reemplazar por jalón unilateral sólo por hoy»). */
  label: string;
  /** Qué cambia y qué no (para la vista previa). */
  preview: string;
  input: Record<string, unknown>;
  /** Clave idempotente (la genera quien propone; se reutiliza al confirmar). */
  key: string;
};
export type ActionSpec = {
  kind: ActionKind;
  risk: Risk;
  /** Autonomía mínima para ejecutar sin confirmación (null = siempre confirma). */
  autoAt: Autonomy | null;
  /** Requiere que la persona sea adulta. */
  adultOnly?: boolean;
  /** Afecta datos de salud (requiere confirmación explícita y nunca se ejecuta solo). */
  health?: boolean;
  /** Sólo dentro de una sesión abierta. */
  inSession?: boolean;
  /** Nunca modifica el programa del entrenador: sólo hoy o borrador. */
  scope: "today" | "draft" | "pref" | "nav" | "record";
  /** Modificación operativa del entrenamiento (cambiar la sesión de hoy o proponer cambios al programa): con autonomía 0 no se ofrece. */
  operational?: boolean;
};
