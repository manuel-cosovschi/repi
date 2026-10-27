import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import * as cm from "@/server/commercial/services";
import { ackNotices, trialNotices } from "@/server/commercial/notices";
import { resetRateLimits } from "@/server/access/util";

// F-BL-05 / D103: cada cambio de condiciones que hace Admin llega al cliente como aviso con historial y por correo al
// responsable (entrega honesta); el job avisa fin de prueba una sola vez; el «Entendido» queda con quién y cuándo.
async function person(name: string, extra: Partial<typeof schema.user.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email: `${id}@test.repi.local`, emailVerified: true, ...extra });
  return id;
}
async function setup(kind: "gym" | "coach" = "coach") {
  const admin = await person("Admin avisos", { platformRole: "admin", twoFactorEnabled: true });
  const email = `${randomUUID()}@test.repi.local`;
  const c = await cm.createClient(admin, { kind, orgName: `Cliente avisos ${randomUUID().slice(0, 6)}`, legalName: "Cliente SA", responsibleName: "Responsable", responsibleEmail: email, currency: "ARS" });
  await cm.recordAcceptance(admin, c.contractId, { method: "external", ref: "Acuerdo firmado", acceptedAt: "2026-10-01", termsVersion: "v1" });
  await cm.enableClient(admin, c.contractId, {});
  const owner = await person("Dueña");
  await db.insert(schema.staffMembership).values({ userId: owner, orgId: c.orgId, role: kind === "gym" ? "owner" : "coach_owner" });
  return { ...c, admin, owner, email };
}
const mails = (to: string) => db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to));
beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("avisos de cambio de condiciones", () => {
  it("cantidad y precio: aviso con versión anterior, motivo y fecha; correo al responsable; «Entendido» con autor", async () => {
    const c = await setup();
    expect((await cm.myConditions(c.owner, c.orgId)).notices).toHaveLength(0); // la primera habilitación no es un cambio
    await cm.addTerm(c.admin, c.contractId, { kind: "quantity", value: 20, effectiveFrom: "2026-11-01", reason: "Acuerdo inicial" });
    await cm.addTerm(c.admin, c.contractId, { kind: "quantity", value: 25, effectiveFrom: "2026-12-01", reason: "Sumó una camada" });
    await cm.addTerm(c.admin, c.contractId, { kind: "unit_price", value: 450_000, effectiveFrom: "2026-12-01", reason: "Actualización anual" });
    const v = await cm.myConditions(c.owner, c.orgId);
    expect(v.unacked).toBe(3);
    const q = v.notices.find((n) => n.title.startsWith("Cantidad acordada: 25 alumnos"))!;
    expect(q).toMatchObject({ kind: "term", effectiveFrom: "2026-12-01", ackAt: null });
    expect(q.body).toContain("Versión 2 (antes: 20 alumnos)");
    expect(q.body).toContain("Sumó una camada");
    expect(v.notices.some((n) => n.title.startsWith("Precio por alumno: ARS 4.500"))).toBe(true);
    expect(v.notices[0]).not.toHaveProperty("delivery"); // el estado del correo es para Admin
    const m = await mails(c.email);
    expect(m.length).toBe(3);
    expect(m.some((x) => x.body.includes("Condiciones REPI") && x.body.includes(`?s=terms`))).toBe(true);

    expect(await ackNotices(c.owner, c.orgId, q.id)).toEqual({ acked: 1 });
    expect(await ackNotices(c.owner, c.orgId, q.id)).toEqual({ acked: 0 }); // ya entendido: no cambia autor ni fecha
    const d = await cm.contractDetail(c.admin, c.contractId);
    expect(d.notices.find((n) => n.id === q.id)).toMatchObject({ ackBy: "Dueña", delivery: "local_only" });
    expect(await ackNotices(c.owner, c.orgId, null)).toEqual({ acked: 2 });
    expect((await cm.myConditions(c.owner, c.orgId)).unacked).toBe(0);
  });

  it("sólo el dueño ve y confirma avisos; otro espacio no puede confirmar los ajenos", async () => {
    const a = await setup(), b = await setup("gym");
    await cm.addTerm(a.admin, a.contractId, { kind: "quantity", value: 5, effectiveFrom: "2026-11-01", reason: "Acuerdo inicial" });
    const staff = await person("Coach asistente");
    await db.insert(schema.staffMembership).values({ userId: staff, orgId: a.orgId, role: "manager" });
    await expect(cm.myConditions(staff, a.orgId)).rejects.toMatchObject({ status: 404 });
    await expect(ackNotices(staff, a.orgId, null)).rejects.toMatchObject({ status: 404 });
    const [n] = (await cm.myConditions(a.owner, a.orgId)).notices;
    expect(await ackNotices(b.owner, b.orgId, n.id)).toEqual({ acked: 0 });
    expect((await cm.myConditions(a.owner, a.orgId)).unacked).toBe(1);
  });

  it("suspensión, rehabilitación, prueba y criterio de conteo generan aviso con motivo", async () => {
    const c = await setup("gym");
    await cm.suspendClient(c.admin, c.contractId, "Falta de pago de septiembre");
    await cm.enableClient(c.admin, c.contractId, {});
    const until = localDate(new Date(Date.now() + 20 * 86_400_000));
    await cm.setTrial(c.admin, c.contractId, { trialUntil: until, reason: "Piloto extendido" });
    await expect(cm.setTrial(c.admin, c.contractId, { trialUntil: until, reason: "Otra vez" })).rejects.toMatchObject({ code: "invalid" });
    await expect(cm.setTrial(c.admin, c.contractId, { trialUntil: "2020-01-01", reason: "Pasado" })).rejects.toMatchObject({ code: "invalid" });
    await cm.setQuantityDefinition(c.admin, c.contractId, { definition: "Socios con cuota al día en el mes", reason: "Acordado en reunión" });
    await cm.setTrial(c.admin, c.contractId, { trialUntil: null, reason: "Pasa a plan pago" });
    const v = await cm.myConditions(c.owner, c.orgId);
    expect(v.notices.map((n) => n.kind)).toEqual(["trial", "definition", "trial", "enabled", "suspended"]);
    expect(v.notices.find((n) => n.kind === "suspended")!.body).toContain("Falta de pago de septiembre");
    expect(v.notices.find((n) => n.kind === "definition")!.body).toContain("Antes no estaba definido");
    expect(v.notices[0].title).toBe("Tu espacio ya no está en prueba gratuita");
    expect((await mails(c.email)).every((m) => m.body.includes("?s=billing"))).toBe(true);
    const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, c.orgId));
    expect(o.trialEndsAt).toBeNull();
    const cualquiera = await person("Cualquiera");
    await expect(cm.setTrial(cualquiera, c.contractId, { trialUntil: null, reason: "x123" })).rejects.toMatchObject({ status: 404 });
  });

  it("el job avisa fin de prueba una sola vez por fecha y no avisa pruebas viejas", async () => {
    const now = new Date("2026-11-10T15:00:00Z");
    const soon = await setup(), ended = await setup(), old = await setup();
    await db.update(schema.clientContract).set({ trialUntil: "2026-11-13" }).where(eq(schema.clientContract.id, soon.contractId));
    await db.update(schema.clientContract).set({ trialUntil: "2026-11-08" }).where(eq(schema.clientContract.id, ended.contractId));
    await db.update(schema.clientContract).set({ trialUntil: "2026-10-01" }).where(eq(schema.clientContract.id, old.contractId));
    await trialNotices(now);
    await trialNotices(now);
    const kinds = async (id: string) => (await db.select().from(schema.contractNotice).where(eq(schema.contractNotice.contractId, id))).map((n) => n.kind);
    expect(await kinds(soon.contractId)).toEqual(["trial_ending"]);
    expect(await kinds(ended.contractId)).toEqual(["trial_ended"]);
    expect(await kinds(old.contractId)).toEqual([]);
    const [n] = await db.select().from(schema.contractNotice).where(eq(schema.contractNotice.contractId, soon.contractId));
    expect(n).toMatchObject({ title: "Tu prueba gratuita termina el 13 de noviembre de 2026", effectiveFrom: "2026-11-14", createdBy: null });
    // Pasada la fecha, el mismo contrato recibe «terminó» (otra clave), no otro «termina».
    await trialNotices(new Date("2026-11-15T15:00:00Z"));
    expect((await kinds(soon.contractId)).sort()).toEqual(["trial_ended", "trial_ending"]);
  });

  it("si el proveedor rechaza el correo, el cambio queda hecho y el aviso visible con la entrega fallida", async () => {
    const c = await setup();
    vi.stubEnv("MAIL_DRIVER", "resend");
    vi.stubEnv("RESEND_API_KEY", "unit-test-key-not-a-credential");
    vi.stubEnv("MAIL_FROM", "REPI <test@example.invalid>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"down"}', { status: 503 })));
    expect(await cm.addTerm(c.admin, c.contractId, { kind: "quantity", value: 9, effectiveFrom: "2026-11-01", reason: "Acuerdo inicial" })).toEqual({ version: 1 });
    const [n] = (await cm.contractDetail(c.admin, c.contractId)).notices;
    expect(n.delivery).toBe("failed");
    const [ev] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, n.id), eq(schema.auditEvent.action, "commercial.notice_delivery")));
    expect(ev.result).toBe("error");
    expect((await cm.myConditions(c.owner, c.orgId)).unacked).toBe(1);
  });
});
