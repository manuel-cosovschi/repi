import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import * as cm from "@/server/commercial/services";

async function client() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Admin comercial", email: `${id}@test.repi.local`, emailVerified: true, platformRole: "admin", twoFactorEnabled: true });
  const email = `${randomUUID()}@test.repi.local`;
  const c = await cm.createClient(id, { kind: "coach", orgName: "Coach entrega", legalName: "Coach entrega", responsibleName: "Responsable", responsibleEmail: email, currency: "ARS" });
  await cm.recordAcceptance(id, c.contractId, { method: "external", ref: "Acuerdo de prueba", acceptedAt: "2026-10-01", termsVersion: "v1" });
  await cm.enableClient(id, c.contractId, {});
  return { ...c, admin: id, email };
}

function provider(status: number) {
  vi.stubEnv("MAIL_DRIVER", "resend");
  vi.stubEnv("RESEND_API_KEY", "unit-test-key-not-a-credential");
  vi.stubEnv("MAIL_FROM", "REPI <test@example.invalid>");
  const fetch = vi.fn().mockResolvedValue(new Response(status < 300 ? '{"id":"test-mail"}' : '{"message":"provider detail must stay private"}', { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("bienvenida comercial: entrega honesta y recuperable", () => {
  it("el rechazo del proveedor queda visible, no se presenta como enviado y se puede reenviar", async () => {
    const c = await client();
    const fetch = provider(503);
    await expect(cm.sendOwnerInvitation(c.admin, c.contractId)).rejects.toMatchObject({ code: "mail_failed", status: 502 });
    const failed = (await cm.contractDetail(c.admin, c.contractId)).invitations[0];
    expect(failed).toMatchObject({ status: "pending", delivery: "failed" });
    const [event] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, failed.id), eq(schema.auditEvent.action, "commercial.owner_invitation_delivery")));
    expect(event.result).toBe("error");
    expect(JSON.stringify(event)).not.toContain("provider detail");
    expect(JSON.stringify(event)).not.toContain("/activar/");
    expect((await cm.listClients(c.admin)).clients.find((x) => x.orgId === c.orgId)?.stage).toBe("enabled");
    fetch.mockResolvedValue(new Response('{"id":"retry-mail"}', { status: 200 }));
    expect(await cm.sendOwnerInvitation(c.admin, c.contractId)).toMatchObject({ delivery: "submitted" });
    const current = (await cm.contractDetail(c.admin, c.contractId)).invitations;
    expect(current.find((i) => i.id === failed.id)?.status).toBe("revoked");
    expect(current.find((i) => i.status === "pending")).toMatchObject({ delivery: "submitted" });
    expect((await cm.listClients(c.admin)).clients.find((x) => x.orgId === c.orgId)?.stage).toBe("invited");
  });

  it("DEMO no silencia una bienvenida rechazada por el proveedor", async () => {
    const c = await client();
    vi.stubEnv("REPI_DEPLOY", "demo");
    provider(422);
    await expect(cm.sendOwnerInvitation(c.admin, c.contractId)).rejects.toMatchObject({ code: "mail_failed" });
    expect((await cm.contractDetail(c.admin, c.contractId)).invitations[0]).toMatchObject({ delivery: "failed" });
  });

  it("un buzón local no se informa como correo enviado", async () => {
    const c = await client();
    expect(await cm.sendOwnerInvitation(c.admin, c.contractId)).toMatchObject({ delivery: "local_only" });
    expect((await cm.contractDetail(c.admin, c.contractId)).invitations[0]).toMatchObject({ delivery: "local_only" });
    expect((await cm.listClients(c.admin)).clients.find((x) => x.orgId === c.orgId)?.stage).toBe("enabled");
  });

  it("un envío aceptado por el proveedor no promete entrega al destinatario", async () => {
    const c = await client();
    provider(200);
    expect(await cm.sendOwnerInvitation(c.admin, c.contractId)).toMatchObject({ delivery: "submitted" });
    const detail = await cm.contractDetail(c.admin, c.contractId);
    expect(detail.invitations[0]).toMatchObject({ delivery: "submitted" });
    expect(JSON.stringify(detail.invitations)).not.toContain("delivered");
  });
});

describe("condiciones y cierre comercial serializados", () => {
  async function priced() {
    const c = await client();
    await cm.addTerm(c.admin, c.contractId, { kind: "quantity", value: 20, effectiveFrom: "2026-10-01", reason: "Cantidad pactada" });
    await cm.addTerm(c.admin, c.contractId, { kind: "unit_price", value: 10000, effectiveFrom: "2026-10-01", reason: "Precio pactado" });
    return c;
  }

  it("cambio y cierre esperan la misma exclusión del contrato y quedan en un orden coherente", async () => {
    const c = await priced();
    let locked!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const holder = db.transaction(async (tx) => {
      await tx.select().from(schema.clientContract).where(eq(schema.clientContract.id, c.contractId)).for("update");
      locked();
      await gate;
    });
    await ready;
    const term = cm.addTerm(c.admin, c.contractId, { kind: "unit_price", value: 12000, effectiveFrom: "2026-10-01", reason: "Renegociación" });
    const close = cm.closePeriodSimulated(c.admin, c.contractId, { start: "2026-10-01", end: "2026-10-31" });
    // Attaching handlers immediately avoids unhandled rejections while the transaction is held.
    const outcomes = Promise.allSettled([term, close]);
    let during: { terms: number; snapshots: number };
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      during = {
        terms: (await db.select().from(schema.contractTerm).where(eq(schema.contractTerm.contractId, c.contractId))).length,
        snapshots: (await db.select().from(schema.billingSnapshot).where(eq(schema.billingSnapshot.contractId, c.contractId))).length,
      };
    } finally { release(); await holder; }
    const [termResult, closeResult] = await outcomes;
    expect(during).toEqual({ terms: 2, snapshots: 0 });
    expect(closeResult.status).toBe("fulfilled");
    const [snapshot] = await db.select().from(schema.billingSnapshot).where(eq(schema.billingSnapshot.contractId, c.contractId));
    if (termResult.status === "fulfilled") expect(snapshot.unitPriceMinor).toBe(12000);
    else { expect(termResult.reason).toMatchObject({ code: "closed_period" }); expect(snapshot.unitPriceMinor).toBe(10000); }
  });

  it("rechaza fechas inexistentes y períodos invertidos antes de guardar", async () => {
    const c = await priced();
    await expect(cm.addTerm(c.admin, c.contractId, { kind: "quantity", value: 30, effectiveFrom: "2026-02-30", reason: "Fecha inválida" })).rejects.toMatchObject({ code: "invalid" });
    await expect(cm.closePeriodSimulated(c.admin, c.contractId, { start: "2026-10-31", end: "2026-10-01" })).rejects.toMatchObject({ code: "invalid" });
    expect(await db.select().from(schema.billingSnapshot).where(eq(schema.billingSnapshot.contractId, c.contractId))).toHaveLength(0);
  });
});
