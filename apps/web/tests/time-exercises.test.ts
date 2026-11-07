// Ejercicios por tiempo (07/11/2026) · integración con la base descartable repi_test (ver tests/global-setup.ts). Una cinta se
// configura sólo con duración, velocidad e inclinación; el alumno registra lo que hizo. Cubre: perfil de la biblioteca (propio y
// catálogo, y el completado por nombre de 0052), guardado de programas y rutinas sin perder la actividad, registro con métricas,
// conflicto entre dispositivos, corrección del historial, exportación, progreso, Training Intelligence sin kilos, reemplazos sólo
// cardio por cardio y «No vino el profe» sin reescribir la duración. Todo lo anterior (programas, series, apps viejas) sigue igual.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_PROFILES, EXERCISE_CATALOG, localDate, type ExerciseDetail, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as h from "@/server/training/history";
import * as own from "@/server/training/own-routines";
import * as gym from "@/server/gym/services";
import { ensureExerciseCatalog } from "@/server/training/library";
import { exportMyData } from "@/server/privacy/services";
import { myExerciseProgress } from "@/server/progress/exercises";
import { aiSoloAdvice } from "@/server/training/ai-coach";
import { programImportPreview } from "@/server/training/program-import";
import { DetailZ } from "@/server/training/detail-schema";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name = "Persona Tiempo") {
  const email = `tm${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const catalogId = async (name: string) => (await db.select({ id: schema.exercise.id }).from(schema.exercise)
  .where(and(eq(schema.exercise.name, name), isNull(schema.exercise.orgId), isNull(schema.exercise.ownerUserId))))[0].id;

const CINTA = { profile: "treadmill" as const, speedKmh: 5, incline: 3 };
const X: Record<string, string> = {};
beforeAll(async () => {
  await ensureExerciseCatalog();
  for (const name of ["Cinta (caminata)", "Cinta (trote)", "Bicicleta fija", "Press de banca", "Plancha", "Elíptico"]) X[name] = await catalogId(name);
});
beforeEach(() => resetRateLimits());

type Row = ProgramDoc["days"][number]["exercises"][number];
const cinta = (p: Partial<Row> = {}): Row => ({ exerciseId: X["Cinta (caminata)"], name: "Cinta (caminata)", sets: 1, reps: "10 min", rir: null, restSec: 0, note: null, detail: { activity: CINTA } as ExerciseDetail, ...p });
const bench: Row = { exerciseId: "", name: "Press de banca", sets: 3, reps: "8-10", rir: 2, restSec: 90, note: null };
const plank: Row = { exerciseId: "", name: "Plancha", sets: 3, reps: "40 s", rir: null, restSec: 60, note: null };
const doc = (exs: Row[]): ProgramDoc => ({ name: "Cardio y fuerza", weeks: 4, note: "", days: [{ name: "Día A", exercises: exs.map((e) => ({ ...e, exerciseId: e.exerciseId || X[e.name] })) }] });
/** Cinta configurada · press de banca · plancha · una cinta de antes (20 min sin actividad) · bici 2 × 5 min nivel 8. */
const DEFAULT_DAY = (): Row[] => [cinta(), bench, plank,
  { exerciseId: X["Cinta (trote)"], name: "Cinta (trote)", sets: 1, reps: "20 min", rir: null, restSec: 0, note: null },
  { exerciseId: X["Bicicleta fija"], name: "Bicicleta fija", sets: 2, reps: "5 min", rir: null, restSec: 0, note: null, detail: { activity: { profile: "bike", level: 8 } } as ExerciseDetail }];

async function world(exs: Row[] = DEFAULT_DAY()) {
  const coach = await verified("Coach Tiempo");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach Tiempo ${n}` });
  const u = await verified("Alumna Tiempo");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, ["training"]);
  const tpl = await tr.createTemplate(coach.id, org.id, doc(exs));
  await tr.assignProgram(coach.id, org.id, tpl, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return { coach: coach.id, org: org.id, user: u.id, rel: rel.relationId, tpl };
}
async function started(user: string) {
  const t = await tr.myTraining(user);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program.days[0].id });
  return { sid, s: await tr.getSession(user, sid), t };
}
const set = (pe: string, i: number, p: Partial<Parameters<typeof tr.logSet>[2]> = {}) => ({ id: randomUUID(), programExerciseId: pe, setIndex: i, weightKg: null, reps: 600, rir: null, ...p });

describe("biblioteca: perfil de cada ejercicio", () => {
  it("el catálogo resuelve cinta, aguante y fuerza; un ejercicio propio guarda el perfil elegido (coach, gimnasio y alumno)", async () => {
    const w = await world([bench]);
    const lib = await tr.listLibrary(w.coach, w.org);
    const byName = (x: string) => lib.find((e) => e.name === x)!;
    expect(byName("Cinta (caminata)").profile).toBe("treadmill");
    expect(byName("Bicicleta fija").profile).toBe("bike");
    expect(byName("Plancha").profile).toBe("hold");
    expect(byName("Press de banca").profile).toBe("strength");
    expect(lib.every((e) => !("metricsProfile" in e))).toBe(true);
    // Con perfil, el tipo de registro sale del perfil y queda guardado.
    const mine = await tr.coachCreateExercise(w.coach, w.org, { name: "Cinta curva", group: "Cardio", profile: "treadmill" });
    expect(mine).toMatchObject({ name: "Cinta curva", kind: "time", profile: "treadmill", own: true, existed: false });
    expect((await db.select().from(schema.exercise).where(eq(schema.exercise.id, mine.id)))[0].metricsProfile).toBe("treadmill");
    expect((await tr.listLibrary(w.coach, w.org)).find((e) => e.id === mine.id)?.profile).toBe("treadmill");
    // Una app anterior (sólo tipo de registro): no guarda perfil y se deduce del nombre («caminadora» es una cinta aunque diga peso).
    const old = await tr.coachCreateExercise(w.coach, w.org, { name: "Caminadora del box", group: "Cardio", kind: "load_reps" });
    expect(old).toMatchObject({ kind: "load_reps", profile: "treadmill" });
    expect((await db.select().from(schema.exercise).where(eq(schema.exercise.id, old.id)))[0].metricsProfile).toBeNull();
    expect((await err(tr.coachCreateExercise(w.coach, w.org, { name: "Remo raro", group: "Cardio", profile: "cardio" })))?.code).toBe("invalid");
    expect((await err(tr.coachCreateExercise(w.coach, w.org, { name: "Sin tipo", group: "Cardio" })))?.code).toBe("invalid");
    // Uno que ya existe devuelve el suyo, con su perfil (no lo cambia).
    expect(await tr.coachCreateExercise(w.coach, w.org, { name: "cinta caminata", group: "Cardio", profile: "bike" })).toMatchObject({ profile: "treadmill", existed: true });
    // Alumno: su ejercicio propio con perfil, sólo para él.
    const m = await own.createMyExercise(w.user, { name: "Escalador del club", group: "Cardio", profile: "stair" });
    expect(m).toMatchObject({ kind: "time", profile: "stair", mine: true });
    expect((await own.myExerciseLibrary(w.user)).find((e) => e.id === m.id)?.profile).toBe("stair");
    // Gimnasio: quien arma programas crea uno con perfil y la biblioteca lo devuelve.
    const owner = await verified("Dueña Tiempo");
    const g = await acc.createGymOrganization(owner.id, { name: `Gym Tiempo ${Date.now()}` });
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: g.id, name: "Centro" }).returning();
    const floor = await verified("Profe Tiempo");
    await db.insert(schema.staffMembership).values({ userId: floor.id, orgId: g.id, locationId: loc.id, role: "floor_trainer" });
    const ge = await gym.gymCreateExercise(floor.id, g.id, { name: "Bici de spinning", group: "Cardio", profile: "bike" });
    expect(ge).toMatchObject({ kind: "time", profile: "bike" });
    const glib = await gym.gymLibrary(floor.id, g.id);
    expect(glib.find((e) => e.id === ge.id)?.profile).toBe("bike");
    expect(glib.find((e) => e.name === "Cinta (caminata)")?.profile).toBe("treadmill");
  });

  it("0052 completa el perfil del catálogo por nombre y tipo, sin tocar ejercicios propios; repetirlo no cambia nada", async () => {
    const MIG = readFileSync(fileURLToPath(new URL("../drizzle/0052_time_metrics.sql", import.meta.url)), "utf8");
    const backfill = /UPDATE "exercise" AS e[\s\S]*?;\s*$/m.exec(MIG)![0];
    // Cada par (nombre, tipo, perfil) del completado es el del catálogo del dominio (no hay perfiles inventados ni viejos).
    const pairs = [...backfill.matchAll(/\('((?:[^']|'')+)', '(\w+)', '(\w+)'\)/g)].map((m) => [m[1].replace(/''/g, "'"), m[2], m[3]]);
    const cat = new Map(EXERCISE_CATALOG.map(([name, , kind, profile]) => [name, `${kind}:${profile}`]));
    expect(pairs.length).toBe(EXERCISE_CATALOG.length);
    for (const [name, kind, profile] of pairs) expect(cat.get(name)).toBe(`${kind}:${profile}`);
    const w = await world([bench]);
    const [ownRow] = await db.insert(schema.exercise).values({ orgId: w.org, name: "Cinta (caminata)", muscleGroup: "Cardio", kind: "time" }).returning();
    const [mine] = await db.insert(schema.exercise).values({ ownerUserId: w.user, name: "Bicicleta fija", muscleGroup: "Cardio", kind: "load_reps" }).returning();
    const catalog = [X["Cinta (caminata)"], X["Bicicleta fija"], X["Plancha"], X["Press de banca"]];
    const profiles = async () => Object.fromEntries((await db.select({ id: schema.exercise.id, p: schema.exercise.metricsProfile }).from(schema.exercise)
      .where(sql`${schema.exercise.id} in (${sql.join([...catalog, ownRow.id, mine.id].map((x) => sql`${x}`), sql`, `)})`)).map((r) => [r.id, r.p]));
    const before = await profiles();
    try {
      await db.update(schema.exercise).set({ metricsProfile: null }).where(sql`${schema.exercise.id} in (${sql.join(catalog.map((x) => sql`${x}`), sql`, `)})`);
      await db.update(schema.exercise).set({ metricsProfile: "rower" }).where(eq(schema.exercise.id, X["Press de banca"])); // un perfil ya guardado no se pisa
      await db.execute(sql.raw(backfill));
      const after = await profiles();
      expect(after[X["Cinta (caminata)"]]).toBe("treadmill");
      expect(after[X["Bicicleta fija"]]).toBe("bike");
      expect(after[X["Plancha"]]).toBe("hold");
      expect(after[X["Press de banca"]]).toBe("rower");
      expect(after[ownRow.id]).toBeNull();
      expect(after[mine.id]).toBeNull();
      await db.execute(sql.raw(backfill));
      expect(await profiles()).toEqual(after);
    } finally {
      for (const [id, p] of Object.entries(before)) await db.update(schema.exercise).set({ metricsProfile: p }).where(eq(schema.exercise.id, id));
      await db.delete(schema.exercise).where(sql`${schema.exercise.id} in (${ownRow.id}, ${mine.id})`);
    }
  });
});

describe("guardar programas y rutinas conserva la actividad", () => {
  it("las rutas aceptan la actividad (DetailZ) y no la descartan", () => {
    const d = DetailZ.parse({ technique: "straight", activity: { profile: "treadmill", speedKmh: 5, incline: 3, extra: 1 } });
    expect(d?.activity).toEqual({ profile: "treadmill", speedKmh: 5, incline: 3 });
    expect(DetailZ.parse({ activity: null })?.activity).toBeNull();
  });

  it("coach: 10 min · 5 km/h · inclinación 3 sin RIR; editar conserva; rangos y duración validados", async () => {
    const w = await world([{ ...cinta(), rir: 2 }, bench]);
    const p = await tr.getProgram(w.coach, w.org, w.tpl);
    const ex = p.doc.days[0].exercises[0];
    expect(ex).toMatchObject({ sets: 1, reps: "10 min", rir: null, restSec: 0 });
    expect(ex.detail?.activity).toEqual(CINTA);
    await tr.saveProgram(w.coach, w.org, w.tpl, { ...tr.plain(p.doc), name: "Editado" });
    expect((await tr.getProgram(w.coach, w.org, w.tpl)).doc.days[0].exercises[0].detail?.activity).toEqual(CINTA);
    // La copia asignada al alumno también la conserva.
    const t = await tr.myTraining(w.user);
    if (t.state !== "ready") throw new Error(t.state);
    expect(t.program.days[0].exercises[0]).toMatchObject({ profile: "treadmill", activity: CINTA, reps: "10 min" });
    expect(t.program.days[0].exercises[1]).toMatchObject({ profile: "strength", activity: null });
    expect((await err(tr.createTemplate(w.coach, w.org, doc([cinta({ detail: { activity: { ...CINTA, speedKmh: 30 } } as ExerciseDetail })]))))?.message).toMatch(/Cinta \(caminata\): La velocidad va de 0,5 a 25 km\/h\./);
    expect((await err(tr.createTemplate(w.coach, w.org, doc([cinta({ reps: "300 min" })]))))?.message).toMatch(/4 horas/);
    expect((await err(tr.createTemplate(w.coach, w.org, doc([cinta({ reps: "10-12" })]))))?.message).toMatch(/duración/);
  });

  it("gimnasio: el programa del socio conserva la actividad", async () => {
    const owner = await verified("Dueño Sala Tiempo");
    const g = await acc.createGymOrganization(owner.id, { name: `Gym Sala Tiempo ${Date.now()}` });
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: g.id, name: "Centro" }).returning();
    const floor = await verified("Profe Sala Tiempo");
    await db.insert(schema.staffMembership).values({ userId: floor.id, orgId: g.id, locationId: loc.id, role: "floor_trainer" });
    const u = await verified("Socia Tiempo");
    const [m] = await db.insert(schema.gymMember).values({ orgId: g.id, locationId: loc.id, userId: u.id, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: g.id, item: "attendance_training", termsVersion: "test" });
    await gym.startShift(floor.id, g.id, loc.id);
    await gym.saveMemberProgram(floor.id, g.id, m.id, { reason: "Programa de sala", doc: doc([cinta(), bench]) });
    const [p] = await db.select().from(schema.program).where(eq(schema.program.gymMemberId, m.id));
    const { doc: d } = await tr.readVersion(p.currentVersionId!);
    expect(d.days[0].exercises[0].detail?.activity).toEqual(CINTA);
    expect(d.days[0].exercises[0].rir).toBeNull();
  });

  it("Mis rutinas, rutina sin programa e importación: la actividad llega a la sesión", async () => {
    const w = await world([bench]);
    const r = await own.saveOwnRoutine(w.user, { name: "Cardio en casa", exercises: [
      { exerciseId: X["Cinta (caminata)"], sets: 1, reps: "10 min", weightKg: null, restSec: 0, note: null, detail: { activity: CINTA } as ExerciseDetail }] });
    const list = await own.listOwnRoutines(w.user);
    const saved = list.find((x) => x.id === r.id)!;
    expect(saved.exercises[0].detail?.activity).toEqual(CINTA);
    expect((await err(own.saveOwnRoutine(w.user, { name: "Larga", exercises: [{ exerciseId: X["Cinta (caminata)"], sets: 1, reps: "5 h", weightKg: null, restSec: 0, note: null, detail: { activity: CINTA } as ExerciseDetail }] })))?.code).toBe("invalid");
    // Una actividad no lleva peso aunque llegue uno (una app vieja o un error de la pantalla).
    const heavy = await own.saveOwnRoutine(w.user, { name: "Con peso", exercises: [{ exerciseId: X["Cinta (caminata)"], sets: 1, reps: "10 min", weightKg: 20, restSec: 0, note: null, detail: { activity: CINTA } as ExerciseDetail }] });
    expect((await own.listOwnRoutines(w.user)).find((x) => x.id === heavy.id)!.exercises[0].weightKg).toBeNull();
    const sid = randomUUID();
    await own.startOwnRoutine(w.user, r.id, sid);
    const s = await tr.getSession(w.user, sid);
    expect(s.exercises[0]).toMatchObject({ profile: "treadmill", activity: CINTA, reps: "10 min", sets: 1 });
    await tr.sessionAction(w.user, sid, "finish");
    // Rutina sin programa («No vino el profe»): mismo validador, con la duración.
    const solo = randomUUID();
    // Sin descanso indicado, una actividad va sin descanso (la fuerza sigue con 90 s); sin «Sugerido: … kg» en la nota.
    await tr.startSoloRoutine(w.user, { id: solo, dayName: "Hoy", exercises: [{ exerciseId: X["Elíptico"], sets: 1, reps: "15 min", weightKg: 40, detail: { activity: { profile: "elliptical", level: 6, incline: 2 } } as ExerciseDetail },
      { exerciseId: X["Press de banca"], sets: 3, reps: "10", weightKg: 40 }] });
    const soloS = await tr.getSession(w.user, solo);
    expect(soloS.exercises[0]).toMatchObject({ profile: "elliptical", activity: { profile: "elliptical", level: 6, incline: 2 }, restSec: 0, note: null });
    expect(soloS.exercises[1]).toMatchObject({ profile: "strength", activity: null, restSec: 90, note: "Sugerido: 40 kg" });
    await tr.sessionAction(w.user, solo, "finish");
    expect((await err(tr.startSoloRoutine(w.user, { id: randomUUID(), dayName: "Hoy", exercises: [{ exerciseId: X["Elíptico"], sets: 1, reps: "300 min", detail: { activity: { profile: "elliptical" } } as ExerciseDetail }] })))?.code).toBe("invalid");
    // Importación revisada: la actividad en el detalle y como procedencia.
    const origin = { written: "Cinta 10 min vel 5 incl 3", exerciseId: "", sets: 1, reps: "10 min", weightKg: null, perSet: null, restSec: null, rir: null, rpe: null, tempo: null, technique: null, unknown: [], completed: [], suggested: [], activity: CINTA };
    const imp = await own.saveImportedRoutines(w.user, { opId: `op-${randomUUID().slice(0, 12)}`, source: "text", file: "text", routines: [
      { name: "Importada", exercises: [{ exerciseId: X["Cinta (caminata)"], sets: 1, reps: "10 min", weightKg: null, restSec: 0, note: null, detail: { activity: CINTA } as ExerciseDetail }], origin: [origin] }] });
    const [row] = await db.select().from(schema.ownRoutine).where(eq(schema.ownRoutine.id, imp.ids[0]));
    expect((row.exercises as { detail?: ExerciseDetail }[])[0].detail?.activity).toEqual(CINTA);
    expect(row.origin?.exercises[0].activity).toEqual(CINTA);
    // Vista previa (coach): la cinta leída con su actividad y el perfil del ejercicio emparejado.
    const k = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    try {
      const pv = await programImportPreview(w.coach, w.org, await tr.listLibrary(w.coach, w.org), { fileName: "t", kind: "text", text: "Día A\nCinta caminadora 10 min vel 5 incl 3\nPress banca 3x10" }, async () => {});
      const [ci, bp] = pv.variants[0].days[0].exercises;
      expect(ci).toMatchObject({ exerciseId: X["Cinta (caminata)"], profile: "treadmill", activity: CINTA });
      expect(bp).toMatchObject({ exerciseId: X["Press de banca"], profile: "strength" });
      expect(bp.activity ?? null).toBeNull();
    } finally { if (k) process.env.OPENAI_API_KEY = k; }
  });
});

describe("registro de la persona", () => {
  it("cinta: duración real en segundos y velocidad e inclinación en métricas; reintentos, app anterior y borrado", async () => {
    const w = await world();
    const { sid, s } = await started(w.user);
    const [c, b, pl, legacy, bike] = s.exercises;
    expect(c).toMatchObject({ profile: "treadmill", activity: CINTA, sets: 1, reps: "10 min", rir: null });
    expect(b).toMatchObject({ profile: "strength", activity: null });
    expect(pl).toMatchObject({ profile: "hold", activity: null });
    expect(legacy).toMatchObject({ profile: "treadmill", activity: null, reps: "20 min" }); // una cinta de antes, como estaba
    expect(bike).toMatchObject({ profile: "bike", activity: { profile: "bike", level: 8 } });
    // Lo que hizo: 12 min a 5,5 km/h con inclinación 4 (redondeado al paso del campo).
    const first = set(c.id, 0, { reps: 720, metrics: { speedKmh: 5.55, incline: 4 } });
    const r1 = await tr.logSet(w.user, sid, first);
    expect(r1).toMatchObject({ status: "ok", reps: 720, weightKg: null, metrics: { speedKmh: 5.6, incline: 4 }, revision: 1 });
    expect((await tr.getSession(w.user, sid)).exercises[0].logs[0]).toMatchObject({ reps: 720, metrics: { speedKmh: 5.6, incline: 4 } });
    // Reintento idéntico: sin cambios. App anterior (sin métricas) con los mismos valores: tampoco cambia ni las borra.
    expect(await tr.logSet(w.user, sid, { ...first, metrics: { incline: 4, speedKmh: 5.6 }, baseRevision: 0 })).toMatchObject({ status: "ok", revision: 1 });
    const { metrics: _m, ...oldApp } = first;
    expect(await tr.logSet(w.user, sid, { ...oldApp, baseRevision: 1 })).toMatchObject({ status: "ok", revision: 1, metrics: { speedKmh: 5.6, incline: 4 } });
    expect(await tr.logSet(w.user, sid, { ...oldApp, reps: 750, baseRevision: 1 })).toMatchObject({ status: "ok", revision: 2, reps: 750, metrics: { speedKmh: 5.6, incline: 4 } });
    // Cambiar sólo la inclinación es un cambio; `null` las borra.
    expect(await tr.logSet(w.user, sid, { ...first, reps: 750, metrics: { speedKmh: 5.6, incline: 5 }, baseRevision: 2 })).toMatchObject({ revision: 3, metrics: { speedKmh: 5.6, incline: 5 } });
    expect(await tr.logSet(w.user, sid, { ...first, reps: 750, metrics: null, baseRevision: 3 })).toMatchObject({ revision: 4, metrics: null });
    // Fuera de rango: error claro, nada guardado. Un campo de otro perfil se descarta.
    expect((await err(tr.logSet(w.user, sid, { ...first, metrics: { speedKmh: 30 }, baseRevision: 4 })))?.message).toBe("La velocidad va de 0,5 a 25 km/h.");
    expect(await tr.logSet(w.user, sid, { ...first, reps: 750, metrics: { speedKmh: 6, level: 9 }, baseRevision: 4 })).toMatchObject({ metrics: { speedKmh: 6 } });
    // Fuerza: sin métricas aunque las mande. Plancha: hasta 1 hora; una actividad, hasta 4.
    expect(await tr.logSet(w.user, sid, set(b.id, 0, { weightKg: 60, reps: 10, rir: 2, metrics: { speedKmh: 5 } }))).toMatchObject({ metrics: null, weightKg: 60 });
    expect((await err(tr.logSet(w.user, sid, set(pl.id, 0, { reps: 3601 }))))?.code).toBe("invalid");
    expect(await tr.logSet(w.user, sid, set(pl.id, 0, { reps: 3600 }))).toMatchObject({ status: "ok" });
    expect(await tr.logSet(w.user, sid, set(bike.id, 0, { reps: 3 * 3600, metrics: { level: 9, cadenceRpm: 85 } }))).toMatchObject({ reps: 10800, metrics: { level: 9, cadenceRpm: 85 } });
    expect((await err(tr.logSet(w.user, sid, set(bike.id, 1, { reps: 4 * 3600 + 1 }))))?.code).toBe("invalid");
    // La cinta de antes (sin actividad configurada) también registra velocidad e inclinación.
    expect(await tr.logSet(w.user, sid, set(legacy.id, 0, { reps: 1200, metrics: { speedKmh: 8, incline: 1 } }))).toMatchObject({ metrics: { speedKmh: 8, incline: 1 } });
    // Volumen y récords no cuentan la actividad (sin kilos); el resumen trae las métricas.
    await tr.sessionAction(w.user, sid, "finish");
    const sum = await tr.sessionSummary(w.user, sid);
    expect(sum.volumeKg).toBe(600);
    expect(sum.exercises[0]).toMatchObject({ profile: "treadmill", activity: CINTA });
    expect(sum.exercises[0].logs[0].metrics).toEqual({ speedKmh: 6 });
    // Exportación de datos personales: cada serie con sus métricas.
    const data = await exportMyData(w.user);
    const sets = data.training.flatMap((x) => x.sets);
    expect(sets.some((x) => x.reps === 10800 && JSON.stringify(x.metrics) === JSON.stringify({ level: 9, cadenceRpm: 85 }))).toBe(true);
    expect(sets.filter((x) => x.weightKg === 60).every((x) => x.metrics === null)).toBe(true);
    // «La vez pasada» que ve el coach al editar el programa del alumno: con las métricas de la actividad.
    const p = await db.select({ id: schema.program.id }).from(schema.program).where(and(eq(schema.program.orgId, w.org), eq(schema.program.coachClientId, w.rel)));
    const last = await tr.coachProgramLastTimes(w.coach, w.org, p[0].id, [X["Bicicleta fija"], X["Press de banca"]]);
    expect(last[X["Bicicleta fija"]].sets[0]).toMatchObject({ reps: 10800, weightKg: null, metrics: { level: 9, cadenceRpm: 85 } });
    expect(last[X["Press de banca"]].sets[0]).toMatchObject({ weightKg: 60 });
    expect("metrics" in last[X["Press de banca"]].sets[0]).toBe(false);
    // Progreso: la cinta se mide por tiempo.
    const prog = await myExerciseProgress(w.user, X["Cinta (caminata)"], "all");
    expect(prog.metric).toBe("time");
    expect(prog.exercise.profile).toBe("treadmill");
    // Ficha del coach: las series con sus métricas.
    const cd = await tr.clientDetail(w.coach, w.org, w.rel);
    const ex = cd.sessions.find((x) => x.id === sid)!.exercises.find((e) => e.exercise === "Cinta (caminata)")!;
    expect(ex).toMatchObject({ timed: true });
    expect(ex.sets[0]).toMatchObject({ reps: 750, metrics: { speedKmh: 6 } });
  });

  it("Training Intelligence: una actividad nunca recibe kilos; cardio mal indicado («10-12») no aplica", async () => {
    const w = await world([cinta(), { exerciseId: X["Cinta (trote)"], name: "Cinta (trote)", sets: 3, reps: "10-12", rir: 2, restSec: 60, note: null }]);
    const { sid, s } = await started(w.user);
    await tr.logSet(w.user, sid, set(s.exercises[0].id, 0, { reps: 600, metrics: { speedKmh: 5, incline: 3 } }));
    await tr.sessionAction(w.user, sid, "finish");
    const next = await started(w.user);
    const [c, wrong] = next.s.exercises;
    expect(c.targets.length).toBeGreaterThan(0);
    expect(c.targets.every((t) => t.weightKg == null && t.rirTarget == null)).toBe(true);
    expect(wrong.targets.every((t) => t.weightKg == null && t.status === "not_applicable")).toBe(true);
    expect(c.suggest).toBeNull();
  });

  it("conflicto entre dispositivos por métricas y resolución con las del teléfono", async () => {
    const w = await world();
    const { sid, s } = await started(w.user);
    const pe = s.exercises[0].id;
    await tr.logSet(w.user, sid, set(pe, 0, { reps: 600, metrics: { speedKmh: 5, incline: 3 } }));
    // Otro teléfono registró la misma serie sin conexión con otra velocidad (mismos segundos).
    const other = await tr.logSet(w.user, sid, set(pe, 0, { reps: 600, metrics: { speedKmh: 6, incline: 3 }, baseRevision: 0 }));
    expect(other).toMatchObject({ status: "conflict", reason: "other_device", metrics: { speedKmh: 5, incline: 3 } });
    const [c] = await tr.listConflicts(w.user, sid);
    expect(c.client).toMatchObject({ metrics: { speedKmh: 6, incline: 3 } });
    expect(c.server).toMatchObject({ metrics: { speedKmh: 5, incline: 3 } });
    await tr.resolveConflict(w.user, c.id, "local");
    const [row] = await db.select().from(schema.setLog).where(and(eq(schema.setLog.sessionId, sid), eq(schema.setLog.programExerciseId, pe)));
    expect(row.metrics).toEqual({ speedKmh: 6, incline: 3 });
    expect(row.revision).toBe(2);
  });

  it("historial: corregir métricas y duración (hasta 4 h en una actividad) y agregar una serie olvidada con métricas", async () => {
    const w = await world();
    const { sid, s } = await started(w.user);
    const [c, , pl, , bike] = s.exercises;
    const logged = await tr.logSet(w.user, sid, set(c.id, 0, { reps: 600, metrics: { speedKmh: 5, incline: 3 } }));
    await tr.logSet(w.user, sid, set(pl.id, 0, { reps: 40 }));
    await tr.logSet(w.user, sid, set(bike.id, 0, { reps: 300, metrics: { level: 8 } }));
    await tr.sessionAction(w.user, sid, "finish");
    const rq = () => randomUUID();
    const fixed = await h.correctSet(w.user, sid, logged.id, { requestId: rq(), baseRevision: 1, values: { metrics: { speedKmh: 5.5, incline: 4 } } });
    expect(fixed.set).toMatchObject({ metrics: { speedKmh: 5.5, incline: 4 }, reps: 600, revision: 2 });
    const [corr] = await db.select().from(schema.trainingCorrection).where(eq(schema.trainingCorrection.setLogId, logged.id));
    expect(corr).toMatchObject({ action: "set_edit", before: { metrics: { speedKmh: 5, incline: 3 } }, after: { metrics: { speedKmh: 5.5, incline: 4 } } });
    expect((await err(h.correctSet(w.user, sid, logged.id, { requestId: rq(), baseRevision: 2, values: { metrics: { incline: 50 } } })))?.message).toMatch(/inclinación/);
    // Duración: una actividad llega a 4 horas; más, no. Una plancha sigue hasta 1 hora.
    expect((await h.correctSet(w.user, sid, logged.id, { requestId: rq(), baseRevision: 2, values: { reps: 4 * 3600 }, confirm: true })).set.reps).toBe(14400);
    expect((await err(h.correctSet(w.user, sid, logged.id, { requestId: rq(), baseRevision: 3, values: { reps: 4 * 3600 + 1 }, confirm: true })))?.message).toBe("La duración va hasta 4 horas.");
    const plankLog = (await tr.getSession(w.user, sid)).exercises[2].logs[0];
    expect((await err(h.correctSet(w.user, sid, plankLog.id, { requestId: rq(), baseRevision: 1, values: { reps: 3601 }, confirm: true })))?.code).toBe("invalid");
    // Sin `metrics`, una corrección de otra cosa no las borra.
    expect((await h.correctSet(w.user, sid, logged.id, { requestId: rq(), baseRevision: 3, values: { feel: "bien" } })).set.metrics).toEqual({ speedKmh: 5.5, incline: 4 });
    // Serie olvidada de la bici (2 × 5 min): con su nivel; un campo de otra actividad se descarta.
    const added = await h.addMissingSet(w.user, sid, { requestId: rq(), programExerciseId: bike.id, setIndex: 1, values: { reps: 300, metrics: { level: 10, speedKmh: 20 } } });
    expect(added.set).toMatchObject({ reps: 300, metrics: { level: 10 } });
    const hs = await h.historySession(w.user, sid);
    const hc = hs.exercises.find((e) => e.id === c.id)!;
    expect(hc).toMatchObject({ profile: "treadmill", activity: CINTA });
    expect(hc.rows[0].log).toMatchObject({ metrics: { speedKmh: 5.5, incline: 4 }, corrected: true });
    expect(hs.exercises.find((e) => e.id === bike.id)!.rows[1].log).toMatchObject({ metrics: { level: 10 }, added: true });
  });
});

describe("reemplazos y «No vino el profe»", () => {
  it("la cinta sólo se reemplaza por otra actividad (nunca por una plancha)", async () => {
    const w = await world();
    const { sid, s } = await started(w.user);
    const alts = await tr.sessionAlternatives(w.user, sid, s.exercises[0].id);
    expect(alts.alternatives.length).toBeGreaterThan(0);
    expect(alts.alternatives.every((a) => (ACTIVITY_PROFILES as readonly string[]).includes(a.profile))).toBe(true);
    expect(alts.alternatives.some((a) => a.name === "Plancha")).toBe(false);
    expect(alts.alternatives.some((a) => a.name === "Bicicleta fija")).toBe(true);
    // Y la plancha no se reemplaza por la cinta.
    const pl = await tr.sessionAlternatives(w.user, sid, s.exercises[2].id);
    expect(pl.alternatives.some((a) => a.name.startsWith("Cinta"))).toBe(false);
    // Con la bici en lugar de la cinta: la fila sigue diciendo qué indicó el profe y el reemplazo trae su propio perfil; la serie
    // guarda los campos de la bici (nivel), no los de la cinta.
    await tr.setExerciseChange(w.user, sid, { programExerciseId: s.exercises[0].id, change: { kind: "substitute", reason: "busy", exerciseId: X["Bicicleta fija"] } });
    const after = (await tr.getSession(w.user, sid)).exercises[0];
    expect(after).toMatchObject({ profile: "treadmill", activity: CINTA, change: { kind: "substitute", substitute: { exerciseId: X["Bicicleta fija"], profile: "bike" } } });
    expect(await tr.logSet(w.user, sid, set(s.exercises[0].id, 0, { reps: 600, metrics: { level: 7, speedKmh: 5 } }))).toMatchObject({ metrics: { level: 7 } });
    // Alternativas del día («No vino el profe»): para la cinta, sólo otras actividades, cada una con su perfil.
    const [{ d }] = await db.select({ d: schema.programExercise.dayId }).from(schema.programExercise).where(eq(schema.programExercise.id, s.exercises[0].id));
    const day = await tr.dayAlternatives(w.user, d);
    const forCinta = day.get(s.exercises[0].id) ?? [];
    expect(forCinta.length).toBeGreaterThan(0);
    expect(forCinta.every((a) => (ACTIVITY_PROFILES as readonly string[]).includes(a.profile))).toBe(true);
  });

  it("la IA no cambia series, duración ni propone kilos en una actividad", async () => {
    const w = await world([cinta(), bench]);
    const seen: { actividad?: string; rir?: unknown }[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const ctx = JSON.parse(JSON.parse(init.body).messages[1].content[0].text);
      const d = ctx.dias[0];
      seen.push(...d.ejercicios);
      const out = { dayId: d.dayId, headline: "Hoy", summary: "Dale.", caution: null, exercises: d.ejercicios.map((e: { programExerciseId: string }) => ({ programExerciseId: e.programExerciseId, sets: 2, reps: "8", weightKg: 50, note: "" })) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200 });
    });
    const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test";
    try {
      const a = await aiSoloAdvice(w.user);
      expect(a.exercises[0]).toMatchObject({ name: "Cinta (caminata)", sets: 1, reps: "10 min", weightKg: null, profile: "treadmill", activity: CINTA, checks: [] });
      expect(a.exercises[1]).toMatchObject({ sets: 2, reps: "8" });
      expect(seen[0]).toMatchObject({ actividad: "10 min · 5 km/h · incl. 3" });
      expect(seen[0].rir).toBeUndefined();
    } finally { vi.unstubAllGlobals(); if (key) process.env.OPENAI_API_KEY = key; else delete process.env.OPENAI_API_KEY; }
  });
});
