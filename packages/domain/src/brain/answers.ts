// AC3 · Respuestas con datos, sin modelo. Cada función arma la respuesta de una intención con el contexto y los datos que le
// pasa el servidor (marcas, tendencia, conteos, procedencia de la rutina importada). Si falta un dato, lo dice: nunca inventa
// fechas, sesiones ni números. Las acciones que ofrece son propuestas: el servidor las valida y la persona confirma.
import type { BrainContext, BrainPrefs, Evidence, ExerciseRef, Intent, IntentName, MemoryItem, Reply, ReplyCard, Section } from "./types";
import type { Proposal, RowTarget, SessionPoint, Trend } from "../intelligence";
import { bodyGoalText, type BodyGoalProgress } from "../progress";
import { fmtSeconds } from "../training";
import { propose } from "./actions";
import { AGE_REPLY, areaWithArticle, topicAllowed, type SafetyResult } from "./safety";
import type { MethodKey } from "./intents";
import type { MemoryDraft } from "./memory";
import { type Alternative, type ShortenPlan, setsText } from "./session";
import { fmtArDate } from "./quiet";
import { fmtKg, listEs, norm, numEs } from "./util";

export type AnswerData = {
  exercise?: ExerciseRef | null;
  exerciseQuery?: string | null;
  /** Última sesión del ejercicio (series válidas, sin anuladas ni aproximaciones). */
  lastMark?: { at: string; sets: { w: number | null; r: number | null }[]; source?: "repi" | "import"; timed?: boolean } | null;
  best?: { e1rm: number | null; at: string | null } | null;
  target?: Pick<RowTarget, "weightKg" | "action" | "status" | "why" | "review" | "guards" | "refs" | "source" | "quality"> | null;
  trend?: Trend | null;
  points?: SessionPoint[];
  proposal?: Proposal | null;
  trends?: { exercise: ExerciseRef; trend: Trend }[];
  count?: { n: number | null; period: string | null; what: string | null } | null;
  method?: MethodKey | null;
  body?: BodyGoalProgress | null;
  bodyUnit?: "kg" | "lb";
  imported?: { name: string; days: number; exercises: number; unknown: { exercise: string; fields: string[] }[]; suggested: { exercise: string; fields: string[] }[]; completed: { exercise: string; fields: string[] }[] } | null;
  week?: { done: number; target: number | null; programDays: number | null } | null;
  days?: number | null;
  alternatives?: Alternative[];
  reason?: "busy" | "no_equipment" | "discomfort" | "dislike" | "other" | null;
  assumed?: boolean;
  shortPlan?: ShortenPlan | null;
  minutes?: number | null;
  minutesOutOfRange?: number | null;
  feel?: string | null;
  preference?: MemoryDraft | null;
  memory?: MemoryItem[];
  forgetTarget?: string | null;
  prefs?: BrainPrefs;
  request?: "program_change" | "message" | null;
  /** «No vino mi profe»: seguir con lo programado. */
  mode?: "solo" | null;
  safety?: SafetyResult;
  flag?: string | null;
  /** Para variar saludos y agradecimientos sin azar (p. ej. la cantidad de mensajes del hilo). */
  variant?: number;
  /** Sal de las claves idempotentes (p. ej. el id del mensaje). */
  salt?: string;
  /** D217 · Progreso del ejercicio: A máximo real, B estimación, C próxima carga (TI) y distancia a una carga. */
  progress?: {
    max: { w: number; r: number; day: string; approx: boolean; source: "session" | "import" } | null;
    best: { w: number; r: number; e1rm: number; day: string } | null;
    capacity?: { reps: number; weightKg: number | null; text: string } | null;
    distance?: { kg: number; text: string } | null;
    next?: { text: string | null; requiresCoach: boolean } | null;
    metric: "load" | "reps" | "time";
    bestReps?: number | null; bestSec?: number | null;
  } | null;
};

const SUGGEST: Record<Section, string[]> = {
  home: ["¿Qué me toca hoy?", "¿Estoy progresando?", "¿Cuántas veces entrené esta semana?"],
  workout: ["La máquina está ocupada", "Me quedan 20 minutos", "¿Por qué este peso?"],
  review: ["¿Cómo me fue respecto de la anterior?", "¿Qué hago la próxima?"],
  progress: ["¿Estoy progresando?", "¿En qué ejercicio mejoré más?", "¿Cuál es mi máximo?"],
  body: ["¿Cómo viene mi objetivo de peso?"],
  history: ["¿Cuál fue mi última marca?", "¿Cuántas veces entrené este mes?"],
  routines: ["Explicame mi rutina importada", "¿Qué es un drop set?"],
  messages: ["Preparar una consulta para mi entrenador"],
  gym: ["Necesito ayuda en sala"],
  profile: ["Hablame más corto", "Mandame menos avisos"],
  club: ["¿Qué me toca hoy?"],
};
const reply = (text: string, p: Partial<Reply> = {}): Reply => ({ text, cards: [], actions: [], via: "rules", ...p });
const evCard = (e: Evidence): ReplyCard => ({ type: "evidence", evidence: e });
const sessionsList = (ats: string[]) => listEs([...new Set(ats.map(fmtArDate))]);
const askExercise = (d: AnswerData) => reply(d.exerciseQuery ? `No encuentro «${d.exerciseQuery}» entre tus ejercicios. ¿Me decís el nombre como figura en tu rutina?` : "¿De qué ejercicio? Decime el nombre como figura en tu rutina.");

// ── Entrenamiento de hoy ───────────────────────────────────────────────────────────────────────────────────────────────
export function answerToday(ctx: BrainContext, d: AnswerData = {}): Reply {
  const s = ctx.session;
  if (s.open) {
    const next = s.current?.exercise.name ?? s.pending[0]?.name ?? null;
    const left = s.pending.length;
    return reply(`Estás entrenando${s.dayName ? ` ${s.dayName}` : ""}.${next ? ` Ahora toca ${next}.` : ""}${left ? ` Te ${left === 1 ? "queda un ejercicio" : `quedan ${numEs(left, false)} ejercicios`}.` : " Ya hiciste todo lo previsto."}`,
      { suggestions: ["La máquina está ocupada", "Me quedan 20 minutos"] });
  }
  const nd = ctx.program.nextDay;
  if (!ctx.program.versionId || !nd) {
    return reply("No tenés un programa vigente. Podés armar una rutina propia o pedirle una a tu entrenador.", { suggestions: ["¿Cómo pido una rutina?"] });
  }
  const day = ctx.program.days.find((x) => x.key === nd.key);
  const lead = d.mode === "solo" ? "Si tu profe no está, seguí con lo que tenías. " : "";
  const text = `${lead}Hoy te toca ${nd.name}${day ? `, con ${numEs(day.exercises, true)} ${day.exercises === 1 ? "ejercicio" : "ejercicios"}` : ""}.`;
  return reply(text, { actions: [propose("open_workout", { dayKey: nd.key }, `Empezar ${nd.name}`, "Abre el entrenamiento del día. No cambia tu rutina.", d.salt)], cards: [{ type: "fact", title: "Programa vigente", rows: [{ label: "Día", value: nd.name }], via: "data" }] });
}

// ── Marcas y cargas ────────────────────────────────────────────────────────────────────────────────────────────────────
export function answerLastMark(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return askExercise(d);
  const name = d.exercise.name;
  const lm = d.lastMark;
  const sets = lm?.sets.filter((x) => x.r != null && x.r > 0) ?? [];
  if (!lm || !sets.length) return reply(`Todavía no tengo registros de ${name}.`, { suggestions: ["¿Qué me toca hoy?"] });
  const what = lm.timed ? sets.map((x) => fmtSeconds(x.r!)).join(", ") : setsText(sets)!;
  const best = d.best?.e1rm ? ` Tu mejor marca estimada es ${fmtKg(d.best.e1rm)} de 1RM${d.best.at ? ` (${fmtArDate(d.best.at)})` : ""}.` : "";
  const evidence: Evidence = { basis: `Última sesión registrada de ${name}: ${fmtArDate(lm.at)}${lm.source === "import" ? " (registro importado)" : ""}.`, excluded: "No cuento series anuladas ni de aproximación.", sessions: [{ at: lm.at }], via: "data" };
  return reply(`La última vez en ${name} (${fmtArDate(lm.at)}) hiciste ${what}.${best}`, {
    cards: [{ type: "fact", title: name, rows: [{ label: "Última vez", value: what }, { label: "Fecha", value: fmtArDate(lm.at) }], via: "data" }, evCard(evidence)],
    actions: [propose("show_history", { exerciseId: d.exercise.id }, "Ver historial", "Abre el historial de este ejercicio.", d.salt)],
  });
}

// ── D217 · Máximo real, capacidad estimada, próxima carga y distancia (nunca la misma cifra para los cuatro) ─────────────────
const ESTIMATE_NOTE = "Es una estimación (Epley), no una repetición máxima ejecutada.";
const dayTxt = (d: string) => fmtArDate(`${d}T12:00:00-03:00`);
export function answerMaxLift(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return askExercise(d);
  const name = d.exercise.name, p = d.progress;
  if (!p || (!p.max && p.bestReps == null && p.bestSec == null)) return reply(`Todavía no tengo registros de ${name}.`, { suggestions: SUGGEST.progress });
  const show = propose("show_history", { exerciseId: d.exercise.id }, "Ver en Progreso", "Abre la evolución de este ejercicio.", d.salt);
  if (p.metric === "reps" && p.bestReps != null) return reply(`Tu mejor serie de ${name} sin carga externa fue de ${p.bestReps} repeticiones.`, { actions: [show] });
  if (p.metric === "time" && p.bestSec != null) return reply(`Tu mejor marca de ${name} es ${fmtSeconds(p.bestSec)}.`, { actions: [show] });
  const m = p.max!;
  const real = `Tu mayor carga registrada en ${name} es ${fmtKg(m.w)} × ${m.r} (${dayTxt(m.day)}${m.approx ? ", fecha aproximada" : m.source === "import" ? ", importado" : ""}).`;
  const est = p.best ? ` Tu mejor serie fue ${fmtKg(p.best.w)} × ${p.best.r}, con un 1RM estimado de ${fmtKg(p.best.e1rm)}. ${ESTIMATE_NOTE}` : "";
  const rows = [{ label: "Mayor carga real", value: `${fmtKg(m.w)} × ${m.r}` }, ...(p.best ? [{ label: "1RM estimado", value: fmtKg(p.best.e1rm) }] : [])];
  return reply(real + est, {
    cards: [{ type: "fact", title: name, rows, via: "data" }, evCard({ basis: "Todas tus series válidas de este ejercicio (REPI e importadas).", excluded: "No cuento aproximaciones, series anuladas ni etapas de un drop.", via: "data" })],
    actions: [show], suggestions: [`¿Cuánto podría tirar para 8 repeticiones en ${name}?`, `¿Qué intento la próxima vez en ${name}?`],
  });
}
export function answerCapacity(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return askExercise(d);
  const c = d.progress?.capacity;
  if (!c) return reply(`Todavía no tengo series con carga de ${d.exercise.name} para estimarlo.`);
  return reply(`${c.text} No es tu próxima carga de trabajo: esa depende de tu programación y de tus últimas sesiones comparables.`, {
    cards: [evCard({ basis: "Estimación por la fórmula de Epley con tu mejor serie reciente de 1 a 10 repeticiones.", excluded: "No uso series de más de 10 repeticiones, fechas aproximadas ni registros de hace más de 4 meses.", via: "rules" })],
    suggestions: [`¿Qué intento la próxima vez en ${d.exercise.name}?`],
  });
}
export function answerNextTarget(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return askExercise(d);
  const n = d.progress?.next;
  if (!n?.text) return reply(`Todavía no tengo sesiones comparables de ${d.exercise.name} para proponerte algo. Seguí la indicación de tu entrenador o una carga con la que completes el rango con buena técnica.`);
  return reply(n.text, { cards: [evCard({ basis: "Training Intelligence: tus últimas sesiones comparables (misma serie y rango).", excluded: "No uso aproximaciones ni series anuladas.", via: "rules" })] });
}
export function answerGoalDistance(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return askExercise(d);
  const g = d.progress?.distance;
  if (!g) return reply("¿Hasta qué carga? Decime los kilos, por ejemplo «¿cuánto me falta para 100 kg?».");
  return reply(g.text, { suggestions: [`¿Cuál es mi máximo en ${d.exercise.name}?`] });
}

export function answerWhyWeight(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return askExercise(d);
  const t = d.target;
  if (!t || t.status === "not_applicable") return reply(`Para ${d.exercise.name} no tengo una carga recomendada${t?.status === "not_applicable" ? ": es una serie de aproximación y la elegís según cómo te sientas" : " todavía"}.`);
  if (t.source === "coach") return reply(`Esa carga la indicó tu profe${t.weightKg ? ` (${fmtKg(t.weightKg)})` : ""}. REPI no la cambia.${t.review ? ` ${t.review}` : ""}`, { cards: [evCard({ basis: "Carga escrita en tu programa por tu entrenador.", via: "data" })] });
  if (t.status === "no_data") return reply(`${t.why || "Todavía no tengo una referencia comparable."} Por eso no te propongo kilos: elegí una carga con la que completes el rango con buena técnica.`);
  const ats = (t.refs ?? []).map((r) => r.at);
  const evidence: Evidence = { basis: ats.length ? `Comparé con tu sesión del ${sessionsList(ats)}.` : "Regla de progresión con tu última sesión comparable.", excluded: "No uso aproximaciones, etapas de un método ni series anuladas.", sessions: [...new Set(ats)].map((at) => ({ at })), via: "rules" };
  const low = t.quality === "low" ? " La referencia es un registro importado: tomala como orientación." : "";
  return reply(`${t.why}${low}`, { cards: [evCard(evidence)] });
}

// ── Progreso ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const FEW = "Todavía tengo pocas sesiones comparables para decirte si estás estancado. Con un par de registros más lo podemos evaluar mejor.";
export function answerTrend(ctx: BrainContext, d: AnswerData): Reply {
  if (!d.exercise) return d.trends ? answerProgressGeneral(ctx, d) : askExercise(d);
  const tr = d.trend;
  const pts = d.points ?? [];
  if (!tr || tr.kind === "insufficient") return reply(`${FEW}${tr ? ` En ${d.exercise.name} tengo ${numEs(tr.sessions, false)} de las tres que necesito.` : ""}`);
  let detail = "";
  const a = pts[0], b = pts[pts.length - 1];
  if (a && b && pts.length >= 2 && a.r != null && b.r != null) {
    if (a.w === b.w && a.r !== b.r) detail = ` En las últimas ${numEs(pts.length, false)} sesiones pasaste de ${a.r} a ${b.r} repeticiones en tu mejor serie${a.w ? ` con ${fmtKg(a.w)}` : ""}.`;
    else if (a.w != null && b.w != null && a.w !== b.w) detail = ` Tu mejor serie pasó de ${fmtKg(a.w)} × ${a.r} a ${fmtKg(b.w)} × ${b.r}.`;
  }
  const evidence: Evidence = { basis: pts.length ? `Comparé las sesiones del ${sessionsList(pts.map((p) => p.at))}.` : tr.basis, excluded: "Excluí las series anuladas y usé sólo las series principales comparables.", sessions: pts.map((p) => ({ at: p.at })), via: "rules" };
  return reply(`${tr.text}${detail}${d.proposal ? ` ${d.proposal.text}` : ""}`, { cards: [evCard(evidence)] });
}

export function answerProgressGeneral(ctx: BrainContext, d: AnswerData): Reply {
  const ts = (d.trends ?? []).filter((x) => x.trend.kind !== "insufficient");
  if (!ts.length) return reply(ctx.history.lastSessionAt ? FEW : "Todavía no hay entrenamientos registrados para ver tu progreso.", { suggestions: SUGGEST.progress });
  const up = ts.filter((x) => x.trend.kind === "progressing").map((x) => x.exercise.name);
  const flat = ts.filter((x) => x.trend.kind === "plateau" || x.trend.kind === "stable").map((x) => x.exercise.name);
  const down = ts.filter((x) => x.trend.kind === "declining").map((x) => x.exercise.name);
  const parts = [
    up.length ? `Venís progresando en ${listEs(up.slice(0, 3))}.` : null,
    flat.length ? `En ${listEs(flat.slice(0, 3))} el rendimiento está estable.` : null,
    down.length ? `En ${listEs(down.slice(0, 2))} viene más bajo: conviene mirar descanso y técnica antes de subir.` : null,
  ].filter(Boolean);
  const text = parts.length ? parts.join(" ") : "Por ahora el rendimiento varía de una sesión a otra: no hay una tendencia clara.";
  return reply(text, { cards: [evCard({ basis: `Miré ${numEs(ts.length, true)} ${ts.length === 1 ? "ejercicio" : "ejercicios"} con al menos tres sesiones comparables.`, excluded: "Excluí las series anuladas y las de aproximación.", via: "rules" })] });
}

const PERIOD_TEXT: Record<string, string> = { week: "esta semana", month: "este mes", year: "este año", "30d": "en los últimos 30 días", "90d": "en los últimos tres meses" };
export function answerCount(_ctx: BrainContext, d: AnswerData): Reply {
  const c = d.count;
  if (!c || c.n == null) return reply("No tengo ese dato registrado.");
  const per = c.period ? PERIOD_TEXT[c.period] ?? "" : "en total";
  const text = c.what ? `Entrenaste ${c.what} ${c.n === 1 ? "una vez" : `${c.n} veces`} ${per}.` : `Registraste ${c.n === 1 ? "un entrenamiento" : `${c.n} entrenamientos`} ${per}.`;
  return reply(text.replace(/\s+\./, "."), { cards: [evCard({ basis: "Cuento sesiones completadas y registradas en REPI.", excluded: "No cuento sesiones anuladas. Si entrenaste sin registrar, no lo sé.", via: "data" })] });
}

// ── Métodos ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const METHOD_GLOSSARY: Record<MethodKey, string> = {
  drop_set: "Drop set: terminás la serie, bajás la carga (más o menos un 20 %) y seguís sin descanso. Cada drop es una etapa de la misma serie, no una serie aparte.",
  rest_pause: "Rest-pause: hacés la serie, descansás unos 10 a 20 segundos y seguís con mini series con la misma carga. Todo cuenta como una sola serie.",
  myo_reps: "Myo-reps: una serie de activación de muchas repeticiones y después mini series cortas (3 a 5 repeticiones) con pausas de unos 5 segundos, con la misma carga.",
  cluster: "Cluster: una serie partida en bloques de pocas repeticiones con pausas cortas (15 a 30 segundos) para sostener la carga.",
  emom: "EMOM: cada minuto arrancás una serie. Lo que sobra del minuto es tu descanso.",
  amrap: "AMRAP: todas las repeticiones (o rondas) que puedas con buena técnica, en una serie o en un tiempo fijo.",
  superset: "Superserie: dos o más ejercicios seguidos, sin descanso entre ellos; descansás al terminar la vuelta.",
  circuit: "Circuito: varios ejercicios en ronda, uno detrás del otro, durante varias vueltas.",
  top_set: "Top set: la serie más pesada del día, con pocas repeticiones. Después suelen venir series más livianas (back-off).",
  backoff: "Back-off: series después del top set con menos carga (más o menos un 15 % menos) y, a veces, más repeticiones.",
  pyramid: "Pirámide: serie a serie sube la carga y bajan las repeticiones. Cada serie se compara con su par de la vez anterior.",
  reverse_pyramid: "Pirámide invertida: arrancás con la serie más pesada y después bajás la carga y subís las repeticiones.",
  warmup: "Aproximación: series livianas para preparar el movimiento. No cuentan para tus marcas ni para la progresión.",
  failure: "Al fallo: seguir hasta que no sale otra repetición con buena técnica. No hace falta llegar siempre: con una o dos de reserva se progresa parecido.",
  rir: "RIR: repeticiones en reserva, las que te quedaban al terminar la serie. RIR 2 = podías hacer dos más. Es una estimación: con series largas cuesta más calcularlo.",
  rpe: "RPE: esfuerzo percibido de 1 a 10. Un RPE 8 equivale más o menos a dejar dos repeticiones en reserva.",
  tempo: "Tempo: la velocidad de cada fase en segundos (bajada, pausa, subida, pausa). Por ejemplo, 3-1-1-0 es bajar en tres segundos y pausar uno abajo.",
};
export function answerExplainMethod(_ctx: BrainContext, d: AnswerData): Reply {
  if (!d.method) return reply("¿Qué método querés que te explique? Puedo contarte drop set, rest-pause, myo-reps, cluster, EMOM, AMRAP, superserie, top set, back-off o pirámide.");
  return reply(METHOD_GLOSSARY[d.method], { cards: [evCard({ basis: "Definición del método tal como lo usa REPI.", via: "rules" })] });
}

// ── Cuerpo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function answerBodyGoal(ctx: BrainContext, d: AnswerData): Reply {
  const age = ctx.person.age.value;
  if (!topicAllowed("body_goal", age)) return reply(AGE_REPLY[age === "minor" ? "minor" : "unknown"]);
  const g = d.body;
  if (!g) return reply("No tengo registros de peso corporal. Podés cargarlos en Mi cuerpo.");
  const text = bodyGoalText(g, d.bodyUnit ?? ctx.person.unit);
  return reply(`${text}${g.state === "insufficient" ? "" : " Lo calculo con tus registros de peso, sin interpretaciones clínicas."}`, { cards: [evCard({ basis: "Tus registros de peso corporal y el objetivo que definiste.", via: "data" })] });
}

// ── Rutina importada ───────────────────────────────────────────────────────────────────────────────────────────────────
const FIELD_TEXT: Record<string, string> = { sets: "el número de series", reps: "las repeticiones", weight: "la carga", rest: "el descanso", method: "el método", name: "el ejercicio", line: "la línea" };
const fields = (fs: string[]) => listEs(fs.map((f) => FIELD_TEXT[f] ?? f));
export function answerImportExplain(ctx: BrainContext, d: AnswerData): Reply {
  const im = d.imported;
  if (!im) {
    const c = ctx.program.imported;
    if (!c) return reply("No encuentro una rutina importada entre las tuyas.");
    return reply(`Tu rutina importada tiene ${c.unknown} ${c.unknown === 1 ? "indicación" : "indicaciones"} sin completar, ${c.suggested} que fueron sugerencias y ${c.completed} que completaste vos.`);
  }
  const lines = [`Importaste «${im.name}»: ${numEs(im.days, true)} ${im.days === 1 ? "día" : "días"} y ${im.exercises} ${im.exercises === 1 ? "ejercicio" : "ejercicios"}.`];
  const unk = im.unknown.filter((u) => u.fields.length);
  if (unk.length) lines.push(`${unk.slice(0, 2).map((u) => `En ${u.exercise} no se indicó ${fields(u.fields)}`).join(". ")}${unk.length > 2 ? ` (y ${unk.length - 2} más)` : ""}.`);
  const sug = im.suggested.filter((u) => u.fields.length);
  if (sug.length) {
    const items = sug.slice(0, 2).map((u) => `${fields(u.fields)} de ${u.exercise}`);
    const many = items.length > 1 || sug[0].fields.length > 1, plural = many || /^(las|los) /.test(items[0]);
    const what = listEs(items);
    lines.push(`${what[0].toUpperCase()}${what.slice(1)} ${many ? "fueron sugerencias" : plural ? "fueron una sugerencia" : "fue una sugerencia"}: no ${plural ? "estaban" : "estaba"} en el original.`);
  }
  const done = im.completed.filter((u) => u.fields.length).length;
  if (done) lines.push(`Completaste a mano ${done === 1 ? "un ejercicio" : `${done} ejercicios`}.`);
  if (unk.length) lines.push("¿Querés completarlo?");
  return reply(lines.join(" "), { cards: [evCard({ basis: "Lo que decía el documento original, lo que quedó desconocido, lo que se sugirió y lo que completaste.", excluded: "Lo sugerido no lo indicó ningún entrenador.", via: "data" })] });
}

// ── Semana ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function answerWeeklyPlan(ctx: BrainContext, d: AnswerData): Reply {
  const w = d.week ?? null;
  const target = w?.target ?? ctx.person.weeklyTarget.value;
  const pd = w?.programDays ?? (ctx.program.days.length || null);
  const parts: string[] = [];
  if (target != null && w) parts.push(`Tu objetivo es entrenar ${numEs(target, false)} ${target === 1 ? "vez" : "veces"} por semana y esta semana llevás ${numEs(w.done, false)}.`);
  const actions: Reply["actions"] = [];
  if (d.days) {
    if (pd && d.days > pd) {
      if (ctx.program.owner === "coach" || ctx.program.owner === "gym") {
        parts.push(`Tu rutina tiene ${numEs(pd, true)} ${pd === 1 ? "día" : "días"}. Para entrenar ${numEs(d.days, true)}, puedo prepararte una consulta para tu entrenador.`);
        actions.push(propose("draft_coach_message", { text: `Hola, esta semana quiero entrenar ${d.days} días y mi rutina tiene ${pd}. ¿Cómo lo organizo?` }, "Preparar consulta", "Deja un borrador en Mensajes. No se envía solo.", d.salt));
      } else parts.push(`Tu rutina tiene ${numEs(pd, true)} ${pd === 1 ? "día" : "días"}. Para entrenar ${numEs(d.days, true)}, podés repetir un día o sumar otro en Mis rutinas.`);
    } else if (pd) parts.push(`Con tu rutina de ${numEs(pd, true)} ${pd === 1 ? "día" : "días"} te alcanza para entrenar ${numEs(d.days, true)} esta semana.`);
  }
  if (!parts.length) parts.push(target == null ? "No definiste cuántos días por semana querés entrenar. Podés hacerlo en Perfil." : `Tu objetivo es entrenar ${numEs(target, false)} veces por semana.`);
  return reply(parts.join(" "), { actions });
}

// ── Conversación ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function answerGreeting(ctx: BrainContext, d: AnswerData = {}): Reply {
  const v = Math.abs(d.variant ?? 0);
  if (ctx.session.open) return reply(["Acá estoy. ¿Necesitás algo?", "Te escucho. ¿En qué te ayudo?"][v % 2], { suggestions: SUGGEST.workout });
  const nd = ctx.program.nextDay?.name;
  const opts = nd ? [`Hola. Hoy te toca ${nd}. ¿Arrancamos?`, `Hola. ¿Vamos con ${nd}?`, "Hola. ¿En qué te ayudo?"] : ["Hola. ¿En qué te ayudo?", "Hola. Contame qué necesitás."];
  return reply(opts[v % opts.length], { suggestions: SUGGEST[ctx.section] });
}
export const answerThanks = (_ctx: BrainContext, d: AnswerData = {}): Reply => reply(["De nada.", "Cuando quieras.", "Para eso estoy."][Math.abs(d.variant ?? 0) % 3]);

export function answerUnknown(ctx: BrainContext, d: AnswerData = {}): Reply {
  if (d.flag === "injection") return reply("Eso no lo puedo hacer: no cambio mis reglas ni actúo con otros permisos. ¿Te ayudo con tu entrenamiento?", { suggestions: SUGGEST[ctx.section] });
  if (d.flag === "other_person") return reply("Sólo puedo mostrarte tus propios datos.", { suggestions: SUGGEST[ctx.section] });
  return reply("No estoy seguro de haberte entendido. Puedo ayudarte con tu entrenamiento de hoy, tus marcas, tu progreso o tu rutina.", { suggestions: SUGGEST[ctx.section] });
}

// ── Seguridad y ayudas en la sesión ────────────────────────────────────────────────────────────────────────────────────
export function answerSafety(_ctx: BrainContext, d: AnswerData): Reply {
  const s = d.safety;
  if (!s || s.level === "none" || !s.reply) return reply("Si algo te molesta, pará y consultalo con tu entrenador.", { via: "safety" });
  const actions = s.level === "pain"
    ? [propose("report_discomfort", { exerciseId: d.exercise?.id ?? null, area: s.area ?? null }, "Registrar la molestia", `Guarda una molestia${s.area ? ` en ${areaWithArticle(s.area)}` : ""}${d.exercise ? ` en ${d.exercise.name}` : ""}. Es un dato de salud: sólo con tu confirmación.`, d.salt)]
    : [];
  return { text: s.reply, cards: [], actions, via: "safety" };
}

export function answerAlternatives(ctx: BrainContext, d: AnswerData): Reply {
  const cur = d.exercise;
  if (!cur) return reply("¿Qué ejercicio querés cambiar?");
  if (d.assumed) return reply(`¿Te referís a ${cur.name}, que te toca ahora?`, { suggestions: ["Sí", "No"] });
  const alts = d.alternatives ?? [];
  const reason = d.reason === "no_equipment" ? "no_equipment" : d.reason === "discomfort" ? "discomfort" : d.reason === "busy" ? "busy" : "other";
  if (!alts.length) {
    return reply(`No encuentro una alternativa compatible para ${cur.name} entre las aprobadas y tu biblioteca. Podés esperar a que se libere${ctx.relation.kind === "gym" ? " o pedir ayuda en sala" : ""}.`,
      { actions: ctx.relation.kind === "gym" && ctx.session.open ? [propose("floor_help", { exerciseId: cur.id }, "Pedir ayuda en sala", "Avisa al equipo de sala. Te pido confirmación.", d.salt)] : [] });
  }
  const first = alts[0];
  const text = first.approvedByCoach
    ? `Tu entrenador aprobó como alternativa ${first.name}. ¿Querés reemplazar ${cur.name} sólo por hoy?`
    : `Podés hacer ${listEs(alts.map((a) => a.name)).replace(/ y /, " o ")}. ¿Querés reemplazar ${cur.name} sólo por hoy? Tu rutina original queda igual.`;
  return reply(text, {
    cards: [{ type: "alternatives", options: alts.map((a) => ({ exerciseId: a.exerciseId, name: a.name, why: a.why, approvedByCoach: a.approvedByCoach })) }],
    actions: ctx.session.open ? alts.map((a) => propose("apply_substitution", { exerciseId: cur.id, substituteId: a.exerciseId, reason }, `Reemplazar por ${a.name} sólo por hoy`, `Hoy hacés ${a.name} en lugar de ${cur.name}. Tu rutina original queda igual.`, d.salt)) : [],
  });
}

export function answerShortTime(ctx: BrainContext, d: AnswerData): Reply {
  if (d.minutesOutOfRange != null) return reply("Decime cuántos minutos te quedan con un número entre 5 y 180.");
  if (d.minutes == null) return reply("¿Cuántos minutos te quedan?", { suggestions: ["20 minutos", "30 minutos", "45 minutos"] });
  const plan = d.shortPlan;
  if (!ctx.session.open || !plan) return reply(`Hoy tenés ${d.minutes} minutos. Cuando empieces, puedo proponerte una versión más corta de tu rutina, conservando los ejercicios prioritarios.`);
  const skipIds = plan.skip.map((x) => x.id);
  return reply(plan.note, {
    cards: [{ type: "plan", keep: plan.keep.map((x) => x.name), skip: plan.skip.map((x) => x.name), note: plan.note }],
    actions: skipIds.length ? [propose("apply_short_session", { minutes: d.minutes, skip: skipIds }, "Aplicar sólo por hoy", `Se omiten hoy: ${listEs(plan.skip.map((x) => x.name))}. Lo registrado no cambia y tu rutina tampoco.`, d.salt)] : [],
  });
}

export const answerLowEnergy = (_ctx: BrainContext, _d: AnswerData = {}): Reply =>
  reply("Gracias por avisar. Hoy podés mantener las cargas sin buscar subir y, si hace falta, acortar la sesión. Si además te sentís mal, mejor parar.", { suggestions: ["Me quedan 30 minutos", "Sigo igual"] });

export function answerSetFeedback(_ctx: BrainContext, d: AnswerData): Reply {
  if (d.feel === "facil") return reply("Bien. A mitad de sesión no subo la carga: si se repite, la próxima vez puede tocar progresar.");
  if (d.feel === "bien") return reply("Bien. Seguimos con lo previsto.");
  return reply("Si te costó mucho, en la próxima mantené o bajá un poco la carga según cómo te sientas. Hoy no subimos.");
}

export function answerPreference(_ctx: BrainContext, d: AnswerData): Reply {
  const p = d.preference;
  if (!p) return reply("No me quedó claro qué querés que recuerde. ¿Me lo decís de otra forma?");
  return reply(`¿Querés que lo recuerde? «${p.text}» Lo podés ver y borrar cuando quieras en Perfil.`, {
    remember: p,
    actions: [propose("save_preference", { key: p.key, value: p.value as string | number | boolean, text: p.text }, "Recordarlo", p.text, d.salt)],
  });
}

export function answerForget(_ctx: BrainContext, d: AnswerData): Reply {
  const items = d.memory ?? [];
  const q = norm(d.forgetTarget ?? "");
  const hits = q ? items.filter((m) => { const t = norm(m.text), k = norm(m.key.replace(/[_:]/g, " ")); return q.split(" ").filter((w) => w.length >= 4).some((w) => t.includes(w) || k.includes(w)); }) : [];
  if (!hits.length) return reply("No encuentro eso entre lo que recuerdo. Podés ver todo en Perfil → Asistente REPI → Lo que REPI recuerda.");
  return reply(hits.length === 1 ? `¿Borro esto? «${hits[0].text}»` : `Encontré ${numEs(hits.length, true)} recuerdos parecidos. ¿Cuál borro?`, {
    actions: hits.slice(0, 3).map((m) => propose("delete_memory", { memoryId: m.id }, `Borrar «${m.text}»`, "Se borra de lo que REPI recuerda.", d.salt)),
  });
}

export function answerFewerMessages(_ctx: BrainContext, d: AnswerData): Reply {
  const cur = d.prefs?.maxPerDay ?? 2;
  const next = Math.max(0, Math.min(1, cur - 1));
  return reply(next === 0 ? "¿Apago los avisos proactivos? Igual me podés escribir cuando quieras." : "¿Querés que te muestre como máximo un aviso por día? Si preferís, también los puedo apagar.", {
    actions: [
      ...(next > 0 ? [propose("update_prefs", { patch: { maxPerDay: next } }, "Un aviso por día", "Cambia la frecuencia de avisos.", d.salt)] : []),
      propose("update_prefs", { patch: { proactive: false } }, "Apagar avisos", "REPI no te escribe por iniciativa propia; vos podés escribirle igual.", d.salt),
    ],
  });
}

export function answerAskCoach(ctx: BrainContext, d: AnswerData): Reply {
  const coach = ctx.relation.hasCoach || ctx.program.owner === "coach" || ctx.program.owner === "gym";
  if (d.request === "program_change") {
    if (ctx.program.owner === "own") return reply("Tu rutina es tuya: la podés editar en Mis rutinas. Si querés, te ayudo a pensar el cambio.");
    if (!coach) return reply("No tenés un programa de un entrenador. Podés armar una rutina propia en Mis rutinas.");
    return reply("Tu rutina la arma tu entrenador: no la cambio yo. Puedo dejarle esta propuesta preparada a tu entrenador. Él decide si la incorpora al programa.", {
      actions: [propose("draft_coach_message", { text: "Hola, quería consultarte por un cambio en mi rutina: " }, "Preparar consulta", "Deja un borrador en Mensajes. No se envía solo.", d.salt)],
    });
  }
  if (!coach) return reply("No tenés un entrenador vinculado en REPI, así que no tengo a quién prepararle la consulta.");
  const about = d.exercise ? ` sobre ${d.exercise.name}` : "";
  return reply(`Te preparo un borrador${about} para tu entrenador. Lo revisás y lo mandás vos.`, {
    actions: [propose("draft_coach_message", { text: `Hola, quería consultarte${about}: `, ...(d.exercise ? { exerciseId: d.exercise.id } : {}) }, "Preparar consulta", "Deja un borrador en Mensajes. No se envía solo.", d.salt)],
  });
}

export function answerFloorHelp(ctx: BrainContext, d: AnswerData): Reply {
  if (ctx.relation.kind !== "gym") return reply("No estás entrenando con una sede vinculada a REPI, así que no puedo avisar a la sala.");
  return reply("¿Querés que avise al equipo de sala para que alguien se acerque?", {
    actions: [propose("floor_help", { exerciseId: d.exercise?.id ?? null }, "Pedir ayuda en sala", "Avisa al equipo de sala de tu sede.", d.salt)],
  });
}

/**
 * Respuesta determinística para una intención ya clasificada. La seguridad y la edad se aplican antes que cualquier dato;
 * las intenciones que necesitan IA o que el servidor resuelve con acciones devuelven igual una respuesta honesta.
 */
export function compose(intent: Intent, ctx: BrainContext, d: AnswerData = {}): Reply {
  const name: IntentName = intent.name;
  if (!topicAllowed(name, ctx.person.age.value)) return reply(AGE_REPLY[ctx.person.age.value === "minor" ? "minor" : "unknown"]);
  switch (name) {
    case "alarm": case "pain": return answerSafety(ctx, d);
    case "today": return answerToday(ctx, d);
    case "last_mark": return answerLastMark(ctx, d);
    case "max_lift": return answerMaxLift(ctx, d);
    case "capacity": return answerCapacity(ctx, d);
    case "next_target": return answerNextTarget(ctx, d);
    case "goal_distance": return answerGoalDistance(ctx, d);
    case "why_weight": return answerWhyWeight(ctx, d);
    case "trend": return answerTrend(ctx, d);
    case "progress_general": return answerProgressGeneral(ctx, d);
    case "count": return answerCount(ctx, d);
    case "explain_method": return answerExplainMethod(ctx, d);
    case "body_goal": return answerBodyGoal(ctx, d);
    case "import_explain": return answerImportExplain(ctx, d);
    case "weekly_plan": return answerWeeklyPlan(ctx, d);
    case "busy_machine": case "change_exercise": return answerAlternatives(ctx, d);
    case "short_time": return answerShortTime(ctx, d);
    case "low_energy": return answerLowEnergy(ctx, d);
    case "set_feedback": return answerSetFeedback(ctx, d);
    case "set_preference": return answerPreference(ctx, d);
    case "forget": return answerForget(ctx, d);
    case "fewer_messages": return answerFewerMessages(ctx, d);
    case "ask_coach": return answerAskCoach(ctx, d);
    case "floor_help": return answerFloorHelp(ctx, d);
    case "greeting": return answerGreeting(ctx, d);
    case "thanks": return answerThanks(ctx, d);
    case "yes": case "no": return reply(name === "yes" ? "¿A qué le decís que sí? Contame qué querés hacer." : "Dale, lo dejamos así.");
    default: return answerUnknown(ctx, d);
  }
}
