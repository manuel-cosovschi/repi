// Nivel REPI y trofeos (D166): se calculan con las sesiones terminadas y sus series; los trofeos se otorgan una vez y la
// animación de desbloqueo se muestra hasta que la persona la cierra.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as cm from "@/server/community/services";
import * as lv from "@/server/community/levels";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name: string) {
  const email = `lv${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
beforeEach(() => resetRateLimits());

describe("nivel y trofeos", () => {
  it("días, récords personales, ejercicios nuevos y toneladas suben el nivel; los trofeos se otorgan una vez", async () => {
    const owner = await verified("Dueña Niveles");
    const org = await acc.createGymOrganization(owner, { name: `Gym Niveles ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const prof = await verified("Profe Niveles");
    await db.insert(schema.staffMembership).values({ userId: prof, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(prof, org.id, A.id);
    const groups = ["Pecho", "Espalda", "Piernas", "Hombros", "Brazos", "Core"];
    const exs = await db.insert(schema.exercise).values(groups.map((g, i) => ({ name: `Nivel ${g} ${i} ${Date.now()}`, muscleGroup: g }))).returning();
    const u = await verified("Socia Niveles");
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    await gym.saveMemberProgram(prof, org.id, m.id, { doc: { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: exs.map((e) => ({ exerciseId: e.id, name: e.name, sets: 3, reps: "10", rir: 2, restSec: 90 })) }] }, reason: "Inicial" });

    const empty = await lv.myLevel(u);
    expect(empty).toMatchObject({ level: 1, xp: 0, unseen: [] });

    const t = await tr.myTraining(u);
    if (t.state !== "ready") throw new Error("sin programa");
    // Dos sesiones terminadas, en días distintos de la misma semana: la segunda supera el peso de press (récord personal).
    const session = async (startedAt: Date, w: number) => {
      const sid = randomUUID();
      await tr.startSession(u, { id: sid, dayId: t.program.days[0].id });
      const s = await tr.getSession(u, sid);
      for (const [i, e] of s.exercises.entries()) {
        await db.insert(schema.setLog).values({ id: randomUUID(), sessionId: sid, programExerciseId: e.id, exerciseId: exs[i].id, setIndex: 0, weightKg: String(w), reps: 10, completedAt: startedAt });
      }
      await db.update(schema.workoutSession).set({ status: "completed", startedAt, endedAt: startedAt }).where(eq(schema.workoutSession.id, sid));
    };
    const monday = new Date("2026-10-26T15:00:00Z");
    await session(monday, 50);
    await session(new Date(monday.getTime() + 86_400_000), 60);

    const st = await lv.levelStats(u);
    // 2 días; 6 récords (cada ejercicio sube de 50 a 60); 6 ejercicios; 6 × (500 + 600) kg = 6,6 t; una semana de cuerpo completo.
    expect(st).toMatchObject({ days: 2, prs: 6, exercises: 6, fullBodyWeeks: 1 });
    expect(st.tons).toBeCloseTo(6.6);

    const l = await lv.myLevel(u);
    expect(l.xp).toBe(2 * 10 + 6 * 15 + 6 * 5 + 6 * 2);
    expect(l.level).toBe(2); // 152 puntos: nivel 2 empieza en 60, el 3 en 160
    expect(l.toNext).toBe(8);
    expect(l.breakdown.map((b) => b.label)).toEqual(["Días entrenados", "Récords personales", "Ejercicios nuevos", "Toneladas movidas"]);
    expect(l.trophies.find((x) => x.key === "fuerza")).toMatchObject({ tier: 1, tierName: "bronce" });
    expect(l.trophies.find((x) => x.key === "cuerpo")).toMatchObject({ tier: 1 });
    expect(l.unseen.map((x) => x.key).sort()).toEqual(["cuerpo", "fuerza"]);
    expect(l.unseen.find((x) => x.key === "fuerza")).toMatchObject({ title: "Fuerza · Bronce", detail: "5 récords personales" });

    // Abrir el gym no las marca vistas (sí los demás logros); cerrarlas, sí. No se otorgan dos veces.
    await cm.markNoticesSeen(u);
    expect((await lv.myLevel(u)).unseen).toHaveLength(2);
    await lv.markTrophiesSeen(u);
    expect((await lv.myLevel(u)).unseen).toHaveLength(0);
    expect(await lv.syncTrophies(u, st)).toEqual([]);
    // Las marcas validadas y los récords del gym también suman.
    await cm.grant(db, u, org.id, "gym_record", "x", "Récord", "x");
    expect((await lv.myLevel(u)).xp).toBe(152 + 60);
    // El nivel y los trofeos llegan al inicio del gym; los trofeos no aparecen como logros sueltos.
    const h = await cm.myGymHome(u);
    expect(h.level).toMatchObject({ level: 3 });
    expect(h.achievements.some((a) => a.kind === "trophy")).toBe(false);
  });
});
