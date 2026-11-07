// REPI Sales Force & Commission OS (D209). Reglas puras: estados del vendedor, pipeline, duplicados, vista previa de un
// cierre y motor de comisiones. Nada de esto inventa precios, porcentajes ni reglas fiscales: los planes los define Admin.
// Dinero siempre en unidades menores enteras (centavos). Fechas AAAA-MM-DD en hora argentina.

// ── Vendedor ────────────────────────────────────────────────────────────────
export const REP_STATUS = {
  invited: "Invitado", pending_acceptance: "Pendiente de aceptación", active: "Activo",
  paused: "Pausado", suspended: "Suspendido", terminated: "Desvinculado",
} as const;
export type RepStatus = keyof typeof REP_STATUS;
export const isRepStatus = (x: unknown): x is RepStatus => typeof x === "string" && x in REP_STATUS;

/**
 * Qué puede hacer un vendedor según su estado. Activo: todo lo suyo. Pausado: ve su cartera y su dinero, no carga nada.
 * Suspendido o desvinculado: sólo sus comisiones y liquidaciones (derechos económicos ya devengados), sin CRM.
 */
export function repCapabilities(status: RepStatus) {
  const active = status === "active";
  const crmRead = active || status === "paused";
  const money = active || status === "paused" || status === "suspended" || status === "terminated";
  return { crmRead, crmWrite: active, dealsWrite: active, moneyRead: money, profileWrite: active || status === "paused" };
}

export const ENGAGEMENT = { independent: "Independiente", agency: "Agencia o empresa", employee: "Relación laboral con REPI", other: "Otra" } as const;
export type Engagement = keyof typeof ENGAGEMENT;

export const PAYOUT_FREQUENCY = { per_sale: "Por venta elegible", weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual", custom: "Otra (definida por Admin)" } as const;
export type PayoutFrequency = keyof typeof PAYOUT_FREQUENCY;
export const isPayoutFrequency = (x: unknown): x is PayoutFrequency => typeof x === "string" && x in PAYOUT_FREQUENCY;

const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // m: 1-12
export const addMonthsIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const max = Number(lastOfMonth(target.getUTCFullYear(), target.getUTCMonth() + 1).slice(8));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, max))).toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 domingo

/**
 * Corte de liquidación vigente para una frecuencia: lo disponible hasta esa fecha (inclusive) entra en el borrador.
 * La frecuencia sólo agrupa: nunca cambia importes ni adelanta comisiones que todavía no están disponibles.
 * Semanal: último domingo. Quincenal: día 15 o último día del mes anterior. Mensual: último día del mes anterior.
 * Por venta y «otra»: hoy (Admin decide cuándo generar).
 */
export function payoutCutoff(freq: PayoutFrequency, today: string): string {
  if (freq === "weekly") { const w = weekday(today); return addDays(today, w === 0 ? 0 : -w); }
  const [y, m, d] = today.split("-").map(Number);
  if (freq === "biweekly") return d >= 15 ? `${today.slice(0, 7)}-15` : lastOfMonth(y, m - 1);
  if (freq === "monthly") return lastOfMonth(y, m - 1);
  return today;
}
/** Próxima fecha de corte prevista (para mostrarle al vendedor cuándo se arma su próxima liquidación). */
export function nextPayoutDate(freq: PayoutFrequency, today: string): string | null {
  if (freq === "weekly") { const w = weekday(today); return addDays(today, w === 0 ? 7 : 7 - w); }
  const [y, m, d] = today.split("-").map(Number);
  if (freq === "biweekly") return d < 15 ? `${today.slice(0, 7)}-15` : lastOfMonth(y, m);
  if (freq === "monthly") return lastOfMonth(y, m);
  return null;
}

// ── Pipeline ────────────────────────────────────────────────────────────────
export const STAGES = {
  new: "Prospecto nuevo", contacted: "Contactado", interested: "Interesado", meeting: "Reunión agendada", demo: "Demo realizada",
  proposal: "Propuesta enviada", negotiation: "Negociación", declared: "Cierre declarado", pending_validation: "Pendiente de validación",
  won: "Ganado", lost: "Perdido",
} as const;
export type Stage = keyof typeof STAGES;
export const isStage = (x: unknown): x is Stage => typeof x === "string" && x in STAGES;
/** Etapas que el vendedor mueve libremente (adelante o atrás). */
export const OPEN_STAGES: Stage[] = ["new", "contacted", "interested", "meeting", "demo", "proposal", "negotiation"];
/** Columnas del tablero en orden. */
export const BOARD_STAGES: Stage[] = [...OPEN_STAGES, "declared", "pending_validation", "won", "lost"];

/**
 * Transiciones. El vendedor: entre etapas abiertas, a «cierre declarado» y a «perdido» (con motivo); reabrir un perdido.
 * «Pendiente de validación» lo pone el sistema al enviar la venta; «ganado» sólo lo pone la aprobación de Admin.
 * Ganado ≠ contrato aceptado ≠ pago recibido.
 */
export function canMoveStage(from: Stage, to: Stage, actor: "rep" | "admin" | "system"): boolean {
  if (from === to) return false;
  if (actor === "system") return true;
  if (to === "won" || to === "pending_validation") return false;
  if (from === "won" || from === "pending_validation") return actor === "admin" && to !== "new";
  if (from === "lost") return to === "contacted" || to === "new";
  if (from === "declared") return OPEN_STAGES.includes(to) || to === "lost";
  return OPEN_STAGES.includes(to) || to === "declared" || to === "lost";
}

export const ACTIVITY_KINDS = {
  call: "Llamada", whatsapp: "WhatsApp", email: "Email", visit: "Visita presencial", demo: "Demostración", meeting: "Reunión",
  note: "Nota", task: "Tarea", reminder: "Recordatorio",
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;
export const isActivityKind = (x: unknown): x is ActivityKind => typeof x === "string" && x in ACTIVITY_KINDS;

export const PROSPECT_SOURCES = {
  field: "Visita o contacto propio", referral: "Recomendación", social: "Redes sociales", event: "Evento", web_lead: "Contacto web de REPI",
  referral_link: "Enlace personal del vendedor", repi_ads: "Publicidad de REPI", other: "Otro",
} as const;
export type ProspectSource = keyof typeof PROSPECT_SOURCES;
export const isProspectSource = (x: unknown): x is ProspectSource => typeof x === "string" && x in PROSPECT_SOURCES;

export const OPP_CATEGORY = { hot: "Caliente", warm: "Tibia", cold: "Fría" } as const;
export type OppCategory = keyof typeof OPP_CATEGORY;

// ── Cierre declarado ────────────────────────────────────────────────────────
export const DEAL_STATUS = {
  declared: "Pendiente de revisión", needs_correction: "Corrección pedida", approved: "Aprobada", rejected: "Rechazada", withdrawn: "Retirada",
} as const;
export type DealStatus = keyof typeof DEAL_STATUS;
export const DEAL_KIND = { new: "Cliente nuevo", renewal: "Renovación", modification: "Ampliación o renegociación" } as const;
export type DealKind = keyof typeof DEAL_KIND;
export const BILLING_PERIODICITY = { monthly: ["Mensual", 1], quarterly: ["Trimestral", 3], semiannual: ["Semestral", 6], annual: ["Anual", 12] } as const;
export type BillingPeriodicity = keyof typeof BILLING_PERIODICITY;
export const isBillingPeriodicity = (x: unknown): x is BillingPeriodicity => typeof x === "string" && x in BILLING_PERIODICITY;

/** Redondeo al centavo más cercano, mitades hacia arriba, sin flotantes. */
export const applyBps = (base: number, bps: number) => {
  const v = Number((BigInt(Math.abs(base)) * BigInt(Math.abs(bps)) * 2n + 10000n) / 20000n);
  return Math.sign(base) * Math.sign(bps) < 0 ? -v : v;
};

export type DealTermsInput = {
  members: number; unitPriceMinor: number; periodicity: BillingPeriodicity; contractStart: string;
  durationMonths?: number | null; discountBps?: number | null; setupFeeMinor?: number | null;
};
/**
 * Vista previa del acuerdo: cantidad pactada × precio por socio/mes, descuento, importe por período de facturación y
 * total contractual estimado. Es una estimación de lo pactado: no es una factura, ni lo cobrado, ni la cantidad de
 * usuarios habilitados en la app.
 */
export function dealPreview(p: DealTermsInput) {
  const errors: string[] = [];
  if (!Number.isSafeInteger(p.members) || p.members < 1 || p.members > 10_000_000) errors.push("Cantidad de socios acordada inválida.");
  if (!Number.isSafeInteger(p.unitPriceMinor) || p.unitPriceMinor < 1 || p.unitPriceMinor > 2_147_483_647) errors.push("Precio por socio inválido.");
  if (!isBillingPeriodicity(p.periodicity)) errors.push("Periodicidad inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.contractStart ?? "")) errors.push("Fecha de inicio inválida.");
  const disc = p.discountBps ?? 0;
  if (!Number.isInteger(disc) || disc < 0 || disc > 10000) errors.push("Descuento inválido (0 a 100 %).");
  const dur = p.durationMonths ?? null;
  if (dur !== null && (!Number.isInteger(dur) || dur < 1 || dur > 120)) errors.push("Duración inválida (1 a 120 meses).");
  const setup = p.setupFeeMinor ?? 0;
  if (!Number.isSafeInteger(setup) || setup < 0) errors.push("Cargo inicial inválido.");
  if (errors.length) return { ok: false as const, errors };
  const monthlyGross = p.members * p.unitPriceMinor;
  const discountMinor = applyBps(monthlyGross, disc);
  const monthlyNet = monthlyGross - discountMinor;
  const months = BILLING_PERIODICITY[p.periodicity][1];
  const perPeriod = monthlyNet * months;
  const total = dur ? monthlyNet * dur + setup : null;
  const effectiveUnit = disc ? p.unitPriceMinor - applyBps(p.unitPriceMinor, disc) : p.unitPriceMinor;
  if (![monthlyGross, perPeriod, total ?? 0].every(Number.isSafeInteger)) return { ok: false as const, errors: ["Importe fuera de rango."] };
  return {
    ok: true as const, monthlyGross, discountMinor, monthlyNet, perPeriod, periodMonths: months, setupFeeMinor: setup, totalContract: total, effectiveUnitMinor: effectiveUnit,
    reviewOn: dur ? addMonthsIso(p.contractStart, dur) : addMonthsIso(p.contractStart, 12),
  };
}

// ── Duplicados ──────────────────────────────────────────────────────────────
const GENERIC_DOMAINS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.ar", "live.com", "icloud.com", "hotmail.com.ar", "outlook.com.ar", "protonmail.com"]);
const NOISE = /\b(gym|gimnasio|gimnasios|fitness|club|centro|studio|estudio|box|crossfit|training|sa|srl|sas|s\.a\.|s\.r\.l\.|el|la|los|las|de|del)\b/g;
export const normalizeBusinessName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const domainOf = (email: string | null | undefined, web: string | null | undefined) => {
  const e = (email ?? "").trim().toLowerCase().split("@")[1];
  if (e && !GENERIC_DOMAINS.has(e)) return e;
  const host = (web ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
};
export type DupCandidate = { name: string; cuit?: string | null; email?: string | null; phone?: string | null; website?: string | null; city?: string | null };
export type DupSignal = "cuit" | "email" | "phone" | "domain" | "name" | "name_city";
export const DUP_SIGNAL_LABEL: Record<DupSignal, string> = { cuit: "CUIT", email: "email", phone: "teléfono", domain: "dominio web", name: "nombre", name_city: "nombre y ciudad" };
/**
 * Señales de posible duplicado. «Fuerte» = CUIT, email o teléfono iguales. Un nombre parecido solo es «posible».
 * Nunca fusiona: devuelve señales para mostrar una advertencia y pedir revisión.
 */
export function duplicateSignals(a: DupCandidate, b: DupCandidate): { signals: DupSignal[]; strong: boolean } {
  const s: DupSignal[] = [];
  const ca = digits(a.cuit), cb = digits(b.cuit);
  if (ca.length === 11 && ca === cb) s.push("cuit");
  const ea = (a.email ?? "").trim().toLowerCase(), eb = (b.email ?? "").trim().toLowerCase();
  if (ea && ea === eb) s.push("email");
  const pa = digits(a.phone).slice(-8), pb = digits(b.phone).slice(-8);
  if (pa.length === 8 && pa === pb) s.push("phone");
  const da = domainOf(a.email, a.website), db = domainOf(b.email, b.website);
  if (da && da === db && !s.includes("email")) s.push("domain");
  const na = normalizeBusinessName(a.name), nb = normalizeBusinessName(b.name);
  if (na.length >= 3 && na === nb) {
    const sameCity = !!a.city && !!b.city && normalizeBusinessName(a.city) === normalizeBusinessName(b.city);
    s.push(sameCity ? "name_city" : "name");
  }
  return { signals: s, strong: s.some((x) => x === "cuit" || x === "email" || x === "phone" || x === "name_city") };
}

// ── Planes de comisión ──────────────────────────────────────────────────────
export type OneOffTrigger = "deal_approved" | "contract_enabled" | "first_payment";
export const TRIGGER_LABEL: Record<OneOffTrigger, string> = { deal_approved: "Al aprobarse la venta", contract_enabled: "Al habilitarse el cliente", first_payment: "Al registrarse el primer cobro" };
export type CommissionComponent =
  | { type: "fixed_per_sale"; amountMinor: number; trigger: OneOffTrigger }
  | { type: "first_payment_pct"; bps: number }
  | { type: "recurring_pct"; bps: number; months: number }
  | { type: "per_member"; amountMinor: number; trigger: OneOffTrigger; maxMembers?: number | null }
  | { type: "tier_bonus"; metric: "approved_deals" | "agreed_members"; tiers: { min: number; amountMinor: number }[] }
  /** % del primer mes cobrado, con el porcentaje según los socios acordados del gimnasio (tramos «desde N socios»). */
  | { type: "first_month_by_members"; brackets: MemberBracket[] };
export type MemberBracket = { minMembers: number; bps: number };
/** Tramo que corresponde a una cantidad de socios: el de mayor mínimo que se cumple (null = por debajo del primero). */
export function bracketFor(brackets: MemberBracket[], members: number): MemberBracket | null {
  return [...brackets].sort((a, b) => a.minMembers - b.minMembers).filter((b) => members >= b.minMembers).at(-1) ?? null;
}
/** «50 a 299 socios → 35 % · 300 a 399 → 50 % · 400 o más → 65 %». */
export function describeBrackets(brackets: MemberBracket[]): string {
  const pct = (b: number) => `${(b / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
  const s = [...brackets].sort((a, b) => a.minMembers - b.minMembers);
  return s.map((b, i) => `${i + 1 < s.length ? `${b.minMembers} a ${s[i + 1].minMembers - 1}` : `${b.minMembers} o más`} socios → ${pct(b.bps)}`).join(" · ");
}
export const COMPONENT_LABEL: Record<CommissionComponent["type"], string> = {
  fixed_per_sale: "Monto fijo por venta", first_payment_pct: "Porcentaje del primer cobro", recurring_pct: "Porcentaje recurrente",
  per_member: "Monto por socio acordado", tier_bonus: "Bono escalonado mensual", first_month_by_members: "Porcentaje del primer mes según socios",
};
export type CommissionRules = {
  currency: "ARS" | "USD";
  components: CommissionComponent[];
  /** Días desde que se devenga hasta que queda disponible para liquidar. */
  holdDays: number;
  /** Mínimo para incluir al vendedor en una liquidación (lo menor queda disponible para la siguiente). */
  minPayoutMinor: number;
  /** Tope por venta y vendedor (suma de todos sus componentes). null = sin tope. */
  capPerDealMinor: number | null;
  /** Qué pasa con los cobros posteriores a la suspensión o fin del contrato. */
  onContractStop: "stop" | "continue";
  /** Qué pasa con los cobros posteriores a la desvinculación del vendedor (lo ya devengado nunca se pierde). */
  afterTermination: "stop" | "continue";
  /** Exclusiones y condiciones contractuales en texto (constancia del acuerdo real). */
  notes?: string | null;
};
const isMoney = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 100_000_000_000;
const isBps = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 10000;

/** Valida un plan completo. Devuelve los errores en español (vacío = válido). No completa valores que falten. */
export function validateRules(r: Partial<CommissionRules> | null | undefined): string[] {
  const e: string[] = [];
  if (!r) return ["Falta el plan."];
  if (r.currency !== "ARS" && r.currency !== "USD") e.push("Elegí la moneda del plan.");
  if (!Array.isArray(r.components) || !r.components.length) e.push("Agregá al menos un componente de comisión.");
  if (!Number.isInteger(r.holdDays) || r.holdDays! < 0 || r.holdDays! > 365) e.push("Días de retención inválidos (0 a 365).");
  if (!isMoney(r.minPayoutMinor)) e.push("Mínimo de liquidación inválido.");
  if (r.capPerDealMinor !== null && r.capPerDealMinor !== undefined && (!isMoney(r.capPerDealMinor) || r.capPerDealMinor === 0)) e.push("Tope por venta inválido.");
  if (r.onContractStop !== "stop" && r.onContractStop !== "continue") e.push("Definí qué pasa si el contrato se suspende o termina.");
  if (r.afterTermination !== "stop" && r.afterTermination !== "continue") e.push("Definí qué pasa con cobros posteriores a la desvinculación.");
  for (const [i, c] of (r.components ?? []).entries()) {
    const n = `Componente ${i + 1}`;
    const trig = (t: unknown) => t === "deal_approved" || t === "contract_enabled" || t === "first_payment";
    if (c.type === "fixed_per_sale") { if (!isMoney(c.amountMinor) || !c.amountMinor || !trig(c.trigger)) e.push(`${n}: monto y momento.`); }
    else if (c.type === "first_payment_pct") { if (!isBps(c.bps)) e.push(`${n}: porcentaje entre 0,01 y 100.`); }
    else if (c.type === "recurring_pct") { if (!isBps(c.bps) || !Number.isInteger(c.months) || c.months < 1 || c.months > 120) e.push(`${n}: porcentaje y cantidad de meses (1 a 120).`); }
    else if (c.type === "per_member") { if (!isMoney(c.amountMinor) || !c.amountMinor || !trig(c.trigger) || (c.maxMembers != null && (!Number.isInteger(c.maxMembers) || c.maxMembers < 1))) e.push(`${n}: monto por socio y momento.`); }
    else if (c.type === "tier_bonus") {
      const ok = (c.metric === "approved_deals" || c.metric === "agreed_members") && Array.isArray(c.tiers) && c.tiers.length > 0 && c.tiers.length <= 10
        && c.tiers.every((t, j) => Number.isInteger(t.min) && t.min > 0 && isMoney(t.amountMinor) && t.amountMinor > 0 && (j === 0 || t.min > c.tiers[j - 1].min));
      if (!ok) e.push(`${n}: escalones con mínimo creciente y bono.`);
    } else if (c.type === "first_month_by_members") {
      const b = c.brackets;
      const ok = Array.isArray(b) && b.length > 0 && b.length <= 10
        && b.every((t, j) => Number.isInteger(t.minMembers) && t.minMembers >= 1 && t.minMembers <= 1_000_000 && isBps(t.bps) && (j === 0 || t.minMembers > b[j - 1].minMembers));
      if (!ok) e.push(`${n}: cada tramo necesita «desde cuántos socios» (creciente, sin repetir) y un porcentaje entre 0,01 y 100.`);
    } else e.push(`${n}: tipo desconocido.`);
  }
  return e;
}
/** Una línea legible por componente (para el vendedor y Admin). */
export function describeComponent(c: CommissionComponent, money: (m: number) => string): string {
  const pct = (b: number) => `${(b / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
  switch (c.type) {
    case "fixed_per_sale": return `${money(c.amountMinor)} por venta · ${TRIGGER_LABEL[c.trigger].toLowerCase()}`;
    case "first_payment_pct": return `${pct(c.bps)} del primer cobro registrado`;
    case "recurring_pct": return `${pct(c.bps)} de cada cobro registrado durante ${c.months} ${c.months === 1 ? "mes" : "meses"} desde el inicio`;
    case "per_member": return `${money(c.amountMinor)} por socio acordado${c.maxMembers ? ` (hasta ${c.maxMembers})` : ""} · ${TRIGGER_LABEL[c.trigger].toLowerCase()}`;
    case "tier_bonus": return `Bono mensual por ${c.metric === "approved_deals" ? "ventas aprobadas" : "socios acordados"}: ${c.tiers.map((t) => `${t.min}+ → ${money(t.amountMinor)}`).join(" · ")}`;
    case "first_month_by_members": return `Del primer mes cobrado, según los socios del gimnasio: ${describeBrackets(c.brackets)}`;
  }
}

/** Reparto entre vendedores (sólo si Admin lo configura). Suma exacta 100 %. */
export type Split = { repId: string; shareBps: number }[];
export function validateSplit(s: Split): string | null {
  if (!Array.isArray(s) || !s.length || s.length > 5) return "El reparto necesita entre 1 y 5 vendedores.";
  if (new Set(s.map((x) => x.repId)).size !== s.length) return "Un vendedor aparece dos veces en el reparto.";
  if (s.some((x) => !Number.isInteger(x.shareBps) || x.shareBps <= 0)) return "Cada parte del reparto tiene que ser mayor que cero.";
  if (s.reduce((a, x) => a + x.shareBps, 0) !== 10000) return "El reparto tiene que sumar 100 %.";
  return null;
}
/** Divide un importe según el reparto; la diferencia de redondeo va al primero, así la suma es exacta. */
export function splitAmount(amount: number, split: Split): { repId: string; amount: number }[] {
  const parts = split.map((x) => ({ repId: x.repId, amount: applyBps(amount, x.shareBps) }));
  const diff = amount - parts.reduce((a, p) => a + p.amount, 0);
  if (parts.length) parts[0].amount += diff;
  return parts;
}

export type LedgerPayment = { id: string; amountMinor: number; currency: string; receivedOn: string; status: "recorded" | "voided"; createdAt?: string };
export type DealForCommission = {
  id: string; kind: DealKind; currency: string; contractStart: string; approvedOn: string; members: number; previousMembers: number;
  split: Split; contractEnabledOn: string | null; contractStoppedOn: string | null;
  /** Meses que cubre cada cobro (1 mensual, 3 trimestral…). El «primer mes» de un cobro trimestral es un tercio. */
  periodicityMonths?: number;
};
export type DesiredEntry = {
  key: string; repId: string; componentIndex: number; component: CommissionComponent["type"]; sourceType: "deal" | "payment"; sourceId: string;
  baseMinor: number; rateBps: number | null; amountMinor: number; currency: string; accrualOn: string; concept: string;
};
export type Exclusion = { componentIndex: number; reason: string; sourceId?: string };

/**
 * Lo que corresponde devengar para una venta aprobada según el plan congelado en la aprobación. Determinista e
 * idempotente: cada asiento tiene una clave estable. Los porcentajes sólo se aplican sobre cobros registrados y no
 * anulados (un cierre o una simulación no son un cobro). `payments` son los cobros del contrato que corresponden a esta
 * venta. `repTerminatedOn` por vendedor del reparto.
 */
export function desiredEntries(rules: CommissionRules, deal: DealForCommission, payments: LedgerPayment[], repTerminatedOn: Record<string, string | null>, today: string) {
  const out: DesiredEntry[] = [];
  const excluded: Exclusion[] = [];
  const live = payments.filter((p) => p.status === "recorded" && p.receivedOn >= deal.contractStart && p.receivedOn <= today)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
  const first = live[0] ?? null;
  const triggerDate = (t: OneOffTrigger) => t === "deal_approved" ? deal.approvedOn : t === "contract_enabled" ? deal.contractEnabledOn : first?.receivedOn ?? null;
  const stopped = (date: string) => rules.onContractStop === "stop" && !!deal.contractStoppedOn && date >= deal.contractStoppedOn;
  const push = (i: number, comp: CommissionComponent, sourceType: DesiredEntry["sourceType"], sourceId: string, base: number, rate: number | null, amount: number, currency: string, date: string, concept: string) => {
    if (amount <= 0) return;
    for (const part of splitAmount(amount, deal.split)) {
      const term = repTerminatedOn[part.repId];
      if (term && date > term && rules.afterTermination === "stop") { excluded.push({ componentIndex: i, reason: "Posterior a la desvinculación del vendedor (regla del plan).", sourceId }); continue; }
      out.push({ key: `${deal.id}:${i}:${sourceType}:${sourceId}:${part.repId}`, repId: part.repId, componentIndex: i, component: comp.type, sourceType, sourceId,
        baseMinor: base, rateBps: rate, amountMinor: part.amount, currency, accrualOn: date, concept });
    }
  };
  rules.components.forEach((c, i) => {
    if (c.type === "fixed_per_sale" || c.type === "per_member") {
      if (deal.currency !== rules.currency) { excluded.push({ componentIndex: i, reason: `La venta es en ${deal.currency} y el monto fijo del plan en ${rules.currency}.` }); return; }
      const date = triggerDate(c.trigger);
      if (!date || date > today) { excluded.push({ componentIndex: i, reason: `Todavía no ocurrió: ${TRIGGER_LABEL[c.trigger].toLowerCase()}.` }); return; }
      if (stopped(date)) { excluded.push({ componentIndex: i, reason: "El contrato se suspendió o terminó antes del evento (regla del plan)." }); return; }
      if (c.type === "fixed_per_sale") push(i, c, "deal", deal.id, c.amountMinor, null, c.amountMinor, rules.currency, date, COMPONENT_LABEL[c.type]);
      else {
        const base = deal.kind === "new" ? deal.members : Math.max(0, deal.members - deal.previousMembers);
        const n = c.maxMembers ? Math.min(base, c.maxMembers) : base;
        if (!n) { excluded.push({ componentIndex: i, reason: "Sin socios adicionales sobre la cantidad anterior." }); return; }
        push(i, c, "deal", deal.id, n, null, n * c.amountMinor, rules.currency, date, `${COMPONENT_LABEL[c.type]} (${n} socios)`);
      }
    } else if (c.type === "first_payment_pct") {
      if (!first) { excluded.push({ componentIndex: i, reason: "Todavía no hay un cobro registrado." }); return; }
      if (stopped(first.receivedOn)) { excluded.push({ componentIndex: i, reason: "Cobro posterior a la suspensión o fin del contrato (regla del plan).", sourceId: first.id }); return; }
      push(i, c, "payment", first.id, first.amountMinor, c.bps, applyBps(first.amountMinor, c.bps), first.currency, first.receivedOn, `${COMPONENT_LABEL[c.type]} (${first.receivedOn})`);
    } else if (c.type === "first_month_by_members") {
      if (!first) { excluded.push({ componentIndex: i, reason: "Todavía no hay un cobro registrado." }); return; }
      if (stopped(first.receivedOn)) { excluded.push({ componentIndex: i, reason: "Cobro posterior a la suspensión o fin del contrato (regla del plan).", sourceId: first.id }); return; }
      const b = bracketFor(c.brackets, deal.members);
      if (!b) { excluded.push({ componentIndex: i, reason: `${deal.members} socios: menos que el primer tramo del plan (${Math.min(...c.brackets.map((x) => x.minMembers))}).` }); return; }
      const months = Math.max(1, deal.periodicityMonths ?? 1);
      const base = months > 1 ? Math.round(first.amountMinor / months) : first.amountMinor;
      push(i, c, "payment", first.id, base, b.bps, applyBps(base, b.bps), first.currency, first.receivedOn, `Primer mes (${deal.members} socios, ${(b.bps / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %)`);
    } else if (c.type === "recurring_pct") {
      const until = addMonthsIso(deal.contractStart, c.months);
      if (!live.length) { excluded.push({ componentIndex: i, reason: "Todavía no hay cobros registrados." }); return; }
      for (const p of live) {
        if (p.receivedOn >= until) { excluded.push({ componentIndex: i, reason: `Fuera de los ${c.months} meses comisionables.`, sourceId: p.id }); continue; }
        if (stopped(p.receivedOn)) { excluded.push({ componentIndex: i, reason: "Cobro posterior a la suspensión o fin del contrato (regla del plan).", sourceId: p.id }); continue; }
        push(i, c, "payment", p.id, p.amountMinor, c.bps, applyBps(p.amountMinor, c.bps), p.currency, p.receivedOn, `${COMPONENT_LABEL[c.type]} (cobro ${p.receivedOn})`);
      }
    }
    // tier_bonus se evalúa por mes y vendedor (tierBonusFor), no por venta.
  });
  // Tope por venta y vendedor, en orden cronológico: lo que excede no se devenga.
  if (rules.capPerDealMinor) {
    const used = new Map<string, number>();
    for (const e of out.sort((a, b) => a.accrualOn.localeCompare(b.accrualOn) || a.key.localeCompare(b.key))) {
      const u = used.get(e.repId) ?? 0;
      const room = Math.max(0, rules.capPerDealMinor - u);
      if (e.amountMinor > room) { excluded.push({ componentIndex: e.componentIndex, reason: "Tope por venta alcanzado (regla del plan).", sourceId: e.sourceId }); e.amountMinor = room; }
      used.set(e.repId, u + e.amountMinor);
    }
  }
  return { entries: out.filter((e) => e.amountMinor > 0), excluded };
}

/** Escalón alcanzado (el más alto cuyo mínimo se cumple). */
export function tierBonusFor(tiers: { min: number; amountMinor: number }[], value: number) {
  const hit = tiers.filter((t) => value >= t.min).at(-1);
  return hit ? hit : null;
}

export type ExistingEntry = { key: string; amountMinor: number; reversalOf: string | null };
/**
 * Compara lo devengado con lo que corresponde hoy. Nunca modifica un asiento: agrega los que faltan y revierte con un
 * asiento negativo los que dejaron de corresponder (cobro anulado, primer cobro que cambió). Un asiento revertido que
 * vuelve a corresponder se registra con una clave nueva (`#2`, `#3`…), así el historial queda completo.
 */
export function diffLedger(existing: ExistingEntry[], desired: DesiredEntry[]) {
  const positives = existing.filter((e) => !e.reversalOf);
  const reversed = new Set(existing.filter((e) => e.reversalOf).map((e) => e.reversalOf!));
  const liveByBase = new Map<string, ExistingEntry>();
  const countByBase = new Map<string, number>();
  for (const e of positives) {
    const base = e.key.replace(/#\d+$/, "");
    countByBase.set(base, (countByBase.get(base) ?? 0) + 1);
    if (!reversed.has(e.key)) liveByBase.set(base, e);
  }
  const want = new Map(desired.map((d) => [d.key, d]));
  const add: (DesiredEntry & { finalKey: string })[] = [];
  for (const d of desired) {
    if (liveByBase.has(d.key)) continue;
    const n = countByBase.get(d.key) ?? 0;
    add.push({ ...d, finalKey: n ? `${d.key}#${n + 1}` : d.key });
  }
  const reverse = [...liveByBase.entries()].filter(([base]) => !want.has(base)).map(([, e]) => e);
  return { add, reverse };
}

/** Estado visible de un asiento para el vendedor y Admin. */
export type EntryState = "accrued" | "available" | "in_payout" | "paid" | "reversed" | "adjustment";
export const ENTRY_STATE_LABEL: Record<EntryState | "estimated" | "pending_validation", string> = {
  estimated: "Estimada", pending_validation: "Pendiente de validación", accrued: "Devengada", available: "Disponible para liquidar",
  in_payout: "En proceso de liquidación", paid: "Pagada", reversed: "Revertida", adjustment: "Ajuste",
};
export function entryState(e: { amountMinor: number; availableOn: string; reversed: boolean; payoutStatus: string | null; isReversal: boolean }, today: string): EntryState {
  if (e.payoutStatus === "paid") return "paid";
  if (e.payoutStatus === "draft" || e.payoutStatus === "approved" || e.payoutStatus === "partially_paid") return "in_payout";
  if (e.reversed && !e.isReversal) return "reversed";
  return e.availableOn <= today ? "available" : "accrued";
}
export const holdUntil = (accrualOn: string, holdDays: number) => addDays(accrualOn, holdDays);

// ── Objetivos y material ────────────────────────────────────────────────────
export const TARGET_METRICS = {
  new_clients: "Gimnasios o coaches nuevos aprobados", contacts: "Contactos comerciales registrados", meetings: "Reuniones", demos: "Demostraciones",
  approved_deals: "Ventas aprobadas", agreed_members: "Socios contratados", contract_value: "Valor mensual contratado",
} as const;
export type TargetMetric = keyof typeof TARGET_METRICS;
export const isTargetMetric = (x: unknown): x is TargetMetric => typeof x === "string" && x in TARGET_METRICS;

export const MATERIAL_KINDS = {
  video: "Video", presentation: "Presentación", pdf: "PDF para gimnasios", flyer: "Folleto", image: "Imagen", feature: "Funcionalidad",
  faq: "Pregunta frecuente", objection: "Objeción habitual", script: "Guion de venta", implementation: "Implementación", conditions: "Condiciones comerciales autorizadas",
} as const;
export type MaterialKind = keyof typeof MATERIAL_KINDS;
export const isMaterialKind = (x: unknown): x is MaterialKind => typeof x === "string" && x in MATERIAL_KINDS;

/** Código comercial legible y sin caracteres ambiguos: V-XXXXXX. */
export const repCodeFrom = (bytes: Uint8Array) => {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `V-${Array.from(bytes.slice(0, 6), (b) => A[b % A.length]).join("")}`;
};
export const isRepCode = (x: unknown): x is string => typeof x === "string" && /^V-[A-HJ-NP-Z2-9]{6}$/.test(x);

/** Faltantes de una oportunidad para avanzar (asistencia determinista, sin IA). */
export function missingOpportunityFields(o: { contactName?: string | null; phone?: string | null; email?: string | null; estMembers?: number | null; estUnitPriceMinor?: number | null; nextContactOn?: string | null; expectedCloseOn?: string | null; stage: Stage }) {
  const m: string[] = [];
  if (!o.contactName) m.push("contacto");
  if (!o.phone && !o.email) m.push("teléfono o email");
  if (o.stage !== "new" && !o.estMembers) m.push("socios estimados");
  if (["proposal", "negotiation", "declared"].includes(o.stage) && !o.estUnitPriceMinor) m.push("precio estimado por socio");
  if (OPEN_STAGES.includes(o.stage) && !o.nextContactOn) m.push("próximo contacto");
  if (["proposal", "negotiation"].includes(o.stage) && !o.expectedCloseOn) m.push("fecha estimada de cierre");
  return m;
}
