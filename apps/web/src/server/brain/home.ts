// Inicio con REPI (D209, contrato §6 «Inicio»; GET /api/me/brain). La tarjeta y los avisos los decide el motor proactivo
// (proactive.homeCandidates, que pasa todo por el motor de relevancia). Si ese motor falla, Inicio no se rompe: se devuelven
// los avisos ya guardados. Aparte, una línea determinística de «hoy» (qué toca o qué queda de la sesión abierta), sin IA.
import { answerToday } from "@repi/domain/brain";
import { logError } from "../log";
import { loadContext } from "./context";
import { activeInterventions, type InterventionView } from "./store";
import { homeCandidates } from "./proactive";
import { requireAssistant } from "./prefs";

export type BrainHome = {
  card: InterventionView | null;
  interventions: InterventionView[];
  /** De dónde salen los avisos: el motor proactivo o, si falló, lo ya guardado. */
  source: "proactive" | "stored";
  today: { text: string; sessionOpen: boolean; sessionId: string | null; dayKey: string | null; dayName: string | null; programOwner: "coach" | "gym" | "own" | null };
  prefs: { proactive: boolean; tone: "normal" | "breve"; autonomy: 0 | 1 | 2 };
};

export async function brainHome(userId: string, now = new Date()): Promise<BrainHome> {
  requireAssistant();
  const [home, sc] = await Promise.all([
    homeCandidates(userId, now).then((h) => ({ ...h, source: "proactive" as const })).catch(async (e) => {
      logError("brain.home", e);
      const items = (await activeInterventions(userId, now, 10).catch(() => [])).filter((i) => i.channel !== "inline");
      return { card: items[0] ?? null, interventions: items.slice(1), source: "stored" as const };
    }),
    loadContext(userId, { section: "home" }, now),
  ]);
  const t = answerToday(sc.ctx);
  const nd = sc.ctx.program.nextDay;
  return {
    card: home.card, interventions: home.interventions, source: home.source,
    today: { text: t.text, sessionOpen: sc.ctx.session.open, sessionId: sc.ctx.session.id, dayKey: sc.ctx.session.open ? null : nd?.key ?? null, dayName: sc.ctx.session.dayName ?? nd?.name ?? null, programOwner: sc.ctx.program.owner },
    prefs: { proactive: sc.prefs.proactive, tone: sc.prefs.tone, autonomy: sc.prefs.autonomy },
  };
}
