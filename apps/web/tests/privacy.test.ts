import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import * as svc from "@/server/access/services";
import * as pv from "@/server/privacy/services";
import * as cm from "@/server/commercial/services";

// F-PR-02 / D75: exportación propia y pedido de eliminación con registro verificable.
let n = 0;
const person = async (name = "Persona Privacidad") => (await svc.signUpPerson({ name, email: `priv${++n}.${Date.now()}@test.repi.local`, password: "prueba1234", terms: true })).userId!;

describe("exportar mis datos", () => {
  it("incluye lo propio, no mensajes de otras personas, y queda auditado", async () => {
    const yo = await person("Yo Mismo"), otro = await person("Otra Persona");
    await db.insert(schema.checkin).values({ userId: yo, date: "2026-10-20", energy: 4, sleep: 3, mood: 5 });
    await db.insert(schema.injury).values({ userId: yo, zone: "Rodilla", status: "active", detail: "Molestia al bajar" });
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, otro));
    const org = await svc.createCoachOrganization(otro, { brand: "Coach Privacidad" });
    const [c] = await db.insert(schema.conversation).values({ kind: "coach_client", relationId: `rel-${n}-${Date.now()}`, orgId: org.id, memberUserId: yo }).returning();
    await db.insert(schema.message).values([
      { id: randomUUID(), conversationId: c.id, senderUserId: yo, senderSide: "member", body: "Mi mensaje" },
      { id: randomUUID(), conversationId: c.id, senderUserId: otro, senderSide: "staff", body: "Mensaje ajeno" },
    ]);
    const d = await pv.exportMyData(yo);
    expect(d.account.name).toBe("Yo Mismo");
    expect(d.checkins).toEqual([{ date: "2026-10-20", energy: 4, sleep: 3, mood: 5 }]);
    expect(d.injuries[0]).toMatchObject({ zone: "Rodilla", detail: "Molestia al bajar" });
    expect(d.messagesSent.map((m) => m.body)).toEqual(["Mi mensaje"]);
    expect(JSON.stringify(d)).not.toContain("Mensaje ajeno");
    expect(JSON.stringify(d)).not.toContain("prueba1234");
    const logs = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, yo), eq(schema.auditEvent.action, "privacy.export")));
    expect(logs).toHaveLength(1);
  });
});

describe("pedido de eliminación", () => {
  it("es único mientras está pendiente, se puede cancelar y no borra nada por sí solo", async () => {
    const yo = await person();
    const a = await pv.requestDeletion(yo, "Ya no entreno");
    const b = await pv.requestDeletion(yo);
    expect(b).toMatchObject({ id: a.id, already: true });
    expect(await db.select().from(schema.user).where(eq(schema.user.id, yo))).toHaveLength(1);
    await pv.cancelDeletion(yo, a.id);
    expect((await pv.myPrivacyRequests(yo))[0].status).toBe("cancelled");
    await expect(pv.cancelDeletion(yo, a.id)).rejects.toMatchObject({ status: 404 });
  });
  it("sólo REPI Admin lo ve y registra el resultado; otra persona no (2FA optativa, D119)", async () => {
    const yo = await person(), cualquiera = await person(), admin = await person("Admin Privacidad");
    const r = await pv.requestDeletion(yo);
    await expect(pv.listPrivacyRequests(cualquiera)).rejects.toMatchObject({ status: 404 });
    await db.update(schema.user).set({ platformRole: "admin" }).where(eq(schema.user.id, admin));
    expect((await pv.listPrivacyRequests(admin)).some((x) => x.id === r.id)).toBe(true);
    await expect(pv.resolvePrivacyRequest(admin, r.id, { status: "done", resolution: " " })).rejects.toMatchObject({ code: "invalid" });
    const done = await pv.resolvePrivacyRequest(admin, r.id, { status: "done", resolution: "Cuenta y entrenamientos borrados; auditoría conservada." });
    expect(done).toMatchObject({ status: "done", resolvedBy: admin });
    await expect(pv.resolvePrivacyRequest(admin, r.id, { status: "rejected", resolution: "x" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("resumen de Admin (F-AD-01)", () => {
  it("cuenta pedidos pendientes y accesos denegados; no informa cobrado; exige Admin", async () => {
    const admin = await person("Admin Resumen"), yo = await person();
    await expect(cm.adminSummary(yo)).rejects.toMatchObject({ status: 404 });
    await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, admin));
    const before = await cm.adminSummary(admin);
    await pv.requestDeletion(yo);
    await db.insert(schema.auditEvent).values({ action: "access.denied", resourceType: "api", result: "denied" });
    const after = await cm.adminSummary(admin);
    expect(after.privacyPending).toBe(before.privacyPending + 1);
    expect(after.deniedLast7d).toBe(before.deniedLast7d + 1);
    expect(after.collected).toBeNull();
  });
});
