// «En sala ahora» (D131): profesores en turno visibles para socio y equipo; el socio elige con quién entrena hoy.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as floor from "@/server/gym/floor-now";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `fl${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Sala") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
beforeEach(() => resetRateLimits());

describe("en sala ahora", () => {
  it("socio ve los profesores en turno de su sede, elige, la sesión lo guarda y el profesor lo ve", async () => {
    const owner = await verified("Dueña Sala");
    const org = await acc.createGymOrganization(owner, { name: `Gym Sala ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
    const sofia = await verified("Sofía Sala"), lucas = await verified("Lucas Sala"), otra = await verified("Otra Sede");
    for (const [u, l] of [[sofia, A.id], [lucas, A.id], [otra, B.id]] as const) await db.insert(schema.staffMembership).values({ userId: u, orgId: org.id, locationId: l, role: "floor_trainer" });
    await gym.startShift(sofia, org.id, A.id); await gym.startShift(lucas, org.id, A.id); await gym.startShift(otra, org.id, B.id);
    const [ex] = await db.insert(schema.exercise).values({ name: `Remo sala ${Date.now()}`, muscleGroup: "Espalda" }).returning();
    const socia = await verified("Socia Sala");
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: socia, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: socia, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    await gym.saveMemberProgram(sofia, org.id, m.id, { doc: { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: ex.id, name: ex.name, sets: 3, reps: "10", rir: 2, restSec: 90 }] }] }, reason: "Inicial" });

    const mine = (await floor.myFloor(socia)).gyms[0];
    expect(mine.trainers.map((t) => t.name).sort()).toEqual(["Lucas Sala", "Sofía Sala"]); // la de otra sede no aparece
    expect((await err(floor.pickFloorTrainer(socia, m.id, otra)))?.code).toBe("not_on_shift");
    await floor.pickFloorTrainer(socia, m.id, lucas);
    await floor.pickFloorTrainer(socia, m.id, sofia); // cambia la elección del día
    expect((await floor.myFloor(socia)).gyms[0].pick).toBe(sofia);

    const t = await tr.myTraining(socia);
    if (t.state !== "ready") throw new Error("sin programa");
    const id = randomUUID();
    const s = await tr.startSession(socia, { id, dayId: t.program.days[0].id });
    expect(s.floorTrainerId).toBe(sofia);

    const forSofia = await floor.staffFloorNow(sofia, org.id, A.id);
    expect(forSofia.trainers.find((x) => x.id === sofia)).toMatchObject({ members: 1, memberNames: ["Socia Sala"] });
    expect(forSofia.trainers.find((x) => x.id === lucas)?.memberNames).toBeUndefined(); // sólo ve los nombres propios
    const forOwner = await floor.staffFloorNow(owner, org.id, null);
    expect(forOwner.trainers).toHaveLength(3);

    // Otro socio no puede elegir por ella; al cerrar el turno, deja de figurar.
    const intruso = await verified("Intruso");
    expect((await err(floor.pickFloorTrainer(intruso, m.id, sofia)))?.code).toBe("not_found");
    await gym.closeShift(sofia, org.id, A.id, { toUserId: null, items: [] });
    expect((await floor.myFloor(socia)).gyms[0]).toMatchObject({ pick: null });
  });
});
