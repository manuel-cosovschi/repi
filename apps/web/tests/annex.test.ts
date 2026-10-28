// Anexo 26/10/2026 «Acceso, altas y facturación» (§11) y pedidos extra (sensación por serie, evolución en el Club).
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as cm from "@/server/commercial/services";
import * as join from "@/server/join/services";
import * as push from "@/server/push/services";
import * as alerts from "@/server/gym/alerts";
import * as notices from "@/server/gym/notices";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as club from "@/server/community/club";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `ax${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Anexo", email = mail()) {
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const code = async (p: Promise<unknown>) => (await err(p))?.code ?? "ok";
async function admin() {
  const u = await verified("Admin");
  await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, u));
  return u;
}
const lastMail = async (to: string) => (await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to)).orderBy(desc(schema.devMailbox.createdAt)).limit(1))[0];

let EX: string;
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Press anexo", muscleGroup: "Pecho" }).onConflictDoNothing().returning();
  EX = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Press anexo")))[0].id;
});
beforeEach(() => resetRateLimits());

/** Gym habilitado por Admin con dos sedes, dueño (vía invitación), gerente, piso en A y B, recepción en A y un socio activo en A. */
async function world() {
  const ad = await admin();
  const ownerEmail = mail();
  const c = await cm.createClient(ad, { kind: "gym", orgName: `Gym Anexo ${n}`, legalName: "Gym Anexo SRL", responsibleName: "Dueña", responsibleEmail: ownerEmail, currency: "ARS", locations: ["Palermo", "Belgrano"] });
  await cm.recordAcceptance(ad, c.contractId, { method: "external", ref: "PDF firmado", acceptedAt: "2026-10-20", termsVersion: "v1" });
  await cm.enableClient(ad, c.contractId, {});
  await cm.sendOwnerInvitation(ad, c.contractId);
  const token = /\/activar\/([\w-]+)/.exec((await lastMail(ownerEmail)).body)![1];
  const owner = await verified("Dueña", ownerEmail);
  await cm.acceptOwnerInvitation(owner, token);
  await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner));
  const locs = await db.select().from(schema.gymLocation).where(eq(schema.gymLocation.orgId, c.orgId));
  const A = locs.find((l) => l.name === "Palermo")!.id, B = locs.find((l) => l.name === "Belgrano")!.id;
  const staff = async (name: string, role: "manager" | "floor_trainer" | "reception", loc: string) => {
    const u = await verified(name);
    await db.insert(schema.staffMembership).values({ userId: u, orgId: c.orgId, locationId: loc, role });
    return u;
  };
  return { ad, contractId: c.contractId, org: c.orgId, A, B, owner, token, manager: await staff("Gerente", "manager", A), tA: await staff("Piso A", "floor_trainer", A),
    tB: await staff("Piso B", "floor_trainer", B), recep: await staff("Recepción A", "reception", A) };
}
const slugFor = async (actor: string, org: string, loc: string) => (await join.regenerateJoinLink(actor, org, loc)).slug;

describe("alta comercial con datos mínimos (D117)", () => {
  it("sólo nombre visible, moneda, responsable y email son obligatorios; razón social y el resto quedan vacíos", async () => {
    const ad = await admin();
    const c = await cm.createClient(ad, { kind: "coach", orgName: "Coach Mínimo", responsibleName: "Urko Uruzuna", responsibleEmail: mail(), currency: "ARS" });
    const [ct] = await db.select().from(schema.clientContract).where(eq(schema.clientContract.id, c.contractId));
    expect(ct.legalName).toBeNull();
    expect(ct.scope).toBe("organization");
    const g = await cm.createClient(ad, { kind: "gym", orgName: "Gym Mínimo", legalName: "", responsibleName: "Dueño", responsibleEmail: mail(), currency: "USD" });
    expect((await db.select().from(schema.gymLocation).where(eq(schema.gymLocation.orgId, g.orgId))).map((l) => l.name)).toEqual(["Sede principal"]);
  });

  it("un punto como razón social o alcance por sedes en un coach no rompen el alta", async () => {
    const ad = await admin();
    const c = await cm.createClient(ad, { kind: "coach", orgName: "Urko Uruzuna", legalName: ".", responsibleName: "Urko Uruzuna", responsibleEmail: mail(), currency: "ARS", scope: "locations", scopeNote: ".", quantityDefinition: "." });
    const [ct] = await db.select().from(schema.clientContract).where(eq(schema.clientContract.id, c.contractId));
    expect(ct.scope).toBe("organization"); // un coach no tiene sedes
    expect(ct.scopeNote).toBeNull();
    const g = await cm.createClient(ad, { kind: "gym", orgName: "Gym Sedes", responsibleName: "Dueño", responsibleEmail: mail(), currency: "ARS", scope: "locations", locations: ["Centro"] });
    expect((await db.select().from(schema.clientContract).where(eq(schema.clientContract.id, g.contractId)))[0].scope).toBe("locations");
  });

  it("si falta algo obligatorio, el mensaje dice qué", async () => {
    const ad = await admin();
    const e = await err(cm.createClient(ad, { kind: "coach", orgName: "C", responsibleName: "", responsibleEmail: "no-es-email", currency: "ARS" }));
    expect(e?.message).toBe("Falta completar: nombre visible, responsable, email válido del responsable.");
    const r = await err(cm.createClient(ad, { kind: "coach", orgName: "Coach OK", responsibleName: "Resp", responsibleEmail: mail(), currency: "EUR" }));
    expect(r?.message).toBe("Falta completar: moneda.");
  });
});

describe("alta comercial (criterios 1–4)", () => {
  it("sin autoalta: contacto comercial; Admin crea en borrador y el cliente no opera hasta habilitarse", async () => {
    expect(await cm.createLead({ kind: "gym", orgName: "Gym Nuevo", contactName: "Ana", email: mail() })).toEqual({ ok: true });
    const notAdmin = await verified();
    expect(await code(cm.createClient(notAdmin, { kind: "coach", orgName: "X", legalName: "X SA", responsibleName: "Xx", responsibleEmail: mail(), currency: "ARS" }))).toBe("not_found");
    const ad = await admin();
    const coachEmail = mail();
    const c = await cm.createClient(ad, { kind: "coach", orgName: "Coach Borrador", legalName: "Coach SA", responsibleName: "Coach", responsibleEmail: coachEmail, currency: "ARS" });
    const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, c.orgId));
    expect(o.commercialStatus).toBe("pending");
    expect(await code(cm.sendOwnerInvitation(ad, c.contractId))).toBe("invalid_state"); // sin habilitar no hay bienvenida
    expect(await code(cm.enableClient(ad, c.contractId, {}))).toBe("invalid_state"); // sin aceptación no se habilita
    // Un coach (creado internamente) en estado pendiente no puede invitar alumnos.
    const coach = await verified("Coach");
    await db.insert(schema.staffMembership).values({ userId: coach, orgId: c.orgId, role: "coach_owner" });
    expect(await code(acc.inviteCoachClient(coach, c.orgId, { email: mail() }))).toBe("org_not_enabled");
  });

  it("invitación de bienvenida: ligada al email, un solo uso, reenviar invalida la anterior; sin contraseñas de Admin", async () => {
    const ad = await admin();
    const email = mail();
    const c = await cm.createClient(ad, { kind: "coach", orgName: "Coach Activo", legalName: "CA SA", responsibleName: "Resp", responsibleEmail: email, currency: "USD" });
    await cm.recordAcceptance(ad, c.contractId, { method: "external", ref: "email 20/10", acceptedAt: "2026-10-20", termsVersion: "v1" });
    await cm.enableClient(ad, c.contractId, {});
    await cm.sendOwnerInvitation(ad, c.contractId);
    const t1 = /\/activar\/([\w-]+)/.exec((await lastMail(email)).body)![1];
    await cm.sendOwnerInvitation(ad, c.contractId);
    const t2 = /\/activar\/([\w-]+)/.exec((await lastMail(email)).body)![1];
    expect((await cm.lookupOwnerInvitation(t1)).state).toBe("revoked");
    expect(await cm.lookupOwnerInvitation(t2)).toMatchObject({ state: "pending", orgName: "Coach Activo" });
    expect((await cm.lookupOwnerInvitation(t2)).emailHint).not.toContain(email.split("@")[0]);
    const otro = await verified();
    expect(await code(cm.acceptOwnerInvitation(otro, t2))).toBe("email_mismatch");
    const resp = await verified("Resp", email);
    expect((await cm.acceptOwnerInvitation(resp, t2)).href).toBe(`/coach/${c.orgId}`);
    expect(await code(cm.acceptOwnerInvitation(resp, t2))).toBe("invalid_link");
    // Ahora el coach opera: invita alumnos por email.
    expect(await code(acc.inviteCoachClient(resp, c.orgId, { email: mail() }))).toBe("ok");
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, resp));
    expect(u.email).toBe(email); // la cuenta la creó la persona, no Admin
  });

  it("clientes previos: regularización sin suspender ni cambiar accesos", async () => {
    const ad = await admin();
    const owner = await verified();
    const org = await acc.createGymOrganization(owner, { name: `Gym Legacy ${n}` }, { commercialStatus: "legacy" });
    const r = await cm.regularize(ad, org.id, { legalName: "Legacy SRL", responsibleName: "Dueño", responsibleEmail: mail(), currency: "ARS" });
    const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, org.id));
    expect(o.commercialStatus).toBe("legacy");
    expect((await cm.contractDetail(ad, r.contractId)).contract.status).toBe("draft");
  });
});

describe("cantidad, precio y facturación (criterios 5–9)", () => {
  it("versiones con vigencia; vista previa = cantidad acordada × precio, sin depender de cuentas; cierre simulado inmutable", async () => {
    const w = await world();
    await cm.addTerm(w.ad, w.contractId, { kind: "quantity", value: 450, effectiveFrom: "2026-10-01", reason: "Acuerdo inicial" });
    await cm.addTerm(w.ad, w.contractId, { kind: "unit_price", value: 125_050, effectiveFrom: "2026-10-01", reason: "Acuerdo inicial" });
    await cm.addTerm(w.ad, w.contractId, { kind: "quantity", value: 500, effectiveFrom: "2026-10-15", reason: "Ampliación" });
    const d = await cm.contractDetail(w.ad, w.contractId, { start: "2026-10-01", end: "2026-10-31" });
    expect(d.preview.ok).toBe(true);
    if (!d.preview.ok) return;
    expect(d.preview.subtotal).toBe(450 * 125_050); // valores al inicio; el cambio del 15 se informa, no se prorratea
    expect(d.preview.changes).toHaveLength(1);
    expect(d.enabledAccesses).toBe(0); // nadie tiene cuenta y la factura no cambia
    expect(d.terms.map((t) => t.version)).toEqual([1, 1, 2]);
    await cm.closePeriodSimulated(w.ad, w.contractId, { start: "2026-10-01", end: "2026-10-31" });
    expect(await code(cm.closePeriodSimulated(w.ad, w.contractId, { start: "2026-10-01", end: "2026-10-31" }))).toBe("exists");
    expect(await code(cm.addTerm(w.ad, w.contractId, { kind: "unit_price", value: 1, effectiveFrom: "2026-10-20", reason: "Reescribir" }))).toBe("closed_period");
    const [snap] = await db.select().from(schema.billingSnapshot).where(eq(schema.billingSnapshot.contractId, w.contractId));
    expect([snap.quantity, snap.unitPriceMinor, snap.subtotalMinor]).toEqual([450, 125_050, 450 * 125_050]);
  });
  it("accesos por encima de lo acordado: alerta de revisión, sin cobro extra; condiciones visibles sólo al responsable", async () => {
    const w = await world();
    await cm.addTerm(w.ad, w.contractId, { kind: "quantity", value: 1, effectiveFrom: "2026-01-01", reason: "Prueba" });
    for (let i = 0; i < 2; i++) {
      const u = await verified();
      await db.insert(schema.gymMember).values({ orgId: w.org, locationId: w.A, userId: u, status: "active" });
    }
    const d = await cm.contractDetail(w.ad, w.contractId);
    expect([d.enabledAccesses, d.overAgreed]).toEqual([2, true]);
    const mine = await cm.myConditions(w.owner, w.org);
    expect(mine.terms[0]).toMatchObject({ kind: "quantity", display: "1" });
    expect(await code(cm.myConditions(w.manager, w.org))).toBe("not_found");
    await cm.requestCorrection(w.owner, w.org, "Acordamos 450 socios, no 1.");
    expect((await cm.contractDetail(w.ad, w.contractId)).corrections).toHaveLength(1);
  });
});

describe("acceso del socio por QR (criterios 10–19)", () => {
  it("QR → solicitud pendiente → piso sin turno no decide; con turno en la sede sí, con método; decisión única", async () => {
    const w = await world();
    const slug = await slugFor(w.owner, w.org, w.A);
    expect(await join.publicJoinInfo(slug)).toMatchObject({ locationName: "Palermo", operational: true });
    const socio = await verified("Socia QR");
    const r = await join.requestAccess(socio, slug, { terms: true });
    expect(r.state).toBe("created");
    const again = await join.requestAccess(socio, slug, { terms: true });
    expect(again.state).toBe("pending"); // no duplica
    const id = "request" in r ? r.request!.id : "";
    // Sin turno: la bandeja lo dice y decidir falla.
    expect((await join.joinInbox(w.tA, w.org)).floorWithoutShift).toBe(true);
    expect(await code(join.decideJoin(w.tA, w.org, id, { approve: true, method: "conocimiento_directo" }))).toBe("no_authority");
    // Piso de otra sede, aun en turno, tampoco.
    await gym.startShift(w.tB, w.org, w.B);
    expect(await code(join.decideJoin(w.tB, w.org, id, { approve: true, method: "conocimiento_directo" }))).toBe("no_authority");
    await gym.startShift(w.tA, w.org, w.A);
    expect(await code(join.decideJoin(w.tA, w.org, id, { approve: true }))).toBe("invalid"); // método obligatorio
    const ok = await join.decideJoin(w.tA, w.org, id, { approve: true, method: "conocimiento_directo" });
    expect(ok.status).toBe("approved");
    const e = await err(join.decideJoin(w.recep, w.org, id, { approve: false, reason: "not_member" }));
    expect(e?.code).toBe("already_decided");
    expect(e?.message).toContain("Piso A");
    const [req] = await db.select().from(schema.membershipRequest).where(eq(schema.membershipRequest.id, id));
    expect([req.decidedAs, req.validationMethod, req.decidedShiftId != null]).toEqual(["floor", "conocimiento_directo", true]);
    expect((await acc.memberOnboardingState(socio)).step).toBe("consentGym");
    // Ya habilitado: escanear de nuevo lleva a la app, sin otra solicitud.
    expect((await join.requestAccess(socio, slug, { terms: true })).state).toBe("already");
  });

  it("recepción resuelve sin turno; rechazo con motivo apto; nadie aprueba su propia solicitud", async () => {
    const w = await world();
    const slug = await slugFor(w.manager, w.org, w.A);
    const socio = await verified();
    const r = await join.requestAccess(socio, slug, { terms: true });
    const id = "request" in r ? r.request!.id : "";
    await join.decideJoin(w.recep, w.org, id, { approve: false, reason: "wrong_location" });
    const [mine] = await join.myJoinRequests(socio);
    expect(mine.status).toBe("rejected");
    expect(mine.reason).toMatch(/otra sede/);
    // El gerente pide acceso como socio en su gym: no se lo aprueba a sí mismo.
    const r2 = await join.requestAccess(w.manager, slug, { terms: true });
    const id2 = "request" in r2 ? r2.request!.id : "";
    expect(await code(join.decideJoin(w.manager, w.org, id2, { approve: true, method: "recepcion" }))).toBe("self");
  });

  it("vence a las 24 h; cancelar; QR revocado no sirve; gym no habilitado no recibe solicitudes; email sin verificar tampoco", async () => {
    const w = await world();
    const slug = await slugFor(w.owner, w.org, w.A);
    const socio = await verified();
    const r = await join.requestAccess(socio, slug, { terms: true });
    const id = "request" in r ? r.request!.id : "";
    await db.update(schema.membershipRequest).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.membershipRequest.id, id));
    expect(await code(join.decideJoin(w.recep, w.org, id, { approve: true, method: "recepcion" }))).toBe("expired");
    const r2 = await join.requestAccess(socio, slug, { terms: true });
    expect(r2.state).toBe("created");
    await join.cancelRequest(socio, "request" in r2 ? r2.request!.id : "");
    const slug2 = await slugFor(w.owner, w.org, w.A); // regenerar revoca el anterior
    expect(await code(join.publicJoinInfo(slug))).toBe("invalid_link");
    expect(await code(join.requestAccess(socio, slug, { terms: true }))).toBe("invalid_link");
    expect((await join.publicJoinInfo(slug2)).locationName).toBe("Palermo");
    await cm.suspendClient(w.ad, w.contractId, "Mora (prueba)");
    expect(await code(join.requestAccess(socio, slug2, { terms: true }))).toBe("org_not_enabled");
    const sinVerificar = (await acc.signUpPerson({ name: "Sin verificar", email: mail(), password: "prueba1234", terms: true, birth: "01/01/1990" })).userId!;
    expect(await code(join.requestAccess(sinVerificar, slug2, { terms: true }))).toBe("unverified");
  });

  it("ampliación de sede y reactivación son trámites aparte; pausar corta el registro de series nuevas", async () => {
    const w = await world();
    const socio = await verified();
    const [m] = await db.insert(schema.gymMember).values({ orgId: w.org, locationId: w.A, userId: socio, status: "active" }).returning();
    const rB = await join.requestAccess(socio, await slugFor(w.owner, w.org, w.B), { terms: true });
    expect("request" in rB && rB.request!.kind).toBe("expansion");
    await gym.startShift(w.tB, w.org, w.B);
    await join.decideJoin(w.tB, w.org, "request" in rB ? rB.request!.id : "", { approve: true, method: "recepcion" });
    expect((await join.listAccesses(w.owner, w.org)).find((a) => a.id === m.id)?.extraLocations).toEqual(["Belgrano"]);
    await join.setAccess(w.owner, w.org, m.id, "suspend");
    const rA = await join.requestAccess(socio, await slugFor(w.owner, w.org, w.A), { terms: true });
    expect("request" in rA && rA.request!.kind).toBe("reactivation");
  });
});

describe("concurrencia y turnos (criterios 2, 5, 7)", () => {
  it("dos operadores a la vez: una sola decisión y un solo vínculo; turno cerrado antes de aprobar no autoriza", async () => {
    const w = await world();
    const slug = await slugFor(w.owner, w.org, w.A);
    const socio = await verified();
    const r = await join.requestAccess(socio, slug, { terms: true });
    const id = "request" in r ? r.request!.id : "";
    const res = await Promise.allSettled([
      join.decideJoin(w.recep, w.org, id, { approve: true, method: "recepcion" }),
      join.decideJoin(w.manager, w.org, id, { approve: false, reason: "not_member" }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason.code).toBe("already_decided");
    const ms = await db.select().from(schema.gymMember).where(and(eq(schema.gymMember.orgId, w.org), eq(schema.gymMember.userId, socio)));
    expect(ms.length).toBeLessThanOrEqual(1);
    // Turno abierto al ver la bandeja y cerrado antes de confirmar: la autoridad se revalida al decidir.
    const otra = await verified();
    const r2 = await join.requestAccess(otra, slug, { terms: true });
    await gym.startShift(w.tA, w.org, w.A);
    expect((await join.joinInbox(w.tA, w.org)).canActAt.map((l) => l.id)).toEqual([w.A]);
    await db.update(schema.shiftLog).set({ endedAt: new Date() }).where(eq(schema.shiftLog.userId, w.tA));
    expect(await code(join.decideJoin(w.tA, w.org, "request" in r2 ? r2.request!.id : "", { approve: true, method: "conocimiento_directo" }))).toBe("no_authority");
  });
  it("bienvenida aceptada dos veces a la vez: un solo uso y una sola membresía", async () => {
    const ad = await admin();
    const email = mail();
    const c = await cm.createClient(ad, { kind: "coach", orgName: "Coach Doble", legalName: "CD SA", responsibleName: "Resp", responsibleEmail: email, currency: "ARS" });
    await cm.recordAcceptance(ad, c.contractId, { method: "external", ref: "ref", acceptedAt: "2026-10-20", termsVersion: "v1" });
    await cm.enableClient(ad, c.contractId, {});
    await cm.sendOwnerInvitation(ad, c.contractId);
    const t = /\/activar\/([\w-]+)/.exec((await lastMail(email)).body)![1];
    const u = await verified("Resp", email);
    const res = await Promise.allSettled([cm.acceptOwnerInvitation(u, t), cm.acceptOwnerInvitation(u, t)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.staffMembership).where(eq(schema.staffMembership.orgId, c.orgId))).toHaveLength(1);
  });
});

/** enqueue dispara el envío sin esperar: se espera a que la fila salga de «pending». */
async function settled(userId: string, kind: (typeof schema.notificationOutbox.$inferSelect)["kind"]) {
  let rows: (typeof schema.notificationOutbox.$inferSelect)[] = [];
  for (let i = 0; i < 40; i++) {
    await push.processOutbox();
    rows = await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.userId, userId), eq(schema.notificationOutbox.kind, kind)));
    if (rows[0] && rows[0].status !== "pending") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return rows;
}

describe("push y resiliencia (criterios 20–21)", () => {
  it("cola deduplicada; sin dispositivos, pausado o sin VAPID queda «skipped» y nada se pierde", async () => {
    const u = await verified();
    expect(await push.enqueue([u, u], { kind: "join_request", dedupe: "t1", title: "REPI", body: "Nueva solicitud de acceso en tu sede", url: "/" })).toBe(1);
    expect(await push.enqueue([u], { kind: "join_request", dedupe: "t1", title: "REPI", body: "x", url: "/" })).toBe(0);
    const [row] = await settled(u, "join_request");
    expect(row.status).toBe("skipped");
    expect(row.body).not.toMatch(/@|Socia|Piso/); // texto mínimo en pantalla bloqueada
    await push.subscribe(u, { endpoint: "https://push.example.test/abc", keys: { p256dh: "k", auth: "a" } }, "test");
    await push.setPaused(u, true);
    await push.enqueue([u], { kind: "floor_alert", dedupe: "t2", title: "REPI", body: "b", url: "/" });
    const rows = await settled(u, "floor_alert");
    expect(rows[0]).toMatchObject({ status: "skipped", lastError: expect.stringMatching(/pausados|sin configurar/) });
  });
});

describe("pedidos extra: sensación por serie y evolución en el Club", () => {
  async function gymSession(w: Awaited<ReturnType<typeof world>>) {
    const socio = await verified("Socia Sala");
    const [m] = await db.insert(schema.gymMember).values({ orgId: w.org, locationId: w.A, userId: socio, status: "active" }).returning();
    await gym.startShift(w.tA, w.org, w.A);
    await gym.saveMemberProgram(w.tA, w.org, m.id, { doc: { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: EX, name: "Press anexo", sets: 4, reps: "8", rir: 2, restSec: 90 }] }] }, reason: "Inicial" });
    const t = await tr.myTraining(socio);
    const day = t.state === "ready" ? t.program.days[0].id : "";
    const sid = randomUUID();
    await tr.startSession(socio, { id: sid, dayId: day });
    const s = await tr.getSession(socio, sid);
    return { socio, memberId: m.id, sid, pe: s.exercises[0].id, day };
  }

  it("pesos finos; «ayuda» avisa al piso en turno; «fácil» no; respeta la espera entre avisos", async () => {
    const w = await world();
    const g = await gymSession(w);
    const set = (i: number, feel: string | null, weightKg = 22.75) => tr.logSet(g.socio, g.sid, { id: randomUUID(), programExerciseId: g.pe, setIndex: i, weightKg, reps: 8, rir: 2, feel });
    expect(await code(set(0, null, 22.755))).toBe("invalid");
    expect(await code(set(0, "rarísimo"))).toBe("invalid");
    expect((await set(0, "facil")).alert).toBeNull();
    const a = await set(1, "dificil");
    expect(a.alert?.notified).toBe(1); // Piso A está en turno
    expect((await set(2, "limite")).alert).toBeNull(); // dentro de los 10 minutos
    expect((await set(3, "ayuda")).alert?.notified).toBe(1); // pedido explícito: siempre avisa
    const list = await alerts.listAlerts(w.tA, w.org, w.A);
    expect(list.map((x) => x.feel)).toEqual(["ayuda", "dificil"]);
    expect(list[1].set).toEqual({ n: 2, weightKg: 22.75, reps: 8 });
    await alerts.ackAlert(w.tA, w.org, list[0].id);
    expect((await alerts.listAlerts(w.tA, w.org, w.A))[0].ackBy).toBe("Piso A");
    expect(await code(alerts.listAlerts(w.tB, w.org, w.A))).toBe("not_found"); // otra sede
    const out = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.userId, w.tA));
    expect(out.filter((o) => o.kind === "floor_alert").map((o) => o.body)).toEqual(["Un socio pidió atención en sala", "Un socio pidió atención en sala"]);
    // Pausar el acceso corta el registro de nuevas series.
    await join.setAccess(w.owner, w.org, g.memberId, "suspend");
    expect(await code(set(0, null))).toBe("relation_inactive");
  });

  it("multisede: con ingreso registrado en otra sede habilitada, avisa a esa sede; sin acceso a esa sede, a la principal", async () => {
    const w = await world();
    const g = await gymSession(w);
    await gym.startShift(w.tB, w.org, w.B);
    await db.insert(schema.attendance).values({ orgId: w.org, locationId: w.B, gymMemberId: g.memberId, source: "recepcion_qr" });
    const set = (i: number) => tr.logSet(g.socio, g.sid, { id: randomUUID(), programExerciseId: g.pe, setIndex: i, weightKg: 20, reps: 8, rir: 2, feel: "ayuda" });
    await set(0); // sin acceso a Belgrano: el registro no alcanza, va a la principal
    expect((await alerts.listAlerts(w.tA, w.org, w.A)).length).toBe(1);
    await db.insert(schema.gymMemberLocation).values({ gymMemberId: g.memberId, locationId: w.B });
    await set(1);
    expect((await alerts.listAlerts(w.tB, w.org, w.B)).length).toBe(1);
    expect((await alerts.listAlerts(w.tA, w.org, w.A)).length).toBe(1);
  });

  it("serie sincronizada tarde no avisa; las sensaciones nunca aparecen en el Club", async () => {
    const w = await world();
    const g = await gymSession(w);
    const late = new Date(Date.now() - 30 * 60_000).toISOString();
    const r = await tr.logSet(g.socio, g.sid, { id: randomUUID(), programExerciseId: g.pe, setIndex: 0, weightKg: 20, reps: 8, rir: 2, feel: "ayuda", at: late });
    expect(r.alert).toBeNull();
    await tr.logSet(g.socio, g.sid, { id: randomUUID(), programExerciseId: g.pe, setIndex: 1, weightKg: 21.25, reps: 8, rir: 1, feel: "molestia" });
    await tr.sessionAction(g.socio, g.sid, "finish");
    // Segundo entrenamiento para tener evolución.
    const sid2 = randomUUID();
    await tr.startSession(g.socio, { id: sid2, dayId: g.day });
    await tr.logSet(g.socio, sid2, { id: randomUUID(), programExerciseId: g.pe, setIndex: 0, weightKg: 23.5, reps: 8, rir: 2 });
    await tr.sessionAction(g.socio, sid2, "finish");
    await club.joinClub(g.socio, w.org, { showName: true, inRanking: false });
    expect((await club.exerciseEvolution(g.socio, w.org, EX)).map((p) => p.kg)).toEqual([21.25, 23.5]);
    await club.createClubPost(g.socio, w.org, { progressExerciseId: EX });
    await club.createClubPost(g.socio, w.org, { sessionId: g.sid });
    const feed = await club.feed(g.socio, w.org);
    expect(feed.map((p) => p.kind).sort()).toEqual(["progress", "session"]);
    expect(JSON.stringify(feed)).not.toMatch(/molestia|ayuda|feel|rir/i);
    // Perfil: vacío hasta elegir; luego sólo lo elegido.
    const otro = await verified();
    await db.insert(schema.gymMember).values({ orgId: w.org, locationId: w.A, userId: otro, status: "active" });
    await club.joinClub(otro, w.org, { showName: true, inRanking: false });
    expect((await club.viewClubProfile(otro, w.org, g.socio)).showcase).toEqual([]);
    await club.setClubProfile(g.socio, w.org, { bio: "Voy por 30 kg", showcase: [EX, "inexistente"] });
    const v = await club.viewClubProfile(otro, w.org, g.socio);
    expect(v.showcase.map((s) => s.exercise)).toEqual(["Press anexo"]);
    expect(v.monthDays).toBeNull();
    expect(await code(club.setClubProfile(g.socio, w.org, { bio: "mirá https://x.y" }))).toBe("invalid");
  });
});

describe("centro de avisos del staff (F-HX-26, D101)", () => {
  it("persiste el aviso sin push, sólo para la sede; resuelto por otra persona; leído por persona", async () => {
    const w = await world();
    await gym.startShift(w.tA, w.org, w.A);
    await gym.startShift(w.tB, w.org, w.B);
    const slug = await slugFor(w.owner, w.org, w.A);
    const socio = await verified("Socia Avisos");
    const r = await join.requestAccess(socio, slug, { terms: true });
    const id = "request" in r ? r.request!.id : "";
    const a = await notices.myStaffNotices(w.tA, w.org);
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ kind: "join_request", resolved: false, read: false, go: { s: "joins", sel: id } });
    expect(a.unread).toBe(1);
    expect((await notices.myStaffNotices(w.tB, w.org)).items).toHaveLength(0); // otra sede
    await join.escalatePending(new Date(Date.now() + 6 * 60_000));
    const rec = await notices.myStaffNotices(w.recep, w.org);
    expect(rec.items.map((x) => x.kind)).toEqual(["join_escalation"]);
    await join.decideJoin(w.tA, w.org, id, { approve: true, method: "conocimiento_directo" });
    const rec2 = await notices.myStaffNotices(w.recep, w.org);
    expect(rec2.items[0]).toMatchObject({ resolved: true, resolution: "Aprobada · Piso A" });
    expect(rec2.unread).toBe(0); // resuelto no cuenta como pendiente aunque no se haya leído
    await notices.markStaffNoticesRead(w.tB, w.org, [a.items[0].id]); // id ajeno: no cambia nada
    expect((await notices.myStaffNotices(w.tA, w.org)).items[0].read).toBe(false);
    await notices.markStaffNoticesRead(w.tA, w.org, null);
    expect((await notices.myStaffNotices(w.tA, w.org)).items[0].read).toBe(true);
    const outsider = await verified("Ajena");
    expect(await code(notices.myStaffNotices(outsider, w.org))).toBe("not_found");
  });
});

describe("QR de la sede para mostrar (D116)", () => {
  it("sala y recepción ven el QR de sus sedes sin regenerarlo; si no había, se crea uno; otra persona no", async () => {
    const w = await world();
    // Sin QR previo: el entrenador de sala lo pide y se crea uno solo para su sede.
    const first = await join.showJoinQr(w.tA, w.org);
    expect(first.qrs.map((q) => q.location.id)).toEqual([w.A]);
    // Recepción ve el mismo: no se regenera.
    expect((await join.showJoinQr(w.recep, w.org)).qrs[0].slug).toBe(first.qrs[0].slug);
    // El de la otra sede es de su propio entrenador.
    expect((await join.showJoinQr(w.tB, w.org)).qrs.map((q) => q.location.id)).toEqual([w.B]);
    // Si gerencia regenera, se muestra el nuevo; el viejo deja de servir.
    const fresh = await slugFor(w.manager, w.org, w.A);
    expect((await join.showJoinQr(w.tA, w.org)).qrs[0].slug).toBe(fresh);
    // El entrenador no puede regenerar ni revocar, y alguien ajeno no ve nada.
    expect(await code(join.regenerateJoinLink(w.tA, w.org, w.A))).not.toBe("ok");
    const outsider = await verified();
    expect(await code(join.showJoinQr(outsider, w.org))).not.toBe("ok");
  });
});
