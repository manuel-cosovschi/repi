// REPI Sales Intelligence 1.0 (D218) · reglas puras de captación: identidad y duplicados, procedencia de datos, puntuación
// explicable, etapas, intención de respuestas, cadencia de seguimiento y enlaces de contacto. Sin red ni base: se prueba solo.
// Regla madre: un dato que no está confirmado queda «desconocido». Nada de esto envía mensajes; eso exige aprobación aparte.
import { normalizeBusinessName } from "./sales";

// ── Etapas ──────────────────────────────────────────────────────────────────
export const LEAD_STAGES = [
  "discovered", "research", "validated", "qualified", "to_contact", "prepared", "contacted", "waiting", "replied", "interested",
  "meeting_pending", "meeting_set", "demo_done", "proposal", "negotiation", "won", "lost", "no_interest", "do_not_contact",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  discovered: "Descubierto", research: "Pendiente de investigación", validated: "Validado", qualified: "Calificado", to_contact: "Pendiente de contacto",
  prepared: "Contacto preparado", contacted: "Contactado", waiting: "Esperando respuesta", replied: "Respondió", interested: "Interesado",
  meeting_pending: "Reunión pendiente", meeting_set: "Reunión agendada", demo_done: "Demostración realizada", proposal: "Propuesta enviada",
  negotiation: "Negociación", won: "Cliente ganado", lost: "Oportunidad perdida", no_interest: "Sin interés", do_not_contact: "No contactar",
};
/** Etapas cerradas: no reciben seguimientos automáticos ni entran en la cola de contacto. */
export const CLOSED_STAGES: readonly LeadStage[] = ["won", "lost", "no_interest", "do_not_contact"];
/** Etapas con conversación abierta: la secuencia se detiene; manda la persona (o la tarea que ella pidió). */
export const ENGAGED_STAGES: readonly LeadStage[] = ["replied", "interested", "meeting_pending", "meeting_set", "demo_done", "proposal", "negotiation"];
export const isLeadStage = (s: unknown): s is LeadStage => typeof s === "string" && (LEAD_STAGES as readonly string[]).includes(s);
/** «No contactar» sólo se levanta a mano y con motivo (servidor); acá: nunca se sale de ahí por una regla automática. */
export function canAutoMove(from: string, to: string): boolean {
  if (from === to) return false;
  if (from === "do_not_contact" || from === "won") return false;
  if (to === "do_not_contact") return true;
  const i = LEAD_STAGES.indexOf(from as LeadStage), j = LEAD_STAGES.indexOf(to as LeadStage);
  if (i < 0 || j < 0) return false;
  if (CLOSED_STAGES.includes(from as LeadStage)) return false;
  return j > i; // automático: sólo hacia adelante
}

// ── Categorías y geografía ──────────────────────────────────────────────────
export const LEAD_CATEGORIES = ["traditional", "bodybuilding", "fitness_center", "premium", "neighborhood", "chain", "functional", "crossfit", "personal_training", "sports_center", "unknown"] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];
export const LEAD_CATEGORY_LABEL: Record<LeadCategory, string> = {
  traditional: "Gimnasio tradicional", bodybuilding: "Musculación", fitness_center: "Centro de fitness", premium: "Gimnasio premium", neighborhood: "Gimnasio de barrio",
  chain: "Cadena / varias sedes", functional: "Entrenamiento funcional", crossfit: "Box de CrossFit", personal_training: "Entrenamiento personalizado", sports_center: "Centro deportivo con sala", unknown: "Sin clasificar",
};
export const asCategory = (s: unknown): LeadCategory => (LEAD_CATEGORIES as readonly string[]).includes(String(s)) ? s as LeadCategory : "unknown";
/** Característica telefónica por localidad (para números publicados sin código de área). */
export const AREA_CODES: Record<string, string> = {
  "mar del plata": "223", "batan": "223", "balcarce": "2266", "miramar": "2291", "necochea": "2262", "quequen": "2262", "tandil": "249",
  "pinamar": "2254", "villa gesell": "2255", "la plata": "221", "bahia blanca": "291", "caba": "11", "buenos aires": "11", "rosario": "341", "cordoba": "351",
};

// ── Normalización de contactos ──────────────────────────────────────────────
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const normCity = (s: string | null | undefined) => fold(s ?? "").replace(/\s+/g, " ");
export const normName = (s: string) => normalizeBusinessName(s);

export type PhoneInfo = { national: string; e164: string; wa: string };
/**
 * Teléfono argentino publicado → número nacional de 10 dígitos (área + abonado), E.164 y formato de wa.me (549…).
 * Quita +54, 0, el 9 de celulares y el 15 local. Sin área, usa la de la ciudad. Lo que no cierra en 10 dígitos → null.
 */
export function normPhoneAR(raw: string | null | undefined, city?: string | null): PhoneInfo | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) { d = d.slice(2); if (d.startsWith("9")) d = d.slice(1); }
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === "15") { d = d.slice(0, a) + d.slice(a + 2); break; }
  }
  if (d.length < 10) {
    const area = AREA_CODES[normCity(city)];
    if (area) {
      if (d.startsWith("15") && d.length - 2 + area.length === 10) d = d.slice(2);
      if (d.length + area.length === 10) d = area + d;
    }
  }
  if (d.length !== 10) return null;
  return { national: d, e164: `+54${d}`, wa: `549${d}` };
}
export const domainOf = (website: string | null | undefined): string | null => {
  const host = fold(website ?? "").replace(/^https?:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  // Páginas en redes o constructores genéricos no identifican al negocio.
  if (/(^|\.)(instagram|facebook|wa|whatsapp|linktr|google|goo|tiktok|youtube|twitter|x)\.(com|me|gl|ee)$/.test(host)) return null;
  return host;
};
export const igHandle = (raw: string | null | undefined): string | null => {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const h = (m ? m[1] : s.replace(/^@/, "")).toLowerCase().replace(/\/$/, "");
  return /^[a-z0-9._]{2,30}$/.test(h) && !["p", "reel", "explore", "stories"].includes(h) ? h : null;
};
export const emailNorm = (raw: string | null | undefined): string | null => {
  const e = (raw ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) ? e : null;
};

// ── Identidad y duplicados ──────────────────────────────────────────────────
export type LeadIdentity = {
  id?: string; name: string; city?: string | null; address?: string | null; website?: string | null; instagram?: string | null;
  phone?: string | null; whatsapp?: string | null; email?: string | null; externalRef?: string | null;
};
/** Claves estables de un negocio. «ext:» = identificador de la fuente (p. ej. osm:node/123). */
export function identityKeys(l: LeadIdentity): string[] {
  const k: string[] = [];
  if (l.externalRef) k.push(`ext:${l.externalRef}`);
  const dom = domainOf(l.website); if (dom) k.push(`dom:${dom}`);
  const ig = igHandle(l.instagram); if (ig) k.push(`ig:${ig}`);
  for (const p of [l.phone, l.whatsapp]) { const n = normPhoneAR(p, l.city); if (n) k.push(`tel:${n.national}`); }
  const e = emailNorm(l.email); if (e) k.push(`mail:${e}`);
  const n = normName(l.name); if (n.length >= 3) k.push(`name:${n}|${normCity(l.city)}`);
  return [...new Set(k)];
}
const addrNorm = (s: string | null | undefined) => fold(s ?? "").replace(/[^a-z0-9 ]/g, " ").replace(/\b(av|avenida|calle|n|nro|numero)\b/g, " ").replace(/\s+/g, " ").trim();
/** Palabras en común / total (Dice sobre tokens): para nombres parecidos, nunca para fusionar sola. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normName(a).split(" ").filter(Boolean)), tb = new Set(normName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let common = 0; for (const t of ta) if (tb.has(t)) common++;
  // Un nombre contenido entero en el otro («Fox» ⊂ «Fox Center») cuenta como muy parecido: sigue siendo sólo para revisar.
  const contained = common === Math.min(ta.size, tb.size) ? 0.85 : 0;
  return Math.max(contained, (2 * common) / (ta.size + tb.size));
}
export type LeadMatch = { id: string; kind: "same" | "branch" | "review"; signals: string[] };
/**
 * Compara un negocio encontrado con los existentes.
 * - «same»: mismo identificador de fuente, teléfono, email o Instagram; o mismo dominio con la misma dirección/nombre; o mismo
 *   nombre y ciudad sin identificadores que se contradigan. Se actualiza el expediente existente.
 * - «branch»: misma marca (dominio o Instagram) y otra dirección: sede de una cadena; registro propio con la misma cadena.
 * - «review»: nombre muy parecido en la misma ciudad, o nombre igual con identificadores distintos. No se fusiona: se marca.
 */
export function matchLead(c: LeadIdentity, existing: (LeadIdentity & { id: string })[]): LeadMatch | null {
  const ck = new Set(identityKeys(c));
  let best: LeadMatch | null = null;
  const rank = { same: 3, branch: 2, review: 1 } as const;
  const all: LeadMatch[] = [];
  for (const e of existing) {
    const ek = identityKeys(e);
    const shared = ek.filter((k) => ck.has(k));
    const has = (p: string) => shared.some((k) => k.startsWith(p));
    const conflict = (p: string) => ek.some((k) => k.startsWith(p)) && [...ck].some((k) => k.startsWith(p)) && !has(p);
    const differentAddress = !!c.address && !!e.address && addrNorm(c.address) !== addrNorm(e.address);
    let m: LeadMatch | null = null;
    if (has("ext:")) m = { id: e.id, kind: "same", signals: ["fuente"] };
    else if ((has("dom:") || has("ig:")) && differentAddress && !has("tel:")) m = { id: e.id, kind: "branch", signals: shared.map(sig) };
    else if (has("tel:") || has("mail:") || has("ig:")) m = { id: e.id, kind: "same", signals: shared.map(sig) };
    else if (has("dom:")) m = { id: e.id, kind: has("name:") || !differentAddress ? "same" : "branch", signals: shared.map(sig) };
    else if (has("name:")) m = { id: e.id, kind: conflict("tel:") || conflict("dom:") || differentAddress ? "review" : "same", signals: ["nombre y ciudad"] };
    else if (normCity(c.city) === normCity(e.city) && nameSimilarity(c.name, e.name) >= 0.8) m = { id: e.id, kind: "review", signals: ["nombre parecido"] };
    if (m) all.push(m);
    if (m && (!best || rank[m.kind] > rank[best.kind])) best = m;
  }
  // Coincidencia sólo por nombre con más de un expediente posible (sedes de una cadena, homónimos): ambigua → revisión.
  const nameOnly = (m: LeadMatch) => m.signals.length === 1 && m.signals[0] === "nombre y ciudad";
  if (best?.kind === "same" && nameOnly(best) && all.length > 1) {
    const strong = all.find((m) => m.kind === "same" && !nameOnly(m));
    return strong ?? { id: (all.find((m) => m.kind === "review") ?? best).id, kind: "review", signals: ["nombre y ciudad", "varios expedientes posibles"] };
  }
  const strong = all.find((m) => m.kind === "same" && !nameOnly(m));
  return strong ?? best;
}
const sig = (k: string) => ({ ext: "fuente", dom: "dominio", ig: "Instagram", tel: "teléfono", mail: "email", name: "nombre y ciudad" } as Record<string, string>)[k.split(":")[0]] ?? k;
/** Clave de cadena: dominio o Instagram compartidos por varias sedes. */
export const chainKeyOf = (l: LeadIdentity) => { const d = domainOf(l.website); if (d) return `dom:${d}`; const ig = igHandle(l.instagram); return ig ? `ig:${ig}` : null; };

// ── Procedencia de cada dato ────────────────────────────────────────────────
export const FACT_FIELDS = ["name", "legalName", "address", "locality", "website", "instagram", "facebook", "email", "phone", "whatsapp", "branches", "estMembers", "category", "positioning", "tools", "contactName", "contactRole"] as const;
export type FactField = (typeof FACT_FIELDS)[number];
export type FactStatus = "verified" | "unverified" | "rejected";
export type SourceType = "official_site" | "osm" | "directory" | "search_result" | "social_profile_listing" | "manual" | "import" | "inbound";
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official_site: "Sitio oficial", osm: "OpenStreetMap (ODbL)", directory: "Directorio", search_result: "Resultado de búsqueda", social_profile_listing: "Perfil público listado",
  manual: "Carga manual", import: "Importación", inbound: "Formulario de REPI",
};
/** Confianza por tipo de fuente: lo publicado por el propio negocio o cargado por una persona pesa más. */
const SOURCE_TRUST: Record<SourceType, number> = { manual: 5, inbound: 5, official_site: 4, import: 3, social_profile_listing: 3, osm: 2, directory: 2, search_result: 1 };
export type FactInput = { field: FactField; value: string; sourceType: SourceType; sourceUrl?: string | null; status?: FactStatus; observedAt: string };
/** ¿El dato nuevo reemplaza al vigente? Nunca pisa uno verificado con uno sin verificar ni uno de mejor fuente con otro peor. */
export function factWins(next: FactInput, cur: { sourceType: SourceType; status: FactStatus; observedAt: string } | null): boolean {
  if (!cur || cur.status === "rejected") return true;
  const ns = next.status ?? "unverified";
  if (ns === "rejected") return false;
  if (cur.status === "verified" && ns !== "verified") return false;
  if (ns === "verified" && cur.status !== "verified") return true;
  const dt = SOURCE_TRUST[next.sourceType] - SOURCE_TRUST[cur.sourceType];
  if (dt !== 0) return dt > 0;
  return next.observedAt >= cur.observedAt;
}

// ── Puntuación explicable ───────────────────────────────────────────────────
export const SCORE_FACTORS = ["fit", "size", "proximity", "contactability", "decisionMaker", "techNeed", "capacity", "intent"] as const;
export type ScoreFactor = (typeof SCORE_FACTORS)[number];
export const SCORE_FACTOR_LABEL: Record<ScoreFactor, string> = {
  fit: "Encaje con REPI", size: "Tamaño y potencial", proximity: "Cercanía", contactability: "Contacto verificable", decisionMaker: "Acceso al decisor",
  techNeed: "Necesidad tecnológica observable", capacity: "Capacidad de implementar", intent: "Señales de interés",
};
export type ScoreWeights = Record<ScoreFactor, number>;
export const DEFAULT_WEIGHTS: ScoreWeights = { fit: 20, size: 15, proximity: 15, contactability: 15, decisionMaker: 10, techNeed: 5, capacity: 10, intent: 10 };
export type ScoreInput = {
  category: LeadCategory; geoTier: 1 | 2 | 3 | null; estMembers: number | null; branches: number | null;
  verified: { phone: boolean; whatsapp: boolean; email: boolean; instagram: boolean; website: boolean };
  /** Contactos publicados pero todavía sin verificar (directorios, búsquedas): cuentan la mitad y se dice. */
  unverified?: { phone: boolean; whatsapp: boolean; email: boolean; instagram: boolean; website: boolean };
  hasContactName: boolean; emailOnOwnDomain: boolean;
  /** Señales cargadas por una persona o detectadas en el sitio (texto exacto en `evidence`). */
  techSignals: { kind: "no_app" | "paper_routines" | "uses_other_software" | "online_booking"; evidence: string }[];
  intent: { inbound: boolean; replied: boolean; positive: boolean; askedPrice: boolean; meeting: boolean };
  closed: boolean;
};
export type ScoreLine = { factor: ScoreFactor; points: number; max: number; why: string };
export type ScoreResult = { score: number; band: "very_high" | "high" | "medium" | "low"; lines: ScoreLine[] };
export const BAND_LABEL = { very_high: "Prioridad muy alta", high: "Prioridad alta", medium: "Prioridad media", low: "Prioridad baja" } as const;
export const bandOf = (s: number): ScoreResult["band"] => s >= 80 ? "very_high" : s >= 60 ? "high" : s >= 40 ? "medium" : "low";
export function validateWeights(w: Partial<ScoreWeights>): string | null {
  for (const f of SCORE_FACTORS) { const v = w[f]; if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) return `Peso inválido en «${SCORE_FACTOR_LABEL[f]}» (0 a 100).`; }
  const sum = SCORE_FACTORS.reduce((a, f) => a + (w[f] as number), 0);
  return sum === 0 ? "Al menos un factor tiene que pesar." : null;
}
/**
 * 0–100 con explicación por factor. Cada factor da 0..1 según datos; el dato que falta da un valor bajo y lo dice («sin dato»):
 * una presencia digital escasa no se trata como necesidad de comprar (techNeed sólo suma con evidencia concreta).
 */
export function scoreLead(i: ScoreInput, weights: ScoreWeights = DEFAULT_WEIGHTS): ScoreResult {
  const parts: Record<ScoreFactor, [number, string]> = {} as never;
  const fitBy: Record<LeadCategory, number> = { traditional: 1, bodybuilding: 1, fitness_center: 1, premium: 1, chain: 1, neighborhood: 0.85, functional: 0.8, crossfit: 0.6, personal_training: 0.7, sports_center: 0.75, unknown: 0.4 };
  parts.fit = [fitBy[i.category], `${LEAD_CATEGORY_LABEL[i.category]}${i.category === "unknown" ? " (sin dato del tipo)" : ""}`];
  if (i.estMembers != null) {
    const m = i.estMembers;
    parts.size = [m >= 400 ? 1 : m >= 300 ? 0.85 : m >= 150 ? 0.65 : m >= 50 ? 0.4 : 0.15, `${m} socios informados`];
  } else if ((i.branches ?? 0) > 1) parts.size = [0.8, `${i.branches} sedes (sin dato de socios)`];
  else if (i.category === "premium" || i.category === "chain" || i.category === "fitness_center") parts.size = [0.5, "Formato que suele tener volumen (sin dato de socios)"];
  else parts.size = [0.3, "Sin dato de socios"];
  parts.proximity = [i.geoTier === 1 ? 1 : i.geoTier === 2 ? 0.6 : i.geoTier === 3 ? 0.3 : 0.1, i.geoTier ? `Zona de nivel ${i.geoTier}` : "Fuera de las zonas configuradas"];
  const v = i.verified, u = i.unverified ?? { phone: false, whatsapp: false, email: false, instagram: false, website: false };
  const lvl = (k: keyof typeof v) => (v[k] ? 1 : u[k] ? 0.5 : 0);
  const c = Math.max(0.4 * lvl("whatsapp"), 0.3 * lvl("phone")) + 0.3 * lvl("email") + 0.2 * lvl("instagram") + 0.1 * lvl("website");
  const names = { whatsapp: "WhatsApp", phone: "teléfono", email: "email", instagram: "Instagram", website: "sitio" } as const;
  const keys = Object.keys(names) as (keyof typeof names)[];
  const ok = keys.filter((k) => v[k]).map((k) => names[k]), pend = keys.filter((k) => !v[k] && u[k]).map((k) => names[k]);
  const cTxt = [ok.length && `Verificado: ${ok.join(", ")}`, pend.length && `Sin verificar: ${pend.join(", ")}`].filter(Boolean).join(" · ");
  parts.contactability = [Math.min(1, c), cTxt || "Sin contacto comercial publicado"];
  parts.decisionMaker = [i.hasContactName ? 1 : i.emailOnOwnDomain ? 0.5 : 0.2, i.hasContactName ? "Responsable identificado" : i.emailOnOwnDomain ? "Email del propio dominio" : "Sin decisor identificado"];
  const need = i.techSignals.filter((s) => s.kind !== "uses_other_software");
  const other = i.techSignals.find((s) => s.kind === "uses_other_software");
  parts.techNeed = need.length ? [1, `Evidencia: ${need[0].evidence.slice(0, 80)}`] : other ? [0.3, `Usa otro software: ${other.evidence.slice(0, 60)}`] : [0.4, "Sin evidencia (no se presume necesidad)"];
  const cap = 0.5 * lvl("website") + 0.3 * lvl("instagram") + ((i.branches ?? 1) > 1 ? 0.2 : 0);
  parts.capacity = [Math.min(1, cap || 0.2), cap ? "Operación con canales propios activos" : "Sin canales propios verificados"];
  const it = i.intent;
  parts.intent = it.meeting ? [1, "Pidió reunión o demo"] : it.askedPrice ? [0.9, "Pidió precios"] : it.positive ? [0.8, "Respondió con interés"] : it.inbound ? [0.7, "Nos contactó por el sitio"] : it.replied ? [0.4, "Respondió"] : [0, "Sin señales todavía"];
  const total = SCORE_FACTORS.reduce((a, f) => a + weights[f], 0) || 1;
  const lines: ScoreLine[] = SCORE_FACTORS.map((f) => ({ factor: f, points: Math.round((parts[f][0] * weights[f] * 100) / total), max: Math.round((weights[f] * 100) / total), why: parts[f][1] }));
  let score = Math.max(0, Math.min(100, lines.reduce((a, l) => a + l.points, 0)));
  if (i.closed) score = 0;
  return { score, band: bandOf(score), lines };
}

// ── Intención de respuestas ─────────────────────────────────────────────────
export const INTENTS = ["high", "medium", "low", "price", "demo", "info", "later", "objection", "not_decision_maker", "not_interested", "unsubscribe", "human"] as const;
export type Intent = (typeof INTENTS)[number];
export const INTENT_LABEL: Record<Intent, string> = {
  high: "Interés alto", medium: "Interés medio", low: "Interés bajo", price: "Pide precios", demo: "Pide demo o reunión", info: "Pide información",
  later: "Pide hablar más adelante", objection: "Objeción", not_decision_maker: "No es quien decide", not_interested: "No le interesa", unsubscribe: "Pidió no recibir mensajes", human: "Requiere revisión",
};
export const OBJECTIONS = ["budget", "other_software", "coaches_own", "members_wont_use", "expensive", "few_members", "no_change"] as const;
export type Objection = (typeof OBJECTIONS)[number];
const RX: [Intent | `obj:${Objection}`, RegExp][] = [
  ["unsubscribe", /\b(no (me|nos) (escrib|contact|mand|molest)|dej(a|e|en) de (escrib|mand)|dame de baja|darme de baja|baja de (la|esta) lista|borr(a|e)(me|nos)|spam|no quiero (recibir|que me))/],
  ["not_interested", /\b(no (me|nos) interesa|no estamos interesad|no gracias|no, gracias|no por ahora|por ahora no|no es para nosotros|no necesitamos)/],
  ["not_decision_maker", /\b(no soy (el|la) (due|encargad|que decide)|no decido|habl(a|á|e) con (el|la)|le paso (tu|el) (mensaje|contacto)|lo (ve|maneja|decide) (el|la|mi)|el due(n|ñ)o (es|no esta))/],
  ["demo", /\b(demo|demostraci|reuni(o|ó)n|junt(arnos|emos)|llamad(a|ita)|videollamada|charlar|agend(ar|emos)|ver c(o|ó)mo funciona|mostrame|me lo mostr|zoom|meet)\b/],
  ["price", /\b(precio|cu(a|á)nto (sale|cuesta|cobran|es)|costo|valor|tarifa|presupuesto (de|para|del)|cotiza)/],
  ["info", /\b(m(a|á)nd(a|á)me|pas(a|á)me|envi(a|á)me|m(a|á)s info|informaci(o|ó)n|presentaci(o|ó)n|detalles|brochure|folleto|link)/],
  ["later", /\b(semana que viene|pr(o|ó)xima semana|m(a|á)s adelante|mes que viene|pr(o|ó)ximo mes|despu(e|é)s de|ahora no puedo|en unos d(i|í)as|ma(n|ñ)ana|pasado ma(n|ñ)ana|el (lunes|martes|mi(e|é)rcoles|jueves|viernes)|a fin de mes|en (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))/],
  ["obj:budget", /\b(no (tenemos|hay) (presupuesto|plata)|sin presupuesto|no nos da el presupuesto)/],
  ["obj:other_software", /\b(ya (usamos|tenemos|trabajamos con) (otro|otra|un|una) (sistema|software|app|aplicaci|plataforma)|ya tenemos (sistema|app|software))/],
  ["obj:coaches_own", /\b(los (profes|profesores|entrenadores) (arman|manejan|hacen) (sus|las) rutinas)/],
  ["obj:members_wont_use", /\b(los socios no (la |lo )?(usar|bajar|descargar)|no van a (usar|bajar|descargar))/],
  ["obj:expensive", /\b(es (muy |re )?caro|mucha plata|mucho dinero|sale caro|muy costoso)/],
  ["obj:few_members", /\b(no tenemos tantos socios|somos (chicos|pocos)|pocos socios|gimnasio chico)/],
  ["obj:no_change", /\b(no queremos cambiar|as(i|í) estamos bien|funcionamos bien as(i|í)|no (nos )?hace falta)/],
  ["high", /\b(me interesa|nos interesa|me encanta|buen(i|í)simo|genial|dale|de una|me gusta|claro que s(i|í)|s(i|í),? (contame|me interesa|dale))/],
  ["medium", /\b(contame|puede ser|podr(i|í)a ser|quiz(a|á)s?|tal vez|lo vemos|lo veo|lo pienso|interesante)/],
  ["low", /\b(no s(e|é)|no creo|lo dudo|veremos|capaz m(a|á)s adelante)/],
];
export type IntentResult = { intent: Intent; confidence: number; needsReview: boolean; objection: Objection | null; followUpOn: string | null; matched: string[] };
/**
 * Clasificación por reglas (español rioplatense). La baja manda siempre. Si hay señales contradictorias o ninguna, va a
 * revisión humana con baja confianza. `followUpOn` sale de expresiones de fecha («la semana que viene», «el jueves»…).
 */
export function classifyReply(text: string, today: string): IntentResult {
  const t = fold(text).replace(/\s+/g, " ");
  const hits = RX.filter(([, rx]) => rx.test(t)).map(([k]) => k);
  const objection = (hits.find((h) => h.startsWith("obj:"))?.slice(4) ?? null) as Objection | null;
  const followUpOn = parseFollowUpDate(t, today);
  const has = (k: string) => hits.includes(k as never);
  const base = { objection, followUpOn, matched: hits as string[] };
  if (!t.trim()) return { ...base, intent: "human", confidence: 0, needsReview: true };
  if (has("unsubscribe")) return { ...base, intent: "unsubscribe", confidence: 0.95, needsReview: false };
  if (has("not_interested") && !has("demo") && !has("price")) return { ...base, intent: "not_interested", confidence: has("high") ? 0.5 : 0.85, needsReview: has("high") };
  if (has("demo")) return { ...base, intent: "demo", confidence: 0.85, needsReview: false };
  if (has("price")) return { ...base, intent: "price", confidence: 0.85, needsReview: false };
  if (has("later") && followUpOn) return { ...base, intent: "later", confidence: 0.8, needsReview: false };
  if (has("not_decision_maker")) return { ...base, intent: "not_decision_maker", confidence: 0.75, needsReview: false };
  if (objection) return { ...base, intent: "objection", confidence: 0.75, needsReview: false };
  if (has("info")) return { ...base, intent: "info", confidence: 0.8, needsReview: false };
  if (has("later")) return { ...base, intent: "later", confidence: 0.6, needsReview: true };
  if (has("high")) return { ...base, intent: "high", confidence: 0.75, needsReview: false };
  if (has("medium")) return { ...base, intent: "medium", confidence: 0.6, needsReview: false };
  if (has("low")) return { ...base, intent: "low", confidence: 0.55, needsReview: true };
  return { ...base, intent: "human", confidence: 0.2, needsReview: true };
}
const WD = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const addDaysIso = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Próximo día hábil (lunes a viernes) desde `iso` inclusive. */
export const nextBusinessDay = (iso: string) => { let d = iso; while (dow(d) === 0 || dow(d) === 6) d = addDaysIso(d, 1); return d; };
export function parseFollowUpDate(text: string, today: string): string | null {
  const t = fold(text);
  if (/pasado manana/.test(t)) return nextBusinessDay(addDaysIso(today, 2));
  if (/\bmanana\b/.test(t)) return nextBusinessDay(addDaysIso(today, 1));
  if (/(semana que viene|proxima semana)/.test(t)) { const d = dow(today); return addDaysIso(today, ((8 - d) % 7) || 7); }
  if (/(mes que viene|proximo mes)/.test(t)) { const [y, m] = today.split("-").map(Number); return nextBusinessDay(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)); }
  if (/fin de mes/.test(t)) { const [y, m] = today.split("-").map(Number); const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); return last <= today ? nextBusinessDay(addDaysIso(today, 1)) : nextBusinessDay(addDaysIso(last, -3) > today ? addDaysIso(last, -3) : last); }
  const n = t.match(/en (\d{1,2}|un|una|dos|tres) (dias|semanas)/);
  if (n) { const q = ({ un: 1, una: 1, dos: 2, tres: 3 } as Record<string, number>)[n[1]] ?? Number(n[1]); return nextBusinessDay(addDaysIso(today, n[2] === "dias" ? q : q * 7)); }
  const w = t.match(/\bel (lunes|martes|miercoles|jueves|viernes)\b/);
  if (w) { const target = WD.indexOf(w[1]); const d = dow(today); return addDaysIso(today, ((target - d + 7) % 7) || 7); }
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    const [y] = today.split("-").map(Number); const day = Number(dm[1]), mon = Number(dm[2]);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) { let iso = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`; if (iso <= today) iso = `${y + 1}${iso.slice(4)}`; return iso; }
  }
  const mo = t.match(/\ben (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  if (mo) {
    const idx = mo[1] === "setiembre" ? 8 : MONTHS.indexOf(mo[1]); const [y, m] = today.split("-").map(Number);
    const year = idx + 1 > m ? y : y + 1; return nextBusinessDay(`${year}-${String(idx + 1).padStart(2, "0")}-01`);
  }
  return null;
}
/** Qué hace el sistema con cada intención. Nunca envía: cambia etapa, corta o pausa la secuencia y crea la tarea. */
export function intentPlan(r: IntentResult, today: string): { stage: LeadStage | null; stopSequence: boolean; suppress: boolean; task: { kind: string; dueOn: string; note: string } | null; priority: boolean } {
  const soon = nextBusinessDay(today);
  switch (r.intent) {
    case "unsubscribe": return { stage: "do_not_contact", stopSequence: true, suppress: true, task: null, priority: false };
    case "not_interested": return { stage: "no_interest", stopSequence: true, suppress: false, task: null, priority: false };
    case "demo": return { stage: "meeting_pending", stopSequence: true, suppress: false, task: { kind: "meeting", dueOn: today, note: "Pidió reunión o demo: proponer horarios reales." }, priority: true };
    case "price": return { stage: "interested", stopSequence: true, suppress: false, task: { kind: "pricing", dueOn: today, note: "Pidió precios: confirmar socios y validar la cotización antes de enviarla." }, priority: true };
    case "info": return { stage: "interested", stopSequence: true, suppress: false, task: { kind: "send_info", dueOn: today, note: "Pidió información: enviar la presentación y proponer próximo paso." }, priority: false };
    case "later": return { stage: "replied", stopSequence: true, suppress: false, task: { kind: "callback", dueOn: r.followUpOn ?? addDaysIso(today, 7), note: r.followUpOn ? "Pidió que lo contactemos en esta fecha. No escribir antes." : "Pidió hablar más adelante (sin fecha clara): revisar." }, priority: false };
    case "not_decision_maker": return { stage: "replied", stopSequence: true, suppress: false, task: { kind: "find_owner", dueOn: soon, note: "No es quien decide: pedir el contacto del responsable." }, priority: false };
    case "objection": return { stage: "replied", stopSequence: true, suppress: false, task: { kind: "objection", dueOn: soon, note: "Respondió con una objeción: responder breve, sin confrontar." }, priority: false };
    case "high": return { stage: "interested", stopSequence: true, suppress: false, task: { kind: "next_step", dueOn: today, note: "Interés alto: proponer demo." }, priority: true };
    case "medium": case "low": return { stage: "replied", stopSequence: true, suppress: false, task: { kind: "reply", dueOn: soon, note: "Respondió: contestar y proponer un próximo paso." }, priority: false };
    default: return { stage: "replied", stopSequence: true, suppress: false, task: { kind: "review", dueOn: today, note: "Respuesta ambigua: revisar a mano." }, priority: false };
  }
}

// ── Cadencia de seguimiento ─────────────────────────────────────────────────
export type Cadence = { steps: number[]; businessDaysOnly: boolean };
export const DEFAULT_CADENCE: Cadence = { steps: [0, 3, 7, 14], businessDaysOnly: true };
export function validateCadence(c: Partial<Cadence>): string | null {
  const s = c.steps;
  if (!Array.isArray(s) || s.length < 1 || s.length > 6) return "La cadencia tiene entre 1 y 6 pasos.";
  if (s[0] !== 0) return "El primer paso es el día 0 (primer mensaje).";
  for (let i = 1; i < s.length; i++) if (!Number.isInteger(s[i]) || s[i] <= s[i - 1] || s[i] > 60) return "Los días tienen que crecer y no pasar de 60.";
  return null;
}
export type SequenceState = {
  stage: string; suppressed: boolean; firstSentOn: string | null; followupsSent: number; lastSentOn: string | null;
  repliedAfterFirst: boolean; snoozeUntil: string | null; sequenceStopped: boolean;
};
/**
 * Próximo paso de la secuencia de un lead. Último paso de la cadencia = evaluación final y cierre sin respuesta.
 * Nunca propone escribir a quien pidió baja, respondió, está en etapa cerrada o pidió una fecha que todavía no llegó.
 */
export function nextSequenceStep(s: SequenceState, c: Cadence, today: string): { action: "none" | "wait" | "followup" | "close"; dueOn: string | null; step: number | null; why: string } {
  if (s.suppressed || s.stage === "do_not_contact") return { action: "none", dueOn: null, step: null, why: "Pidió no recibir mensajes" };
  if (CLOSED_STAGES.includes(s.stage as LeadStage)) return { action: "none", dueOn: null, step: null, why: "Etapa cerrada" };
  if (s.sequenceStopped || s.repliedAfterFirst || ENGAGED_STAGES.includes(s.stage as LeadStage)) return { action: "none", dueOn: null, step: null, why: "Hay conversación: manda la persona" };
  if (!s.firstSentOn) return { action: "none", dueOn: null, step: null, why: "Todavía no se confirmó el primer envío" };
  const step = s.followupsSent + 1; // 0 es el primer mensaje
  const add = (d: number) => { const raw = addDaysIso(s.firstSentOn as string, d); return c.businessDaysOnly ? nextBusinessDay(raw) : raw; };
  if (step >= c.steps.length) return { action: "none", dueOn: null, step: null, why: "Secuencia terminada" };
  let due = add(c.steps[step]);
  if (s.snoozeUntil && s.snoozeUntil > due) due = s.snoozeUntil;
  const isLast = step === c.steps.length - 1;
  if (due > today) return { action: "wait", dueOn: due, step, why: isLast ? `Evaluación final el ${due}` : `Seguimiento ${step} el ${due}` };
  return isLast ? { action: "close", dueOn: due, step, why: "Sin respuesta al final de la cadencia: cerrar la secuencia" } : { action: "followup", dueOn: due, step, why: `Toca el seguimiento ${step}` };
}

// ── Enlaces de contacto (no envían nada) ────────────────────────────────────
export const waLink = (wa: string, text: string) => `https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
export const gmailComposeLink = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const mailtoLink = (to: string, subject: string, body: string) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
/** Evento para agregar en Google Calendar a mano (sin API): fechas en hora argentina (UTC−3). */
export function calendarLink(title: string, startLocal: string, minutes: number, details: string) {
  const start = new Date(`${startLocal}:00-03:00`);
  const end = new Date(start.getTime() + minutes * 60_000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${f(start)}/${f(end)}&details=${encodeURIComponent(details)}&ctz=America/Argentina/Buenos_Aires`;
}

// ── Métricas ────────────────────────────────────────────────────────────────
/** Clientes que hacen falta para un MRR objetivo con un ticket mensual promedio (socios × precio). Precio = supuesto a validar. */
export function clientsForMrr(targetMinor: number, currentMinor: number, avgMembers: number, unitMinor: number) {
  const ticket = Math.max(1, Math.round(avgMembers * unitMinor));
  const gap = Math.max(0, targetMinor - currentMinor);
  return { ticketMinor: ticket, gapMinor: gap, clients: Math.ceil(gap / ticket) };
}
/** Tasa en % con un decimal; null si no hay base (no se muestra 0 % inventado). */
export const rate = (num: number, den: number) => (den > 0 ? Math.round((num * 1000) / den) / 10 : null);

/** Celda CSV segura: comillas dobles y prefijo ante fórmulas (=, +, -, @) para que una planilla no ejecute nada. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
