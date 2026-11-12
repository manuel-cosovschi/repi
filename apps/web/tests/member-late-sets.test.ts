// FSA1 (MEMBER-04): un entrenamiento que el servidor cerró solo (D160) sin series —porque el teléfono las estaba registrando sin
// conexión— ya no rechaza para siempre esas series: la primera que llega lo reabre y no se pierde nada. Un descarte hecho por la
// persona sigue sin aceptar series.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as own from "@/server/training/own-routines";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified() {
  const email = `late${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Late", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
/** Alumno con coach (sin programa): entrena con una rutina propia. */
async function person() {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach late ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  await acc.acceptInvitation(u.id, inv.code, []);
  return u.id;
}
let SQ = "";
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Sentadilla", muscleGroup: "Piernas" }).onConflictDoNothing().returning();
  SQ = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla")))[0].id;
});
beforeEach(() => resetRateLimits());

async function openWorkout(user: string, t0: Date) {
  const { id } = await own.saveOwnRoutine(user, { name: "Rutina", exercises: [{ exerciseId: SQ, sets: 3, reps: "8", weightKg: null, restSec: null, note: null }] });
  const sid = randomUUID();
  await own.startOwnRoutine(user, id, sid, t0);
  return { sid, pe: (await tr.getSession(user, sid)).exercises[0].id, routine: id };
}

describe("series que llegan después del cierre automático", () => {
  it("el entrenamiento cerrado solo y sin series vuelve a estar en curso con las series del teléfono, una sola vez", async () => {
    const user = await person();
    const t0 = new Date(Date.now() - 7 * 3_600_000);
    const { sid, pe } = await openWorkout(user, t0);
    await tr.closeIdleWorkouts(new Date(t0.getTime() + 6 * 3_600_000 + 60_000));
    expect((await tr.getSession(user, sid)).status).toBe("abandoned");
    // El teléfono, sin conexión, registró dos series (horas reales del teléfono) y reconecta ahora.
    const a = { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 82.5, reps: 8, rir: 2, at: new Date(Date.now() - 10 * 60_000).toISOString() };
    const r1 = await tr.logSet(user, sid, a);
    expect(r1.status).toBe("ok");
    expect(await tr.logSet(user, sid, a)).toMatchObject({ status: "ok" }); // reintento: no duplica
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe, setIndex: 1, weightKg: 82.5, reps: 7, rir: 1, at: new Date(Date.now() - 5 * 60_000).toISOString() });
    const g = await tr.getSession(user, sid);
    expect(g.status).toBe("in_progress");
    expect(g.exercises[0].logs.map((l) => [l.setIndex, l.weightKg, l.reps])).toEqual([[0, 82.5, 8], [1, 82.5, 7]]);
    // El «Finalizar» que el teléfono tenía en la cola lo cierra como completado.
    await tr.sessionAction(user, sid, "finish", new Date(), new Date().toISOString());
    expect((await tr.getSession(user, sid)).status).toBe("completed");
  });

  it("con otro entrenamiento abierto, las series llegan y el reabierto queda completado (nunca dos abiertos)", async () => {
    const user = await person();
    const t0 = new Date(Date.now() - 7 * 3_600_000);
    const { sid, pe, routine } = await openWorkout(user, t0);
    await tr.closeIdleWorkouts(new Date(t0.getTime() + 6 * 3_600_000 + 60_000));
    const other = randomUUID();
    await own.startOwnRoutine(user, routine, other);
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 60, reps: 8, rir: null, at: new Date(Date.now() - 60_000).toISOString() });
    expect((await tr.getSession(user, sid)).status).toBe("completed");
    expect((await tr.getSession(user, other)).status).toBe("in_progress");
  });

  it("un entrenamiento que la persona cortó sin series sigue sin aceptar series", async () => {
    const user = await person();
    const { sid, pe } = await openWorkout(user, new Date(Date.now() - 60_000));
    await tr.sessionAction(user, sid, "finish");
    expect((await tr.getSession(user, sid)).status).toBe("abandoned");
    await expect(tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 60, reps: 8, rir: null })).rejects.toMatchObject({ code: "closed" });
  });
});
