// D168: REPI invita a desafíos y rankings con lo que la persona ya entrena; el gym avisa los desafíos nuevos y quien
// pierde un récord se entera.
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as cm from "@/server/community/services";
import * as club from "@/server/community/club";
import { communityNudges, placeAmong } from "@/server/community/nudges";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name: string) {
  const email = `nd${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
beforeEach(() => resetRateLimits());

describe("invitaciones de REPI", () => {
  it("puesto entre otras marcas", () => {
    expect(placeAmong([120, 100, 90], 110)).toBe(2);
    expect(placeAmong([120, 110], 110)).toBe(2); // empate comparte puesto
    expect(placeAmong([60, 70], 65, true)).toBe(2);
  });

  it("desafío ligado a un ejercicio, ranking del Club, récord superado y aviso de desafío nuevo", async () => {
    const owner = await verified("Dueña Invita");
    const org = await acc.createGymOrganization(owner, { name: `Gym Invita ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const prof = await verified("Profe Invita");
    await db.insert(schema.staffMembership).values({ userId: prof, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(prof, org.id, A.id);
    const [press] = await db.insert(schema.exercise).values({ name: `Press invita ${Date.now()}`, muscleGroup: "Pecho" }).returning();
    const member = async (name: string, w: number) => {
      const u = await verified(name);
      const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" }).returning();
      await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
      await gym.saveMemberProgram(prof, org.id, m.id, { doc: { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: press.id, name: press.name, sets: 3, reps: "5", rir: 2, restSec: 90 }] }] }, reason: "Inicial" });
      const t = await tr.myTraining(u);
      if (t.state !== "ready") throw new Error("sin programa");
      const sid = randomUUID();
      await tr.startSession(u, { id: sid, dayId: t.program.days[0].id });
      const s = await tr.getSession(u, sid);
      await db.insert(schema.setLog).values({ id: randomUUID(), sessionId: sid, programExerciseId: s.exercises[0].id, exerciseId: press.id, setIndex: 0, weightKg: String(w), reps: 1, completedAt: new Date() });
      await db.update(schema.workoutSession).set({ status: "completed", endedAt: new Date() }).where(eq(schema.workoutSession.id, sid));
      return { u, m };
    };
    const ana = await member("Ana Invita", 110);
    const beto = await member("Beto Invita", 130);
    const caro = await member("Caro Invita", 100);

    // Desafío nuevo con ejercicio: aviso push encolado a los socios de la sede.
    const ch = await cm.createChallenge(owner, org.id, { title: "Press máximo", rule: "Una repetición, barra al pecho y bloqueo.", unit: "kg", category: "fuerza", prize: "Remera", endsOn: localDate(new Date()), locationId: A.id, exerciseId: press.id });
    const queued = await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.kind, "challenge_new"), eq(schema.notificationOutbox.userId, ana.u)));
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe("/app?gym=ch");

    // Caro validó 100 kg: Ana (110 entrenando) sería récord; Beto ya validó 130: Ana entraría 2ª.
    const approve = async (who: { u: string; m: { id: string } }, v: number) => {
      const r = await cm.submitAttempt(who.u, { challengeId: ch.id, value: v, inPerson: true, confirm: true });
      return cm.decideAttempt(prof, org.id, r.id, { approve: true });
    };
    await approve(caro, 100);
    expect((await communityNudges(ana.u)).nudges[0]).toMatchObject({ title: "Con tus 110 kg serías récord del gym", action: "challenge", challengeId: ch.id });
    await approve(beto, 130);
    expect((await communityNudges(ana.u)).nudges[0]).toMatchObject({ title: "Con tus 110 kg entrarías 2°" });

    // Caro tenía el récord y Beto se lo superó: se le avisa por push y en la app.
    const beaten = await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.kind, "challenge_beaten"), eq(schema.notificationOutbox.userId, caro.u)));
    expect(beaten).toHaveLength(1);
    expect(beaten[0].body).toContain("130 kg");
    expect((await communityNudges(caro.u)).nudges[0]).toMatchObject({ title: "Te superaron en Press máximo", cta: "Recuperarlo" });

    // Ranking por ejercicio del Club: Beto compite; Ana no, y REPI le muestra dónde quedaría.
    await club.joinClub(beto.u, org.id, { showName: true, inRanking: true });
    const optin = (await communityNudges(ana.u)).nudges.find((x) => x.action === "ranking_optin");
    expect(optin).toMatchObject({ title: `Estarías 2° en ${press.name}` });
    await club.optIntoRanking(ana.u, org.id);
    expect((await club.clubState(ana.u, org.id)).inRanking).toBe(true);
    const after = (await communityNudges(ana.u)).nudges;
    expect(after.some((x) => x.action === "ranking_optin")).toBe(false);
    expect(after.find((x) => x.id.startsWith("pos:"))).toMatchObject({ title: `Estás 2° en ${press.name}` });
  });
});
