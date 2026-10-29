// Biblioteca de ejercicios (D129): catálogo base amplio y ejercicios propios por organización.
import { desc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { EXERCISE_CATALOG } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import { ensureExerciseCatalog } from "@/server/training/library";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `ex${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Ejercicio") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
beforeEach(() => resetRateLimits());

describe("biblioteca de ejercicios", () => {
  it("carga el catálogo base una vez, sin duplicar lo que ya había", async () => {
    await db.insert(schema.exercise).values({ name: "Press de banca", muscleGroup: "Pecho" }).onConflictDoNothing();
    await ensureExerciseCatalog();
    await ensureExerciseCatalog();
    const rows = await db.select({ name: schema.exercise.name }).from(schema.exercise).where(isNull(schema.exercise.orgId));
    expect(rows.filter((r) => r.name === "Press de banca")).toHaveLength(1);
    expect(rows.length).toBeGreaterThanOrEqual(EXERCISE_CATALOG.length);
  });

  it("el coach crea un ejercicio propio, lo usa en un programa y no lo ve otro coach; sin duplicados", async () => {
    const coach = await verified("Coach Uno");
    const org = await acc.createCoachOrganization(coach, { brand: `Uno ${Date.now()}` });
    const e = await tr.coachCreateExercise(coach, org.id, { name: "  remo   gorila ", group: "Espalda", kind: "load_reps" });
    expect(e).toMatchObject({ name: "Remo gorila", own: true, existed: false });
    expect((await tr.coachCreateExercise(coach, org.id, { name: "REMO GORILA", group: "Espalda", kind: "load_reps" })).id).toBe(e.id);
    // Uno del catálogo base no se duplica como propio.
    expect(await tr.coachCreateExercise(coach, org.id, { name: "jalon al pecho", group: "Espalda", kind: "load_reps" })).toMatchObject({ own: false, existed: true });
    expect((await tr.listLibrary(coach, org.id)).find((x) => x.id === e.id)?.own).toBe(true);
    await tr.createTemplate(coach, org.id, { name: "Con propio", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: e.id, name: e.name, sets: 3, reps: "10", rir: 2, restSec: 90 }] }] });
    const other = await verified("Coach Dos");
    const org2 = await acc.createCoachOrganization(other, { brand: `Dos ${Date.now()}` });
    expect((await tr.listLibrary(other, org2.id)).some((x) => x.id === e.id)).toBe(false);
    expect((await err(tr.createTemplate(other, org2.id, { name: "Ajeno", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: e.id, name: e.name, sets: 3, reps: "10", rir: 2, restSec: 90 }] }] })))?.code).toBe("invalid");
    expect((await err(tr.coachCreateExercise(other, org.id, { name: "Intruso", group: "Core", kind: "time" })))?.code).toBeTruthy();
  });

  it("valida nombre, grupo y forma de registro", async () => {
    const coach = await verified("Coach Tres");
    const org = await acc.createCoachOrganization(coach, { brand: `Tres ${Date.now()}` });
    expect((await err(tr.coachCreateExercise(coach, org.id, { name: "x", group: "Core", kind: "time" })))?.code).toBe("invalid");
    expect((await err(tr.coachCreateExercise(coach, org.id, { name: "Algo", group: "Inventado", kind: "time" })))?.code).toBe("invalid");
    expect((await err(tr.coachCreateExercise(coach, org.id, { name: "Algo", group: "Core", kind: "otro" })))?.code).toBe("invalid");
  });

  it("en el gimnasio lo crea quien arma programas (sala); recepción no", async () => {
    const owner = await verified("Dueño Ej");
    const org = await acc.createGymOrganization(owner, { name: `Gym Ej ${Date.now()}` });
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const floor = await verified("Profe Ej");
    await db.insert(schema.staffMembership).values({ userId: floor, orgId: org.id, locationId: loc.id, role: "floor_trainer" });
    const recep = await verified("Recep Ej");
    await db.insert(schema.staffMembership).values({ userId: recep, orgId: org.id, locationId: loc.id, role: "reception" });
    const e = await gym.gymCreateExercise(floor, org.id, { name: "Sentadilla con cadena", group: "Piernas", kind: "load_reps" });
    expect(e.own).toBe(true);
    expect((await gym.gymLibrary(floor, org.id)).some((x) => x.id === e.id && x.own)).toBe(true);
    expect((await err(gym.gymCreateExercise(recep, org.id, { name: "Otro", group: "Core", kind: "time" })))?.code).toBe("forbidden");
  });
});
