// D218 · Expediente: alta/actualización con deduplicación, procedencia por dato, exclusiones (clientes, negociaciones, no
// contactar) y puntuación. Si un negocio reaparece meses después, se recupera su expediente en lugar de crear otro.
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  asCategory, chainKeyOf, CLOSED_STAGES, canAutoMove, domainOf, emailNorm, factWins, igHandle, matchLead, normCity, normName, normPhoneAR,
  scoreLead, duplicateSignals, type FactField, type FactStatus, type LeadStage, type SourceType,
} from "@repi/domain";
import { db, schema } from "@/db";
import type { Tx } from "../access/util";
import { getSettings, leadBusiness, leadFact, leadSuppression, logLead, tierByCity, today } from "./core";

export type SourceRef = { type: SourceType; url?: string | null; observedAt?: string; status?: FactStatus };
export type Candidate = {
  name: string; city: string | null; province?: string | null; locality?: string | null; address?: string | null; lat?: number | null; lng?: number | null;
  website?: string | null; instagram?: string | null; facebook?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null;
  category?: string | null; positioning?: string | null; branches?: number | null; estMembers?: number | null; tools?: string | null;
  contactName?: string | null; contactRole?: string | null; legalName?: string | null;
  externalRef?: string | null;
  /** Fuente de cada campo; lo que no tenga, usa `source`. */
  sources?: Partial<Record<FactField, SourceRef>>;
  source: SourceRef;
  notes?: string | null;
};
export type IngestResult = { id: string; outcome: "created" | "updated" | "branch" | "review" | "unchanged"; excluded: string | null };

const FIELDS: FactField[] = ["name", "legalName", "address", "locality", "website", "instagram", "facebook", "email", "phone", "whatsapp", "branches", "estMembers", "category", "positioning", "tools", "contactName", "contactRole"];
const str = (v: unknown) => (v == null || v === "" ? null : String(v).trim().slice(0, 500) || null);

/** Valor normalizado para guardar como dato (descarta lo que no se puede validar: un teléfono sin 10 dígitos no se guarda). */
function factValue(f: FactField, v: unknown, city: string | null): string | null {
  const s = str(v);
  if (!s) return null;
  switch (f) {
    case "phone": return normPhoneAR(s, city) ? s : null;
    case "whatsapp": return normPhoneAR(s, city) ? s : null;
    case "email": return emailNorm(s);
    case "instagram": return igHandle(s);
    case "website": return /^https?:\/\//i.test(s) ? s : domainOf(s) ? `https://${s}` : null;
    case "branches": case "estMembers": { const n = Number(s); return Number.isInteger(n) && n > 0 && n < 100_000 ? String(n) : null; }
    case "category": return asCategory(s);
    default: return s;
  }
}

/** Alta o actualización de un negocio encontrado por cualquier fuente. Idempotente: repetirlo no duplica datos. */
export async function ingest(c: Candidate, actor: { userId: string | null; role: "admin" | "system" }): Promise<IngestResult> {
  const name = str(c.name); if (!name || normName(name).length < 2) throw new Error("nombre vacío");
  const city = str(c.city);
  return db.transaction(async (tx) => {
    // Candidatos a coincidencia: misma ciudad o mismos identificadores (cualquier ciudad).
    const ph = [c.phone, c.whatsapp].map((p) => normPhoneAR(p, city)?.national).filter(Boolean) as string[];
    const dom = domainOf(c.website), ig = igHandle(c.instagram), em = emailNorm(c.email);
    const conds = [eq(leadBusiness.normName, normName(name))];
    if (city) conds.push(sql`translate(lower(${leadBusiness.city}), 'áéíóúüñ', 'aeiouun') = ${normCity(city)}`);
    if (ph.length) conds.push(inArray(leadBusiness.phoneNational, ph));
    if (dom) conds.push(eq(leadBusiness.domain, dom));
    if (ig) conds.push(eq(leadBusiness.instagram, ig));
    if (em) conds.push(eq(leadBusiness.email, em));
    if (c.externalRef) conds.push(sql`${leadBusiness.externalRefs} @> ${JSON.stringify([c.externalRef])}::jsonb`);
    const existing = await tx.select().from(leadBusiness).where(or(...conds)).limit(500);
    const m = matchLead({ ...c, name, city }, existing.map((e) => ({ id: e.id, name: e.name, city: e.city, address: e.address, website: e.website, instagram: e.instagram, phone: e.phone, whatsapp: e.whatsapp, email: e.email, externalRef: e.externalRefs.find((r) => r === c.externalRef) ?? null })));
    let id: string; let outcome: IngestResult["outcome"];
    if (m?.kind === "same") { id = m.id; outcome = "updated"; }
    else {
      const [row] = await tx.insert(leadBusiness).values({
        name, normName: normName(name), city, province: str(c.province), category: asCategory(c.category), externalRefs: c.externalRef ? [c.externalRef] : [],
        chainKey: chainKeyOf({ name, website: c.website, instagram: c.instagram }), reviewOfId: m?.kind === "review" ? m.id : null, reviewSignals: m?.kind === "review" ? m.signals : null,
        stage: "discovered", ownerUserId: actor.role === "admin" ? actor.userId : null, notes: str(c.notes),
      }).returning({ id: leadBusiness.id });
      id = row.id; outcome = m?.kind === "branch" ? "branch" : m?.kind === "review" ? "review" : "created";
      await logLead(tx, { businessId: id, kind: "discovered", summary: `Encontrado por ${c.source.type}${m ? ` · ${m.kind === "branch" ? "sede de una cadena ya registrada" : "posible duplicado: revisar"}` : ""}`, payload: { source: c.source, match: m }, actorUserId: actor.userId, actorRole: actor.role });
      if (m?.kind === "branch") await tx.update(leadBusiness).set({ chainKey: chainKeyOf({ name, website: c.website, instagram: c.instagram }) }).where(eq(leadBusiness.id, m.id));
    }
    const changed = await writeFacts(tx, id, c, city, actor.userId);
    if (outcome === "updated" && c.externalRef) {
      await tx.update(leadBusiness).set({ externalRefs: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(${leadBusiness.externalRefs} || ${JSON.stringify([c.externalRef])}::jsonb) x)` }).where(eq(leadBusiness.id, id));
    }
    if (outcome === "updated" && !changed) outcome = "unchanged";
    if (outcome === "updated" && changed) await logLead(tx, { businessId: id, kind: "refound", summary: `Volvió a aparecer (${c.source.type}): datos actualizados`, payload: { source: c.source }, actorUserId: actor.userId, actorRole: actor.role });
    const excluded = await refreshLead(tx, id);
    return { id, outcome, excluded };
  });
}

/** Guarda cada dato con su fuente. Devuelve si cambió algún valor vigente. */
async function writeFacts(tx: Tx, businessId: string, c: Candidate, city: string | null, actorId: string | null): Promise<boolean> {
  const cur = await tx.select().from(leadFact).where(and(eq(leadFact.businessId, businessId), eq(leadFact.current, true)));
  let changed = false;
  for (const f of FIELDS) {
    const v = factValue(f, (c as Record<string, unknown>)[f], city);
    if (!v) continue;
    const src = { ...c.source, ...(c.sources?.[f] ?? {}) };
    const observedAt = src.observedAt ?? today();
    const status: FactStatus = src.status ?? (src.type === "manual" || src.type === "inbound" ? "verified" : "unverified");
    const prev = cur.find((x) => x.field === f);
    const same = prev && prev.value.toLowerCase() === v.toLowerCase();
    if (same) {
      // Mismo valor: si llega mejor confirmación, se registra; si no, sólo se refresca la fecha de verificación del expediente.
      if (prev.status !== "verified" && status === "verified") {
        await tx.update(leadFact).set({ status: "verified", verifiedAt: new Date(), verifiedBy: actorId, sourceType: src.type, sourceUrl: src.url ?? prev.sourceUrl }).where(eq(leadFact.id, prev.id));
        changed = true;
      }
      continue;
    }
    const wins = factWins({ field: f, value: v, sourceType: src.type, status, observedAt, sourceUrl: src.url }, prev ? { sourceType: prev.sourceType as SourceType, status: prev.status, observedAt: prev.observedAt } : null);
    if (wins && prev) await tx.update(leadFact).set({ current: false }).where(eq(leadFact.id, prev.id));
    await tx.insert(leadFact).values({ businessId, field: f, value: v, sourceType: src.type, sourceUrl: src.url ?? null, status, observedAt, current: wins, verifiedAt: status === "verified" ? new Date() : null, verifiedBy: status === "verified" ? actorId : null });
    if (wins) changed = true;
  }
  return changed;
}

/**
 * Recalcula el expediente desde sus datos vigentes: columnas normalizadas, exclusiones, «no contactar», nivel geográfico,
 * puntuación y avance automático de etapa (sólo hacia adelante). Devuelve el motivo de exclusión, si hay.
 */
export async function refreshLead(tx: Tx | typeof db, id: string): Promise<string | null> {
  const [b] = await tx.select().from(leadBusiness).where(eq(leadBusiness.id, id));
  if (!b) return null;
  const facts = await tx.select().from(leadFact).where(and(eq(leadFact.businessId, id), eq(leadFact.current, true)));
  const val = (f: FactField) => facts.find((x) => x.field === f)?.value ?? null;
  const st = (f: FactField) => facts.find((x) => x.field === f)?.status ?? null;
  const city = b.city;
  const phone = val("phone"), wa = val("whatsapp");
  const phoneN = normPhoneAR(phone, city) ?? normPhoneAR(wa, city);
  const waN = normPhoneAR(wa, city);
  const domain = domainOf(val("website")), ig = igHandle(val("instagram")), email = emailNorm(val("email"));
  // Exclusiones: lista de no contactar (por canal), clientes (organizaciones reales) y negociaciones abiertas en Ventas.
  const supp = await tx.select().from(leadSuppression).where(or(
    ...(email ? [and(eq(leadSuppression.channel, "email"), eq(leadSuppression.value, email))] : []),
    ...(phoneN ? [and(eq(leadSuppression.channel, "phone"), eq(leadSuppression.value, phoneN.national))] : []),
    ...(ig ? [and(eq(leadSuppression.channel, "instagram"), eq(leadSuppression.value, ig))] : []),
    ...(domain ? [and(eq(leadSuppression.channel, "domain"), eq(leadSuppression.value, domain))] : []),
    eq(leadSuppression.businessId, id),
  ));
  const doNotContact = supp.length > 0 || b.stage === "do_not_contact";
  let exclusion = b.exclusion === "manual" ? "manual" : null;
  let exclusionNote = b.exclusion === "manual" ? b.exclusionNote : null;
  let orgId = b.orgId;
  if (!exclusion) {
    const orgs = await tx.select({ id: schema.organization.id, name: schema.organization.name }).from(schema.organization).where(and(eq(schema.organization.kind, "gym"), eq(schema.organization.isDemo, false)));
    const hit = orgs.find((o) => normName(o.name).length >= 3 && normName(o.name) === b.normName);
    if (hit) { exclusion = "customer"; exclusionNote = `Cliente de REPI: ${hit.name}`; orgId = hit.id; }
  }
  if (!exclusion) {
    const pros = await tx.select().from(schema.salesProspect).where(and(isNull(schema.salesProspect.archivedAt), b.salesProspectId ? sql`${schema.salesProspect.id} <> ${b.salesProspectId}` : sql`true`)).limit(2000);
    const hit = pros.find((p) => duplicateSignals({ name: b.name, city, phone, email, website: val("website") }, { name: p.name, city: p.city, phone: p.phone, email: p.email, website: p.website }).strong);
    if (hit) { exclusion = "negotiation"; exclusionNote = `Ya está en Ventas: ${hit.name}`; }
  }
  // Contacto entrante por el sitio (commercial_lead): señal de interés y vínculo.
  let commercialLeadId = b.commercialLeadId;
  if (!commercialLeadId && (email || phoneN)) {
    const cl = await tx.select().from(schema.commercialLead).where(or(...(email ? [sql`lower(${schema.commercialLead.email}) = ${email}`] : []), ...(phoneN ? [sql`right(regexp_replace(coalesce(${schema.commercialLead.phone}, ''), '\\D', '', 'g'), 8) = ${phoneN.national.slice(-8)}`] : []))).limit(1);
    if (cl[0]) commercialLeadId = cl[0].id;
  }
  const tiers = await tierByCity();
  const fold = (s: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const t = tiers.get(fold(city));
  const intent = { ...b.intentFlags, inbound: b.intentFlags.inbound || !!commercialLeadId };
  const settings = await getSettings(tx);
  const has = (f: FactField) => !!val(f);
  const ver = (f: FactField) => has(f) && st(f) === "verified";
  const closed = CLOSED_STAGES.includes(b.stage as LeadStage);
  const sc = scoreLead({
    category: asCategory(val("category") ?? b.category), geoTier: (t?.tier ?? null) as 1 | 2 | 3 | null, estMembers: val("estMembers") ? Number(val("estMembers")) : null, branches: val("branches") ? Number(val("branches")) : null,
    verified: { phone: ver("phone"), whatsapp: ver("whatsapp"), email: ver("email"), instagram: ver("instagram"), website: ver("website") },
    unverified: { phone: has("phone"), whatsapp: has("whatsapp"), email: has("email"), instagram: has("instagram"), website: has("website") },
    hasContactName: has("contactName"), emailOnOwnDomain: !!email && !!domain && email.endsWith(`@${domain}`),
    techSignals: b.techSignals as never, intent, closed: closed || doNotContact || !!exclusion,
  }, settings.weights);
  // Etapa automática (sólo avanza): sin contacto → investigar; con contacto → validado; con puntaje ≥ 40 → calificado.
  let stage = b.stage as LeadStage;
  const reachable = !!(phoneN || email || ig);
  const auto: LeadStage | null = doNotContact ? "do_not_contact" : !reachable ? "research" : sc.score >= 40 && !exclusion ? "qualified" : "validated";
  if (auto && ["discovered", "research", "validated"].includes(stage) && canAutoMove(stage, auto)) stage = auto;
  if (doNotContact && stage !== "do_not_contact" && canAutoMove(stage, "do_not_contact")) stage = "do_not_contact";
  await tx.update(leadBusiness).set({
    name: val("name") ?? b.name, normName: normName(val("name") ?? b.name), legalName: val("legalName"), address: val("address"), locality: val("locality"),
    website: val("website"), domain, instagram: ig, facebook: val("facebook"), email, phone: phone ?? (wa && !phone ? wa : null), phoneNational: phoneN?.national ?? null,
    whatsapp: waN?.wa ?? null, category: asCategory(val("category") ?? b.category), positioning: val("positioning"), branches: val("branches") ? Number(val("branches")) : null,
    estMembers: val("estMembers") ? Number(val("estMembers")) : null, tools: val("tools"), contactName: val("contactName"), contactRole: val("contactRole"),
    areaId: t?.areaId ?? b.areaId, geoTier: t?.tier ?? null, score: sc.score, scoreBand: sc.band, scoreLines: sc.lines, scoredAt: new Date(),
    exclusion, exclusionNote, orgId, doNotContact, commercialLeadId, intentFlags: intent,
    lastVerifiedAt: facts.some((f) => f.status === "verified") ? new Date() : b.lastVerifiedAt,
    ...(stage !== b.stage ? { stage, stageChangedAt: new Date() } : {}), updatedAt: new Date(),
  }).where(eq(leadBusiness.id, id));
  if (stage !== b.stage) await logLead(tx, { businessId: id, kind: "stage", summary: `Etapa automática: ${b.stage} → ${stage}`, payload: { from: b.stage, to: stage }, actorRole: "system" });
  return doNotContact ? "do_not_contact" : exclusion;
}

/** Recalcula todos los expedientes abiertos (después de cambiar pesos o zonas). */
export async function rescoreAll(limit = 3000) {
  const rows = await db.select({ id: leadBusiness.id }).from(leadBusiness).orderBy(desc(leadBusiness.updatedAt)).limit(limit);
  for (const r of rows) await refreshLead(db, r.id);
  return { rescored: rows.length };
}
