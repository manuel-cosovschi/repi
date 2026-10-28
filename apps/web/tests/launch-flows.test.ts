// Circuito de lanzamiento Coach (RELEASE_READINESS.md, LF-01..LF-03): de la alta comercial a que el coach vea el progreso,
// con las negativas que bloquean el lanzamiento. El gimnasio se cubre en annex.test.ts y gym.test.ts.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as cm from "@/server/commercial/services";
import * as msg from "@/server/messages/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `lf${++n}.${Date.now()}@test.repi.local`;
async function verified(name: string, email = mail()) {
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e as AccessError).code);
const lastMail = async (to: string) => (await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to)).orderBy(desc(schema.devMailbox.createdAt)).limit(1))[0];

const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g] of [["Press lanzamiento", "Pecho"], ["Remo lanzamiento", "Espalda"]] as const) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

/** Alta comercial real: interés → Admin registra acuerdo y habilita → el coach activa su espacio con la invitación. */
async function coachSpace() {
  const ad = await verified("Admin lanzamiento");
  await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, ad.id));
  const coachEmail = mail();
  await cm.createLead({ kind: "coach", orgName: "Coach Lanzamiento", contactName: "Coach Uno", email: coachEmail });
  const c = await cm.createClient(ad.id, { kind: "coach", orgName: `Coach Lanzamiento ${n}`, legalName: "Coach Uno", responsibleName: "Coach Uno", responsibleEmail: coachEmail, currency: "ARS" });
  await cm.recordAcceptance(ad.id, c.contractId, { method: "external", ref: "Acuerdo firmado", acceptedAt: "2026-10-27", termsVersion: "v2026.10" });
  await cm.enableClient(ad.id, c.contractId, {});
  await cm.sendOwnerInvitation(ad.id, c.contractId);
  const token = /\/activar\/([\w-]+)/.exec((await lastMail(coachEmail)).body)![1];
  const coach = await verified("Coach Uno", coachEmail);
  const intruder = await verified("Otra persona");
  expect(await code(cm.acceptOwnerInvitation(intruder.id, token))).toBe("email_mismatch");
  expect((await cm.acceptOwnerInvitation(coach.id, token)).href).toBe(`/coach/${c.orgId}`);
  return { admin: ad.id, coach: coach.id, orgId: c.orgId, contractId: c.contractId };
}

describe("circuito Coach de punta a punta", () => {
  it("LF-01..03: alta → alumno → rutina → entrenamiento sin duplicados → historial → el coach ve el progreso y ajusta", async () => {
    const { coach, orgId } = await coachSpace();
    // Alumno: invitación ligada a su email, aceptación única.
    const alumno = await verified("Alumna Lanzamiento");
    const inv = await acc.inviteCoachClient(coach, orgId, { email: alumno.email });
    const otro = await verified("Otro alumno");
    expect(await code(acc.acceptInvitation(otro.id, inv.code, []))).not.toBe("ok");
    const rel = await acc.acceptInvitation(alumno.id, inv.code, []);
    expect(await code(acc.acceptInvitation(alumno.id, inv.code, []))).not.toBe("ok");
    // Rutina con series, reps, RIR, descanso e indicaciones; asignada como copia propia.
    const pid = await tr.createTemplate(coach, orgId, { name: "Full body", weeks: 4, note: "Calentá 5 min", days: [
      { name: "Día A", exercises: [
        { exerciseId: EX["Press lanzamiento"], name: "Press lanzamiento", sets: 3, reps: "8-10", rir: 2, restSec: 90, note: "Codos a 45°" },
        { exerciseId: EX["Remo lanzamiento"], name: "Remo lanzamiento", sets: 3, reps: "10-12", rir: 2, restSec: 90 },
      ] },
    ] });
    await tr.assignProgram(coach, orgId, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
    const t = await tr.myTraining(alumno.id);
    expect(t.state).toBe("ready");
    if (t.state !== "ready") return;
    expect(t.program.days[0].exercises.map((e) => e.name)).toEqual(["Press lanzamiento", "Remo lanzamiento"]);
    // Entrenamiento: inicio idempotente, series con reintento (misma id) sin duplicar, finalizar con RPE.
    const sid = randomUUID();
    await tr.startSession(alumno.id, { id: sid, dayId: t.program.days[0].id });
    await tr.startSession(alumno.id, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(alumno.id, sid);
    const setId = randomUUID();
    await tr.logSet(alumno.id, sid, { id: setId, programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    await tr.logSet(alumno.id, sid, { id: setId, programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    await tr.logSet(alumno.id, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 1, weightKg: 42.5, reps: 8, rir: 1 });
    await tr.logSet(alumno.id, sid, { id: randomUUID(), programExerciseId: s.exercises[1].id, setIndex: 0, weightKg: 30, reps: 12, rir: 2 });
    expect(await db.$count(schema.setLog, eq(schema.setLog.sessionId, sid))).toBe(3);
    // Otra persona no escribe en esta sesión.
    expect(await code(tr.logSet(otro.id, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 2, weightKg: 1, reps: 1, rir: 0 }))).not.toBe("ok");
    await tr.sessionAction(alumno.id, sid, "finish");
    await tr.sessionFeedback(alumno.id, sid, { rpe: 7, note: "Bien" });
    const hist = await tr.myHistory(alumno.id);
    expect(hist[0]).toMatchObject({ id: sid, sets: 3, rpe: 7 });
    // El coach ve la sesión, las series y el volumen; otro coach no.
    const det = await tr.clientDetail(coach, orgId, rel.relationId);
    expect(det.sessions[0]).toMatchObject({ id: sid, status: "completed", sets: 3, rpe: 7 });
    expect(det.sessions[0].volumeKg).toBe(40 * 10 + 42.5 * 8 + 30 * 12);
    const other = await coachSpace();
    expect(await code(tr.clientDetail(other.coach, other.orgId, rel.relationId))).toBe("not_found");
    expect(await code(tr.clientDetail(other.coach, orgId, rel.relationId))).toBe("not_found");
    // Ajuste del coach: la copia del alumno cambia para adelante; lo ya registrado no.
    const copy = det.program!;
    await tr.saveProgram(coach, orgId, copy.programId, { ...copy.doc, days: copy.doc.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, sets: 4 })) })) });
    const t2 = await tr.myTraining(alumno.id);
    if (t2.state !== "ready") throw new Error("sin programa");
    expect(t2.program.days[0].exercises[0].sets).toBe(4);
    expect((await tr.getSession(alumno.id, sid)).exercises[0].sets).toBe(3);
    // Mensajes privados en ambos sentidos.
    const [th] = await msg.myThreads(alumno.id);
    await msg.sendMessage(alumno.id, th.id, { id: randomUUID(), body: "¿Subo el press?" });
    expect((await msg.coachThreads(coach, orgId))[0].unread).toBe(1);
    await msg.sendMessage(coach, th.id, { id: randomUUID(), body: "Sí, 2,5 kg" });
    expect((await msg.getThread(alumno.id, th.id)).messages.map((m) => m.body)).toEqual(["¿Subo el press?", "Sí, 2,5 kg"]);
    expect(await code(msg.getThread(other.coach, th.id))).toBe("not_found");
  });

  it("LF-04: suspender la cuenta comercial corta el acceso del coach sin borrar datos", async () => {
    const { admin, coach, orgId, contractId } = await coachSpace();
    await cm.suspendClient(admin, contractId, "Prueba de lanzamiento");
    expect(await code(acc.inviteCoachClient(coach, orgId, { email: mail() }))).not.toBe("ok");
    const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId));
    expect(o).toBeDefined();
  });

  it("LF-05: el coach pausa, reactiva y termina la relación; el historial queda y puede volver a invitarlo", async () => {
    const { coach, orgId } = await coachSpace();
    const alumno = await verified("Alumno Relación");
    const rel = await acc.acceptInvitation(alumno.id, (await acc.inviteCoachClient(coach, orgId, { email: alumno.email })).code, []);
    const pid = await tr.createTemplate(coach, orgId, { name: "Base", weeks: 4, note: "", days: [{ name: "A", exercises: [
      { exerciseId: EX["Press lanzamiento"], name: "Press lanzamiento", sets: 3, reps: "8", rir: 2, restSec: 90 },
    ] }] });
    await tr.assignProgram(coach, orgId, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
    const t = await tr.myTraining(alumno.id);
    if (t.state !== "ready") throw new Error("sin programa");
    const sid = randomUUID();
    await tr.startSession(alumno.id, { id: sid, dayId: t.program.days[0].id });
    await tr.logSet(alumno.id, sid, { id: randomUUID(), programExerciseId: (await tr.getSession(alumno.id, sid)).exercises[0].id, setIndex: 0, weightKg: 40, reps: 8, rir: 2 });
    await tr.sessionAction(alumno.id, sid, "finish");
    // Pausa: el alumno deja de ver el programa; el coach lo sigue viendo en su lista.
    await tr.setClientStatus(coach, orgId, rel.relationId, "paused");
    expect((await tr.myTraining(alumno.id)).state).not.toBe("ready");
    expect((await tr.clientDetail(coach, orgId, rel.relationId)).status).toBe("paused");
    await tr.setClientStatus(coach, orgId, rel.relationId, "active");
    expect((await tr.myTraining(alumno.id)).state).toBe("ready");
    // Otro coach no puede cambiarla.
    const other = await coachSpace();
    expect(await code(tr.setClientStatus(other.coach, orgId, rel.relationId, "ended"))).toBe("not_found");
    // Terminar: sin programa, sin acceso del coach, chat de sólo lectura, historial intacto.
    const [th] = await msg.myThreads(alumno.id);
    await tr.setClientStatus(coach, orgId, rel.relationId, "ended");
    expect((await tr.myTraining(alumno.id)).state).not.toBe("ready");
    expect(await code(tr.clientDetail(coach, orgId, rel.relationId))).toBe("not_found");
    expect(await code(tr.setClientStatus(coach, orgId, rel.relationId, "active"))).toBe("ended");
    expect((await msg.getThread(alumno.id, th.id)).readOnly).toBe(true);
    expect((await tr.myHistory(alumno.id)).map((h) => h.id)).toContain(sid);
    const grants = await db.select().from(schema.consentGrant).where(eq(schema.consentGrant.relationId, rel.relationId));
    expect(grants.every((g) => g.status === "revoked")).toBe(true);
    // Volver: invitación nueva, misma relación reactivada.
    await acc.acceptInvitation(alumno.id, (await acc.inviteCoachClient(coach, orgId, { email: alumno.email })).code, []);
    expect((await tr.clientDetail(coach, orgId, rel.relationId)).status).toBe("active");
  });
});
