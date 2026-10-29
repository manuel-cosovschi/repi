import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as svc from "@/server/access/services";
import { AccessError, dniHmac, dniLast3, resetRateLimits } from "@/server/access/util";

const PW = "prueba1234";
let n = 0;
const mail = () => `persona${++n}.${Date.now()}@test.repi.local`;

async function lastMail(to: string) {
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  return m;
}
async function otpFor(email: string) {
  const m = await lastMail(email);
  const code = /\b(\d{6})\b/.exec(m?.body ?? "")?.[1];
  if (!code) throw new Error("sin código para " + email);
  return code;
}
async function verified(email: string, extra: Partial<svc.SignUpInput> = {}) {
  const r = await svc.signUpPerson({ name: "Persona Prueba", email, password: PW, terms: true, ...extra });
  await auth.api.verifyEmailOTP({ body: { email, otp: await otpFor(email) } });
  return r.userId!;
}
const expectErr = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(AccessError);
  await p.catch((e: AccessError) => expect(e.code).toBe(code));
};
const birthYearsAgo = (y: number) => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() - y}`;
};

beforeEach(() => resetRateLimits());

describe("registro", () => {
  it("crea cuenta sin verificar, registra términos con versión y envía código", async () => {
    const email = mail();
    const { userId } = await svc.signUpPerson({ name: "Ana Coach", email, password: PW, terms: true });
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId!));
    expect(u.emailVerified).toBe(false);
    const legal = await db.select().from(schema.legalAcceptance).where(eq(schema.legalAcceptance.userId, userId!));
    const mails = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email));
    expect(mails).toHaveLength(1); // un solo código, no duplicado por el hook de Better Auth
    expect(legal.map((l) => l.document).sort()).toEqual(["privacy", "terms"]);
    expect(legal[0].version).toMatch(/^v2026/);
    expect(await otpFor(email)).toMatch(/^\d{6}$/);
  });
  it("el servidor rechaza contraseña débil y términos sin aceptar", async () => {
    await expectErr(svc.signUpPerson({ name: "X", email: mail(), password: "abcdefgh", terms: true }), "invalid");
    await expectErr(svc.signUpPerson({ name: "X", email: mail(), password: PW, terms: false }), "invalid");
  });
  it("email duplicado: respuesta indistinguible, sin cuenta nueva, aviso al titular", async () => {
    const email = mail();
    await svc.signUpPerson({ name: "Uno", email, password: PW, terms: true });
    const r = await svc.signUpPerson({ name: "Dos", email, password: PW, terms: true });
    expect(r).toMatchObject({ userId: null, existing: true });
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(1);
    expect((await lastMail(email)).subject).toBe("Ya tenés una cuenta REPI");
  });
  it("menor de 13 no puede crear cuenta; 13–17 queda marcado menor", async () => {
    await expectErr(svc.signUpPerson({ name: "Niño", email: mail(), password: PW, terms: true, birth: birthYearsAgo(12) }), "under_13");
    const r = await svc.signUpPerson({ name: "Teen", email: mail(), password: PW, terms: true, birth: birthYearsAgo(15) });
    expect(r.minor).toBe(true);
  });
  it("sin verificar no crea espacio de coach", async () => {
    const email = mail();
    const { userId } = await svc.signUpPerson({ name: "Sin Verificar", email, password: PW, terms: true });
    await expectErr(svc.createCoachOrganization(userId!, {}), "unverified");
  });
});

async function coachWithOrg() {
  const uid = await verified(mail());
  const org = await svc.createCoachOrganization(uid, { brand: "Agus Coach", specialty: "Fuerza", modality: "Online" });
  return { uid, org };
}

describe("invitación de alumno por coach", () => {
  it("lookup muestra datos reales; aceptar crea relación y sólo los grants pedidos y permitidos", async () => {
    const { uid: coachId, org } = await coachWithOrg();
    const alumnoEmail = mail();
    const inv = await svc.inviteCoachClient(coachId, org.id, { email: alumnoEmail });
    const look = await svc.lookupInvitation(inv.code.toLowerCase());
    expect(look).toMatchObject({ kind: "coach_client", orgName: "Agus Coach", detail: "Fuerza · Online" });

    const alumno = await verified(alumnoEmail, { birth: birthYearsAgo(25) });
    const r = await svc.acceptInvitation(alumno, inv.code, ["health", "chat", "progress_photos"]);
    expect(r.grants.sort()).toEqual(["health", "progress_photos", "training"]);
    const ws = await svc.listWorkspaces(alumno);
    expect(ws.map((w) => w.key)).toEqual(["personal"]);
    // Reutilizar el código falla.
    await expectErr(svc.acceptInvitation(alumno, inv.code), "invalid_code");
  });
  it("código revocado o vencido no se puede usar ni consultar", async () => {
    const { uid, org } = await coachWithOrg();
    const a = await svc.inviteCoachClient(uid, org.id, { email: mail() });
    await svc.revokeInvitation(uid, a.id);
    await expectErr(svc.lookupInvitation(a.code), "invalid_code");
    const b = await svc.inviteCoachClient(uid, org.id, { email: mail() });
    await db.update(schema.invitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invitation.id, b.id));
    await expectErr(svc.lookupInvitation(b.code), "invalid_code");
  });
  it("otro usuario no puede invitar en un espacio ajeno", async () => {
    const { org } = await coachWithOrg();
    const intruso = await verified(mail());
    await expectErr(svc.inviteCoachClient(intruso, org.id, { email: mail() }), "forbidden");
  });
  it("el coach no puede aceptarse a sí mismo como cliente", async () => {
    const { uid, org } = await coachWithOrg();
    const [me] = await db.select().from(schema.user).where(eq(schema.user.id, uid));
    const inv = await svc.inviteCoachClient(uid, org.id, { email: me.email });
    await expectErr(svc.acceptInvitation(uid, inv.code), "self_invite");
  });
  it("anexo: sin email no hay invitación; con email, sólo la acepta esa cuenta; reenviar invalida la anterior", async () => {
    const { uid, org } = await coachWithOrg();
    await expectErr(svc.inviteCoachClient(uid, org.id, {}), "invalid");
    const destino = mail();
    const inv = await svc.inviteCoachClient(uid, org.id, { email: destino });
    const otro = await verified(mail());
    await expectErr(svc.acceptInvitation(otro, inv.code), "email_mismatch");
    const nueva = await svc.resendInvitation(uid, inv.id);
    await expectErr(svc.lookupInvitation(inv.code), "invalid_code");
    const alumno = await verified(destino);
    await svc.acceptInvitation(alumno, nueva.code);
  });
});

describe("anexo PWA: retomar invitaciones al abrir desde inicio", () => {
  it("lista sólo las vigentes del mismo email verificado y no acepta nada", async () => {
    const { uid, org } = await coachWithOrg();
    const destino = mail();
    const vigente = await svc.inviteCoachClient(uid, org.id, { email: destino.toUpperCase() });
    const vencida = await svc.inviteCoachClient(uid, org.id, { email: destino });
    await db.update(schema.invitation).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.invitation.code, vencida.code));
    const revocada = await svc.inviteCoachClient(uid, org.id, { email: destino });
    await svc.revokeInvitation(uid, revocada.id);
    await svc.inviteCoachClient(uid, org.id, { email: mail() }); // de otra persona

    const alumno = await verified(destino);
    const list = await svc.pendingInvitations(alumno);
    expect(list.map((i) => i.code)).toEqual([vigente.code]);
    expect(list[0]).toMatchObject({ kind: "coach_client", orgName: "Agus Coach" });
    const [still] = await db.select().from(schema.invitation).where(eq(schema.invitation.code, vigente.code));
    expect(still.status).toBe("pending");
    await svc.acceptInvitation(alumno, vigente.code);
    expect(await svc.pendingInvitations(alumno)).toEqual([]);
  });
  it("sin email verificado no devuelve nada", async () => {
    const { uid, org } = await coachWithOrg();
    const destino = mail();
    await svc.inviteCoachClient(uid, org.id, { email: destino });
    const r = await svc.signUpPerson({ name: "Sin Verificar", email: destino, password: PW, terms: true });
    expect(await svc.pendingInvitations(r.userId!)).toEqual([]);
  });
});

describe("menores", () => {
  it("sin autorización no comparte salud ni fotos; tras aprobación del adulto sí puede", async () => {
    const { uid: coachId, org } = await coachWithOrg();
    const teenEmail = mail();
    const teen = await verified(teenEmail, { birth: birthYearsAgo(15) });
    expect(await svc.minorWithoutGuardian(teen)).toBe(true);
    const inv = await svc.inviteCoachClient(coachId, org.id, { email: teenEmail });
    const r = await svc.acceptInvitation(teen, inv.code, ["health", "progress_photos", "measurements"]);
    expect(r.grants.sort()).toEqual(["measurements", "training"]);

    const adult = mail();
    await expectErr(svc.requestGuardianConsent(teen, { name: "Mamá", email: teenEmail, relation: "Madre" }), "invalid");
    await svc.requestGuardianConsent(teen, { name: "Laura", email: adult, relation: "Madre" });
    expect(await svc.guardianStatus(teen)).toBe("pending");
    const token = /\/tutor\/([\w-]+)/.exec((await lastMail(adult)).body)![1];
    expect((await svc.getGuardianRequest(token)).guardianName).toBe("Laura");
    await svc.decideGuardian(token, true);
    expect(await svc.guardianStatus(teen)).toBe("approved");
    expect(await svc.minorWithoutGuardian(teen)).toBe(false);
    await expectErr(svc.decideGuardian(token, false), "invalid_token"); // un solo uso
  });
});

async function gymWithLocation() {
  const ownerEmail = mail();
  const owner = await verified(ownerEmail, { organizationTerms: true });
  const org = await svc.createGymOrganization(owner, { name: `Gym Test ${n}`, cuit: "20-12345678-6", locationsRange: "2–3" });
  const [loc] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Palermo", address: "Av. Santa Fe 3200" }).returning();
  return { owner, ownerEmail, org, loc };
}

describe("gimnasio", () => {
  it("dueño: DPA vinculado al gym, CUIT validado, entra sin exigirle 2FA (D119)", async () => {
    const { owner, org } = await gymWithLocation();
    const dpa = await db.select().from(schema.legalAcceptance).where(and(eq(schema.legalAcceptance.userId, owner), eq(schema.legalAcceptance.document, "dpa")));
    expect(dpa[0].orgId).toBe(org.id);
    await expectErr(svc.createGymOrganization(owner, { name: "Otro", cuit: "30-12345678-9" }), "invalid_cuit");
    const ws = await svc.listWorkspaces(owner);
    expect(ws[0]).toMatchObject({ detail: "Dueño", needs2fa: false });
  });
  it("invitación de staff ligada al email: otra cuenta es rechazada y auditada", async () => {
    const { owner, org, loc } = await gymWithLocation();
    const staffEmail = mail();
    const inv = await svc.inviteGymStaff(owner, org.id, { email: staffEmail, role: "floor_trainer", locationId: loc.id });
    const look = await svc.lookupInvitation(inv.code);
    expect(look.detail).toBe("Entrenador de sala · Palermo");
    expect(look.inviter).toMatch(/dueño/);
    expect(look.emailBound).toBe(true);
    expect(look.emailHint).toMatch(/^.{2}•••.*@/);
    expect(look.emailHint).not.toBe(staffEmail);
    // Antes de crear la cuenta: con otro email se frena acá (no al final, después de verificar); mayúsculas y espacios no importan.
    await expectErr(svc.assertInvitationEmail(inv.code, mail()), "email_mismatch");
    await svc.assertInvitationEmail(inv.code, ` ${staffEmail.toUpperCase()} `);
    const otro = await verified(mail());
    await expectErr(svc.acceptInvitation(otro, inv.code), "email_mismatch");
    const denied = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, otro), eq(schema.auditEvent.result, "denied")));
    expect(denied).toHaveLength(1);
    const staff = await verified(staffEmail);
    await svc.acceptInvitation(staff, inv.code);
    const ws = await svc.listWorkspaces(staff);
    expect(ws[0]).toMatchObject({ detail: "Entrenador de sala", needs2fa: false });
    expect(ws[0].title).toContain("Palermo");
  });
  it("anexo: el alta de socios por DNI quedó cerrada (se usa el QR de la sede)", async () => {
    const { loc } = await gymWithLocation();
    await expectErr(svc.memberSignUp({ locationId: loc.id, dni: "35123456", email: mail(), password: PW, terms: true }), "moved");
  });
});

describe("recuperación de contraseña", () => {
  it("responde igual para email inexistente y el reset revoca las sesiones previas", async () => {
    const ghost = mail();
    await expect(auth.api.requestPasswordResetEmailOTP({ body: { email: ghost } })).resolves.toMatchObject({ success: true });
    expect(await lastMail(ghost)).toBeUndefined();

    const email = mail();
    const uid = await verified(email);
    await auth.api.signInEmail({ body: { email, password: PW } });
    expect((await db.select().from(schema.session).where(eq(schema.session.userId, uid))).length).toBeGreaterThan(0);
    await auth.api.requestPasswordResetEmailOTP({ body: { email } });
    await auth.api.resetPasswordEmailOTP({ body: { email, otp: await otpFor(email), password: "nueva5678" } });
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, uid))).toHaveLength(0);
    await expect(auth.api.signInEmail({ body: { email, password: PW } })).rejects.toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email, password: "nueva5678" } })).resolves.toBeTruthy();
  });
});
