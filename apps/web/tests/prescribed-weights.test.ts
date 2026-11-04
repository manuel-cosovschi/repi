// Hotfix P0 (D193) · Pesos indicados por el profe que el alumno no veía al entrenar. Reproduce el caso real (sin datos
// reales): el profe cargó las cargas en la PLANTILLA mientras su alumno entrenaba con su COPIA (sin cargas) y se la volvió a
// asignar con el entrenamiento abierto. Antes: la sesión no avisaba («outdated» falso) y «Aplicar ahora» fallaba con
// «Tu programa ya no está asignado», así que el alumno veía 0 kg. Base de prueba descartable (repi_test), sin simulaciones.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { kgTo, localDate, type ExerciseDetail, type ProgramDoc, type SetSpec } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as gym from "@/server/gym/services";
import { resetRateLimits } from "@/server/access/util";
import { fromServer, setKey } from "@/lib/offline/store";

let n = 0;
async function verified(name = "Persona PW") {
  const email = `pw${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let HACK = "", PRESS = "", PLANK = "";
beforeAll(async () => {
  const ins = async (name: string, kind: "load_reps" | "bodyweight" = "load_reps") => (await db.insert(schema.exercise).values({ name, muscleGroup: "Piernas", kind }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  HACK = await ins("Sentadilla hack PW");
  PRESS = await ins("Prensa PW");
  PLANK = await ins("Dominadas PW", "bodyweight");
});
beforeEach(() => resetRateLimits());

const S = (kind: SetSpec["kind"], reps: string, weightKg: number | null, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg, pct1rm: null, rir: 1, rpe: null, restSec: 120, note: null, ...p });
type Ex = { exerciseId?: string; name?: string; sets: number; reps: string; rir?: number | null; detail?: ExerciseDetail | null };
const doc = (exs: Ex[]): ProgramDoc => ({ name: "Piernas", weeks: 4, note: "",
  days: [{ name: "Piernas", exercises: exs.map((e) => ({ exerciseId: e.exerciseId ?? HACK, name: e.name ?? "Sentadilla hack PW", sets: e.sets, reps: e.reps, rir: e.rir ?? 1, restSec: 120, note: null, ...(e.detail ? { detail: e.detail } : {}) })) }] });
/** Lo que el profe quería: 80 × 12, 90 × 10, 100 × 8 (series de trabajo con su carga cada una). */
const PLANNED: Ex = { sets: 3, reps: "8-12", detail: { technique: "custom", setPlan: [S("work", "12", 80), S("work", "10", 90), S("work", "8", 100)] } as ExerciseDetail };
const TOPBACK: Ex = { sets: 3, reps: "4-10", detail: { technique: "top_backoff", setPlan: [S("top", "5", 45), S("backoff", "6", 40), S("backoff", "8", 35)] } as ExerciseDetail };
const PLAIN: Ex = { sets: 3, reps: "8-12" };

async function coachWorld(first: Ex[]) {
  const coach = await verified("Coach PW");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach PW ${n}` });
  const u = await verified("Alumno PW");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const tpl = await tr.createTemplate(coach.id, org.id, doc(first));
  await tr.assignProgram(coach.id, org.id, tpl, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return { coach: coach.id, org: org.id, user: u.id, rel: rel.relationId, tpl };
}
const dayId = async (user: string) => { const t = await tr.myTraining(user); if (t.state !== "ready") throw new Error(t.state); return t.program.days[0].id; };
async function open(user: string) { const sid = randomUUID(); await tr.startSession(user, { id: sid, dayId: await dayId(user) }); return sid; }
const draftOf = (s: Awaited<ReturnType<typeof tr.getSession>>, k = 0) => {
  const local = fromServer(s as never);
  const e = s.exercises[k];
  return Array.from({ length: e.sets }, (_, i) => local.sets[setKey(e.id, i)]);
};

describe("D193 · el alumno ve las cargas que le indicó su profe", () => {
  it("caso real: cargas en la plantilla + reasignación con el entrenamiento abierto → aviso, «Aplicar ahora» y cargas a la vista", async () => {
    const w = await coachWorld([PLAIN]);
    const sid = await open(w.user);
    // Sin cargas en su copia: no hay nada que mostrar como «indicado por tu profe» (no se inventa).
    let s = await tr.getSession(w.user, sid);
    expect(s.exercises[0].detail).toBeNull();
    expect(s.exercises[0].targets.every((t) => t.source !== "coach")).toBe(true);
    // El profe carga las cargas en la plantilla. La copia del alumno no cambia (cada cliente tiene la suya) y se dice en el editor.
    await tr.saveProgram(w.coach, w.org, w.tpl, doc([PLANNED]));
    expect((await tr.getProgram(w.coach, w.org, w.tpl)).clients).toHaveLength(1);
    s = await tr.getSession(w.user, sid);
    expect(s.exercises[0].detail).toBeNull();
    expect(s.outdated).toBe(false);
    // Registra la primera serie con lo que le dijeron de palabra.
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 82.5, reps: 11, rir: 1 });
    // El profe se la vuelve a asignar (crea la copia nueva y cierra la asignación de la sesión abierta).
    await tr.assignProgram(w.coach, w.org, w.tpl, { coachClientIds: [w.rel], startsOn: localDate(new Date()) });
    s = await tr.getSession(w.user, sid);
    expect(s.outdated).toBe(true); // antes: false (no se avisaba)
    const r = await tr.upgradeSession(w.user, sid); // antes: «Tu programa ya no está asignado»
    expect(r).toMatchObject({ changed: true, moved: 1 });
    const hack = r.session.exercises[0];
    expect(hack.detail?.setPlan?.map((x) => [x.weightKg, x.reps])).toEqual([[80, "12"], [90, "10"], [100, "8"]]);
    // La tarjeta: «Tu profe indicó» con la carga del plan en las series que faltan (la 1.ª ya está registrada).
    const tg = [1, 2].map((i) => hack.targets.find((t) => t.setIndex === i)!);
    expect(tg.map((t) => [t.source, t.weightKg])).toEqual([["coach", 90], ["coach", 100]]);
    // La serie hecha no se toca; las que faltan se precargan con la carga del profe (no 0, no historial, no sugerencia).
    const d = draftOf(r.session);
    expect(d.map((x) => [x.w, x.r, x.done])).toEqual([[82.5, 11, true], [90, 10, false], [100, 8, false]]);
    expect(r.session.outdated).toBe(false);
    // La sesión pasó a la asignación vigente; la versión nueva queda congelada; un reintento no hace nada.
    const [ws] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid));
    const [active] = await db.select().from(schema.programAssignment).where(eq(schema.programAssignment.coachClientId, w.rel)).orderBy(desc(schema.programAssignment.assignedAt)).limit(1);
    expect([ws.assignmentId, active.status]).toEqual([active.id, "active"]);
    expect((await db.select().from(schema.programVersion).where(eq(schema.programVersion.id, ws.versionId)))[0].locked).toBe(true);
    expect(await tr.upgradeSession(w.user, sid)).toMatchObject({ changed: false });
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid))).toHaveLength(1);
    // Se sigue registrando y al terminar el historial guarda lo real, separado del plan.
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: hack.id, setIndex: 1, weightKg: 87.5, reps: 10, rir: 1 });
    await tr.sessionAction(w.user, sid, "finish");
    const logs = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid));
    expect(logs.map((l) => [l.setIndex, l.weightKg]).sort()).toEqual([[0, "82.5"], [1, "87.5"]]);
    expect((await tr.getSession(w.user, sid)).outdated).toBe(false); // terminada: no se ofrece cambiar nada
  });

  it("programa del alumno con cargas: aparecen exactamente, con o sin historial distinto, y la sugerencia no las pisa", async () => {
    const w = await coachWorld([PLANNED]);
    let sid = await open(w.user);
    let s = await tr.getSession(w.user, sid);
    expect(draftOf(s).map((x) => [x.w, x.r, !!x.pend])).toEqual([[80, 12, false], [90, 10, false], [100, 8, false]]);
    expect(s.exercises[0].targets.map((t) => [t.setIndex, t.source, t.weightKg, t.why])).toEqual([[0, "coach", 80, "Carga indicada por tu profe."], [1, "coach", 90, "Carga indicada por tu profe."], [2, "coach", 100, "Carga indicada por tu profe."]]);
    // Historial distinto (60 kg): sigue mandando el profe; la diferencia queda como revisión, no como cambio.
    for (const [i, x] of [[60, 12], [60, 12], [60, 12]].entries()) await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: i, weightKg: x[0], reps: x[1], rir: 3 });
    await tr.sessionAction(w.user, sid, "finish");
    sid = await open(w.user);
    s = await tr.getSession(w.user, sid);
    expect(s.exercises[0].prev).toMatchObject({ weightKg: 60 });
    expect(draftOf(s).map((x) => x.w)).toEqual([80, 90, 100]);
    expect(s.exercises[0].targets.every((t) => t.source === "coach")).toBe(true);
    // El alumno cambia la carga de la serie 1 y la registra: queda lo suyo; las demás siguen con la del profe.
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 77.5, reps: 12, rir: 1 });
    s = await tr.getSession(w.user, sid); // recargar
    expect(draftOf(s).map((x) => [x.w, x.done])).toEqual([[77.5, true], [90, false], [100, false]]);
    // kg → lb: el número es el mismo peso (la presentación convierte, el dato sigue en kg).
    expect(kgTo(90, "lb")).toBeCloseTo(198.4, 1);
  });

  it("top set + back-off con cargas explícitas y back-off sin carga (no hereda la del top set)", async () => {
    const w = await coachWorld([TOPBACK, { exerciseId: PRESS, name: "Prensa PW", sets: 2, reps: "6-8", detail: { technique: "top_backoff", setPlan: [S("top", "6", 200), S("backoff", "8", null)] } as ExerciseDetail }]);
    const sid = await open(w.user);
    const s = await tr.getSession(w.user, sid);
    expect(draftOf(s, 0).map((x) => [x.w, !!x.pend])).toEqual([[45, false], [40, false], [35, false]]);
    const press = draftOf(s, 1);
    expect([press[0].w, !!press[0].pend]).toEqual([200, false]);
    expect([press[1].w, !!press[1].pend]).toEqual([0, true]); // D182: por elegir, nunca 200 kg heredados
    expect(s.exercises[1].targets.find((t) => t.setIndex === 1)?.weightKg ?? null).not.toBe(200);
  });

  it("drop set con carga explícita en la etapa: se conserva; sin carga: queda por elegir", async () => {
    const drop: Ex = { sets: 2, reps: "8-10", detail: { technique: "drop_set", setPlan: [
      { ...S("work", "10", 60), id: "a", block: 0, stage: 0 }, { ...S("drop", "al fallo", 45), id: "b", block: 0, stage: 1 },
      { ...S("work", "10", 60), id: "c", block: 1, stage: 0 }, { ...S("drop", "al fallo", null), id: "d", block: 1, stage: 1 },
    ] } as ExerciseDetail };
    const w = await coachWorld([drop]);
    const sid = await open(w.user);
    const s = await tr.getSession(w.user, sid);
    expect(draftOf(s).map((x) => [x.w, !!x.pend])).toEqual([[60, false], [45, false], [60, false], [0, true]]);
  });

  it("serie sin carga programada y ejercicio de peso corporal: no se inventa una carga del profe", async () => {
    const w = await coachWorld([PLAIN, { exerciseId: PLANK, name: "Dominadas PW", sets: 3, reps: "8" }]);
    const sid = await open(w.user);
    const s = await tr.getSession(w.user, sid);
    for (const e of s.exercises) {
      expect(e.detail?.setPlan?.some((x) => x.weightKg != null) ?? false).toBe(false);
      expect(e.targets.some((t) => t.source === "coach")).toBe(false);
    }
  });

  it("offline: la sesión rearmada desde el servidor después de reconectar no duplica ni pisa lo registrado", async () => {
    const w = await coachWorld([PLANNED]);
    const sid = await open(w.user);
    const s = await tr.getSession(w.user, sid);
    const id = randomUUID();
    // Serie registrada sin conexión que llega dos veces (reintento de la cola).
    const at = new Date().toISOString();
    await tr.logSet(w.user, sid, { id, programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 80, reps: 12, rir: 1, at });
    await tr.logSet(w.user, sid, { id, programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 80, reps: 12, rir: 1, at });
    const back = await tr.getSession(w.user, sid);
    expect(back.exercises[0].logs).toHaveLength(1);
    expect(draftOf(back).map((x) => [x.w, x.done])).toEqual([[80, true], [90, false], [100, false]]);
  });

  it("una rutina propia nunca pasa al programa asignado, y otra persona no ve ni aplica la sesión", async () => {
    const w = await coachWorld([PLAIN]);
    const own = randomUUID();
    await tr.startSoloRoutine(w.user, { id: own, dayName: "Mi rutina", source: "own", exercises: [{ exerciseId: HACK, sets: 3, reps: "10" }] });
    await tr.saveProgram(w.coach, w.org, w.tpl, doc([PLANNED]));
    await tr.assignProgram(w.coach, w.org, w.tpl, { coachClientIds: [w.rel], startsOn: localDate(new Date()) });
    expect((await tr.getSession(w.user, own)).outdated).toBe(false);
    await expect(tr.upgradeSession(w.user, own)).rejects.toMatchObject({ code: "no_program" });
    await tr.sessionAction(w.user, own, "finish").catch(() => null);
    const sid = await open(w.user);
    const other = await verified("Alumno de otro coach PW");
    await expect(tr.getSession(other.id, sid)).rejects.toMatchObject({ code: "not_found" });
    await expect(tr.upgradeSession(other.id, sid)).rejects.toMatchObject({ code: "not_found" });
  });

  it("molestia en el ejercicio: la carga del profe se muestra igual, con la advertencia de seguridad primero", async () => {
    const w = await coachWorld([PLANNED]);
    let sid = await open(w.user);
    let s = await tr.getSession(w.user, sid);
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 80, reps: 12, rir: 1, feel: "molestia" });
    await tr.sessionAction(w.user, sid, "finish");
    sid = await open(w.user);
    s = await tr.getSession(w.user, sid);
    const t = s.exercises[0].targets.find((x) => x.setIndex === 0)!;
    expect([t.source, t.weightKg]).toEqual(["coach", 80]);
    expect(t.action).toBe("reduce_effort");
    expect(t.review).toMatch(/molestia/i);
  });

  it("programa del entrenador de sala: una versión nueva con cargas llega al entrenamiento abierto con «Aplicar ahora»", async () => {
    const owner = await verified("Dueño PW");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner.id));
    const org = await acc.createGymOrganization(owner.id, { name: `Gym PW ${n}-${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const floor = await verified("Sala PW");
    await db.insert(schema.staffMembership).values({ userId: floor.id, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(floor.id, org.id, A.id);
    const u = await verified("Socio PW");
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u.id, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    await gym.saveMemberProgram(floor.id, org.id, m.id, { doc: doc([PLAIN]), reason: "Inicial" });
    const sid = await open(u.id);
    expect(draftOf(await tr.getSession(u.id, sid)).map((x) => x.w)).toEqual([0, 0, 0]);
    await gym.saveMemberProgram(floor.id, org.id, m.id, { doc: doc([PLANNED]), reason: "Cargas" });
    expect((await tr.getSession(u.id, sid)).outdated).toBe(true);
    const r = await tr.upgradeSession(u.id, sid);
    expect(draftOf(r.session).map((x) => x.w)).toEqual([80, 90, 100]);
    expect(r.session.exercises[0].targets.every((t) => t.source === "coach")).toBe(true);
  });
});
