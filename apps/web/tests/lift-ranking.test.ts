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
import * as screen from "@/server/community/screen";
import * as ac from "@/server/gym/access-control";
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
      return { u, log, pe };
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

    // SEC-6 (QA 29/10): una menor sin consentimiento del adulto no puede sumarse al ranking ni aparece si ya estaba.
    const teen = await socio("Teen Rápida");
    await teen.log(0, 150, 5);
    const d = new Date(); const birth = `${d.getFullYear() - 15}-01-01`;
    await db.update(schema.user).set({ birthDate: birth }).where(eq(schema.user.id, teen.u));
    await expect(club.joinClub(teen.u, org.id, { showName: true, inRanking: true })).rejects.toMatchObject({ code: "guardian_required" });
    // Ya marcada de antes (o consentimiento revocado después): tampoco aparece.
    await db.insert(schema.clubMember).values({ orgId: org.id, userId: teen.u, showName: true, inRanking: true });
    expect((await club.clubLiftRanking(oculto.u, org.id, ex.id)).rows.map((x) => x.name)).not.toContain("Teen R.");
    expect((await club.clubLiftRanking(oculto.u, org.id, ex.id)).rows).toHaveLength(2);

    // DATA-6 (QA 29/10): en una serie por tiempo `reps` son segundos; no da un 1RM ni entra al ranking.
    const hold = await socio("Hold Largo");
    await db.update(schema.programExercise).set({ reps: "40 s" }).where(eq(schema.programExercise.id, hold.pe));
    await hold.log(0, 300, 10);
    await club.joinClub(hold.u, org.id, { showName: true, inRanking: true });
    expect((await club.clubLiftRanking(oculto.u, org.id, ex.id)).rows.map((x) => x.name)).not.toContain("Hold L.");
  });

  it("D146: la pantalla de la sala muestra el tablero con su secreto, sin «Vos» y deja de andar al revocarla", async () => {
    const owner = await verified("Dueño Pantalla");
    const org = await acc.createGymOrganization(owner, { name: `Gym Pantalla ${Date.now()}` });
    await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" });
    const [loc] = await db.select().from(schema.gymLocation).where(eq(schema.gymLocation.orgId, org.id));
    const trainer = await verified("Profe Pantalla");
    await db.insert(schema.staffMembership).values({ userId: trainer, orgId: org.id, locationId: loc.id, role: "floor_trainer" });
    // Sólo dueño o gerencia crean pantallas.
    await expect(screen.createRankingScreen(trainer, org.id, "TV")).rejects.toMatchObject({ status: 403 });
    await expect(screen.createRankingScreen(owner, org.id, "x")).rejects.toMatchObject({ code: "invalid" });
    const { id, link } = await screen.createRankingScreen(owner, org.id, "TV de la sala");
    const secret = new URL(link).hash.split("k=")[1];
    expect(link).toContain("/ranking/pantalla#k=");
    const b = await screen.screenBoard(secret, null);
    expect(b).toMatchObject({ gym: org.name, rows: [], exercise: null });
    expect((await screen.rankingScreens(owner, org.id)).screens.map((x) => x.name)).toEqual(["TV de la sala"]);
    // El secreto del ranking no sirve para el QR de ingreso, ni aparece entre las pantallas de ingreso.
    await expect(ac.displayQr(secret)).rejects.toMatchObject({ code: "invalid_display" });
    expect((await ac.accessSettings(owner, org.id)).displays).toHaveLength(0);
    await expect(screen.screenBoard("x".repeat(43), null)).rejects.toMatchObject({ status: 401 });
    await screen.revokeRankingScreen(owner, org.id, id);
    await expect(screen.screenBoard(secret, null)).rejects.toMatchObject({ status: 401 });
    await expect(screen.revokeRankingScreen(owner, org.id, id)).rejects.toMatchObject({ code: "not_found" });
  });
});
