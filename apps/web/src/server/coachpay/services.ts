// Cobros manuales del coach a sus clientes (F-BL-01, F-CO-17, F-HX-06; D80). Fuente: REPI Desktop Coach (SCR-C pagos):
// KPIs cobrado/por cobrar/vencido, tabla por cliente y «Registrar pago». Es un registro: REPI no cobra ni mueve dinero,
// y nada de esto se mezcla con lo que REPI le factura al coach. Anular exige motivo y no borra el cargo.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { isCurrency, localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireCoach } from "../training/services";

const { coachCharge, coachClient, user, organization } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const METHODS = ["efectivo", "transferencia", "otro"] as const;
type Method = (typeof METHODS)[number];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

type Row = typeof coachCharge.$inferSelect;
const view = (c: Row, today: string) => ({
  id: c.id, coachClientId: c.coachClientId, concept: c.concept, amountMinor: c.amountMinor, currency: c.currency, dueOn: c.dueOn,
  status: c.status, overdue: c.status === "pending" && c.dueOn < today, paidOn: c.paidOn, method: c.method, note: c.note, voidReason: c.voidReason, createdAt: c.createdAt,
});

/** Totales por moneda (no se suman ARS con USD). */
function totals(rows: Row[], today: string) {
  const month = today.slice(0, 7);
  const by: Record<string, { collectedMonth: number; pending: number; overdue: number }> = {};
  for (const c of rows) {
    const t = (by[c.currency] ??= { collectedMonth: 0, pending: 0, overdue: 0 });
    if (c.status === "paid" && c.paidOn?.startsWith(month)) t.collectedMonth += c.amountMinor;
    if (c.status === "pending") { if (c.dueOn < today) t.overdue += c.amountMinor; else t.pending += c.amountMinor; }
  }
  return by;
}

async function clientOf(orgId: string, coachClientId: string) {
  const [r] = await db.select({ id: coachClient.id, name: user.name, status: coachClient.status }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(coachClient.id, coachClientId), eq(coachClient.coachOrgId, orgId)));
  if (!r) throw NOT_FOUND();
  return r;
}
async function chargeOf(orgId: string, id: string) {
  const [c] = await db.select().from(coachCharge).where(and(eq(coachCharge.id, id), eq(coachCharge.coachOrgId, orgId)));
  if (!c) throw NOT_FOUND();
  return c;
}

/** Pantalla «Cobros a alumnos»: KPIs del mes y estado por cliente. */
export async function coachPayments(actorId: string, orgId: string, now = new Date()) {
  await requireCoach(actorId, orgId);
  const today = localDate(now);
  const rows = await db.select().from(coachCharge).where(eq(coachCharge.coachOrgId, orgId)).orderBy(asc(coachCharge.dueOn));
  const clients = await db.select({ id: coachClient.id, name: user.name, status: coachClient.status }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(eq(coachClient.coachOrgId, orgId)).orderBy(asc(user.name));
  return {
    today, totals: totals(rows, today),
    clients: clients.map((cl) => {
      const mine = rows.filter((r) => r.coachClientId === cl.id);
      const open = mine.filter((r) => r.status === "pending");
      const next = open[0] ?? null;
      const lastPaid = mine.filter((r) => r.status === "paid").sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? ""))[0] ?? null;
      return { id: cl.id, name: cl.name, status: cl.status, next: next ? view(next, today) : null, openCount: open.length, lastPaidOn: lastPaid?.paidOn ?? null };
    }),
  };
}

/** Pestaña «Pagos» de la ficha: historial completo del cliente. */
export async function clientCharges(actorId: string, orgId: string, coachClientId: string, now = new Date()) {
  await requireCoach(actorId, orgId);
  await clientOf(orgId, coachClientId);
  const today = localDate(now);
  const rows = await db.select().from(coachCharge).where(and(eq(coachCharge.coachOrgId, orgId), eq(coachCharge.coachClientId, coachClientId))).orderBy(desc(coachCharge.dueOn));
  return { today, totals: totals(rows, today), charges: rows.map((r) => view(r, today)) };
}

export async function createCharge(actorId: string, orgId: string, p: { coachClientId: string; concept: string; amountMinor: number; currency: string; dueOn: string }) {
  await requireCoach(actorId, orgId);
  const cl = await clientOf(orgId, p.coachClientId);
  if (cl.status === "ended") throw new AccessError("invalid", `${cl.name} ya no es tu cliente.`);
  const concept = p.concept?.trim().slice(0, 120);
  if (!concept) throw new AccessError("invalid", "Escribí el concepto (por ejemplo, «Plan mensual noviembre»).");
  if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0 || p.amountMinor > 1_000_000_000) throw new AccessError("invalid", "El importe tiene que ser mayor a cero.");
  if (!isCurrency(p.currency)) throw new AccessError("invalid", "Moneda no admitida.");
  if (!isDay(p.dueOn)) throw new AccessError("invalid", "Elegí la fecha de vencimiento.");
  const [c] = await db.insert(coachCharge).values({ coachOrgId: orgId, coachClientId: p.coachClientId, concept, amountMinor: p.amountMinor, currency: p.currency, dueOn: p.dueOn, createdBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "coach_charge.created", resourceType: "coach_charge", resourceId: c.id, meta: { amountMinor: c.amountMinor, currency: c.currency } });
  return view(c, localDate(new Date()));
}

export async function registerPayment(actorId: string, orgId: string, id: string, p: { paidOn: string; method: string; note?: string | null }) {
  await requireCoach(actorId, orgId);
  const c = await chargeOf(orgId, id);
  if (c.status !== "pending") throw new AccessError("invalid", c.status === "paid" ? "Ese cargo ya figura pagado." : "Ese cargo está anulado.");
  if (!isDay(p.paidOn) || p.paidOn > localDate(new Date())) throw new AccessError("invalid", "La fecha de pago no puede ser futura.");
  if (!(METHODS as readonly string[]).includes(p.method)) throw new AccessError("invalid", "Elegí cómo te pagó.");
  const [u] = await db.update(coachCharge).set({ status: "paid", paidOn: p.paidOn, method: p.method as Method, note: p.note?.trim().slice(0, 300) || null, updatedAt: new Date() })
    .where(and(eq(coachCharge.id, id), eq(coachCharge.status, "pending"))).returning();
  if (!u) throw new AccessError("invalid", "Ese cargo cambió mientras lo editabas. Recargá.");
  await audit(db, { actorUserId: actorId, orgId, action: "coach_charge.paid", resourceType: "coach_charge", resourceId: id, meta: { method: p.method } });
  return view(u, localDate(new Date()));
}

/** Anular: el cargo queda en el historial con su motivo (también uno pagado, si se registró por error). */
export async function voidCharge(actorId: string, orgId: string, id: string, reason: string) {
  await requireCoach(actorId, orgId);
  const c = await chargeOf(orgId, id);
  if (c.status === "void") throw new AccessError("invalid", "Ese cargo ya está anulado.");
  const why = reason?.trim().slice(0, 200);
  if (!why) throw new AccessError("invalid", "Escribí el motivo de la anulación.");
  const [u] = await db.update(coachCharge).set({ status: "void", voidReason: why, updatedAt: new Date() }).where(eq(coachCharge.id, id)).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "coach_charge.voided", resourceType: "coach_charge", resourceId: id, meta: { previous: c.status } });
  return view(u, localDate(new Date()));
}

/** Vista del alumno (F-HX-06): sus cargos con cada coach. Nunca los de otras personas ni la suscripción REPI del coach. */
export async function myCharges(userId: string, now = new Date()) {
  const today = localDate(now);
  const rels = await db.select({ id: coachClient.id, org: organization.name }).from(coachClient).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(eq(coachClient.userId, userId));
  if (!rels.length) return { today, coaches: [] };
  const rows = await db.select().from(coachCharge).where(inArray(coachCharge.coachClientId, rels.map((r) => r.id))).orderBy(desc(coachCharge.dueOn));
  return {
    today,
    coaches: rels.map((r) => {
      const mine = rows.filter((c) => c.coachClientId === r.id);
      return { coach: r.org, totals: totals(mine, today), charges: mine.filter((c) => c.status !== "void" || c.paidOn).map((c) => view(c, today)) };
    }).filter((x) => x.charges.length),
  };
}
