// D185: un día sin ejercicios (el coach lo dejó vacío) no se puede empezar y la rotación lo saltea. Antes quedaba abierto un
// entrenamiento sin ejercicios: la app se quedaba en «Cargando entrenamiento…» y «Empezar» o «Continuar» volvían a abrirlo.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `ed${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Día Vacío") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;
let EXID = "";
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Press día vacío", muscleGroup: "Pecho" }).onConflictDoNothing().returning();
  EXID = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Press día vacío")))[0].id;
});
beforeEach(() => resetRateLimits());

async function clientWith(doc: ProgramDoc) {
  const coach = await verified("Coach Día Vacío");
  const org = await acc.createCoachOrganization(coach, { brand: `Coach vacío ${n}` });
  const u = await verified("Alumno Día Vacío");
  const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(u) });
  const r = await acc.acceptInvitation(u, inv.code, []);
  const pid = await tr.createTemplate(coach, org.id, doc);
  await tr.assignProgram(coach, org.id, pid, { coachClientIds: [r.relationId], startsOn: localDate(new Date()) });
  await db.update(schema.programAssignment).set({ startsOn: localDate(new Date(Date.now() - 2 * 86_400_000)) }).where(eq(schema.programAssignment.coachClientId, r.relationId));
  return u;
}
const doc = (): ProgramDoc => ({ name: "Con un día vacío", weeks: 4, note: "", days: [
  { name: "Pecho-Cuadri", exercises: [] },
  { name: "Full body", exercises: [{ exerciseId: EXID, name: "Press día vacío", sets: 3, reps: "10", rir: 2, restSec: 90 }] },
] });

describe("D185 · día sin ejercicios", () => {
  it("la rotación lo saltea y el servidor no deja empezarlo; el día con ejercicios se empieza normal", async () => {
    const u = await clientWith(doc());
    const t = await tr.myTraining(u);
    if (t.state !== "ready") throw new Error("sin programa");
    expect(t.program.days[t.program.nextDay].name).toBe("Full body"); // antes proponía «Pecho-Cuadri» (vacío)
    const empty = t.program.days.find((d) => d.name === "Pecho-Cuadri")!;
    const e = await tr.startSession(u, { id: randomUUID(), dayId: empty.id }).then(() => null, (x) => x as AccessError);
    expect(e).toMatchObject({ code: "empty_day" });
    expect(e?.message).toMatch(/Pecho-Cuadri» todavía no tiene ejercicios/);
    expect((await tr.myTraining(u)).openSession).toBeNull(); // no quedó nada abierto
    const id = randomUUID();
    await tr.startSession(u, { id, dayId: t.program.days.find((d) => d.name === "Full body")!.id });
    expect((await tr.getSession(u, id)).exercises).toHaveLength(1);
  });
  it("un entrenamiento vacío que ya quedó abierto (como el de producción) se puede cortar: sin series, queda descartado", async () => {
    const u = await clientWith(doc());
    const t = await tr.myTraining(u);
    if (t.state !== "ready") throw new Error("sin programa");
    const id = randomUUID();
    await tr.startSession(u, { id, dayId: t.program.days.find((d) => d.name === "Full body")!.id });
    // Reproduce el caso real: el día de la sesión abierta no tiene ejercicios.
    const s = await tr.getSession(u, id);
    await db.delete(schema.programExercise).where(eq(schema.programExercise.dayId, s.dayId));
    expect((await tr.getSession(u, id)).exercises).toEqual([]);
    expect(await tr.sessionAction(u, id, "finish")).toMatchObject({ status: "abandoned" });
    expect((await tr.myTraining(u)).openSession).toBeNull();
  });
});
