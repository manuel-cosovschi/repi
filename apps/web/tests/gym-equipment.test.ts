// D195 · Catálogo de equipamiento por sede (bloque 05/06): permisos por capacidad y sede, aislamiento entre sedes y
// organizaciones, prioridad de saltos (plan > sede > desconocido), cargas disponibles en las recomendaciones, sustitutos, kg/lb,
// archivo y programas anteriores. Base de prueba descartable (repi_test).
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyDetail, type ExerciseDetail, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as gym from "@/server/gym/services";
import * as eqp from "@/server/gym/equipment";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name = "Persona EQ") {
  const email = `eq${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let CURL = "", PRESS = "";
beforeAll(async () => {
  const ins = async (name: string) => (await db.insert(schema.exercise).values({ name, muscleGroup: "Brazos" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  CURL = await ins("Curl con mancuernas EQ");
  PRESS = await ins("Press inclinado EQ");
});
beforeEach(() => resetRateLimits());

type Ex = { exerciseId: string; name: string; sets: number; reps: string; detail?: ExerciseDetail | null };
const doc = (exs: Ex[]): ProgramDoc => ({ name: "Sala", weeks: 4, note: "", days: [{ name: "A", exercises: exs.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: 2, restSec: 90, note: null, ...(e.detail ? { detail: e.detail } : {}) })) }] });
const CURL_EX: Ex = { exerciseId: CURL, name: "Curl con mancuernas EQ", sets: 2, reps: "8-12" };

async function gymWorld(exs: Ex[]) {
  const owner = await verified("Dueño EQ");
  await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner.id));
  const org = await acc.createGymOrganization(owner.id, { name: `Gym EQ ${n}-${Date.now()}` });
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
  const staff = async (role: "manager" | "reception" | "floor_trainer" | "coordinator", loc: string | null, name: string) => {
    const s = await verified(name);
    await db.insert(schema.staffMembership).values({ userId: s.id, orgId: org.id, locationId: loc, role });
    return s.id;
  };
  const floor = await staff("floor_trainer", A.id, "Sala A EQ");
  const coordB = await staff("coordinator", B.id, "Coordinación B EQ");
  const manager = await staff("manager", A.id, "Gerencia EQ");
  const reception = await staff("reception", A.id, "Recepción EQ");
  await gym.startShift(floor, org.id, A.id);
  const u = await verified("Socio EQ");
  const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u.id, status: "active" }).returning();
  await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
  await gym.saveMemberProgram(floor, org.id, m.id, { doc: doc(exs.map((e) => ({ ...e, exerciseId: e.exerciseId || CURL }))), reason: "Inicial" });
  return { owner: owner.id, org: org.id, A: A.id, B: B.id, floor, coordB, manager, reception, user: u.id, memberId: m.id };
}
const DB = { name: "Mancuernas", category: "dumbbell", unit: "kg" as const, increment: null, perSide: false, minLoad: null, maxLoad: null, loads: [10, 12.5, 15, 17.5, 20], exerciseIds: [] as string[] };
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; status: number }; } };

async function trainAndOpen(user: string, rows: [number, number][]) {
  const t = await tr.myTraining(user);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program.days[0].id });
  const s = await tr.getSession(user, sid);
  for (const [i, [w, r]] of rows.entries()) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: i, weightKg: w, reps: r, rir: 2 });
  await tr.sessionAction(user, sid, "finish");
  const next = randomUUID();
  await tr.startSession(user, { id: next, dayId: t.program.days[0].id });
  return tr.getSession(user, next);
}

describe("catálogo por sede: permisos y aislamiento", () => {
  it("dueño, gerencia y coordinación de la sede lo administran; sala lo consulta; recepción y socio no; otra sede u organización: 404", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    const made = await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, exerciseIds: [CURL] });
    const list = await eqp.listEquipment(g.floor, g.org, g.A);
    expect(list).toMatchObject({ canEdit: false, items: [{ id: made.id, name: "Mancuernas", exercises: [{ id: CURL }], ladder: { loadsKg: [10, 12.5, 15, 17.5, 20] } }] });
    expect((await eqp.listEquipment(g.owner, g.org, g.A)).canEdit).toBe(true);
    expect((await err(eqp.createEquipment(g.floor, g.org, g.A, { ...DB, name: "Otra" })))?.status).toBe(403);
    expect((await err(eqp.listEquipment(g.reception, g.org, g.A)))?.status).toBe(403);
    expect((await err(eqp.listEquipment(g.user, g.org, g.A)))?.status).toBe(404);
    // Coordinación de B no ve ni toca la sede A.
    expect((await err(eqp.listEquipment(g.coordB, g.org, g.A)))?.status).toBe(404);
    expect((await err(eqp.updateEquipment(g.coordB, g.org, made.id, { ...DB, revision: 1 })))?.status).toBe(404);
    expect((await eqp.listEquipment(g.coordB, g.org, g.B)).items).toEqual([]);
    // Otra organización.
    const other = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    expect((await err(eqp.updateEquipment(other.manager, other.org, made.id, { ...DB, revision: 1 })))?.status).toBe(404);
    expect((await err(eqp.listEquipment(other.manager, g.org, g.A)))?.status).toBe(404);
    const audits = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.resourceId, made.id));
    expect(audits.map((a) => a.action)).toContain("gym.equipment.created");
  });

  it("modificar con revisión (409 si otra persona cambió), nombre único por sede, archivar sin borrar y restaurar", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    const made = await eqp.createEquipment(g.manager, g.org, g.A, DB);
    const up = await eqp.updateEquipment(g.manager, g.org, made.id, { ...DB, loads: [10, 12, 14], exerciseIds: [CURL], revision: 1 });
    expect(up.revision).toBe(2);
    expect((await err(eqp.updateEquipment(g.manager, g.org, made.id, { ...DB, revision: 1 })))?.code).toBe("stale");
    expect((await err(eqp.createEquipment(g.manager, g.org, g.A, { ...DB, name: "mancuernas" })))?.code).toBe("duplicate");
    expect((await eqp.createEquipment(g.coordB, g.org, g.B, DB)).id).toBeTruthy(); // otra sede, mismo nombre: independiente
    expect((await err(eqp.createEquipment(g.manager, g.org, g.B, { ...DB, name: "Otra" })))?.status).toBe(404); // la gerencia de A no administra B
    await eqp.archiveEquipment(g.manager, g.org, made.id, true);
    expect((await eqp.listEquipment(g.manager, g.org, g.A)).items).toHaveLength(0);
    expect((await eqp.listEquipment(g.manager, g.org, g.A, { archived: true })).items).toHaveLength(1);
    await eqp.archiveEquipment(g.manager, g.org, made.id, false);
    expect((await eqp.listEquipment(g.manager, g.org, g.A)).items).toHaveLength(1);
  });

  it("valida: no inventa equipos ni ejercicios de otra organización; «por lado» sólo con discos", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    const [own] = await db.insert(schema.exercise).values({ name: `Ajeno EQ ${Date.now()}`, muscleGroup: "x", orgId: (await gymWorld([CURL_EX])).org }).returning();
    expect((await err(eqp.createEquipment(g.manager, g.org, g.A, { ...DB, exerciseIds: [own.id] })))?.code).toBe("invalid");
    expect((await err(eqp.createEquipment(g.manager, g.org, g.A, { ...DB, perSide: true })))?.code).toBe("invalid");
    expect((await err(eqp.createEquipment(g.manager, g.org, g.A, { ...DB, loads: [10] })))?.code).toBe("invalid");
  });
});

describe("cargas reales en Training Intelligence", () => {
  it("con mancuernas 10/12,5/15/17,5/20 en la sede, REPI no recomienda una carga inexistente y la sesión trae los saltos", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, exerciseIds: [CURL] });
    const s = await trainAndOpen(g.user, [[15, 12], [15, 12]]);
    const e = s.exercises[0];
    expect(e.ladder).toMatchObject({ source: "gym", loadsKg: [10, 12.5, 15, 17.5, 20] });
    for (const t of e.targets ?? []) if (t.weightKg != null && t.source === "rules") expect([10, 12.5, 15, 17.5, 20]).toContain(t.weightKg);
  });

  it("prioridad: el salto del ejercicio en el programa manda sobre la sede; sin ninguno, desconocido y conservador", async () => {
    const withLoad: ExerciseDetail = { ...emptyDetail(), load: { equipment: "dumbbell", incrementKg: 1 } };
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL, detail: withLoad }, { exerciseId: PRESS, name: "Press inclinado EQ", sets: 2, reps: "8-12" }]);
    await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, exerciseIds: [CURL] });
    const t = await tr.myTraining(g.user);
    if (t.state !== "ready") throw new Error();
    const sid = randomUUID();
    await tr.startSession(g.user, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(g.user, sid);
    expect(s.exercises[0].ladder).toMatchObject({ source: "plan", incrementKg: 1, loadsKg: null });
    expect(s.exercises[1].ladder).toMatchObject({ source: "unknown", incrementKg: null });
  });

  it("sustituto: usa el equipo del ejercicio que se hace (o desconocido), nunca el del original", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, exerciseIds: [CURL] });
    const t = await tr.myTraining(g.user);
    if (t.state !== "ready") throw new Error();
    const sid = randomUUID();
    await tr.startSession(g.user, { id: sid, dayId: t.program.days[0].id });
    let s = await tr.getSession(g.user, sid);
    await tr.setExerciseChange(g.user, sid, { programExerciseId: s.exercises[0].id, change: { kind: "substitute", reason: "busy", exerciseId: PRESS } });
    s = await tr.getSession(g.user, sid);
    expect(s.exercises[0].ladder?.source).toBe("unknown");
  });

  it("otra sede del mismo gimnasio no presta su equipo; archivado deja de usarse; lb se convierte una vez", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    const inB = await eqp.createEquipment(g.coordB, g.org, g.B, { ...DB, exerciseIds: [CURL] });
    expect((await eqp.laddersForMember(g.memberId, [CURL])).size).toBe(0);
    const lb = await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, name: "Mancuernas lb", unit: "lb", loads: [20, 25, 30], exerciseIds: [CURL] });
    expect((await eqp.laddersForMember(g.memberId, [CURL])).get(CURL)).toMatchObject({ loadsKg: [9.07, 11.34, 13.61] });
    await eqp.archiveEquipment(g.manager, g.org, lb.id, true);
    expect((await eqp.laddersForMember(g.memberId, [CURL])).size).toBe(0);
    expect(inB.id).toBeTruthy();
  });

  it("dos equipos distintos para el mismo ejercicio: no se sabe cuál usa, queda desconocido", async () => {
    const g = await gymWorld([{ ...CURL_EX, exerciseId: CURL }]);
    await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, exerciseIds: [CURL] });
    await eqp.createEquipment(g.manager, g.org, g.A, { ...DB, name: "Mancuernas livianas", loads: [2, 4, 6], exerciseIds: [CURL] });
    expect((await eqp.laddersForMember(g.memberId, [CURL])).size).toBe(0);
  });
});
