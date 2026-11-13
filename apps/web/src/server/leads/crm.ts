// D218 · CRM de captación: cola, ficha, alta manual, verificación de datos, exclusiones, importación/exportación y
// asignación a un vendedor (crea el prospecto en Ventas: el vendedor lo ve en /ventas y nadie más lo contacta en paralelo).
import { and, asc, desc, eq, ilike, inArray, isNull, isNotNull, or, sql, type SQL } from "drizzle-orm";
import {
  FACT_FIELDS, LEAD_STAGE_LABEL, LEAD_CATEGORY_LABEL, SOURCE_TYPE_LABEL, BAND_LABEL, csvCell, normName, type FactField, type LeadStage, type SourceType,
} from "@repi/domain";
import { db, schema } from "@/db";
import { getLead, getSettings, leadActivity, leadBusiness, leadFact, leadMessage, leadTask, leadsAdmin, logLead, NF, bad, today } from "./core";
import { ingest, refreshLead, type Candidate } from "./store";
import { contactLinks, bestChannel, recentMessages } from "./messaging";

const PAGE = 50;
export async function listLeads(actorId: string, f: { q?: string | null; stage?: string | null; city?: string | null; band?: string | null; view?: string | null; page?: number; sort?: string | null }) {
  await leadsAdmin(actorId);
  const w: SQL[] = [];
  if (f.q) w.push(or(ilike(leadBusiness.name, `%${f.q}%`), ilike(leadBusiness.city, `%${f.q}%`), ilike(leadBusiness.instagram, `%${f.q}%`)) as SQL);
  if (f.stage) w.push(eq(leadBusiness.stage, f.stage));
  if (f.city) w.push(eq(leadBusiness.city, f.city));
  if (f.band) w.push(eq(leadBusiness.scoreBand, f.band));
  // Vistas: cola (contactables y sin exclusión), revisión (posibles duplicados), excluidos, todos.
  if (f.view === "queue") w.push(and(eq(leadBusiness.doNotContact, false), isNull(leadBusiness.exclusion), isNull(leadBusiness.repId), inArray(leadBusiness.stage, ["validated", "qualified", "to_contact", "prepared"])) as SQL);
  if (f.view === "review") w.push(isNotNull(leadBusiness.reviewOfId));
  if (f.view === "excluded") w.push(or(isNotNull(leadBusiness.exclusion), eq(leadBusiness.doNotContact, true)) as SQL);
  if (f.view === "research") w.push(eq(leadBusiness.stage, "research"));
  const where = w.length ? and(...w) : undefined;
  const page = Math.max(1, f.page ?? 1);
  const order = f.sort === "name" ? [asc(leadBusiness.name)] : f.sort === "recent" ? [desc(leadBusiness.createdAt)] : [desc(leadBusiness.score), asc(leadBusiness.name)];
  const rows = await db.select().from(leadBusiness).where(where).orderBy(...order).limit(PAGE).offset((page - 1) * PAGE);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(leadBusiness).where(where);
  const cities = await db.selectDistinct({ city: leadBusiness.city }).from(leadBusiness).orderBy(asc(leadBusiness.city));
  return {
    total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)), cities: cities.map((c) => c.city).filter(Boolean),
    rows: rows.map((b) => ({
      id: b.id, name: b.name, city: b.city, locality: b.locality, category: b.category, categoryLabel: LEAD_CATEGORY_LABEL[b.category as never] ?? b.category,
      score: b.score, band: b.scoreBand, bandLabel: BAND_LABEL[b.scoreBand as never], stage: b.stage, stageLabel: LEAD_STAGE_LABEL[b.stage as LeadStage] ?? b.stage,
      channel: bestChannel(b), hasPhone: !!b.phoneNational, hasEmail: !!b.email, hasIg: !!b.instagram, hasWeb: !!b.website,
      exclusion: b.exclusion, doNotContact: b.doNotContact, review: !!b.reviewOfId, nextAction: b.nextAction, nextActionOn: b.nextActionOn, repId: b.repId,
      topReason: (b.scoreLines as { points: number; max: number; why: string }[]).slice().sort((a, c) => c.points - a.points)[0]?.why ?? null,
    })),
  };
}

export async function leadDetail(actorId: string, id: string) {
  await leadsAdmin(actorId);
  const b = await getLead(id);
  const s = await getSettings();
  const [facts, acts, msgs, tasks] = await Promise.all([
    db.select().from(leadFact).where(eq(leadFact.businessId, id)).orderBy(asc(leadFact.field), desc(leadFact.current), desc(leadFact.createdAt)),
    db.select().from(leadActivity).where(eq(leadActivity.businessId, id)).orderBy(desc(leadActivity.createdAt)).limit(200),
    recentMessages(id),
    db.select().from(leadTask).where(eq(leadTask.businessId, id)).orderBy(desc(leadTask.createdAt)).limit(50),
  ]);
  const review = b.reviewOfId ? await db.select({ id: leadBusiness.id, name: leadBusiness.name, city: leadBusiness.city, address: leadBusiness.address }).from(leadBusiness).where(eq(leadBusiness.id, b.reviewOfId)) : [];
  const chain = b.chainKey ? await db.select({ id: leadBusiness.id, name: leadBusiness.name, address: leadBusiness.address }).from(leadBusiness).where(and(eq(leadBusiness.chainKey, b.chainKey), sql`${leadBusiness.id} <> ${id}`)) : [];
  const [rep] = b.repId ? await db.select({ id: schema.salesRep.id, name: schema.salesRep.name }).from(schema.salesRep).where(eq(schema.salesRep.id, b.repId)) : [];
  return {
    lead: { ...b, stageLabel: LEAD_STAGE_LABEL[b.stage as LeadStage] ?? b.stage, categoryLabel: LEAD_CATEGORY_LABEL[b.category as never] ?? b.category, bandLabel: BAND_LABEL[b.scoreBand as never], channel: bestChannel(b) },
    facts: facts.map((f) => ({ id: f.id, field: f.field, value: f.value, sourceType: f.sourceType, sourceLabel: SOURCE_TYPE_LABEL[f.sourceType as SourceType] ?? f.sourceType, sourceUrl: f.sourceUrl, status: f.status, observedAt: f.observedAt, current: f.current, verifiedAt: f.verifiedAt })),
    activity: acts.map((a) => ({ id: a.id, kind: a.kind, summary: a.summary, actorRole: a.actorRole, createdAt: a.createdAt })),
    messages: msgs.map((m) => ({ ...m, links: m.direction === "out" && m.status !== "cancelled" && m.status !== "sent" ? contactLinks(m, b, s.sender) : [] })),
    tasks, review: review[0] ?? null, chain, rep: rep ?? null,
  };
}

export type LeadInput = { name: string; city: string; province?: string | null; locality?: string | null; address?: string | null; website?: string | null; instagram?: string | null; facebook?: string | null;
  email?: string | null; phone?: string | null; whatsapp?: string | null; category?: string | null; positioning?: string | null; branches?: number | null; estMembers?: number | null;
  contactName?: string | null; contactRole?: string | null; notes?: string | null; sourceUrl?: string | null };
/** Alta manual (o corrección): lo que carga una persona queda como verificado por ella, con la fuente si la indica. */
export async function saveManual(actorId: string, p: LeadInput, id?: string) {
  await leadsAdmin(actorId);
  if (!p.name?.trim() || !p.city?.trim()) throw bad("Nombre y ciudad son obligatorios.");
  if (id) await getLead(id);
  const r = await ingest({ ...p, source: { type: "manual", url: p.sourceUrl ?? null, status: "verified" }, notes: p.notes ?? null }, { userId: actorId, role: "admin" });
  if (p.notes?.trim()) await logLead(db, { businessId: r.id, kind: "note", summary: p.notes.trim().slice(0, 1000), actorUserId: actorId, actorRole: "admin" });
  return r;
}
/** Confirmar o descartar un dato concreto (p. ej. después de llamar). */
export async function verifyFact(actorId: string, factId: string, status: "verified" | "rejected") {
  await leadsAdmin(actorId);
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(leadFact).where(eq(leadFact.id, factId));
    if (!f) throw NF();
    await tx.update(leadFact).set({ status, verifiedAt: new Date(), verifiedBy: actorId, ...(status === "rejected" ? { current: false } : {}) }).where(eq(leadFact.id, factId));
    if (status === "rejected") {
      // El mejor dato anterior no rechazado vuelve a ser el vigente.
      const [alt] = await tx.select().from(leadFact).where(and(eq(leadFact.businessId, f.businessId), eq(leadFact.field, f.field), sql`${leadFact.status} <> 'rejected'`, sql`${leadFact.id} <> ${f.id}`)).orderBy(desc(leadFact.createdAt)).limit(1);
      if (alt) await tx.update(leadFact).set({ current: true }).where(eq(leadFact.id, alt.id));
    }
    await logLead(tx, { businessId: f.businessId, kind: "verify", summary: `${f.field}: ${status === "verified" ? "verificado" : "descartado"} (${f.value.slice(0, 80)})`, actorUserId: actorId, actorRole: "admin" });
    await refreshLead(tx, f.businessId);
    return { ok: true };
  });
}
/** Posible duplicado: confirmar que son distintos o fusionar este expediente en el otro (los datos pasan como historia). */
export async function resolveReview(actorId: string, id: string, action: "distinct" | "merge") {
  await leadsAdmin(actorId);
  return db.transaction(async (tx) => {
    const b = await getLead(id, tx);
    if (!b.reviewOfId) throw bad("No está marcado como posible duplicado.");
    if (action === "distinct") {
      await tx.update(leadBusiness).set({ reviewOfId: null, reviewSignals: null }).where(eq(leadBusiness.id, id));
      await logLead(tx, { businessId: id, kind: "review", summary: "Revisado: es un negocio distinto", actorUserId: actorId, actorRole: "admin" });
      return { ok: true, id };
    }
    const target = b.reviewOfId;
    await tx.update(leadFact).set({ businessId: target, current: false }).where(eq(leadFact.businessId, id));
    for (const t of [leadMessage, leadTask, leadActivity] as const) await tx.update(t).set({ businessId: target }).where(eq(t.businessId, id));
    await tx.update(leadBusiness).set({ externalRefs: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(${leadBusiness.externalRefs} || ${JSON.stringify(b.externalRefs)}::jsonb) x)` }).where(eq(leadBusiness.id, target));
    await tx.delete(leadBusiness).where(eq(leadBusiness.id, id));
    await logLead(tx, { businessId: target, kind: "merge", summary: `Fusionado con «${b.name}» (revisión manual). Sus datos quedaron como historia.`, actorUserId: actorId, actorRole: "admin" });
    await refreshLead(tx, target);
    return { ok: true, id: target };
  });
}
export async function setExclusion(actorId: string, id: string, p: { exclude: boolean; note?: string | null }) {
  await leadsAdmin(actorId);
  const b = await getLead(id);
  await db.update(leadBusiness).set({ exclusion: p.exclude ? "manual" : null, exclusionNote: p.exclude ? (p.note?.slice(0, 200) || "Excluido a mano") : null, updatedAt: new Date() }).where(eq(leadBusiness.id, id));
  await logLead(db, { businessId: id, kind: "exclusion", summary: p.exclude ? `Excluido de la prospección: ${p.note ?? "a mano"}` : `Vuelve a la prospección (antes: ${b.exclusionNote ?? b.exclusion})`, actorUserId: actorId, actorRole: "admin" });
  await refreshLead(db, id);
  return { ok: true };
}
export async function setTechSignals(actorId: string, id: string, signals: { kind: string; evidence: string }[]) {
  await leadsAdmin(actorId);
  await getLead(id);
  const clean = signals.filter((x) => ["no_app", "paper_routines", "uses_other_software", "online_booking"].includes(x.kind) && x.evidence.trim()).slice(0, 5).map((x) => ({ kind: x.kind, evidence: x.evidence.trim().slice(0, 200) }));
  await db.update(leadBusiness).set({ techSignals: clean }).where(eq(leadBusiness.id, id));
  await refreshLead(db, id);
  return { ok: true };
}

/** Asignar a un vendedor: crea (o reutiliza) el prospecto en Ventas con la oportunidad, y el vendedor lo ve en su pipeline. */
export async function assignToRep(actorId: string, id: string, p: { repId: string; reason: string }) {
  await leadsAdmin(actorId);
  if ((p.reason ?? "").trim().length < 3) throw bad("Escribí el motivo.");
  const [rep] = await db.select().from(schema.salesRep).where(eq(schema.salesRep.id, p.repId));
  if (!rep || rep.status !== "active") throw bad("Elegí un vendedor activo.");
  const b = await getLead(id);
  if (b.doNotContact) throw bad("Este negocio pidió no recibir mensajes.");
  if (b.exclusion === "customer") throw bad("Ya es cliente de REPI.");
  if (b.salesProspectId) {
    const { assignProspect } = await import("../sales/crm");
    await assignProspect(actorId, b.salesProspectId, { repId: rep.id, reason: p.reason });
    await db.update(leadBusiness).set({ repId: rep.id }).where(eq(leadBusiness.id, id));
    await logLead(db, { businessId: id, kind: "assign", summary: `Reasignado a ${rep.name}: ${p.reason}`, actorUserId: actorId, actorRole: "admin" });
    return { ok: true, prospectId: b.salesProspectId };
  }
  return db.transaction(async (tx) => {
    const [pr] = await tx.insert(schema.salesProspect).values({
      kind: "gym", name: b.name, legalName: b.legalName, city: b.city, province: b.province, address: b.address, estMembers: b.estMembers, locations: b.branches,
      website: b.website, instagram: b.instagram, phone: b.phone, email: b.email, contactName: b.contactName, contactRole: b.contactRole,
      contactChannel: b.whatsapp ? "whatsapp" : b.email ? "email" : b.phone ? "phone" : null,
      notes: `Desde Captación (puntaje ${b.score}). ${p.reason.trim().slice(0, 200)}`, source: "sales_intelligence", capturedOn: today(), ownerRepId: rep.id, commercialLeadId: b.commercialLeadId, createdBy: actorId,
    }).returning();
    await tx.insert(schema.salesOpportunity).values({ prospectId: pr.id, repId: rep.id, estMembers: b.estMembers, stage: ["interested", "meeting_pending", "meeting_set"].includes(b.stage) ? "interested" : b.stage === "waiting" || b.stage === "contacted" ? "contacted" : "new" });
    await tx.insert(schema.salesActivity).values({ prospectId: pr.id, repId: rep.id, actorUserId: actorId, actorRole: "admin", kind: "assign", summary: `Asignado desde Captación a ${rep.name}. ${p.reason.trim().slice(0, 200)}` });
    if (rep.userId) await tx.insert(schema.salesNotice).values({ userId: rep.userId, kind: "prospect_assigned", title: `Te asignaron un prospecto: ${b.name}`, body: p.reason.trim().slice(0, 200), url: `/ventas?s=pipeline&p=${pr.id}`, dedupeKey: `lead-assign:${id}:${rep.id}` }).onConflictDoNothing();
    await tx.update(leadBusiness).set({ repId: rep.id, salesProspectId: pr.id, updatedAt: new Date() }).where(eq(leadBusiness.id, id));
    await logLead(tx, { businessId: id, kind: "assign", summary: `Asignado a ${rep.name} (Ventas): ${p.reason}`, actorUserId: actorId, actorRole: "admin" });
    await tx.insert(schema.auditEvent).values({ actorUserId: actorId, action: "leads.assign_rep", resourceType: "lead_business", resourceId: id, result: "ok", meta: { repId: rep.id, prospectId: pr.id } });
    return { ok: true, prospectId: pr.id };
  });
}

/** Busca el expediente por el contacto de quien respondió (email, número de WhatsApp o usuario de Instagram). */
export async function findLeadByContact(channel: "email" | "whatsapp" | "instagram", from: string): Promise<string | null> {
  const { emailNorm, igHandle, normPhoneAR } = await import("@repi/domain");
  const where = channel === "email" ? (emailNorm(from.match(/[^<\s]+@[^>\s]+/)?.[0] ?? from) ? eq(leadBusiness.email, emailNorm(from.match(/[^<\s]+@[^>\s]+/)?.[0] ?? from) as string) : null)
    : channel === "instagram" ? (igHandle(from) ? eq(leadBusiness.instagram, igHandle(from) as string) : null)
    : (normPhoneAR(from) ? eq(leadBusiness.phoneNational, (normPhoneAR(from) as { national: string }).national) : null);
  if (!where) return null;
  const [b] = await db.select({ id: leadBusiness.id }).from(leadBusiness).where(where).orderBy(desc(leadBusiness.updatedAt)).limit(1);
  return b?.id ?? null;
}

// ── Importación y exportación ───────────────────────────────────────────────
export type ImportRow = Omit<Candidate, "source" | "sources"> & { sources?: Record<string, { url?: string | null; type?: string; seenAt?: string }> };
const TYPES: SourceType[] = ["official_site", "osm", "directory", "search_result", "social_profile_listing", "manual", "import", "inbound"];
/**
 * Importa negocios investigados (JSON con la fuente de cada dato, o CSV). Un dato visto sólo en un buscador queda «sin
 * verificar» aunque diga venir del sitio oficial: verificar es abrir la fuente.
 */
export async function importLeads(actorId: string, rows: ImportRow[], p: { label: string }) {
  await leadsAdmin(actorId);
  return importLeadsAs(actorId, rows, p);
}
/** Importación sin sesión (job con CRON_SECRET): queda como «system» en el expediente y en la auditoría. */
export async function importLeadsAs(actorId: string | null, rows: ImportRow[], p: { label: string }) {
  if (!Array.isArray(rows) || !rows.length) throw bad("No hay filas para importar.");
  if (rows.length > 500) throw bad("Hasta 500 filas por importación.");
  const out = { created: 0, updated: 0, branch: 0, review: 0, unchanged: 0, excluded: 0, errors: [] as string[] };
  for (const r of rows) {
    try {
      const sources: Candidate["sources"] = {};
      for (const [k, v] of Object.entries(r.sources ?? {})) {
        const field = (k === "estMembers" || (FACT_FIELDS as readonly string[]).includes(k)) ? k as FactField : null;
        if (!field || !v) continue;
        const t = TYPES.includes(v.type as SourceType) ? v.type as SourceType : "import";
        sources[field] = { type: t, url: v.url ?? null, observedAt: v.seenAt ?? today(), status: "unverified" };
      }
      const res = await ingest({ ...r, sources, source: { type: "import", observedAt: today(), status: "unverified" }, notes: r.notes ? `${p.label}: ${r.notes}` : null }, { userId: actorId, role: actorId ? "admin" : "system" });
      out[res.outcome === "branch" ? "branch" : res.outcome]++;
      if (res.excluded) out.excluded++;
    } catch (e) { out.errors.push(`${r.name ?? "?"}: ${(e as Error).message}`); }
  }
  await db.insert(schema.auditEvent).values({ actorUserId: actorId, action: "leads.import", resourceType: "lead_business", result: "ok", meta: { label: p.label, rows: rows.length, ...out, errors: out.errors.length } });
  return out;
}

/** Lista de exclusión (clientes actuales, conversaciones abiertas, ya contactados): se marcan y no entran en la cola. */
export async function importExclusions(actorId: string, names: { name: string; city?: string | null; reason: string }[]) {
  await leadsAdmin(actorId);
  return importExclusionsAs(actorId, names);
}
export async function importExclusionsAs(actorId: string | null, names: { name: string; city?: string | null; reason: string }[]) {
  let marked = 0; const notFound: string[] = [];
  for (const x of names.slice(0, 300)) {
    const n = normName(x.name);
    if (n.length < 2) continue;
    const hits = await db.select({ id: leadBusiness.id }).from(leadBusiness).where(and(eq(leadBusiness.normName, n), x.city ? sql`lower(${leadBusiness.city}) = lower(${x.city})` : sql`true`));
    if (!hits.length) { notFound.push(x.name); continue; }
    for (const h of hits) {
      await db.update(leadBusiness).set({ exclusion: "manual", exclusionNote: x.reason.slice(0, 200), updatedAt: new Date() }).where(eq(leadBusiness.id, h.id));
      await logLead(db, { businessId: h.id, kind: "exclusion", summary: `Excluido de la prospección: ${x.reason.slice(0, 200)}`, actorUserId: actorId, actorRole: actorId ? "admin" : "system" });
      await refreshLead(db, h.id);
      marked++;
    }
  }
  return { marked, notFound };
}

const COLS: [string, (b: typeof leadBusiness.$inferSelect) => unknown][] = [
  ["Nombre", (b) => b.name], ["Ciudad", (b) => b.city], ["Barrio", (b) => b.locality], ["Dirección", (b) => b.address], ["Tipo", (b) => LEAD_CATEGORY_LABEL[b.category as never] ?? b.category],
  ["Sitio", (b) => b.website], ["Instagram", (b) => b.instagram ? `@${b.instagram}` : ""], ["Facebook", (b) => b.facebook], ["Email", (b) => b.email], ["Teléfono", (b) => b.phone],
  ["WhatsApp", (b) => b.whatsapp ? `+${b.whatsapp}` : ""], ["Socios (informados)", (b) => b.estMembers], ["Sedes", (b) => b.branches], ["Puntaje", (b) => b.score],
  ["Prioridad", (b) => BAND_LABEL[b.scoreBand as never]], ["Motivo", (b) => (b.scoreLines as { points: number; why: string }[]).slice().sort((a, c) => c.points - a.points).slice(0, 2).map((l) => l.why).join(" · ")],
  ["Etapa", (b) => LEAD_STAGE_LABEL[b.stage as LeadStage] ?? b.stage], ["Mejor canal", (b) => bestChannel(b) ?? ""], ["Próxima acción", (b) => b.nextAction], ["Fecha próxima acción", (b) => b.nextActionOn],
  ["Exclusión", (b) => b.doNotContact ? "No contactar" : b.exclusionNote ?? ""], ["Primera vez visto", (b) => b.firstSeenAt.toISOString().slice(0, 10)], ["Última verificación", (b) => b.lastVerifiedAt?.toISOString().slice(0, 10) ?? ""],
];
async function exportRows() {
  const rows = await db.select().from(leadBusiness).orderBy(desc(leadBusiness.score), asc(leadBusiness.name));
  const facts = await db.select({ businessId: leadFact.businessId, field: leadFact.field, url: leadFact.sourceUrl, type: leadFact.sourceType, status: leadFact.status }).from(leadFact).where(eq(leadFact.current, true));
  const srcOf = (id: string) => facts.filter((f) => f.businessId === id).map((f) => `${f.field}: ${SOURCE_TYPE_LABEL[f.type as SourceType] ?? f.type}${f.status === "verified" ? " ✓" : ""}${f.url ? ` ${f.url}` : ""}`).join(" | ");
  return { header: [...COLS.map((c) => c[0]), "Fuentes"], body: rows.map((b) => [...COLS.map((c) => c[1](b)), srcOf(b.id)]) };
}
export async function exportCsv(actorId: string) {
  await leadsAdmin(actorId);
  const { header, body } = await exportRows();
  return "﻿" + [header, ...body].map((r) => r.map((v) => csvCell(v)).join(",")).join("\r\n");
}
/** Excel: planilla XML 2003 (se abre en Excel, LibreOffice y Google Sheets) sin dependencias nuevas. */
export async function exportXls(actorId: string) {
  await leadsAdmin(actorId);
  const { header, body } = await exportRows();
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cell = (v: unknown) => typeof v === "number" ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Leads"><Table>${[header, ...body].map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
}
