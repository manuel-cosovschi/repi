// AC3 · Motor de relevancia: decide qué avisos se muestran y cuáles no. Cada candidato pasa por las mismas preguntas: ¿sigue
// vigente?, ¿hay evidencia?, ¿ya se dijo?, ¿la persona lo quiere?, ¿es el momento?, ¿hay algo más importante? «No intervenir»
// es una respuesta válida y queda registrada con su motivo. También arma los candidatos más comunes con textos que no
// inventan hechos («no registraste entrenamientos», nunca «faltaste»).
import type { AgeBand, BrainPrefs, Candidate, Channel, Decision, Evidence, InterventionCategory, RecentIntervention, SuppressReason } from "./types";
import { CATEGORY_RANK } from "./types";
import type { Proposal, Trend } from "../intelligence";
import { arDay, arWeekStart, endOfArDay, fmtArDate, inQuiet } from "./quiet";
import { numEs } from "./util";

/** Horas mínimas entre dos avisos del mismo tipo (configurable). Lo que no figura usa `default`. */
export const COOLDOWN_HOURS: Record<string, number> = {
  default: 24, weekly_target_met: 24 * 6, pr: 0, inactivity: 24 * 3, plateau: 24 * 7, progressing: 24 * 7, declining: 24 * 7,
  program_updated: 0, import_unknowns: 24 * 3, session_review: 0, low_energy: 12, safety: 0,
};
/** Cuántos avisos del mismo canal se emiten juntos como máximo (el resto queda como «menor prioridad»). */
export const MAX_PER_CHANNEL: Record<Channel, number> = { card: 2, inline: 1, push: 1 };
/** Tipos de aviso sobre el cuerpo o el peso: nunca para menores ni edad desconocida. */
export const BODY_KINDS: ReadonlySet<string> = new Set(["body_goal", "body_progress", "body_logged", "weight_goal", "goal_reached_body"]);
/**
 * Preferencias por categoría (§19 del máster): «Recordatorios de entrenamiento» = reminder; «Avisos de progreso» = logros;
 * «Recomendaciones de rendimiento» = tendencias y propuestas; «Mensajes motivacionales»; «Resúmenes semanales». Seguridad,
 * instrucciones del entrenador y ayuda en la sesión no se apagan por categoría (sí con la asistencia proactiva desactivada).
 */
export const CATEGORY_PREF: Partial<Record<InterventionCategory, keyof BrainPrefs["categories"]>> = {
  reminder: "training", achievement: "progress", progress: "performance", motivation: "motivation", weekly: "weekly",
};
const SHOWN: ReadonlySet<string> = new Set(["pending", "shown", "accepted", "dismissed", "never", "expired", "cancelled"]);

export type DecideOptions = {
  prefs: BrainPrefs;
  recent: RecentIntervention[];
  now: Date | string;
  age: AgeBand;
  /** Versión vigente del programa: un aviso atado a otra versión es obsoleto. */
  programVersionId?: string | null;
  cooldowns?: Partial<Record<string, number>>;
  maxPerChannel?: Partial<Record<Channel, number>>;
};

/**
 * Decide qué candidatos se emiten. Orden de prioridad: seguridad > entrenador > ayuda en la sesión > progreso > logro >
 * recordatorio (empate: el orden recibido). Reglas, en este orden: obsoleto (vencido o de otra versión del programa),
 * evidencia insuficiente, «no mostrar más» de ese tipo, duplicado (misma clave ya mostrada, leída o descartada, también dentro
 * del lote), sin información nueva, menores (nada de cuerpo ni push), asistencia proactiva apagada (salvo seguridad y ayuda en
 * la pantalla), categoría apagada, push (sin permiso, en horario de silencio), enfriamiento por tipo (doble si lo descartó),
 * tope diario y, al final, como máximo 1–2 por canal. La seguridad sólo respeta obsolescencia, duplicados y el permiso de push.
 */
export function decide(candidates: Candidate[], o: DecideOptions): Decision {
  const now = typeof o.now === "string" ? new Date(o.now) : o.now;
  const t = now.getTime();
  const today = arDay(now);
  const cool = { ...COOLDOWN_HOURS, ...o.cooldowns };
  const perChannel = { ...MAX_PER_CHANNEL, ...o.maxPerChannel };
  const emit: Candidate[] = [];
  const suppressed: Decision["suppressed"] = [];
  const seen = new Set<string>();
  const never = new Set(o.recent.filter((r) => r.status === "never").map((r) => r.kind));
  const COUNTED = new Set(["pending", "shown", "accepted", "dismissed", "never"]);
  const shownToday = o.recent.filter((r) => r.category !== "safety" && r.channel !== "inline" && COUNTED.has(r.status) && arDay(r.createdAt) === today).length;
  let emittedToday = 0;
  const byChannel: Record<Channel, number> = { card: 0, inline: 0, push: 0 };
  const ordered = candidates.map((c, i) => ({ c, i })).sort((a, b) => CATEGORY_RANK[a.c.category] - CATEGORY_RANK[b.c.category] || a.i - b.i).map((x) => x.c);

  for (const c of ordered) {
    const no = (reason: SuppressReason) => { suppressed.push({ candidate: c, reason }); };
    const safety = c.category === "safety";
    if ((c.expiresAt && Date.parse(c.expiresAt) <= t) || (c.programVersionId && o.programVersionId && c.programVersionId !== o.programVersionId)) { no("obsolete"); continue; }
    if (!c.enoughEvidence) { no("insufficient_evidence"); continue; }
    if (!safety && never.has(c.kind)) { no("never_again"); continue; }
    if (seen.has(c.dedupeKey) || o.recent.some((r) => r.dedupeKey === c.dedupeKey && SHOWN.has(r.status))) { no("duplicate"); continue; }
    seen.add(c.dedupeKey);
    if (c.novel === false && !safety) { no("not_novel"); continue; }
    if (o.age !== "adult" && (BODY_KINDS.has(c.kind) || (c.channel === "push" && !safety))) { no("minor"); continue; }
    if (!safety && !o.prefs.proactive && c.channel !== "inline") { no("proactive_off"); continue; }
    const pref = CATEGORY_PREF[c.category];
    if (!safety && pref && o.prefs.categories[pref] === false) { no("category_off"); continue; }
    if (c.channel === "push") {
      if (!o.prefs.push) { no("push_off"); continue; }
      if (!safety && inQuiet(now, o.prefs.quietStart, o.prefs.quietEnd)) { no("quiet_hours"); continue; }
    }
    if (!safety) {
      const hours = cool[c.kind] ?? cool.default ?? 24;
      const last = o.recent.filter((r) => r.kind === c.kind && SHOWN.has(r.status) && r.status !== "never").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      if (last && hours > 0) {
        const wait = (last.status === "dismissed" ? 2 : 1) * hours * 3_600_000;
        if (t - Date.parse(last.createdAt) < wait) { no("cooldown"); continue; }
      }
      if (c.channel !== "inline" && shownToday + emittedToday >= o.prefs.maxPerDay) { no("daily_cap"); continue; }
    }
    if (byChannel[c.channel] >= perChannel[c.channel] && !safety) { no("lower_priority"); continue; }
    byChannel[c.channel]++;
    if (!safety && c.channel !== "inline") emittedToday++;
    emit.push(c);
  }
  return { emit, suppressed };
}

// ── Candidatos frecuentes ──────────────────────────────────────────────────────────────────────────────────────────────
const ev = (basis: string, via: Evidence["via"] = "data", sessions?: { at: string; label?: string }[]): Evidence => ({ basis, via, ...(sessions ? { sessions } : {}) });
const card = (c: Omit<Candidate, "channel"> & { channel?: Channel }): Candidate => ({ channel: "card", ...c });

/** Objetivo semanal cumplido («Completaste cuatro sesiones esta semana, justo la frecuencia que te habías propuesto»). */
export function weeklyTargetCandidate(p: { sessionsThisWeek: number; target: number | null; now: Date | string }): Candidate | null {
  if (!p.target || p.target < 1 || p.sessionsThisWeek < p.target) return null;
  const n = p.sessionsThisWeek;
  return card({
    kind: "weekly_target_met", category: "achievement", dedupeKey: `weekly_target:${arWeekStart(p.now)}`, enoughEvidence: true,
    title: "Objetivo semanal cumplido",
    body: n === p.target ? `Completaste ${numEs(n, false)} ${n === 1 ? "sesión" : "sesiones"} esta semana, justo la frecuencia que te habías propuesto.` : `Esta semana llevás ${numEs(n, false)} sesiones: ya pasaste tu objetivo de ${numEs(p.target, false)}.`,
    evidence: ev(`Sesiones completadas desde el lunes ${fmtArDate(arWeekStart(p.now) + "T12:00:00-03:00")}, sin contar las anuladas.`),
    actions: [{ id: "dismiss", label: "Listo" }],
  });
}

/** Marca personal auténtica (sólo con historia previa; la primera vez no es un récord). */
export function prCandidate(p: { exercise: { id: string; name: string }; markText: string; sessionId: string; at: string }): Candidate {
  return card({
    kind: "pr", category: "achievement", dedupeKey: `pr:${p.sessionId}:${p.exercise.id}`, enoughEvidence: true,
    title: `Marca en ${p.exercise.name}`, body: `En ${p.exercise.name} ${p.markText}.`,
    evidence: ev(`Comparado con todas tus series válidas anteriores de ${p.exercise.name} (sin anuladas ni aproximaciones).`, "data", [{ at: p.at }]),
    actions: [{ id: "why", label: "Ver por qué" }, { id: "dismiss", label: "Listo" }],
  });
}

/**
 * Días sin entrenamientos registrados. Nunca afirma que faltó: sólo sabe que no hay sesiones registradas (pudo entrenar sin
 * registrar). Una clave por pausa: no se repite mientras siga la misma.
 */
export function inactivityCandidate(p: { daysSinceLast: number | null; lastSessionAt: string | null; nextDayName?: string | null; minDays?: number }): Candidate | null {
  const min = p.minDays ?? 5;
  if (p.daysSinceLast == null || !p.lastSessionAt || p.daysSinceLast < min) return null;
  return card({
    kind: "inactivity", category: "reminder", dedupeKey: `inactivity:${arDay(p.lastSessionAt)}`, enoughEvidence: true,
    title: "¿Retomamos?",
    body: `Hace ${p.daysSinceLast} días que no registrás entrenamientos.${p.nextDayName ? ` ¿Querés retomar con ${p.nextDayName}?` : " ¿Querés retomar?"}`,
    evidence: ev(`Tu última sesión registrada fue el ${fmtArDate(p.lastSessionAt)}. Si entrenaste sin registrar, no lo sé.`),
    actions: [{ id: "start", label: "Empezar" }, { id: "dismiss", label: "Ahora no" }, { id: "never", label: "No mostrar algo parecido" }],
  });
}

/**
 * Tendencia de un ejercicio (de `exerciseTrend`, con su propuesta de `nextProposal`). Sólo progreso, estancamiento o baja, y
 * sólo con evidencia: confianza «consistente» o al menos 5 sesiones comparables.
 */
export function trendCandidate(p: { exercise: { id: string; name: string }; trend: Trend; proposal?: Proposal | null; lastAt: string; sessions?: { at: string }[] }): Candidate | null {
  const k = p.trend.kind;
  if (k !== "progressing" && k !== "plateau" && k !== "declining") return null;
  const enough = p.trend.confidence === "consistent" || p.trend.sessions >= 5;
  const n = p.trend.sessions;
  const body = k === "progressing" ? `Venís progresando en ${p.exercise.name}: lo veo en tus últimas ${numEs(n, false)} sesiones comparables.`
    : k === "plateau" ? `En ${p.exercise.name} el rendimiento está estable hace ${numEs(n, false)} sesiones comparables.`
      : `En ${p.exercise.name} el rendimiento viene más bajo en las últimas sesiones comparables.`;
  return card({
    kind: k, category: "progress", dedupeKey: `trend:${p.exercise.id}:${k}:${arDay(p.lastAt)}`, enoughEvidence: enough,
    title: k === "progressing" ? "Vas bien" : k === "plateau" ? "Posible estancamiento" : "Rendimiento más bajo",
    body: p.proposal && k !== "progressing" ? `${body} ${p.proposal.text}` : body,
    evidence: { basis: p.sessions?.length ? `Comparé las sesiones del ${p.sessions.map((s) => fmtArDate(s.at)).join(", ")}. ${p.trend.basis}` : p.trend.basis, excluded: "Excluí las series anuladas y las de aproximación.", via: "rules", sessions: p.sessions },
    actions: [{ id: "why", label: "Ver por qué" }, { id: "chat", label: "Hablar con REPI" }, { id: "dismiss", label: "Descartar" }],
  });
}

/** El entrenador (o la sede) actualizó la rutina: una vez por versión; obsoleto si llega otra versión. */
export function programUpdatedCandidate(p: { versionId: string; byCoach: boolean; changedAt: string | null }): Candidate {
  return card({
    kind: "program_updated", category: "coach", dedupeKey: `program:${p.versionId}`, programVersionId: p.versionId, enoughEvidence: true,
    title: "Rutina actualizada",
    body: p.byCoach ? "Tu entrenador actualizó tu rutina. Te muestro qué cambió antes de empezar." : "Tu rutina se actualizó. Te muestro qué cambió antes de empezar.",
    evidence: ev(p.changedAt ? `Versión nueva del ${fmtArDate(p.changedAt)}.` : "Versión nueva del programa."),
    actions: [{ id: "open", label: "Ver cambios" }, { id: "dismiss", label: "Después" }],
  });
}

/** Rutina importada con indicaciones sin completar (no se completan solas: se ofrece revisarlas). */
export function importUnknownsCandidate(p: { routineId: string; name: string; unknown: number }): Candidate | null {
  if (!(p.unknown > 0)) return null;
  return card({
    kind: "import_unknowns", category: "reminder", dedupeKey: `import:${p.routineId}:${p.unknown}`, enoughEvidence: true,
    title: "Rutina importada incompleta",
    body: `En «${p.name}» ${p.unknown === 1 ? "quedó una indicación" : `quedaron ${numEs(p.unknown, false)} indicaciones`} sin completar (por ejemplo, series o repeticiones que no aparecían en el original). ¿Las revisamos?`,
    evidence: ev("Lo que no estaba escrito en el documento original quedó marcado como desconocido al importarlo."),
    actions: [{ id: "open", label: "Revisar" }, { id: "dismiss", label: "Después" }],
  });
}

/** Cierre de sesión disponible (vence al terminar el día). */
export function sessionReviewCandidate(p: { sessionId: string; at: string; summary: string }): Candidate {
  return card({
    kind: "session_review", category: "session", dedupeKey: `review:${p.sessionId}`, enoughEvidence: true, expiresAt: endOfArDay(p.at).toISOString(),
    title: "Tu cierre de hoy", body: p.summary, evidence: ev(`Sesión del ${fmtArDate(p.at)}.`, "rules"),
    actions: [{ id: "open", label: "Ver cierre" }, { id: "dismiss", label: "Listo" }],
  });
}

/** Check-in de hoy con poca energía o mal descanso: ofrecer una sesión más tranquila (sin diagnosticar nada). */
export function lowEnergyCandidate(p: { energy: number | null; sleep: number | null; at: string }): Candidate | null {
  const low = (p.energy != null && p.energy <= 2) || (p.sleep != null && p.sleep <= 2);
  if (!low) return null;
  return card({
    kind: "low_energy", category: "session", dedupeKey: `low_energy:${arDay(p.at)}`, enoughEvidence: true, expiresAt: endOfArDay(p.at).toISOString(),
    title: "Hoy, con calma",
    body: `Marcaste ${p.energy != null && p.energy <= 2 ? "poca energía" : "que dormiste mal"}. Si querés, hoy mantenemos las cargas y, si hace falta, acortamos la sesión.`,
    evidence: ev(`Tu check-in de hoy (${fmtArDate(p.at)}).`),
    actions: [{ id: "chat", label: "Hablar con REPI" }, { id: "dismiss", label: "Estoy bien" }],
  });
}

/**
 * Arma todos los candidatos posibles a partir de lo que el servidor ya calculó (cada entrada es opcional) y descarta los que
 * no corresponden. Después hay que pasarlos por `decide`: estar en esta lista no significa que se muestren.
 */
export function buildCandidates(i: {
  now: Date | string;
  weekly?: { sessionsThisWeek: number; target: number | null } | null;
  prs?: Parameters<typeof prCandidate>[0][];
  inactivity?: Parameters<typeof inactivityCandidate>[0] | null;
  trends?: Parameters<typeof trendCandidate>[0][];
  program?: Parameters<typeof programUpdatedCandidate>[0] | null;
  imports?: Parameters<typeof importUnknownsCandidate>[0][];
  review?: Parameters<typeof sessionReviewCandidate>[0] | null;
  checkIn?: Parameters<typeof lowEnergyCandidate>[0] | null;
}): Candidate[] {
  return [
    i.program ? programUpdatedCandidate(i.program) : null,
    i.review ? sessionReviewCandidate(i.review) : null,
    i.checkIn ? lowEnergyCandidate(i.checkIn) : null,
    ...(i.trends ?? []).map(trendCandidate),
    ...(i.prs ?? []).map(prCandidate),
    i.weekly ? weeklyTargetCandidate({ ...i.weekly, now: i.now }) : null,
    i.inactivity ? inactivityCandidate(i.inactivity) : null,
    ...(i.imports ?? []).map(importUnknownsCandidate),
  ].filter((c): c is Candidate => !!c);
}
