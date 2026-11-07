// Asistente REPI (Adaptive Coaching 3.0, D210) · tipos del lado del navegador. Espejo de lo que devuelven las rutas
// /api/me/brain/** (contrato: docs/adaptive/AC3_API_SOCIO.md y AC3_API_PROACTIVO_COACH_ADMIN.md). La interfaz no calcula nada
// de esto: lo muestra. Los tipos del núcleo se importan del dominio (sólo tipos, no lógica de servidor).
import type { ActionKind, BrainPrefs, CardAction, Evidence, InterventionCategory, MemoryKind, ReplyCard, Section } from "@repi/domain/brain/types";

export type { ActionKind, BrainPrefs, CardAction, Evidence, ReplyCard, Section };

export type Via = "rules" | "ai" | "fallback" | "safety";

/** Referencia de la pantalla: sólo identificadores; el servidor los valida (un id ajeno responde 404). */
export type BrainRef = { exerciseId?: string | null; programExerciseId?: string | null; sessionId?: string | null; routineId?: string | null; setIndex?: number | null };

export type ProposedAction = {
  kind: ActionKind; label: string; preview: string; input: Record<string, unknown>; key: string;
  mode: "auto" | "confirm" | "blocked"; reason: string | null; code: string; actionId: string;
};

export type MessageView = {
  id: string; threadId: string; role: "user" | "repi"; text: string; cards: ReplyCard[]; actions: ProposedAction[];
  section: string | null; ref: Record<string, string | number | null> | null; via: Via | null; feedback: -1 | 1 | null; createdAt: string;
};

export type InterventionView = {
  id: string; kind: string; category: InterventionCategory; title: string; body: string; evidence: Evidence | null;
  actions: CardAction[]; data: { exerciseId?: string; sessionId?: string; routineId?: string } & Record<string, unknown>;
  channel: "card" | "inline" | "push"; status: string; reason: string | null; priority: number; programVersionId: string | null;
  createdAt: string; shownAt: string | null; resolvedAt: string | null; expiresAt: string | null;
};

export type BrainHome = {
  card: InterventionView | null;
  interventions: InterventionView[];
  source: "proactive" | "stored";
  today: { text: string; sessionOpen: boolean; sessionId: string | null; dayKey: string | null; dayName: string | null; programOwner: "coach" | "gym" | "own" | null };
  prefs: { proactive: boolean; tone: "normal" | "breve"; autonomy: 0 | 1 | 2 };
};

export type MessageResponse = { message: MessageView; reply: MessageView; suggestions: string[]; replayed: boolean };
export type ThreadResponse = { thread: { id: string; createdAt: string; updatedAt: string; closedAt: string | null } | null; messages: MessageView[] };

export type ActionView = { id: string; kind: string; idempotencyKey: string; status: "proposed" | "confirmed" | "executed" | "failed" | "blocked" | "cancelled"; result: Record<string, unknown> | null; error: string | null };
export type ConfirmResponse = { ok: boolean; executed: boolean; action: ActionView; result: Record<string, unknown> | null; text: string; code?: string };

/** Lo que una acción ejecutada le pide a la pantalla (navegación o borrador para Mensajes). */
export type Navigate =
  | { to: "workout"; dayKey: string | null }
  | { to: "history"; exerciseId: string | null }
  | { to: "change_exercise"; programExerciseId: string | null }
  | { to: "short_session"; minutes: number };
export type Draft = { draft: string; to: "coach" | "gym" | null; exerciseId: string | null };

export type MemoryItem = { id: string; kind: MemoryKind; key: string; value: unknown; text: string; source: "user" | "system" | "coach"; ref: unknown; createdAt: string; expiresAt: string | null };

export type ReviewMark = { type: "load" | "reps_at_load" | "e1rm" | "reps" | "time"; value: number; previous: number; tie: boolean; text: string };
export type ReviewExercise = { exerciseId: string; name: string; status: "done" | "partial" | "skipped"; doneMain: number; plannedMain: number; comparison: "more" | "same" | "fewer" | "first" | "not_comparable"; delta: string | null; mark?: ReviewMark | null };
export type ReviewView = {
  sessionId: string; status: "in_progress" | "paused" | "completed" | "abandoned"; dayName: string; at: string;
  review: {
    text: string; planned: number; done: number; exercises: ReviewExercise[]; skipped: string[]; adaptations: string[]; marks: ReviewMark[];
    fatigue: boolean; next: { kind: string; text: string; requiresCoach: boolean } | null; ask: string | null; evidence: Evidence;
  };
};
