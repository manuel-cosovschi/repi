// Acciones de REPI (D210, contrato §5 «actions.ts»; máster §12). REPI sólo hace lo que está en el catálogo del dominio
// (ACTIONS), con la entrada validada contra el contexto REAL de la persona (validateAction) y según su autonomía
// (decideExecution). El protocolo de cada acción: intención → contexto → permisos → validación → seguridad → versión vigente
// → confirmación → ejecución idempotente (brain_action + executeActionOnce) → auditoría → confirmación con el resultado real.
//
// Garantías:
// - Nada se ejecuta por texto del modelo: la IA sólo puede PROPONER y lo propuesto se valida igual que lo de las reglas.
// - Confirmar exige una propuesta registrada por el servidor (brain_action por clave): el navegador no inventa entradas.
// - Al confirmar se vuelve a validar con el contexto de ese momento (la sesión puede haber cambiado): si ya no vale, se bloquea.
// - Lo de hoy vale sólo por hoy (setExerciseChange de la sesión abierta); nunca se borra una serie registrada ni se toca el
//   programa: lo que necesita al entrenador queda como propuesta (training_proposal) o como borrador de mensaje.
// - Salud: la molestia se registra sólo con confirmación explícita y con la intensidad que elige la persona (no se inventa).
// - «Listo: …» sale sólo del resultado del servidor; una falla responde que falló (caso 70).
import { randomUUID } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { PAIN_ZONES } from "@repi/domain";
import {
  ACTIONS, KEY_RE, arDay, decideExecution, isActionKind, listEs, makeKey, norm, rankAlternatives, validateAction,
  type ActionKind, type ActionProposal, type AltContext, type Alternative, type ExecContext, type ValidationCtx,
} from "@repi/domain/brain";
import { addEntry } from "../nutrition/services";
import { MEAL_LABEL, type Meal } from "@repi/domain";
import { db, schema } from "@/db";
import { logError } from "../log";
import { AccessError, audit } from "../access/util";
import { sessionAlternatives, setExerciseChange } from "../training/services";
import { STUDENT_REQUEST_VERSION } from "../training/intelligence";
import { reportPain } from "../followup/services";
import { memberCreate } from "../gym/connect";
import { exMeta, loadContext, sessionEx, type ServerContext } from "./context";
import { createMemory, deleteMemory } from "./memory";
import { getPrefs, requireAssistant, updatePrefs } from "./prefs";
import { setFeedback } from "./conversation";
import { ActionStop, actionByKey, executeActionOnce, proposeAction, transitionAction, type ActionView } from "./store";
import { recordDecision, recordTemporal } from "./events";

const { brainMemory, trainingProposal, consentGrant } = schema;

/**
 * Acciones que se ejecutan solas con autonomía 2. Vacío a propósito: todavía no hay un lugar donde la persona (y la política de
 * su organización) habiliten acciones una por una. Con la lista vacía, todo lo operativo pide confirmación.
 */
export const AUTO_ALLOWED: readonly ActionKind[] = [];
/** Versión del «algoritmo» con que REPI deja propuestas al entrenador (distingue de Training Intelligence en training_proposal). */
export const BRAIN_PROPOSAL_VERSION = STUDENT_REQUEST_VERSION;

/**
 * Alimentación, comidas y forma del cuerpo (texto ya normalizado con `norm`). Nunca se guarda como preferencia de entrenamiento
 * (para nadie: «me gusta saltear comidas» no es un ejercicio que le gusta) y con menores o edad desconocida no se conversa por
 * acá (contrato: no reforzar conductas alimentarias extremas). Sin palabras de carga («peso», «kilos»), que son de los ejercicios.
 */
const FOOD_CORE = "comer|comiendo|comida\\w*|comid[ao]s?|ayun\\w*|picote\\w*|dieta\\w*|calori\\w*|aliment\\w*|nutri\\w*|adelgaz\\w*|engord\\w*|bajar de peso|subir de peso|perder peso|ganar peso|peso corporal|grasa corporal|proteina\\w*|suplement\\w*|balanza|kilos de mas|vomit\\w*|purg\\w*|atracon\\w*|laxante\\w*";
/** Horarios de comida: hablan de comida en una preferencia, no en «voy a almorzar y vuelvo» o «antes del desayuno». */
const MEALS = "cena\\w*|almuerz\\w*|almorz\\w*|desayun\\w*|merienda\\w*";
/** Forma del cuerpo; «gorda» no cuenta en «barra gorda», «agarre grueso» y parecidos (equipamiento). */
const SHAPE = "flac[oa]s?|(?<!(?:barra|agarre|empunadura|manija|mancuerna|soga|cuerda) )gord[oa]s?|panza";
export const FOOD_TALK = new RegExp(`\\b(${FOOD_CORE}|${MEALS}|${SHAPE})\\b`);
const FOOD_ANY_INTENT = new RegExp(`\\b(${FOOD_CORE}|${SHAPE})\\b`);
const prepFood = (text: string) => norm(text.replace(/[_:]/g, " "));
export const isFoodTalk = (text: string) => FOOD_TALK.test(prepFood(text));
/**
 * Con menores o edad desconocida, cualquier mensaje: comida, dieta y forma del cuerpo, sin los horarios de comida (revisión
 * AC3: «la máquina está ocupada, voy a almorzar y vuelvo» no es hablar de alimentación).
 */
export const isFoodTalkAnyIntent = (text: string) => FOOD_ANY_INTENT.test(prepFood(text));
/**
 * ¿Una preferencia es de alimentación? Se mira lo que se va a guardar (clave, valor y texto armado), no la frase entera: «prefiero
 * entrenar a la mañana antes del desayuno» guarda un horario. Un ejercicio que gusta o no gusta se mira por su nombre, sin la
 * forma del cuerpo («press con barra gorda» es un ejercicio; «comer» no).
 */
export function isFoodPreference(p: { key?: unknown; value?: unknown; text?: unknown }): boolean {
  const key = typeof p.key === "string" ? p.key : "";
  const value = typeof p.value === "string" ? p.value : p.value != null ? JSON.stringify(p.value) : "";
  if (/^(avoid|likes)_exercise:/.test(key)) return isFoodTalkAnyIntent(`${key.split(":").slice(1).join(" ")} ${value}`) || new RegExp(`\\b(${MEALS})\\b`).test(prepFood(key));
  return isFoodTalk([key, value, typeof p.text === "string" ? p.text : ""].join(" "));
}

/**
 * Acciones atadas al momento en que se propusieron: la sesión abierta (o, sin sesión, el día). Una tarjeta de otro entrenamiento
 * no se ejecuta en el de hoy aunque los ejercicios del programa tengan los mismos ids (una propuesta que ya no corresponde se bloquea).
 */
const SESSION_BOUND: ReadonlySet<ActionKind> = new Set<ActionKind>(["propose_substitution", "propose_short_session", "apply_substitution", "apply_short_session", "floor_help", "report_discomfort"]);
/**
 * Lo que el servidor guarda junto a la entrada de la acción (brain_action.input._bind; nunca va al dominio ni a la tarjeta):
 * `offer`, la respuesta que la ofreció (las alternativas de una misma oferta son UN rechazo para el entrenador), y para las
 * acciones atadas al momento, la sesión y el día.
 */
type Bind = { offer?: string; sessionId?: string | null; day?: string };
const bindOf = (sc: ServerContext, kind: ActionKind, offer: string): Bind =>
  ({ offer, ...(SESSION_BOUND.has(kind) ? { sessionId: sc.session?.id ?? null, day: arDay(sc.now) } : {}) });
/** Separa la entrada que valida el dominio de lo que guardó el servidor. */
const splitInput = (input: Record<string, unknown>) => {
  const { _bind, ...rest } = input;
  return { input: rest, bind: (_bind && typeof _bind === "object" ? _bind : null) as Bind | null };
};
/** ¿La propuesta es de otro momento? Devuelve el motivo (para «Eso ya no se puede hacer: …») o null si sigue valiendo. */
/** Registrar una molestia vale todo el día, con o sin entrenamiento abierto (propuesta en Inicio y confirmada ya entrenando, o al revés). */
const DAY_ONLY: ReadonlySet<ActionKind> = new Set<ActionKind>(["report_discomfort"]);
/** «Sólo por hoy»: también vence al cambiar el día aunque la sesión siga abierta pasada la medianoche. */
const DAY_TOO: ReadonlySet<ActionKind> = new Set<ActionKind>(["propose_short_session", "apply_short_session"]);
function staleBinding(kind: ActionKind, bind: Bind | null, sc: ServerContext): string | null {
  if (!SESSION_BOUND.has(kind)) return null;
  const again = "Pedímelo de nuevo si todavía lo necesitás.";
  if (!bind || !("sessionId" in bind)) return `es de antes. ${again}`;
  const otherDay = bind.day !== arDay(sc.now);
  if (DAY_ONLY.has(kind)) return otherDay ? `era de otro día. ${again}` : null;
  if ((bind.sessionId ?? null) !== (sc.session?.id ?? null)) return `era para otro entrenamiento. ${again}`;
  if ((!bind.sessionId || DAY_TOO.has(kind)) && otherDay) return `era de otro día. ${again}`;
  return null;
}

/** Una propuesta ya validada y registrada, con cómo se ejecutaría (para el botón y la confirmación). */
export type ProposedAction = ActionProposal & {
  mode: "auto" | "confirm" | "blocked";
  /** Motivo en palabras (bloqueo o por qué se confirma). */
  reason: string | null;
  code: string;
  actionId: string;
};
export type ExecOutcome = {
  ok: boolean;
  /** true sólo si ESTE pedido la ejecutó (un reintento devuelve el resultado guardado con executed: false). */
  executed: boolean;
  action: ActionView;
  result: Record<string, unknown> | null;
  /** Lo que REPI le dice a la persona, armado con el resultado real (o con la falla). */
  text: string;
  code?: string;
};
export type ActionDetails = { level?: number | null; zone?: string | null };

// ── Contextos de validación y ejecución ─────────────────────────────────────
export const execCtx = (sc: ServerContext): ExecContext => ({
  age: sc.ctx.person.age.value, sessionOpen: sc.ctx.session.open, programOwner: sc.execOwner, allowAuto: AUTO_ALLOWED, confirmFirst: sc.confirmFirst, supervised: sc.supervised,
});

/**
 * Lo que vale para validar: ejercicios de la sesión abierta (pendientes = sin omitir ni terminar; «hechos» = con alguna serie
 * registrada, que nunca se omiten ni se reemplazan), alternativas ofrecidas, ejercicios que la persona puede nombrar, días del
 * programa y sus recuerdos. Los ids son los que ve el dominio (el del programa en la sesión, el de la biblioteca fuera).
 */
export function validationCtx(sc: ServerContext, alternatives: Record<string, string[]> = {}): ValidationCtx {
  const sx = sc.session?.exercises ?? [];
  return {
    sessionOpen: sc.ctx.session.open,
    session: sc.session ? {
      pending: sx.filter((e) => !e.skipped && e.loggedIdx.length < (e.sets ?? 0)).map((e) => e.peId),
      done: sx.filter((e) => e.loggedIdx.length > 0).map((e) => e.peId),
    } : null,
    alternatives,
    exercises: [...sc.meta.keys()],
    days: (sc.program?.days ?? []).map((d) => d.id),
    memoryIds: sc.ctx.memory.map((m) => m.id),
  };
}

export type AltReason = NonNullable<AltContext["reason"]>;
export type AltCache = Map<string, Alternative[]>;
const ALT_REASONS: readonly AltReason[] = ["busy", "no_equipment", "discomfort", "dislike", "no_time", "other"];
export const altReason = (x: unknown): AltReason => (ALT_REASONS as readonly string[]).includes(x as string) ? (x as AltReason) : "other";

/**
 * Una o dos alternativas reales para un ejercicio de la sesión abierta: la biblioteca visible para el programa (las mismas que
 * ve la persona en «Cambiar ejercicio»), aprobadas por el entrenador primero, sin lo que evita, lo restringido ni lo que ya está
 * en la sesión (rankAlternatives del dominio). Sin sesión abierta o con un ejercicio ajeno, ninguna.
 */
export async function alternativesFor(sc: ServerContext, exerciseRef: string, reason: AltReason, cache?: AltCache): Promise<Alternative[]> {
  const k = `${exerciseRef}|${reason}`;
  const hit = cache?.get(k);
  if (hit) return hit;
  const se = sessionEx(sc, exerciseRef);
  let out: Alternative[] = [];
  if (se && sc.session) {
    const alt = await sessionAlternatives(sc.userId, sc.session.id, se.peId);
    const exclude = sc.session.exercises.flatMap((e) => [e.exerciseId, e.originalId]);
    out = rankAlternatives(
      { exerciseId: se.originalId, name: se.originalName, muscleGroup: alt.group ?? se.muscleGroup, kind: se.kind },
      alt.alternatives.map((x) => ({ exerciseId: x.id, name: x.name, muscleGroup: x.muscleGroup, kind: x.kind, approvedByCoach: x.approved, approvedNote: x.approvedNote, hasHistory: !!x.prev })),
      { reason, avoids: sc.avoids, restrictions: sc.restrictedNames, exclude },
    );
  }
  cache?.set(k, out);
  return out;
}

/** Valida (con las alternativas que hagan falta) una propuesta. Devuelve la entrada normalizada o los errores. */
async function validate(sc: ServerContext, p: Pick<ActionProposal, "kind" | "input" | "key">, cache?: AltCache) {
  if (p.kind === "save_preference" && isFoodPreference({ key: p.input?.key, value: p.input?.value, text: p.input?.text })) {
    return { ok: false as const, errors: ["De alimentación no guardo preferencias."] };
  }
  const alts: Record<string, string[]> = {};
  if (p.kind === "apply_substitution" && typeof p.input?.exerciseId === "string") {
    alts[p.input.exerciseId] = (await alternativesFor(sc, p.input.exerciseId, altReason(p.input.reason), cache)).map((a) => a.exerciseId);
  }
  return validateAction(p, validationCtx(sc, alts));
}

/**
 * Registra las propuestas de una respuesta (reglas o IA): valida cada una, decide cómo se ejecutaría y la guarda en brain_action
 * con su clave (las bloqueadas también, con el motivo: sirven para métricas y para explicar). Lo inválido no se muestra.
 * `offer`: la respuesta que las ofrece (sin ella, cada propuesta es su propia oferta).
 */
export async function registerProposals(sc: ServerContext, proposals: ActionProposal[], cache?: AltCache, o: { offer?: string } = {}): Promise<{ actions: ProposedAction[]; rejected: { kind: string; errors: string[] }[] }> {
  const actions: ProposedAction[] = [], rejected: { kind: string; errors: string[] }[] = [];
  const seen = new Set<string>();
  for (const p of proposals) {
    if (!p || !isActionKind(p.kind) || seen.has(p.key)) { rejected.push({ kind: String(p?.kind), errors: ["Acción desconocida."] }); continue; }
    seen.add(p.key);
    const v = await validate(sc, p, cache);
    if (!v.ok) { rejected.push({ kind: p.kind, errors: v.errors }); continue; }
    const d = decideExecution(ACTIONS[p.kind], sc.prefs.autonomy, execCtx(sc));
    const { action } = await proposeAction(sc.userId, {
      kind: p.kind, idempotencyKey: p.key, autonomy: sc.prefs.autonomy, input: { ...v.input, _bind: bindOf(sc, p.kind, o.offer ?? p.key) },
      status: d.mode === "blocked" ? "blocked" : "proposed", error: d.mode === "blocked" ? d.code : null,
    });
    actions.push({ kind: p.kind, label: p.label, preview: p.preview, input: v.input, key: p.key, mode: d.mode, reason: d.reason, code: d.code, actionId: action.id });
  }
  return { actions, rejected };
}

// ── Ejecutores ──────────────────────────────────────────────────────────────
/** `commit`: avisar apenas el efecto principal quedó escrito (después, una falla no hace reintentar: duplicaría el efecto). */
type Run = (sc: ServerContext, input: Record<string, unknown>, a: ActionView, details: ActionDetails, now: Date, commit: () => void) => Promise<Record<string, unknown>>;
const str = (x: unknown) => (typeof x === "string" ? x : null);
const CLOSED = () => new AccessError("closed", "No hay un entrenamiento abierto.", 409);

/** Zona de la molestia según lo que dijo la persona. Hombro y rodilla piden el lado (no se supone). */
const ZONE_OF: Record<string, string | null> = {
  "zona lumbar": "Lumbar", espalda: "Lumbar", cintura: "Lumbar", codo: "Codo", "muñeca": "Muñeca", cuello: "Cuello", cadera: "Cadera", tobillo: "Tobillo",
  hombro: null, rodilla: null,
};
function painZone(area: string | null, chosen: string | null | undefined): string | null {
  if (chosen) return (PAIN_ZONES as readonly string[]).includes(chosen) ? chosen : null;
  if (!area) return null;
  return area in ZONE_OF ? ZONE_OF[area] : "Otra";
}

/** Lo que tiene que estar antes de ejecutar (sin consumir la acción si falta: se pide y se vuelve a confirmar). */
function preflight(kind: ActionKind, input: Record<string, unknown>, details: ActionDetails) {
  if (kind !== "report_discomfort") return;
  const missing: string[] = [];
  if (!Number.isInteger(details.level) || (details.level as number) < 0 || (details.level as number) > 10) missing.push("level");
  if (!painZone(str(input.area), details.zone)) missing.push("zone");
  if (missing.length) throw new AccessError("details_required", "Para registrarla necesito la intensidad (0 a 10) y la zona.", 409, { fields: missing, zones: PAIN_ZONES });
}

async function hasGrant(relationId: string, item: string) {
  const [g] = await db.select({ id: consentGrant.id }).from(consentGrant).where(and(eq(consentGrant.relationId, relationId), eq(consentGrant.item, item), eq(consentGrant.status, "active")));
  return !!g;
}

const RUN: Record<ActionKind, Run> = {
  open_workout: async (_sc, input) => ({ text: "", navigate: { to: "workout", dayKey: str(input.dayKey) } }),
  show_history: async (sc, input) => ({ text: "", navigate: { to: "history", exerciseId: exMeta(sc, str(input.exerciseId))?.exerciseId ?? null } }),
  propose_substitution: async (sc, input) => ({ text: "", navigate: { to: "change_exercise", programExerciseId: sessionEx(sc, str(input.exerciseId))?.peId ?? null } }),
  propose_short_session: async (_sc, input) => ({ text: "", navigate: { to: "short_session", minutes: input.minutes } }),

  apply_substitution: async (sc, input, _a, _d, now, commit) => {
    const se = sessionEx(sc, str(input.exerciseId));
    if (!se || !sc.session) throw CLOSED();
    const r = await setExerciseChange(sc.userId, sc.session.id, { programExerciseId: se.peId, change: { kind: "substitute", reason: input.reason as "busy", exerciseId: str(input.substituteId) } }, now);
    const sub = r.change?.substitute;
    if (!sub) throw new AccessError("error", "No se aplicó el reemplazo.", 500);
    commit();
    if (input.reason === "busy" || input.reason === "no_equipment") {
      await recordTemporal(sc.userId, { key: "busy_equipment", value: { exerciseId: se.originalId }, text: `Hoy ${se.originalName} no estaba disponible.`, ref: { sessionId: sc.session.id, exerciseId: se.originalId } }, now);
    }
    return {
      text: `Listo: hoy hacés ${sub.name} en lugar de ${se.originalName}. Tu rutina original queda igual.`,
      scope: "today", sessionId: sc.session.id, programExerciseId: se.peId, original: { exerciseId: se.originalId, name: se.originalName }, substitute: sub,
    };
  },

  apply_short_session: async (sc, input, _a, _d, now, commit) => {
    if (!sc.session) throw CLOSED();
    const sid = sc.session.id;
    const skip = (input.skip as string[]).map((id) => sessionEx(sc, id)).filter((x): x is NonNullable<typeof x> => !!x);
    const applied: typeof skip = [];
    try {
      for (const se of skip) {
        await setExerciseChange(sc.userId, sid, { programExerciseId: se.peId, change: { kind: "skip", reason: "no_time" } }, now);
        applied.push(se);
      }
    } catch (e) {
      // Todo o nada: lo que ya se omitió vuelve como estaba (un reemplazo previo se restituye; mejor esfuerzo).
      for (const se of applied) {
        const back = se.substituted ? { kind: "substitute" as const, reason: "other" as const, exerciseId: se.exerciseId } : null;
        await setExerciseChange(sc.userId, sid, { programExerciseId: se.peId, change: back }, now).catch((err) => logError("brain.actions.rollback", err));
      }
      throw e;
    }
    commit();
    await recordTemporal(sc.userId, { key: "minutes_today", value: input.minutes, text: `Hoy tenías ${input.minutes} minutos.`, ref: { sessionId: sid } }, now);
    const names = skip.map((x) => x.name);
    return {
      text: `Listo: por hoy dejamos ${listEs(names)} para otro día. Lo registrado no cambia y tu rutina tampoco.`,
      scope: "today", sessionId: sid, minutes: input.minutes, skipped: skip.map((x) => ({ programExerciseId: x.peId, name: x.name })),
    };
  },

  save_preference: async (sc, input, _a, _d, now, commit) => {
    const key = input.key as string;
    const { item, created } = await createMemory(sc.userId, { kind: "preference", key, value: input.value, text: input.text as string, source: "user" }, now);
    commit();
    // Modificar una preferencia (caso 30): la nueva reemplaza a la anterior de la misma clave.
    await db.update(brainMemory).set({ revokedAt: now })
      .where(and(eq(brainMemory.userId, sc.userId), eq(brainMemory.kind, "preference"), eq(brainMemory.key, key), isNull(brainMemory.revokedAt), ne(brainMemory.id, item.id)));
    if (key === "tone" && (input.value === "breve" || input.value === "normal")) await updatePrefs(sc.userId, { tone: input.value }, now);
    const cat = /^category_off:(training|progress|performance|motivation|weekly)$/.exec(key)?.[1];
    if (cat) await updatePrefs(sc.userId, { categories: { [cat]: false } }, now);
    return { text: `Listo: lo recuerdo. «${item.text}» Lo podés ver o borrar en Perfil → Asistente REPI.`, memoryId: item.id, created };
  },

  delete_memory: async (sc, input, _a, _d, now) => {
    await forgetMemory(sc.userId, input.memoryId as string, now);
    return { text: "Listo: lo borré de lo que REPI recuerda.", memoryId: input.memoryId };
  },

  update_prefs: async (sc, input, _a, _d, now) => {
    const prefs = await updatePrefs(sc.userId, input.patch, now);
    return { text: prefs.proactive ? "Listo: cambié tus preferencias de avisos." : "Listo: apagué los avisos de REPI. Me podés escribir cuando quieras.", prefs };
  },

  record_feedback: async (sc, input, _a, _d, now) => {
    const value = input.value as 1 | -1;
    if (input.target === "message") await setFeedback(sc.userId, input.id as string, value);
    else await recordDecision(sc.userId, { decision: value === 1 ? "accepted" : "rejected", what: "intervention_feedback", ref: { interventionId: input.id as string } }, now);
    return { text: "Gracias por avisar." };
  },

  draft_coach_message: async (sc, input) => ({
    // Nunca se envía: el texto vuelve para que la persona lo revise en el campo de Mensajes y lo mande ella.
    text: "Te dejé el borrador para que lo revises y lo mandes vos.",
    draft: input.text, to: sc.relation?.kind ?? null, exerciseId: exMeta(sc, str(input.exerciseId))?.exerciseId ?? null, sent: false,
  }),

  floor_help: async (sc, input, a, _d, now) => {
    const se = sessionEx(sc, str(input.exerciseId));
    const r = await memberCreate(sc.userId, {
      reason: se ? "ejercicio" : "hablar", comment: str(input.note), clientKey: a.idempotencyKey,
      gymMemberId: sc.relation?.kind === "gym" ? sc.relation.id : null,
      context: se && sc.session ? { sessionId: sc.session.id, programExerciseId: se.peId, exerciseId: se.originalId } : null,
    }, now);
    return {
      text: r.duplicate ? `Ya tenías un pedido abierto en ${r.place} (${r.ref}): te avisan cuando alguien lo tome.` : `Listo: avisé al equipo de sala de ${r.place} (${r.ref}).`,
      taskId: r.id, ref: r.ref, duplicate: r.duplicate,
    };
  },

  // D221: registra el alimento confirmado en el diario. El id sale de la clave de la acción (un reintento no duplica) y los
  // valores los calcula el servicio de Nutrición desde la biblioteca (nunca los que vinieron en la propuesta).
  log_food: async (sc, input, a, _d, now) => {
    const id = `b${a.idempotencyKey.split(":")[1]}`;
    const r = await addEntry(sc.userId, { id, day: str(input.day)!, meal: str(input.meal)!, ref: { kind: "catalog", id: str(input.foodSlug)! }, quantity: { amount: input.amount as number, unit: str(input.unit) as "g" } }, now);
    return { text: r.duplicate ? "Ya estaba registrado: no lo dupliqué." : `Listo: lo registré en ${MEAL_LABEL[str(input.meal) as Meal].toLowerCase()}.`, entryId: id, duplicate: r.duplicate };
  },

  report_discomfort: async (sc, input, _a, details, _now, commit) => {
    const se = sessionEx(sc, str(input.exerciseId));
    const m = exMeta(sc, str(input.exerciseId));
    const zone = painZone(str(input.area), details.zone)!;
    const r = await reportPain(sc.userId, {
      zone, level: details.level as number, context: se && sc.session ? "now" : "out", exerciseName: m?.name ?? null,
      sessionId: se && sc.session ? sc.session.id : null, note: str(input.note),
    }, { onSaved: commit });
    return {
      text: `Listo: registré la molestia (${zone}). ${r.visibleToCoach ? `La ve ${r.coachName ?? "tu entrenador"}.` : "Queda en tu perfil."} Si sigue, consultalo con tu entrenador o con un profesional de la salud.`,
      painId: r.id, visibleToCoach: r.visibleToCoach,
    };
  },

  propose_to_coach: async (sc, input) => {
    const rel = sc.relation;
    if (!rel || (sc.execOwner !== "coach" && sc.execOwner !== "gym")) throw new AccessError("no_coach", "Tu rutina no es de un entrenador: la podés editar vos en Mis rutinas.", 409);
    if (!(await hasGrant(rel.id, rel.kind === "coach" ? "training" : "attendance_training")))
      throw new AccessError("no_grant", "Para dejarle una propuesta a tu entrenador, primero compartí tus entrenamientos con él (Perfil → Privacidad).", 403);
    const m = exMeta(sc, str(input.exerciseId));
    const inProgram = !!m && (sc.program?.days ?? []).some((d) => d.exercises.some((e) => e.exerciseId === m.exerciseId));
    if (!m || !inProgram) throw new AccessError("invalid", "Ese ejercicio no está en tu programa vigente.");
    const note = str(input.note);
    const payload = {
      text: `Tu alumno pidió revisar ${m.name}${note ? `: «${note}»` : "."}`.slice(0, 300),
      weightKg: (input.weightKg as number | null) ?? null, reps: (input.reps as number | null) ?? null,
      basis: "Pedido del alumno desde REPI. No lo calculó Training Intelligence: revisalo antes de aplicarlo.", trend: "student_request", sessions: 0,
    };
    const relVals = rel.kind === "coach" ? { coachClientId: rel.id } : { gymMemberId: rel.id };
    const [row] = await db.insert(trainingProposal).values({ ...relVals, exerciseId: m.exerciseId, kind: input.kind as "load", payload, algoVersion: BRAIN_PROPOSAL_VERSION })
      .onConflictDoNothing().returning({ id: trainingProposal.id });
    let id: string | null = row?.id ?? null, ti = false;
    if (!row) {
      const relCol = rel.kind === "coach" ? trainingProposal.coachClientId : trainingProposal.gymMemberId;
      const [cur] = await db.select({ id: trainingProposal.id, algoVersion: trainingProposal.algoVersion }).from(trainingProposal)
        .where(and(eq(relCol, rel.id), eq(trainingProposal.exerciseId, m.exerciseId), eq(trainingProposal.kind, input.kind as "load"), eq(trainingProposal.status, "open")));
      // Si el lugar lo ocupa una propuesta de Training Intelligence, no se la toma como pedido del alumno: ni se pisa ni se cuenta
      // como suya (el entrenador la ve igual, como propuesta de Training Intelligence).
      ti = !!cur && cur.algoVersion !== BRAIN_PROPOSAL_VERSION;
      id = ti ? null : cur?.id ?? null;
    } else {
      await audit(db, { actorUserId: sc.userId, orgId: rel.orgId, action: "brain.proposal_created", resourceType: "training_proposal", resourceId: row.id, meta: { kind: input.kind } });
    }
    return {
      text: row ? "Listo: le dejé la propuesta a tu entrenador. Él decide si la incorpora; tu rutina no cambia."
        : ti ? "Tu entrenador ya tiene para revisar una propuesta sobre ese ejercicio. Si querés sumarle lo tuyo, mandale un mensaje: tu rutina no cambia."
          : "Ya hay una propuesta abierta para ese ejercicio: tu entrenador la va a ver.",
      proposalId: id, duplicate: !row, scope: "draft",
    };
  },
};

// ── Protocolo ───────────────────────────────────────────────────────────────
/** Cómo se nombra cada acción en «Lo que REPI recuerda» (decisiones aceptadas o rechazadas). */
export const ACTION_TEXT: Record<ActionKind, string> = {
  open_workout: "abrir el entrenamiento", show_history: "ver el historial", record_feedback: "opinar sobre una respuesta",
  propose_substitution: "ver reemplazos", propose_short_session: "una versión corta de la sesión", apply_substitution: "un reemplazo sólo por hoy",
  apply_short_session: "acortar la sesión de hoy", draft_coach_message: "preparar una consulta para tu entrenador", propose_to_coach: "dejarle una propuesta a tu entrenador",
  save_preference: "guardar una preferencia", delete_memory: "borrar un recuerdo", update_prefs: "cambiar tus avisos", floor_help: "pedir ayuda en sala",
  report_discomfort: "registrar una molestia", log_food: "registrar un alimento",
};
const failText = (kind: ActionKind, e: unknown) => {
  const msg = e instanceof AccessError && e.status < 500 ? ` ${e.message}` : " Probá de nuevo en un rato.";
  const what: Partial<Record<ActionKind, string>> = {
    apply_substitution: "aplicar el reemplazo", apply_short_session: "acortar la sesión", save_preference: "guardar la preferencia", delete_memory: "borrar el recuerdo",
    update_prefs: "cambiar tus preferencias", floor_help: "avisar a la sala", log_food: "registrar el alimento", report_discomfort: "registrar la molestia", propose_to_coach: "dejarle la propuesta a tu entrenador",
  };
  return `No pude ${what[kind] ?? "hacerlo"}: no se cambió nada.${msg}`;
};
/** Qué decir cuando el efecto quedó hecho pero falló un paso posterior (registrar el contexto, leer quién la ve). */
const PARTIAL_TEXT: Partial<Record<ActionKind, string>> = {
  report_discomfort: "Listo: registré la molestia. No pude confirmar quién la ve: revisalo en tu perfil. Si sigue, consultalo con tu entrenador o con un profesional de la salud.",
  apply_substitution: "Listo: el reemplazo de hoy quedó aplicado. Tu rutina original queda igual.",
  apply_short_session: "Listo: por hoy dejamos esos ejercicios para otro día. Lo registrado no cambia y tu rutina tampoco.",
  save_preference: "Listo: lo recuerdo. Lo podés ver o borrar en Perfil → Asistente REPI.",
};
const resultText = (a: ActionView) => (typeof a.result?.text === "string" ? (a.result.text as string) : "");

/**
 * Ejecuta una acción una sola vez (executeActionOnce: la reclama, corre `run` sin transacciones abiertas y la cierra) y arma lo
 * que se le dice a la persona con el resultado real o con la falla. `orgId` se lee al final (el contexto puede armarse en `run`).
 */
async function runAction(userId: string, a: ActionView, run: (cur: ActionView, commit: () => void) => Promise<Record<string, unknown>>, now: Date, orgId: () => string | null): Promise<ExecOutcome> {
  const kind = a.kind as ActionKind;
  const r = await executeActionOnce(userId, a.id, run, now);
  if (r.stopped) {
    // Faltan datos (details_required): la acción vuelve a quedar propuesta y se piden; el llamador muestra el pedido.
    if (r.stopped.to === "proposed" && r.stopped.reason instanceof Error) throw r.stopped.reason;
    return { ok: false, executed: false, action: r.action, result: null, text: r.stopped.text, code: r.stopped.code ?? "blocked" };
  }
  if (r.partial) {
    // El efecto principal quedó escrito y falló un paso posterior: no se reintenta (duplicaría) y no se dice «no se cambió nada».
    logError("brain.actions.partial", r.error);
    await audit(db, { actorUserId: userId, orgId: orgId(), action: "brain.action_executed", resourceType: "brain_action", resourceId: a.id, meta: { kind, partial: true } })
      .catch((e) => logError("brain.actions.audit", e));
    return { ok: true, executed: true, action: r.action, result: r.action.result, text: PARTIAL_TEXT[kind] ?? "Listo: quedó hecho, aunque no pude confirmar todos los detalles." };
  }
  if (r.error !== undefined) {
    const code = r.error instanceof AccessError ? r.error.code : "error";
    if (!(r.error instanceof AccessError) || r.error.status >= 500) logError("brain.actions.run", r.error);
    await audit(db, { actorUserId: userId, action: "brain.action_failed", resourceType: "brain_action", resourceId: a.id, result: "error", meta: { kind, code } }).catch((e) => logError("brain.actions.audit", e));
    return { ok: false, executed: false, action: r.action, result: null, text: failText(kind, r.error), code };
  }
  if (!r.executed && r.action.status === "blocked") return { ok: false, executed: false, action: r.action, result: null, text: "Esa acción no está disponible.", code: r.action.error ?? "blocked" };
  if (r.executed) {
    await audit(db, { actorUserId: userId, orgId: orgId(), action: "brain.action_executed", resourceType: "brain_action", resourceId: a.id, meta: { kind } })
      .catch((e) => logError("brain.actions.audit", e));
    if (kind !== "record_feedback" && kind !== "open_workout" && kind !== "show_history") {
      await recordDecision(userId, { decision: "accepted", what: kind, label: ACTION_TEXT[kind], ref: { actionId: a.id } }, now);
    }
  }
  return { ok: true, executed: r.executed, action: r.action, result: r.action.result, text: resultText(r.action) };
}

/**
 * Confirma y ejecuta una acción propuesta por el servidor (por su clave). Idempotente: un reintento, un doble toque u otra
 * pestaña devuelven el resultado ya guardado sin volver a ejecutar (caso 23). Se revisa con la acción YA reclamada (nadie más
 * puede correrla mientras tanto) y con el contexto de ese momento: si es de otra sesión u otro día, o ya no valida, se bloquea y
 * lo dice. `sc` permite reutilizar un contexto recién armado (el orquestador lo tiene).
 */
export async function confirmAction(userId: string, key: string, o: { details?: ActionDetails; now?: Date; sc?: ServerContext } = {}): Promise<ExecOutcome> {
  requireAssistant();
  const now = o.now ?? new Date();
  if (typeof key !== "string" || !KEY_RE.test(key)) throw new AccessError("invalid", "Clave de acción inválida.");
  const a = await actionByKey(userId, key);
  if (!a || !isActionKind(a.kind)) throw new AccessError("not_found", "No encontramos esa acción.", 404);
  if (a.status === "executed") return { ok: true, executed: false, action: a, result: a.result, text: resultText(a) };
  if (a.status === "blocked") return { ok: false, executed: false, action: a, result: null, text: "Esa acción no está disponible.", code: a.error ?? "blocked" };
  if (a.status !== "proposed" && a.status !== "confirmed") throw new AccessError("invalid_state", "Esa acción ya se resolvió.", 409);
  const kind = a.kind;
  let used: ServerContext | null = null;
  return runAction(userId, a, async (cur, commit) => {
    const sc = used = o.sc ?? await loadContext(userId, { section: "workout" }, now);
    const { input, bind } = splitInput(cur.input);
    const stale = staleBinding(kind, bind, sc);
    if (stale) throw new ActionStop("blocked", "stale", `Eso ya no se puede hacer: ${stale}`);
    const v = await validate(sc, { kind, input, key: cur.idempotencyKey });
    if (!v.ok) throw new ActionStop("blocked", "stale", `Eso ya no se puede hacer: ${v.errors[0]}`);
    const d = decideExecution(ACTIONS[kind], sc.prefs.autonomy, execCtx(sc));
    if (d.mode === "blocked") throw new ActionStop("blocked", d.code, d.reason ?? "Esa acción no está disponible.");
    try { preflight(kind, v.input, o.details ?? {}); } catch (e) { throw new ActionStop("proposed", null, e instanceof Error ? e.message : "", e); }
    return RUN[kind](sc, v.input, cur, o.details ?? {}, now, commit);
  }, now, () => used?.relation?.orgId ?? null);
}

/** Cancela una propuesta («no», «dejalo»): queda como decisión rechazada para no insistir con lo mismo (caso 29). */
export async function cancelAction(userId: string, key: string, now = new Date()): Promise<{ action: ActionView; changed: boolean }> {
  if (typeof key !== "string" || !KEY_RE.test(key)) throw new AccessError("invalid", "Clave de acción inválida.");
  const a = await actionByKey(userId, key);
  if (!a) throw new AccessError("not_found", "No encontramos esa acción.", 404);
  if (a.status === "blocked" || a.status === "cancelled") return { action: a, changed: false };
  const r = await transitionAction(userId, a.id, "cancelled", {}, now);
  if (r.changed) await recordDecision(userId, { decision: "rejected", what: a.kind, label: isActionKind(a.kind) ? ACTION_TEXT[a.kind] : null, ref: { actionId: a.id } }, now);
  return r;
}

/**
 * Propuesta que llega del navegador (atajos de la interfaz: «máquina ocupada», un botón de preferencias). Se valida igual que
 * una del chat contra el contexto real; si la autonomía la deja ejecutar sola, se ejecuta y devuelve el resultado. Sin `key`,
 * se genera una nueva (sin idempotencia entre toques distintos); la interfaz debería mandar una por toque.
 */
export async function proposeFromClient(userId: string, p: { kind: unknown; input?: unknown; key?: string | null; section?: string | null }, now = new Date()) {
  requireAssistant();
  if (!isActionKind(p.kind)) throw new AccessError("invalid", "Acción desconocida.");
  const kind = p.kind;
  const input = p.input && typeof p.input === "object" && !Array.isArray(p.input) ? (p.input as Record<string, unknown>) : {};
  const key = p.key ?? makeKey(kind, input, randomUUID());
  if (!KEY_RE.test(key) || !key.startsWith(`${kind}:`)) throw new AccessError("invalid", "Clave de acción inválida.");
  const existing = await actionByKey(userId, key);
  if (existing) {
    if (existing.kind !== kind) throw new AccessError("conflict", "Esa clave ya se usó para otra acción.", 409);
    return { action: existing, mode: existing.status === "blocked" ? "blocked" as const : "confirm" as const, reason: null, outcome: existing.status === "executed" ? { ok: true, executed: false, action: existing, result: existing.result, text: resultText(existing) } : null };
  }
  const sc = await loadContext(userId, { section: "workout" }, now);
  const { actions, rejected } = await registerProposals(sc, [{ kind, input, key, label: "", preview: "" }]);
  if (!actions.length) throw new AccessError("invalid", rejected[0]?.errors[0] ?? "Acción inválida.", 400, { errors: rejected[0]?.errors ?? [] });
  const pa = actions[0];
  const action = await actionByKey(userId, key);
  if (pa.mode !== "auto" || !action) return { action: action!, mode: pa.mode, reason: pa.reason, outcome: null };
  return { action, mode: pa.mode, reason: pa.reason, outcome: await runAction(userId, action, (cur, commit) => RUN[kind](sc, pa.input, cur, {}, now, commit), now, () => sc.relation?.orgId ?? null) };
}

/**
 * Borra un recuerdo propio (definitivo) y deshace lo que ese recuerdo había cambiado en las preferencias de avisos (tono,
 * categoría apagada), si no queda otro igual vigente. Lo usan la acción «delete_memory» y DELETE /api/me/brain/memory/[id].
 */
export async function forgetMemory(userId: string, id: string, now = new Date()) {
  const [m] = await db.select({ kind: brainMemory.kind, key: brainMemory.key }).from(brainMemory).where(and(eq(brainMemory.id, id), eq(brainMemory.userId, userId)));
  await deleteMemory(userId, id); // 404 si no es de la persona
  if (m?.kind !== "preference") return { deleted: true };
  const [other] = await db.select({ id: brainMemory.id }).from(brainMemory)
    .where(and(eq(brainMemory.userId, userId), eq(brainMemory.kind, "preference"), eq(brainMemory.key, m.key), isNull(brainMemory.revokedAt))).limit(1);
  if (other) return { deleted: true };
  const cat = /^category_off:(training|progress|performance|motivation|weekly)$/.exec(m.key)?.[1];
  try {
    if (m.key === "tone" && (await getPrefs(userId)).tone !== "normal") await updatePrefs(userId, { tone: "normal" }, now);
    if (cat) await updatePrefs(userId, { categories: { [cat]: true } }, now);
  } catch (e) { logError("brain.actions.forget", e); }
  return { deleted: true };
}
