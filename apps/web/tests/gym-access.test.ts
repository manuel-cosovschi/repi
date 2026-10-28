// REPI Gym Access Control (D127): membresía, política, QR dinámico, check-in y protección de acciones en el servidor.
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as ac from "@/server/gym/access-control";
import * as join from "@/server/join/services";
import * as cn from "@/server/gym/connect";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { localDate } from "@repi/domain";

let n = 0;
const mail = () => `ga${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Acceso") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

let EX: string;
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Remo acceso", muscleGroup: "Espalda" }).onConflictDoNothing().returning();
  EX = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Remo acceso")))[0].id;
});
beforeEach(() => resetRateLimits());
const DOC = () => ({ name: "Sala acceso", weeks: 4, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: "Remo acceso", sets: 3, reps: "10", rir: 2, restSec: 90 }] }] });

/** Gimnasio con control de acceso (HÍBRIDO), dos sedes, dueño, recepción, profesor con turno y socio con programa del gym. */
async function gymWorld(name = "Gym A", mode: "open" | "hybrid" | "strict" = "hybrid") {
  const owner = await verified(`Dueño ${name}`);
  const org = await acc.createGymOrganization(owner, { name: `${name} ${n}-${Date.now()}` });
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
  await ac.setAccessEnabled(org.id, true, owner);
  if (mode !== "hybrid") await ac.updatePolicy(owner, org.id, { mode });
  const floor = await verified("Profe Sala");
  await db.insert(schema.staffMembership).values({ userId: floor, orgId: org.id, locationId: A.id, role: "floor_trainer" });
  const recep = await verified("Recepción");
  await db.insert(schema.staffMembership).values({ userId: recep, orgId: org.id, locationId: A.id, role: "reception" });
  await gym.startShift(floor, org.id, A.id);
  const member = async (u?: string) => {
    const userId = u ?? await verified("Socia");
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    await gym.saveMemberProgram(floor, org.id, m.id, { doc: DOC(), reason: "Inicial" });
    return { userId, memberId: m.id };
  };
  return { org: org.id, A: A.id, B: B.id, owner, floor, recep, member };
}
const qrOf = async (w: { org: string; A: string; recep: string }, at = new Date()) => (await ac.staffQr(w.recep, w.org, w.A, at)).token;
async function startGym(userId: string, startedAt?: string) {
  const t = await tr.myTraining(userId);
  if (t.state !== "ready") throw new Error("sin programa");
  const id = randomUUID();
  return { id, s: await tr.startSession(userId, { id, dayId: t.program.days[0].id, startedAt }) };
}

describe("Gym Access · membresía y política", () => {
  it("1–2 · desde casa consulta su rutina; en HÍBRIDO no inicia el entrenamiento del gimnasio sin validar (ni llamando directo a la API)", async () => {
    const w = await gymWorld();
    const v = await w.member();
    const t = await tr.myTraining(v.userId);
    expect(t.state).toBe("ready");
    expect((await err(startGym(v.userId)))?.code).toBe("presence_required");
    const st = await ac.myPresence(v.userId);
    expect(st.gyms[0]).toMatchObject({ enabled: true, mode: "hybrid", startNeedsCheckin: true, membership: "active", pass: null });
  });

  it("12–13 · OPEN no exige nada; ESTRICTO sólo restringe lo configurado", async () => {
    const o = await gymWorld("Abierto", "open");
    const a = await o.member();
    expect((await startGym(a.userId)).s.presenceCheckinId).toBeNull();
    const s = await gymWorld("Estricto", "strict");
    await db.update(schema.organization).set({ connectEnabled: true }).where(eq(schema.organization.id, s.org));
    const b = await s.member();
    expect(await cn.memberCreate(b.userId, { reason: "duda" })).toMatchObject({ duplicate: false }); // no configurado: libre
    await ac.updatePolicy(s.owner, s.org, { strictActions: ["gym.assistance.request"] });
    expect((await err(cn.memberCreate(b.userId, { reason: "hablar" })))?.code).toBe("presence_required");
    await ac.memberCheckin(b.userId, { token: await qrOf(s) });
    expect(await cn.memberCreate(b.userId, { reason: "hablar" })).toMatchObject({ duplicate: false });
  });

  it("11 · baja, pausa o vigencia vencida cortan el acceso institucional y anulan el ingreso vigente; lo registrado queda", async () => {
    const w = await gymWorld();
    const v = await w.member();
    const ok = await ac.memberCheckin(v.userId, { token: await qrOf(w) });
    expect(ok.ok).toBe(true);
    const { id } = await startGym(v.userId);
    const sess = await tr.getSession(v.userId, id);
    await tr.logSet(v.userId, id, { id: randomUUID(), programExerciseId: sess.exercises[0].id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    await join.setAccess(w.owner, w.org, v.memberId, "end");
    const [pass] = await db.select().from(schema.gymCheckin).where(and(eq(schema.gymCheckin.userId, v.userId), eq(schema.gymCheckin.result, "ok")));
    expect(pass.revokedAt).not.toBeNull();
    expect((await err(tr.logSet(v.userId, id, { id: randomUUID(), programExerciseId: sess.exercises[0].id, setIndex: 1, weightKg: 40, reps: 10, rir: 2 })))?.code).toBe("relation_inactive");
    expect((await tr.getSession(v.userId, id)).exercises[0].logs).toHaveLength(1); // 19 · no se pierde lo guardado
    const r = await ac.memberCheckin(v.userId, { token: await qrOf(w) });
    expect(r).toMatchObject({ ok: false, reason: "membership_inactive" });
    const u = await w.member();
    await ac.setAccessUntil(w.owner, w.org, u.memberId, "2020-01-01");
    expect(await ac.memberCheckin(u.userId, { token: await qrOf(w) })).toMatchObject({ ok: false, reason: "membership_inactive" });
  });
});

describe("Gym Access · QR dinámico", () => {
  it("3 · 8 · 9 · un QR vigente sirve a varios socios; el mismo socio dos veces no crea pases contradictorios", async () => {
    const w = await gymWorld();
    const a = await w.member(), b = await w.member();
    const token = await qrOf(w);
    const ra = await ac.memberCheckin(a.userId, { token });
    const rb = await ac.memberCheckin(b.userId, { token });
    expect([ra.ok, rb.ok]).toEqual([true, true]);
    const [x, y] = await Promise.all([ac.memberCheckin(a.userId, { token }), ac.memberCheckin(a.userId, { token: await qrOf(w) })]);
    expect(x.ok && y.ok && x.pass.id === y.pass.id && ra.ok && ra.pass.id === x.pass.id).toBe(true);
    const passes = await db.select().from(schema.gymCheckin).where(and(eq(schema.gymCheckin.userId, a.userId), eq(schema.gymCheckin.result, "ok")));
    expect(passes).toHaveLength(1);
    const { s } = await startGym(a.userId);
    expect(s.presenceCheckinId).toBe(passes[0].id);
  });

  it("4 · 5 · 6 · 24 · sin membresía, vencido (captura de pantalla vieja) o alterado: rechazado y registrado sin datos de más", async () => {
    const w = await gymWorld();
    const v = await w.member();
    const outsider = await verified("Rita Externa");
    expect(await ac.memberCheckin(outsider, { token: await qrOf(w) })).toMatchObject({ ok: false, reason: "no_membership" });
    const old = await qrOf(w, new Date(Date.now() - 31_000));
    expect(await ac.memberCheckin(v.userId, { token: old })).toMatchObject({ ok: false, reason: "expired_token" });
    const t = await qrOf(w);
    const [p, body, sig] = t.split(".");
    const forged = `${p}.${Buffer.from(Buffer.from(body, "base64url").toString().replace(/\.\d{10}\./, ".9999999999.")).toString("base64url")}.${sig}`;
    expect(await ac.memberCheckin(v.userId, { token: forged })).toMatchObject({ ok: false, reason: "invalid_token" });
    expect(await ac.memberCheckin(v.userId, { token: "https://evil.example/ingreso" })).toMatchObject({ ok: false, reason: "invalid_token" });
    const rep = await ac.accessReport(w.owner, w.org, null, 7);
    expect(rep.denials.map((d) => d.reason).sort()).toEqual(["expired_token", "no_membership"]);
    expect(JSON.stringify(rep)).not.toContain("Rita Externa"); // se muestra genérico, sin el nombre
    expect(rep.recent.find((r) => r.reason === "Sin membresía")?.name).toBe("Persona sin membresía");
  });

  it("7 · 16 · 18 · 20 · un ingreso de un gimnasio no sirve en otro; dos membresías son independientes; sin fugas entre organizaciones", async () => {
    const A = await gymWorld("Gym A"), B = await gymWorld("Gym B");
    const both = await verified("Socia de dos gimnasios");
    await A.member(both);
    await B.member(both);
    await db.insert(schema.userPref).values({ userId: both, activeRelationId: (await db.select().from(schema.gymMember).where(and(eq(schema.gymMember.userId, both), eq(schema.gymMember.orgId, B.org))))[0].id });
    expect((await ac.memberCheckin(both, { token: await qrOf(A) })).ok).toBe(true);
    expect((await err(startGym(both)))?.code).toBe("presence_required"); // relación activa: Gym B
    expect((await ac.memberCheckin(both, { token: await qrOf(B) })).ok).toBe(true);
    expect((await startGym(both)).s.presenceCheckinId).not.toBeNull();
    expect((await ac.myPresence(both)).gyms.filter((g) => g.pass)).toHaveLength(2);
    expect((await err(ac.staffQr(A.recep, B.org, B.A)))?.code).toBe("not_found");
    expect((await err(ac.staffQr(A.recep, A.org, B.A)))?.code).toBe("not_found");
    expect((await err(ac.accessReport(A.owner, B.org, null)))?.code).toBe("not_found");
    expect((await err(ac.accessReport(A.floor, A.org, null)))?.code).toBe("forbidden");
    expect((await err(ac.staffCheckin(A.recep, A.org, { gymMemberId: (await B.member()).memberId, locationId: A.A })))?.code).toBe("not_found");
  });

  it("pantalla autorizada: secreto válido muestra el QR de su sede; revocada o inventada, no", async () => {
    const w = await gymWorld();
    const d = await ac.createDisplay(w.owner, w.org, w.A, "Tablet recepción");
    const secret = d.link.split("#k=")[1];
    const q = await ac.displayQr(secret);
    expect(ac.readQrToken(q.token)).toMatchObject({ ok: true, orgId: w.org, locationId: w.A });
    expect((await err(ac.displayQr("x".repeat(43))))?.code).toBe("invalid_display");
    await ac.revokeDisplay(w.owner, w.org, d.id);
    expect((await err(ac.displayQr(secret)))?.code).toBe("invalid_display");
    expect((await err(ac.staffQr(w.floor, w.org, w.A)))?.code).toBe("forbidden"); // el piso no genera QR de ingreso
  });
});

describe("Gym Access · vigencia, sin conexión y alternativas", () => {
  it("10 · 19 · 26 · vencido no registra series nuevas; lo hecho sin conexión dentro de la vigencia se acepta al sincronizar", async () => {
    const w = await gymWorld();
    const v = await w.member();
    const t0 = new Date(Date.now() - 4 * 3_600_000);
    expect((await ac.memberCheckin(v.userId, { token: await qrOf(w, t0) }, t0)).ok).toBe(true);
    const id = randomUUID();
    const tt = await tr.myTraining(v.userId);
    // Inicio y primera serie hechos sin conexión hace 3 h 50 min (dentro de la vigencia) que llegan ahora: se aceptan.
    await tr.startSession(v.userId, { id, dayId: tt.state === "ready" ? tt.program.days[0].id : "", startedAt: new Date(t0.getTime() + 10 * 60_000).toISOString() });
    const sess = await tr.getSession(v.userId, id);
    await tr.logSet(v.userId, id, { id: randomUUID(), programExerciseId: sess.exercises[0].id, setIndex: 0, weightKg: 30, reps: 10, rir: 2, at: new Date(t0.getTime() + 20 * 60_000).toISOString() });
    // Una serie de ahora (vencido) se rechaza y no se simula guardada; lo anterior sigue.
    expect((await err(tr.logSet(v.userId, id, { id: randomUUID(), programExerciseId: sess.exercises[0].id, setIndex: 1, weightKg: 30, reps: 10, rir: 2 })))?.code).toBe("presence_required");
    expect((await tr.getSession(v.userId, id)).exercises[0].logs).toHaveLength(1);
    // Revalida y sigue.
    expect((await ac.memberCheckin(v.userId, { token: await qrOf(w) })).ok).toBe(true);
    await tr.logSet(v.userId, id, { id: randomUUID(), programExerciseId: sess.exercises[0].id, setIndex: 1, weightKg: 30, reps: 10, rir: 2 });
    expect((await tr.getSession(v.userId, id)).exercises[0].logs).toHaveLength(2);
  });

  it("14 · 15 · ubicación obligatoria sin lectura confiable deriva al equipo, que valida a mano con turno", async () => {
    const w = await gymWorld();
    await ac.updatePolicy(w.owner, w.org, { geoMode: "required" });
    await ac.setLocationGeo(w.owner, w.org, w.A, { lat: -34.6, lng: -58.4, radiusM: 150 });
    const v = await w.member();
    expect(await ac.memberCheckin(v.userId, { token: await qrOf(w), geo: null })).toMatchObject({ ok: false, reason: "geo_denied" });
    expect(await ac.memberCheckin(v.userId, { token: await qrOf(w), geo: { lat: -34.7, lng: -58.5, accuracyM: 20, ageSec: 3 } })).toMatchObject({ ok: false, reason: "geo_far" });
    const near = await ac.memberCheckin(v.userId, { token: await qrOf(w), geo: { lat: -34.6001, lng: -58.4001, accuracyM: 25, ageSec: 3 } });
    expect(near.ok && near.pass.method).toBe("qr_geo");
    const [denied] = await db.select().from(schema.gymCheckin).where(and(eq(schema.gymCheckin.userId, v.userId), eq(schema.gymCheckin.reason, "geo_far")));
    expect(Object.keys(denied).some((k) => /lat|lng/i.test(k))).toBe(false); // no se guardan coordenadas
    const u = await w.member();
    const m = await ac.staffCheckin(w.floor, w.org, { gymMemberId: u.memberId, locationId: w.A, note: "GPS apagado" });
    expect(m.pass.method).toBe("staff");
    const started = await startGym(u.userId);
    expect(started.s.presenceCheckinId).toBe(m.pass.id);
    const rep = await ac.accessReport(w.owner, w.org, null, 7);
    expect(rep.totals).toMatchObject({ manual: 1, withGeo: 1, sessions: 1 });
    await ac.revokePass(w.owner, w.org, m.pass.id);
    const sess = await tr.getSession(u.userId, started.id);
    expect((await err(tr.logSet(u.userId, started.id, { id: randomUUID(), programExerciseId: sess.exercises[0].id, setIndex: 0, weightKg: 20, reps: 10, rir: 2 })))?.code).toBe("presence_required");
  });

  it("17 · Repi Coach no cambia: el alumno de un coach entrena sin validar ingreso", async () => {
    const coach = await verified("Coach Privado");
    const corg = await acc.createCoachOrganization(coach, {});
    const alumno = await verified("Alumno Coach");
    const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, alumno));
    const inv = await acc.inviteCoachClient(coach, corg.id, { email: u.email });
    await acc.acceptInvitation(alumno, inv.code, []);
    const tpl = await tr.createTemplate(coach, corg.id, DOC());
    const [rel] = await db.select().from(schema.coachClient).where(eq(schema.coachClient.userId, alumno));
    await tr.assignProgram(coach, corg.id, tpl, { coachClientIds: [rel.id], startsOn: localDate(new Date()) });
    const { s } = await startGym(alumno);
    expect([s.coachClientId, s.presenceCheckinId]).toEqual([rel.id, null]);
  });

  it("apagar el módulo vuelve al comportamiento anterior y anula los ingresos vigentes", async () => {
    const w = await gymWorld();
    const v = await w.member();
    expect((await ac.memberCheckin(v.userId, { token: await qrOf(w) })).ok).toBe(true);
    await ac.setAccessEnabled(w.org, false, w.owner);
    expect((await startGym(v.userId)).s.presenceCheckinId).toBeNull();
    expect(await ac.memberCheckin(v.userId, { token: ac.issueQrToken(w.org, w.A, 30, "t").token })).toMatchObject({ ok: false, reason: "module_off" });
  });
});
