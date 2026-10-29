import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;

let n = 0;
const mail = () => `sy${++n}.${Date.now()}@test.repi.local`;
async function verified() {
  const email = mail();
  const r = await acc.signUpPerson({ name: "Persona Sync", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

let EX: Record<string, string> = {};
beforeAll(async () => {
  // Grupo real: estos nombres están en el catálogo base (D129) y otros archivos de prueba esperan su grupo verdadero.
  for (const [name, muscleGroup] of [["Press de banca", "Pecho"], ["Sentadilla", "Piernas"]] as const) {
    await db.insert(schema.exercise).values({ name, muscleGroup }).onConflictDoNothing();
    EX[name] = (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

async function ready() {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach, {});
  const user = await verified();
  const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(user) });
  const rel = await acc.acceptInvitation(user, inv.code, []);
  const pid = await tr.createTemplate(coach, org.id, { name: "P", weeks: 4, note: "", days: [
    { name: "A", exercises: [{ exerciseId: EX["Press de banca"], name: "Press de banca", sets: 3, reps: "8-10", rir: 2, restSec: 120 }] },
    { name: "B", exercises: [{ exerciseId: EX["Sentadilla"], name: "Sentadilla", sets: 3, reps: "5", rir: 2, restSec: 180 }] },
  ] });
  await tr.assignProgram(coach, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  // Las horas del dispositivo van hasta 60 min atrás: cerca de medianoche caerían el día anterior al inicio.
  await db.update(schema.programAssignment).set({ startsOn: localDate(new Date(Date.now() - 2 * 86_400_000)) }).where(eq(schema.programAssignment.coachClientId, rel.relationId)); // la asignación es de la copia del alumno, no de la plantilla
  const t = await tr.myTraining(user);
  if (t.state !== "ready") throw new Error("sin programa");
  return { coach, orgId: org.id, user, relId: rel.relationId, t };
}
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe("sesión hecha sin conexión y sincronizada después", () => {
  it("respeta las horas del dispositivo y reenviar todo no duplica nada", async () => {
    const { user, t } = await ready();
    const t0 = Date.now(), ago = (min: number) => new Date(t0 - min * 60_000).toISOString();
    const id = randomUUID(), pe = t.program!.days[0].exercises[0].id;
    const set1 = { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 80, reps: 10, rir: 2, baseRevision: 0, at: ago(50) };
    const set2 = { id: randomUUID(), programExerciseId: pe, setIndex: 1, weightKg: 80, reps: 9, rir: 1, baseRevision: 0, at: ago(45) };
    const replay = async () => {
      await tr.startSession(user, { id, dayId: t.program!.days[0].id, startedAt: ago(60) });
      await tr.logSet(user, id, set1);
      await tr.logSet(user, id, set2);
      await tr.sessionAction(user, id, "pause", new Date(), ago(40));
      await tr.sessionAction(user, id, "resume", new Date(), ago(30));
      await tr.sessionAction(user, id, "finish", new Date(), ago(20));
    };
    await replay();
    await replay(); // respuestas perdidas: la cola reenvía todo
    const sets = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, id));
    expect(sets).toHaveLength(2);
    const [s] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, id));
    expect(s.status).toBe("completed");
    expect(s.activeMs).toBe(30 * 60_000); // 60→40 activo, 40→30 en pausa, 30→20 activo
    expect(await tr.listConflicts(user)).toHaveLength(0);
  });

  it("rechaza horas imposibles del dispositivo", async () => {
    const { user, t } = await ready();
    const e = await err(tr.startSession(user, { id: randomUUID(), dayId: t.program!.days[0].id, startedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }));
    expect(e?.code).toBe("invalid_time");
  });

  it("una sesión iniciada sin conexión con una versión vieja se acepta y conserva esa versión", async () => {
    const { user, t, coach, orgId, relId } = await ready();
    const oldDay = t.program!.days[0].id;
    // Primero se usa la versión 1 (queda congelada) y luego el coach edita: versión 2.
    const s0 = randomUUID();
    await tr.startSession(user, { id: s0, dayId: oldDay });
    await tr.sessionAction(user, s0, "finish");
    const det = await tr.clientDetail(coach, orgId, relId);
    await tr.saveProgram(coach, orgId, det.program!.programId, { name: "P2", weeks: 4, note: "", days: [{ name: "A2", exercises: [{ exerciseId: EX["Sentadilla"], name: "Sentadilla", sets: 2, reps: "5", rir: null, restSec: 60 }] }] });
    const id = randomUUID();
    const s = await tr.startSession(user, { id, dayId: oldDay, startedAt: ago(10) });
    expect(s.dayName).toBe("A");
    expect((await tr.getSession(user, id)).exercises[0].name).toBe("Press de banca");
  });
});

describe("conflictos entre dispositivos", () => {
  it("misma serie desde dos dispositivos con valores distintos: se guardan ambas y la persona elige", async () => {
    const { user, t } = await ready();
    const id = randomUUID(), pe = t.program!.days[0].exercises[0].id;
    await tr.startSession(user, { id, dayId: t.program!.days[0].id });
    const a = await tr.logSet(user, id, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 80, reps: 10, rir: null, baseRevision: 0 });
    expect(a).toMatchObject({ status: "ok", revision: 1 });
    const bBody = { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 85, reps: 8, rir: null, baseRevision: 0 };
    const b = await tr.logSet(user, id, bBody);
    expect(b).toMatchObject({ status: "conflict", reason: "other_device", weightKg: 80 });
    await tr.logSet(user, id, bBody); // reintento: sigue habiendo un solo conflicto abierto
    const cs = await tr.listConflicts(user, id);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ server: { weightKg: 80, reps: 10 }, client: { weightKg: 85, reps: 8 } });
    await tr.resolveConflict(user, cs[0].id, "local");
    const [row] = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, id));
    expect(row).toMatchObject({ weightKg: "85", reps: 8, revision: 2 });
    const [c] = await db.select().from(schema.syncConflict).where(eq(schema.syncConflict.id, cs[0].id));
    expect(c.status).toBe("kept_local"); // la versión descartada sigue en el registro
  });

  it("edición con base vieja no pisa la más nueva; elegir la del servidor la conserva", async () => {
    const { user, t } = await ready();
    const id = randomUUID(), pe = t.program!.days[0].exercises[0].id, setId = randomUUID();
    await tr.startSession(user, { id, dayId: t.program!.days[0].id });
    await tr.logSet(user, id, { id: setId, programExerciseId: pe, setIndex: 0, weightKg: 80, reps: 10, rir: null, baseRevision: 0 });
    await tr.logSet(user, id, { id: setId, programExerciseId: pe, setIndex: 0, weightKg: 82.5, reps: 10, rir: null, baseRevision: 1 }); // dispositivo A
    const stale = await tr.logSet(user, id, { id: setId, programExerciseId: pe, setIndex: 0, weightKg: 80, reps: 12, rir: null, baseRevision: 1 }); // B offline
    expect(stale).toMatchObject({ status: "conflict", reason: "stale_base", weightKg: 82.5, revision: 2 });
    const [cf] = await tr.listConflicts(user, id);
    await tr.resolveConflict(user, cf.id, "server");
    const [row] = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, id));
    expect(row).toMatchObject({ weightKg: "82.5", reps: 10 });
    const e = await err(tr.resolveConflict(randomUUID(), cf.id, "local")); // otra persona no lo ve
    expect(e?.code).toBe("not_found");
  });

  it("dos sesiones abiertas en dispositivos distintos: conflicto explícito; sólo se cierra la otra si se elige", async () => {
    const { user, t } = await ready();
    const a = randomUUID();
    await tr.startSession(user, { id: a, dayId: t.program!.days[0].id });
    const pe = t.program!.days[0].exercises[0].id;
    await tr.logSet(user, a, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 70, reps: 10, rir: null });
    const b = randomUUID();
    const e = await err(tr.startSession(user, { id: b, dayId: t.program!.days[1].id, startedAt: ago(5) }));
    expect(e?.code).toBe("open_session");
    expect(e?.data?.other).toMatchObject({ id: a, dayName: "A", sets: 1 });
    await tr.startSession(user, { id: b, dayId: t.program!.days[1].id, startedAt: ago(5), closeOther: true });
    const [sa] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, a));
    expect(sa.status).toBe("completed"); // la serie del otro dispositivo se conserva
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, a), eq(schema.auditEvent.action, "session.closed_for_other")));
    expect(ev).toHaveLength(1);
  });
});
