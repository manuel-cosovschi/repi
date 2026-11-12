// D218 · Procesos y programador. El job de cada minuto (pg_cron → /api/cron/notifications) llama a `leadsTick`: si la
// programación está encendida y es día hábil configurado, corre como mucho UN paso por minuto, el primero cuya hora (Argentina)
// ya pasó y que hoy no corrió. Cada paso queda en lead_run con estadísticas y error visible. Ningún paso envía mensajes.
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { handleMatchesBusiness, nextSequenceStep, type LeadStage, CLOSED_STAGES, ENGAGED_STAGES } from "@repi/domain";
import { db } from "@/db";
import { logError } from "../log";
import { ensureAreas, getSettings, leadArea, leadBusiness, leadMessage, leadRun, leadTask, leadsAdmin, leadsEnabled, logLead, today } from "./core";
import { discoverOsm, readOfficialSite } from "./sources";
import { ingest, refreshLead, rescoreAll } from "./store";
import { createDraft, bestChannel } from "./messaging";

export const STEPS = ["discovery", "enrich", "score", "compose", "outreach", "followup", "report"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = { discovery: "Investigación", enrich: "Enriquecimiento", score: "Calificación", compose: "Preparación comercial", outreach: "Envío automático (email)", followup: "Seguimiento", report: "Informe diario" };

async function run<T extends Record<string, unknown>>(kind: Step, trigger: "cron" | "manual", actorId: string | null, work: () => Promise<T>) {
  // Una corrida cortada por el límite de la función queda «running» para siempre: pasados 3 minutos se cierra como error.
  await db.update(leadRun).set({ status: "error", error: "La corrida se cortó por el límite de tiempo de la función", finishedAt: new Date() })
    .where(and(eq(leadRun.status, "running"), lte(leadRun.startedAt, new Date(Date.now() - 3 * 60_000))));
  const dedupeKey = trigger === "cron" ? `${kind}:${today()}` : null;
  const [r] = await db.insert(leadRun).values({ kind, trigger, dedupeKey, actorUserId: actorId }).onConflictDoNothing().returning();
  if (!r) return { skipped: true as const };
  try {
    const stats = await work();
    const status = (stats as { errors?: unknown[] }).errors?.length ? "partial" : "ok";
    await db.update(leadRun).set({ status, stats, finishedAt: new Date(), error: status === "partial" ? String((stats as unknown as { errors: unknown[] }).errors[0]).slice(0, 500) : null }).where(eq(leadRun.id, r.id));
    return { id: r.id, status, stats };
  } catch (e) {
    logError(`leads.run.${kind}`, e);
    await db.update(leadRun).set({ status: "error", error: String((e as Error).message ?? e).slice(0, 500), finishedAt: new Date() }).where(eq(leadRun.id, r.id));
    return { id: r.id, status: "error" as const, error: String((e as Error).message ?? e) };
  }
}

// ── Pasos ────────────────────────────────────────────────────────────────────
/** Investigación: OpenStreetMap en las zonas encendidas, empezando por las que hace más tiempo no se revisan. */
export async function stepDiscovery(opts: { areaIds?: string[]; budgetMs?: number } = {}) {
  await ensureAreas();
  const s = await getSettings();
  const areas = await db.select().from(leadArea).where(opts.areaIds?.length ? inArray(leadArea.id, opts.areaIds) : eq(leadArea.enabled, true))
    .orderBy(sql`${leadArea.lastDiscoveredAt} asc nulls first`, asc(leadArea.tier)).limit(s.limits.discoveryAreasPerRun);
  const out = { areas: [] as string[], found: 0, created: 0, updated: 0, branches: 0, review: 0, unchanged: 0, known: 0, pending: 0, errors: [] as string[] };
  // Presupuesto de tiempo (el job de cada minuto comparte 45 s y Admin corta a los 25 s): lo que no entra sigue en la próxima
  // corrida. Los elementos de OSM ya registrados se saltean, así cada corrida avanza sobre los nuevos.
  const until = Date.now() + (opts.budgetMs ?? 20_000);
  const known = new Set((await db.execute<{ r: string }>(sql`select distinct jsonb_array_elements_text(external_refs) as r from lead_business`)).map((x) => x.r));
  for (const a of areas) {
    // Una zona necesita margen para la consulta y la carga: si no queda, sigue en la próxima corrida.
    if (until - Date.now() < 10_000) { out.errors.push(`${a.name}: sin tiempo en esta corrida`); break; }
    try {
      const cands = await discoverOsm(a, fetch, Math.min(22_000, until - Date.now() - 3_000));
      out.found += cands.length;
      let complete = true;
      for (const c of cands.slice(0, 300)) {
        if (c.externalRef && known.has(c.externalRef)) { out.known++; continue; }
        if (Date.now() > until) { complete = false; out.pending++; continue; }
        try {
          const r = await ingest(c, { userId: null, role: "system" });
          if (r.outcome === "created") out.created++; else if (r.outcome === "updated") out.updated++; else if (r.outcome === "branch") out.branches++; else if (r.outcome === "review") out.review++; else out.unchanged++;
        } catch (e) { out.errors.push(`${c.name}: ${(e as Error).message}`); }
      }
      if (complete) await db.update(leadArea).set({ lastDiscoveredAt: new Date() }).where(eq(leadArea.id, a.id));
      out.areas.push(complete ? a.name : `${a.name} (sigue en la próxima corrida)`);
    } catch (e) { out.errors.push(`${a.name}: ${(e as Error).message}`); }
  }
  return out;
}

/** Enriquecimiento: sitio oficial (robots.txt), los que nunca se enriquecieron o hace más de 60 días. */
export async function stepEnrich(opts: { ids?: string[]; budgetMs?: number } = {}) {
  const s = await getSettings();
  const stale = new Date(Date.now() - 60 * 864e5);
  const rows = await db.select().from(leadBusiness).where(and(
    opts.ids?.length ? inArray(leadBusiness.id, opts.ids) : sql`true`, sql`${leadBusiness.website} is not null`, eq(leadBusiness.doNotContact, false),
    or(isNull(leadBusiness.enrichedAt), lte(leadBusiness.enrichedAt, stale)),
  )).orderBy(desc(leadBusiness.score)).limit(opts.ids?.length ? 20 : s.limits.enrichPerRun);
  const out = { checked: 0, updated: 0, skipped: [] as string[], errors: [] as string[] };
  const until = Date.now() + (opts.budgetMs ?? 20_000);
  for (const b of rows) {
    if (Date.now() > until) break; // el resto sigue en la próxima corrida (no se marcó como enriquecido)
    out.checked++;
    try {
      const r = await readOfficialSite(b.website as string);
      await db.update(leadBusiness).set({ enrichedAt: new Date() }).where(eq(leadBusiness.id, b.id));
      if (!r.ok) { out.skipped.push(`${b.name}: ${r.reason}`); await logLead(db, { businessId: b.id, kind: "enrich", summary: `Sitio oficial no leído: ${r.reason}`, actorRole: "system" }); continue; }
      const f = r.facts; const url = r.pages[0];
      const src = { type: "official_site" as const, url, status: "verified" as const };
      // Perfiles enlazados desde el sitio: verificados sólo si son del propio negocio (no de un inquilino o sponsor).
      const own = (h: string | null) => handleMatchesBusiness(h, b.name, b.website);
      const fbHandle = f.facebook?.match(/facebook\.com\/([^/?#]+)/i)?.[1] ?? null;
      const res = await ingest({
        name: b.name, city: b.city, website: b.website, email: f.emails[0] ?? null, phone: f.phones[0] ?? null, whatsapp: f.whatsapps[0] ?? null, instagram: f.instagram, facebook: f.facebook,
        source: src, externalRef: null,
        sources: { instagram: { ...src, status: own(f.instagram) ? "verified" : "unverified" }, facebook: { ...src, status: own(fbHandle) ? "verified" : "unverified" } },
      }, { userId: null, role: "system" });
      if (res.outcome !== "unchanged") out.updated++;
      await logLead(db, { businessId: b.id, kind: "enrich", summary: `Sitio oficial leído (${r.pages.length} página${r.pages.length > 1 ? "s" : ""}): ${[f.emails.length && "email", f.phones.length && "teléfono", f.whatsapps.length && "WhatsApp", f.instagram && "Instagram"].filter(Boolean).join(", ") || "sin datos de contacto nuevos"}`, payload: { pages: r.pages }, actorRole: "system" });
    } catch (e) { out.errors.push(`${b.name}: ${(e as Error).message}`); }
  }
  return out;
}

export async function stepScore() { return rescoreAll(); }

/** Preparación: borradores de primer contacto para los mejores calificados sin borrador. No envía. */
export async function stepCompose(opts: { limit?: number } = {}) {
  const s = await getSettings();
  const rows = await db.select().from(leadBusiness).where(and(inArray(leadBusiness.stage, ["qualified", "to_contact"]), eq(leadBusiness.doNotContact, false), isNull(leadBusiness.exclusion), isNull(leadBusiness.reviewOfId)))
    .orderBy(desc(leadBusiness.score)).limit(opts.limit ?? s.limits.composePerRun);
  const out = { drafts: 0, noChannel: 0, errors: [] as string[] };
  for (const b of rows) {
    if (!bestChannel(b)) { out.noChannel++; continue; }
    const [has] = await db.select({ id: leadMessage.id }).from(leadMessage).where(and(eq(leadMessage.businessId, b.id), eq(leadMessage.direction, "out"), inArray(leadMessage.status, ["draft", "approved"]))).limit(1);
    if (has) continue;
    try {
      await createDraft(null, b.id, { variant: "first_contact" });
      await db.insert(leadTask).values({ businessId: b.id, kind: "contact", dueOn: today(), note: "Revisar el borrador y enviarlo", dedupeKey: `contact:${b.id}:0` }).onConflictDoNothing();
      out.drafts++;
    } catch (e) { out.errors.push(`${b.name}: ${(e as Error).message}`); }
  }
  return out;
}

/** Seguimiento: aplica la cadencia; crea borradores y tareas de seguimiento o cierra la secuencia sin respuesta. */
export async function stepFollowup() {
  const s = await getSettings();
  const d = today();
  const rows = await db.select().from(leadBusiness).where(and(sql`${leadBusiness.firstSentOn} is not null`, eq(leadBusiness.sequenceStopped, false), eq(leadBusiness.doNotContact, false),
    sql`${leadBusiness.stage} not in (${sql.join([...CLOSED_STAGES, ...ENGAGED_STAGES].map((x) => sql`${x}`), sql`, `)})`));
  const out = { followups: 0, closed: 0, waiting: 0, callbacksDue: 0, errors: [] as string[] };
  for (const b of rows) {
    const n = nextSequenceStep({ stage: b.stage, suppressed: b.doNotContact, firstSentOn: b.firstSentOn, followupsSent: b.followupsSent, lastSentOn: b.lastSentOn, repliedAfterFirst: !!b.lastReplyAt, snoozeUntil: b.snoozeUntil, sequenceStopped: b.sequenceStopped }, s.cadence, d);
    try {
      if (n.action === "wait") out.waiting++;
      if (n.action === "followup" && n.step) {
        const key = `followup:${b.id}:${n.step}`;
        const [t] = await db.insert(leadTask).values({ businessId: b.id, kind: "followup", dueOn: n.dueOn ?? d, note: `Seguimiento ${n.step}: revisar el historial antes de enviar`, dedupeKey: key }).onConflictDoNothing().returning();
        if (t) {
          // El seguimiento va por el mismo canal que el primer mensaje (el piloto automático contacta por email).
          const [first] = await db.select({ channel: leadMessage.channel }).from(leadMessage).where(and(eq(leadMessage.businessId, b.id), eq(leadMessage.direction, "out"), eq(leadMessage.status, "sent"))).orderBy(asc(leadMessage.sentAt)).limit(1);
          const ch = first && ["whatsapp", "email", "instagram"].includes(first.channel) ? first.channel as "whatsapp" | "email" | "instagram" : undefined;
          await createDraft(null, b.id, { variant: n.step >= 2 ? "followup_2" : "followup_1", step: n.step, channel: ch });
          await db.update(leadBusiness).set({ nextAction: `Seguimiento ${n.step}`, nextActionOn: n.dueOn }).where(eq(leadBusiness.id, b.id));
          out.followups++;
        }
      }
      if (n.action === "close") {
        await db.update(leadBusiness).set({ sequenceStopped: true, nextAction: "Sin respuesta: evaluar reactivación más adelante", nextActionOn: null, updatedAt: new Date() }).where(eq(leadBusiness.id, b.id));
        await logLead(db, { businessId: b.id, kind: "sequence_closed", summary: `Secuencia cerrada sin respuesta (día ${s.cadence.steps.at(-1)})`, actorRole: "system" });
        out.closed++;
      }
    } catch (e) { out.errors.push(`${b.name}: ${(e as Error).message}`); }
  }
  const [{ due }] = await db.select({ due: sql<number>`count(*)::int` }).from(leadTask).where(and(eq(leadTask.status, "open"), lte(leadTask.dueOn, d)));
  out.callbacksDue = due;
  return out;
}

/** Informe diario: números del día y las cinco acciones recomendadas (lo arma el agente con datos reales). */
export async function stepReport() {
  const { dailySummary } = await import("./insights");
  const { dailyDigest } = await import("./autopilot");
  const sum = await dailySummary();
  const digest = await dailyDigest(sum);
  return { ...sum, digest };
}

const STEP_FN: Record<Step, () => Promise<Record<string, unknown>>> = { discovery: () => stepDiscovery(), enrich: () => stepEnrich(), score: stepScore, compose: () => stepCompose(), outreach: async () => (await import("./autopilot")).stepOutreach(), followup: stepFollowup, report: stepReport };

/** Ejecución por el job interno (CRON_SECRET), sin sesión: igual que la manual pero registrada como «cron-manual». */
export async function runStepSystem(step: Step, opts: { areaIds?: string[]; budgetMs?: number } = {}) {
  if (!STEPS.includes(step)) throw new Error("paso inválido");
  const work = step === "discovery" ? () => stepDiscovery(opts) : step === "enrich" ? () => stepEnrich(opts) : STEP_FN[step];
  return run(step, "manual", null, work);
}
/** Ejecución manual desde Admin (no cuenta para el programador). */
export async function runStep(actorId: string, step: Step, opts: { areaIds?: string[]; ids?: string[] } = {}) {
  await leadsAdmin(actorId);
  if (!STEPS.includes(step)) throw new Error("paso inválido");
  const work = step === "discovery" ? () => stepDiscovery(opts) : step === "enrich" ? () => stepEnrich(opts) : STEP_FN[step];
  return run(step, "manual", actorId, work);
}

/** Hora y día en Argentina (UTC−3, sin horario de verano desde 2009). */
export function argClock(d = new Date()) {
  const a = new Date(d.getTime() - 3 * 3600_000);
  return { day: a.getUTCDay(), hhmm: `${String(a.getUTCHours()).padStart(2, "0")}:${String(a.getUTCMinutes()).padStart(2, "0")}` };
}
/** Llamado cada minuto por el job: un paso como máximo, idempotente por día. */
export async function leadsTick(now = new Date()) {
  if (!leadsEnabled()) return { ran: null };
  const s = await getSettings();
  // Recordatorios de reuniones: cada minuto, aunque la programación diaria esté apagada.
  const reminders = await (await import("./autopilot")).meetingReminders(now).catch((e) => { logError("leads.reminders", e); return 0; });
  if (!s.schedule.enabled) return { ran: null, reminders };
  const c = argClock(now);
  if (!s.schedule.days.includes(c.day)) return { ran: null };
  const due = STEPS.filter((k) => s.schedule[k] <= c.hhmm);
  if (!due.length) return { ran: null };
  const done = await db.select({ kind: leadRun.kind }).from(leadRun).where(inArray(leadRun.dedupeKey, due.map((k) => `${k}:${today(now)}`)));
  const next = due.find((k) => !done.some((x) => x.kind === k));
  if (!next) return { ran: null };
  const r = await run(next, "cron", null, STEP_FN[next]);
  return { ran: next, status: "status" in r ? r.status : "skipped" };
}

export async function runsList(actorId: string) {
  await leadsAdmin(actorId);
  return db.select().from(leadRun).orderBy(desc(leadRun.startedAt)).limit(60);
}
export async function refreshOne(actorId: string, id: string) { await leadsAdmin(actorId); await refreshLead(db, id); return { ok: true }; }
export type { LeadStage };
