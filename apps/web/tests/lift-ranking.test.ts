// Ranking por ejercicio del gym en vivo (D144): sólo quienes eligieron aparecer, mejor 1RM estimado, subidas y bajadas.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as club from "@/server/community/club";
import * as tr from "@/server/training/services";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name: string) {
  const email = `lr${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
beforeEach(() => resetRateLimits());

describe("ranking por ejercicio", () => {
  it("ordena por 1RM estimado, muestra subidas y nuevos, oculta a quien no eligió y lo ve cualquier socio", async () => {
    const owner = await verified("Dueña Ranking");
    const org = await acc.createGymOrganization(owner, { name: `Gym Ranking ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const coachU = await verified("Profe Ranking");
    await db.insert(schema.staffMembership).values({ userId: coachU, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(coachU, org.id, A.id);
    const [ex] = await db.insert(schema.exercise).values({ name: `Press ranking ${Date.now()}`, muscleGroup: "Pecho" }).returning();
    const socio = async (name: string) => {
      const u = await verified(name);
      const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" }).returning();
      await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
      await gym.saveMemberProgram(coachU, org.id, m.id, { doc: { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: ex.id, name: ex.name, sets: 3, reps: "5", rir: 2, restSec: 90 }] }] }, reason: "Inicial" });
      const t = await tr.myTraining(u);
      if (t.state !== "ready") throw new Error("sin programa");
      const sid = randomUUID();
      await tr.startSession(u, { id: sid, dayId: t.program.days[0].id });
      const pe = (await tr.getSession(u, sid)).exercises[0].id;
      const log = (i: number, w: number, r: number, daysAgo = 0) => db.insert(schema.setLog).values({ id: randomUUID(), sessionId: sid, programExerciseId: pe, exerciseId: ex.id, setIndex: i, weightKg: String(w), reps: r, completedAt: new Date(Date.now() - daysAgo * 86_400_000) });
      return { u, log };
    };
    const ana = await socio("Ana Fuerte"), beto = await socio("Beto Firme"), oculto = await socio("Oculto Total");
    await ana.log(0, 80, 5, 10); // hace 10 días: Ana iba segunda
    await beto.log(0, 90, 5, 10);
    await ana.log(1, 100, 5); // hoy: pasa al primer puesto
    await oculto.log(0, 200, 1);
    await club.joinClub(ana.u, org.id, { showName: true, inRanking: true });
    await club.joinClub(beto.u, org.id, { showName: false, inRanking: true });
    await club.joinClub(oculto.u, org.id, { showName: true, inRanking: false });

    const r = await club.clubLiftRanking(oculto.u, org.id, null); // quien no participa igual lo ve
    expect(r.exercise?.id).toBe(ex.id);
    expect(r.inRanking).toBe(false);
    expect(r.rows.map((x) => [x.pos, x.name, x.best, x.delta, x.isNew])).toEqual([[1, "Ana F.", 116.5, 1, false], [2, "Socio/a del gym", 105, -1, false]]);
    expect(JSON.stringify(r)).not.toContain(ana.u);
    const mine = await club.clubLiftRanking(ana.u, org.id, ex.id);
    expect(mine.rows[0]).toMatchObject({ name: "Vos", me: true });
  });
});
