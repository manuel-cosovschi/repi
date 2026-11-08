// Incidente 07/11 (pedido de /api/admin colgado 300 s): con el pool de producción (Vercel: 3 conexiones), varias aprobaciones
// o liquidaciones simultáneas de lo mismo se trababan para siempre. Cada una retenía su conexión (bloqueo de fila o advisory
// lock) y dentro de la transacción pedía otra al db global; con las 3 tomadas, ninguna terminaba y la instancia entera quedaba
// sin base. Estas pruebas usan el cliente real de src/db con VERCEL=1 y fallan por tiempo (no se cuelgan) si vuelve a pasar.
import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { localDate, type CommissionRules } from "@repi/domain";

vi.mock("@/db", async (importOriginal) => {
  const g = globalThis as { __repiSql?: unknown };
  const prev = { vercel: process.env.VERCEL, sql: g.__repiSql };
  process.env.VERCEL = "1";
  delete g.__repiSql;
  try { return await importOriginal<typeof import("@/db")>(); } finally {
    if (prev.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = prev.vercel;
    g.__repiSql = prev.sql; // el cliente de 3 conexiones no queda cacheado para otros archivos
  }
});

const { db, schema, sqlClient, POOL_OPTIONS } = await import("@/db");
const cm = await import("@/server/commercial/services");
const reps = await import("@/server/sales/reps");
const deals = await import("@/server/sales/deals");
const com = await import("@/server/sales/commissions");
const pay = await import("@/server/sales/payouts");
const { withDeadline } = await import("@/server/deadline");

afterAll(async () => { await sqlClient.end({ timeout: 1 }); });

const uid = () => randomUUID();
const k = () => randomUUID().replace(/-/g, "");
async function admin() {
  const id = uid();
  await db.insert(schema.user).values({ id, name: "Admin pool", email: `${id}@test.repi.local`, emailVerified: true, platformRole: "admin", twoFactorEnabled: true });
  return id;
}
async function onboardRep(adminId: string) {
  const email = `${uid()}@vendedor.repi.local`;
  const r = await reps.createRep(adminId, { name: "Vendedora Pool", email, province: "Córdoba", city: "Córdoba" });
  await reps.sendRepInvitation(adminId, r.id);
  const userId = uid();
  await db.insert(schema.user).values({ id: userId, name: "Vendedora Pool", email, emailVerified: true });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await reps.acceptRepInvitation(userId, m.body.match(/\/ventas\/activar\/([A-Za-z0-9_-]+)/)![1]);
  return { repId: r.id, userId };
}
const RULES: CommissionRules = {
  currency: "ARS", components: [{ type: "fixed_per_sale", amountMinor: 20000_00, trigger: "contract_enabled" }],
  holdDays: 0, minPayoutMinor: 0, capPerDealMinor: null, onContractStop: "stop", afterTermination: "stop",
};
async function declared(userId: string) {
  return deals.declareDeal(userId, {
    idempotencyKey: k(), clientKind: "gym", businessName: `Gimnasio Pool ${k().slice(0, 8)}`, contactName: "Dueña Pool", contactEmail: `${uid()}@cliente.repi.local`,
    members: 300, unitPriceMinor: 500_00, currency: "ARS", periodicity: "monthly", contractStart: "2026-10-01", durationMonths: 12, evidence: "Propuesta firmada P-POOL (prueba)", closedOn: "2026-10-01",
  });
}
const approveInput = (revision: number) => ({ revision, link: { mode: "create" as const }, quantity: 300, unitPriceMinor: 500_00, effectiveFrom: "2026-10-01", applyTerms: true });
/** Una consulta cualquiera de otro pedido en la misma instancia (lo que carga REPI Admin): tiene que conseguir conexión. */
const victim = () => withDeadline(db.select({ n: sql<number>`1` }).from(schema.user).limit(1), 3_000, "otra consulta del mismo proceso");

describe("pool de 3 conexiones (Vercel)", () => {
  it("usa la configuración de producción", () => {
    expect(POOL_OPTIONS).toMatchObject({ max: 3, idle_timeout: 20, max_lifetime: 300, connect_timeout: 10 });
  });

  it("tres aprobaciones simultáneas de la misma venta: una aprueba, dos responden «stale» y el pool sigue libre", async () => {
    const a = await admin();
    const { userId } = await onboardRep(a);
    const d = await declared(userId);
    const rev = (await deals.dealReview(a, d.id)).deal.revision;
    const out = await withDeadline(Promise.allSettled([1, 2, 3].map(() => deals.approveDeal(a, d.id, approveInput(rev)))), 8_000, "aprobaciones simultáneas");
    expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(out.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason.code)).toEqual(["stale", "stale"]);
    await expect(victim()).resolves.toHaveLength(1);
  });

  it("aprobar, rechazar y pedir corrección a la vez sobre la misma venta no traban el pool", async () => {
    const a = await admin();
    const { userId } = await onboardRep(a);
    const d = await declared(userId);
    const rev = (await deals.dealReview(a, d.id)).deal.revision;
    const out = await withDeadline(Promise.allSettled([
      deals.approveDeal(a, d.id, approveInput(rev)),
      deals.rejectDeal(a, d.id, { note: "Faltan datos del contrato", revision: rev }),
      deals.requestDealCorrection(a, d.id, { note: "Revisá el CUIT del cliente", revision: rev }),
    ]), 8_000, "decisiones simultáneas");
    expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(victim()).resolves.toHaveLength(1);
  });

  it("tres «Generar liquidación» simultáneos del mismo vendedor: uno genera, dos responden «exists» y el pool sigue libre", async () => {
    const a = await admin();
    const { userId, repId } = await onboardRep(a);
    const p = await com.createPlan(a, { name: `Plan pool ${k().slice(0, 6)}` });
    const v = await com.saveDraftVersion(a, p.id, { rules: RULES, effectiveFrom: "2026-01-01" });
    await com.approveVersion(a, v.id);
    await reps.assignPlan(a, repId, { planVersionId: v.id, effectiveFrom: "2026-01-01", reason: "Acuerdo comercial de prueba" });
    const d = await declared(userId);
    const c = await deals.approveDeal(a, d.id, approveInput((await deals.dealReview(a, d.id)).deal.revision));
    await cm.recordAcceptance(a, c.contractId, { method: "external", ref: "Contrato firmado", acceptedAt: "2026-10-02", termsVersion: "v1" });
    await cm.enableClient(a, c.contractId, {}); // devenga el fijo, disponible hoy (holdDays 0)
    const cutoffOn = localDate(new Date());
    const out = await withDeadline(Promise.allSettled([1, 2, 3].map(() => pay.generateBatch(a, { repId, currency: "ARS", cutoffOn, idempotencyKey: k() }))), 8_000, "liquidaciones simultáneas");
    expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(out.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason.code)).toEqual(["exists", "exists"]);
    await expect(victim()).resolves.toHaveLength(1);
  });
});
