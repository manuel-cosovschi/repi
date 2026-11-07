// D184: los mismos métodos avanzados en todos los orígenes (rutina propia, importada, de REPI, duplicada) y la ejecución
// conectada que viaja entre dispositivos: etapas omitidas e intervalo EMOM en el servidor, con reintentos, conflictos y
// estadísticas que no cuentan lo omitido. Contra la base de pruebas descartable (ver tests/global-setup.ts).
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMethod, detectMethod, emptyDetail, localDate, methodDetail, planBlocks, type ExerciseDetail } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as own from "@/server/training/own-routines";
import { aiMethodDetail } from "@/server/training/solo-routine";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { DetailZ } from "@/server/training/detail-schema";
import { fromServer, setKey } from "@/lib/offline/store";
import { planBackfill, rollbackBackfill, runBackfill } from "../scripts/operations/backfill-set-log-stage";
import postgres from "postgres";

let n = 0;
const mail = () => `me${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Rutinas") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g] of [["Elevación rutina", "Hombros"], ["Curl rutina", "Brazos"], ["Remo rutina", "Espalda"], ["Burpee rutina", "Core"]]) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

async function student() {
  const coach = await verified("Coach Rutinas");
  const org = await acc.createCoachOrganization(coach, { brand: `Coach rutinas ${n}` });
  const u = await verified("Alumno Rutinas");
  const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(u) });
  const r = await acc.acceptInvitation(u, inv.code, []);
  return { coach, orgId: org.id, userId: u, relId: r.relationId };
}
const drop = (sets: number, reps = "12") => applyMethod(null, { sets, reps, rir: null }, "drop_set", [sets - 1], { stages: 2 }).detail;
const R = (name: string, sets: number, reps: string, detail?: ExerciseDetail | null, weightKg: number | null = null) => ({ exerciseId: EX[name], sets, reps, weightKg, restSec: 60, note: null, detail: detail ?? null });
const log = (userId: string, sid: string, peId: string, setIndex: number, weightKg: number | null, reps: number, at?: string) =>
  tr.logSet(userId, sid, { id: randomUUID(), programExerciseId: peId, setIndex, weightKg, reps, rir: 1, at });
const skip = (userId: string, sid: string, peId: string, setIndex: number, skipped: boolean, at: string) => tr.setStageSkip(userId, sid, { programExerciseId: peId, setIndex, skipped, at });
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

async function ownDropSession() {
  const w = await student();
  const { id: rid } = await own.saveOwnRoutine(w.userId, { name: "Hombros con drop", exercises: [R("Elevación rutina", 3, "12", drop(3), 8), R("Curl rutina", 3, "10")] });
  const sid = randomUUID();
  await own.startOwnRoutine(w.userId, rid, sid);
  return { ...w, rid, sid, s: await tr.getSession(w.userId, sid) };
}

describe("D184 · 1. rutina manual del alumno con drop set", () => {
  it("se guarda con el mismo detalle del coach, se entrena con etapas conectadas y el historial cuenta series principales", async () => {
    const w = await ownDropSession();
    const list = await own.listOwnRoutines(w.userId);
    expect(list[0].exercises[0].detail?.technique).toBe("drop_set");
    const e = w.s.exercises[0];
    expect(e.sets).toBe(5);
    expect(planBlocks(e.detail, e.sets).map((b) => b.stages)).toEqual([0, 0, 2]);
    // El peso de la rutina va en las series principales (primera vez), nunca en los drops.
    expect(e.detail!.setPlan!.map((r) => r.weightKg)).toEqual([8, 8, 8, null, null]);
    for (const [i, kg, r] of [[0, 8, 12], [1, 8, 12], [2, 8, 12], [3, 6, 10], [4, 4, 10]] as const) await log(w.userId, w.sid, e.id, i, kg, r);
    await tr.sessionAction(w.userId, w.sid, "finish");
    const sum = await tr.sessionSummary(w.userId, w.sid);
    expect(sum.metrics).toMatchObject({ mainDone: 3, stagesDone: 2, stagesSkipped: 0 });
    expect((await tr.myHistory(w.userId))[0].sets).toBe(3);
    const rows = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, w.sid));
    expect(rows.find((r) => r.setIndex === 3)).toMatchObject({ setKind: "drop", blockIndex: 2, stageIndex: 1, specId: e.detail!.setPlan![3].id });
  });
  it("una superserie o circuito con vueltas que no coinciden no se guarda; uno parejo sí", async () => {
    const w = await student();
    const c = { ...emptyDetail(), group: "A", groupKind: "circuit" as const, rounds: 3 };
    const bad = await err(own.saveOwnRoutine(w.userId, { name: "Circuito", exercises: [R("Remo rutina", 3, "10", c), R("Burpee rutina", 2, "10", { ...c, rounds: null })] }));
    expect(bad?.message).toMatch(/circuito A tiene 3 vueltas/);
    await own.saveOwnRoutine(w.userId, { name: "Circuito", exercises: [R("Remo rutina", 3, "10", c), R("Burpee rutina", 3, "10", { ...c, rounds: null })] });
  });
  it("duplicar conserva métodos e identidades de las etapas; la copia es independiente", async () => {
    const w = await student();
    const { id } = await own.saveOwnRoutine(w.userId, { name: "Original", exercises: [R("Elevación rutina", 3, "12", drop(3))] });
    const { id: copy } = await own.duplicateOwnRoutine(w.userId, id);
    const list = await own.listOwnRoutines(w.userId);
    const [a, b] = [list.find((x) => x.id === id)!, list.find((x) => x.id === copy)!];
    expect(b.name).toBe("Original (copia)");
    expect(b.exercises[0].detail?.setPlan?.map((r) => r.id)).toEqual(a.exercises[0].detail?.setPlan?.map((r) => r.id));
    expect(await err(own.duplicateOwnRoutine((await student()).userId, id))).toMatchObject({ code: "not_found" }); // sólo las propias
  });
});

describe("D184 · 2. rutina importada con método avanzado", () => {
  it("la planilla con columna Técnica y A1/A2 se interpreta; lo ambiguo queda para confirmar; se guarda editable y se entrena", async () => {
    const w = await student();
    const csv = "Día,Ejercicio,Series,Reps,Peso,Técnica\nHombros,A1. Elevación rutina,3,12,8,drop set en la última\nHombros,A2. Curl rutina,3,10,,\nHombros,Remo rutina,3,10,40,pirámide";
    const p = await own.previewRoutineImport(w.userId, { fileName: "rutina.csv", kind: "text", text: csv });
    const day = p.variants[0].days[0];
    const [el, curl, remo] = day.exercises;
    expect(el).toMatchObject({ written: "Elevación rutina", exerciseId: EX["Elevación rutina"], group: "A1", method: { technique: "drop_set", confident: true, selection: "last" } });
    expect(curl).toMatchObject({ written: "Curl rutina", group: "A2", method: null });
    expect(remo.method).toMatchObject({ technique: "pyramid", confident: false }); // se pregunta: no se transforma solo
    expect(remo.note).toContain("pirámide"); // el texto original no se pierde
    // Lo que hace el teléfono al revisar: aplica lo claro con el mismo applyMethod y la persona puede editarlo antes de guardar.
    const dd = { ...methodDetail(el.method!, { sets: el.sets!, reps: el.reps!, weightKg: null }).detail, group: "A", groupKind: "superset" as const };
    const { id } = await own.saveOwnRoutine(w.userId, { name: day.name, exercises: [
      { exerciseId: el.exerciseId!, sets: dd.setPlan!.length, reps: el.reps!, weightKg: el.weightKg, restSec: null, note: el.note, detail: dd },
      { exerciseId: curl.exerciseId!, sets: 3, reps: "10", weightKg: null, restSec: null, note: null, detail: { ...emptyDetail(), group: "A", groupKind: "superset" } },
      { exerciseId: remo.exerciseId!, sets: 3, reps: "10", weightKg: 40, restSec: null, note: remo.note, detail: null },
    ] });
    const sid = randomUUID();
    await own.startOwnRoutine(w.userId, id, sid);
    const s = await tr.getSession(w.userId, sid);
    expect(s.exercises.map((e) => [e.sets, e.detail?.group ?? null])).toEqual([[5, "A"], [3, "A"], [3, null]]);
  });
});

describe("D184 · 3. rutina de REPI con etapas", () => {
  it("el método propuesto pasa por las mismas reglas: lista corta, nunca en un básico pesado ni con el check-in bajo", () => {
    const md = aiMethodDetail("drop_set", { name: "Elevación rutina", kind: "load_reps" }, { sets: 3, reps: "12", weightKg: null }, false);
    expect(planBlocks(md!.detail, md!.detail.setPlan!.length).map((b) => b.stages)).toEqual([0, 0, 2]);
    expect(md!.label).toBe("Drop set en la última serie");
    expect(aiMethodDetail("drop_set", { name: "Sentadilla con barra", kind: "load_reps" }, { sets: 3, reps: "5", weightKg: null }, false)).toBeNull();
    expect(aiMethodDetail("rest_pause", { name: "Elevación rutina", kind: "load_reps" }, { sets: 3, reps: "12", weightKg: null }, true)).toBeNull();
    expect(aiMethodDetail("cluster" as never, { name: "Elevación rutina", kind: "load_reps" }, { sets: 3, reps: "12", weightKg: null }, false)).toBeNull();
  });
  it("la rutina de hoy con un método se empieza con el mismo detalle y se registra por etapas", async () => {
    const w = await student();
    const md = aiMethodDetail("rest_pause", { name: "Curl rutina", kind: "load_reps" }, { sets: 3, reps: "10", weightKg: null }, false)!;
    const sid = randomUUID();
    await tr.startSoloRoutine(w.userId, { id: sid, dayName: "Rutina de hoy", exercises: [{ exerciseId: EX["Curl rutina"], sets: md.detail.setPlan!.length, reps: "10", detail: md.detail }] });
    const e = (await tr.getSession(w.userId, sid)).exercises[0];
    expect(e.detail?.setPlan?.filter((r) => r.stage! > 0).map((r) => r.kind)).toEqual(["rest_pause", "rest_pause"]);
    await log(w.userId, sid, e.id, 3, 12, 4);
    expect((await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid)))[0]).toMatchObject({ setKind: "rest_pause", stageIndex: 1 });
  });
});

describe("D184 · 4–7, 12. etapas omitidas en el servidor", () => {
  it("4. omitida en el teléfono A aparece omitida en el B; no es un resultado ni suma a reps o tonelaje (12)", async () => {
    const w = await ownDropSession();
    const e = w.s.exercises[0];
    for (const [i, kg] of [[0, 8], [1, 8], [2, 8], [3, 6]] as const) await log(w.userId, w.sid, e.id, i, kg, 10);
    const r = await skip(w.userId, w.sid, e.id, 4, true, ago(5)); // A: «Terminar la serie acá»
    expect(r).toMatchObject({ skipped: true, applied: true });
    // B lee la sesión: la etapa llega omitida (estado del servidor, no del teléfono A).
    const b = fromServer(await tr.getSession(w.userId, w.sid) as never);
    expect(b.sets[setKey(e.id, 4)]).toMatchObject({ skip: true, done: false });
    expect(b.sets[setKey(e.id, 3)]).toMatchObject({ done: true });
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, w.sid))).toHaveLength(4); // sin resultado falso
    await tr.sessionAction(w.userId, w.sid, "finish");
    const sum = await tr.sessionSummary(w.userId, w.sid);
    expect(sum.metrics).toMatchObject({ mainDone: 3, stagesDone: 1, stagesSkipped: 1, reps: 40, tonnageKg: 8 * 30 + 60 });
    expect(sum.exDone).toBe(1); // completo: la etapa omitida no lo deja incompleto
  });
  it("5. una etapa hecha sin conexión llega con su hora y le gana a una omisión anterior del otro teléfono", async () => {
    const w = await ownDropSession();
    const e = w.s.exercises[0];
    await skip(w.userId, w.sid, e.id, 4, true, ago(60)); // B la omitió
    await log(w.userId, w.sid, e.id, 4, 4, 10, ago(120)); // A la había hecho offline antes; sincroniza ahora
    const s = await tr.getSession(w.userId, w.sid);
    const local = fromServer(s as never);
    expect(local.sets[setKey(e.id, 4)]).toMatchObject({ done: true, w: 4 });
    expect(local.sets[setKey(e.id, 4)].skip).toBeFalsy(); // el resultado manda
    expect(tr.skippedRows(s.exercises[0])).toEqual([]);
    expect(await skip(w.userId, w.sid, e.id, 4, true, ago(0))).toMatchObject({ applied: false, reason: "logged", skipped: false }); // nunca pisa lo registrado
  });
  it("6. corregir una omisión: deshacerla vuelve a pendiente, y también con el entrenamiento terminado", async () => {
    const w = await ownDropSession();
    const e = w.s.exercises[0];
    await skip(w.userId, w.sid, e.id, 4, true, ago(30));
    await skip(w.userId, w.sid, e.id, 4, false, ago(10));
    expect(fromServer(await tr.getSession(w.userId, w.sid) as never).sets[setKey(e.id, 4)].skip).toBe(false);
    await log(w.userId, w.sid, e.id, 0, 8, 12);
    await tr.sessionAction(w.userId, w.sid, "finish");
    await skip(w.userId, w.sid, e.id, 4, true, ago(5)); // ya terminado: se puede corregir el registro
    expect((await tr.sessionSummary(w.userId, w.sid)).metrics.stagesSkipped).toBe(1);
  });
  it("7. conflictos: gana el cambio más reciente; el reintento viejo no pisa y el idéntico no hace nada", async () => {
    const w = await ownDropSession();
    const e = w.s.exercises[0];
    const tA = ago(40), tB = ago(20);
    await skip(w.userId, w.sid, e.id, 4, true, tA); // A omite
    await skip(w.userId, w.sid, e.id, 4, false, tB); // B deshace después
    expect(await skip(w.userId, w.sid, e.id, 4, true, tA)).toMatchObject({ applied: false, reason: "older", skipped: false }); // reintento de A
    expect(await skip(w.userId, w.sid, e.id, 4, false, tB)).toMatchObject({ applied: false, reason: "same" });
    expect(await db.select().from(schema.setSkip).where(eq(schema.setSkip.sessionId, w.sid))).toHaveLength(1);
  });
  it("permisos y reglas: sólo etapas, sólo la persona dueña, con el acceso vigente", async () => {
    const w = await ownDropSession();
    const e = w.s.exercises[0];
    expect(await err(skip(w.userId, w.sid, e.id, 2, true, ago(1)))).toMatchObject({ code: "invalid" }); // una serie principal no se omite así
    expect(await err(skip((await student()).userId, w.sid, e.id, 4, true, ago(1)))).toMatchObject({ code: "not_found" });
    await db.update(schema.coachClient).set({ status: "paused" }).where(eq(schema.coachClient.id, w.relId));
    expect(await err(skip(w.userId, w.sid, e.id, 4, true, ago(1)))).toMatchObject({ code: "relation_inactive" });
  });
});

describe("D184 · 8–9. intervalo EMOM", () => {
  async function emomSession() {
    const w = await student();
    const em = applyMethod(null, { sets: 4, reps: "8", rir: null }, "emom", [0, 1, 2, 3], { emomSec: 60 }).detail;
    const sid = randomUUID();
    await tr.startSoloRoutine(w.userId, { id: sid, dayName: "EMOM", exercises: [{ exerciseId: EX["Burpee rutina"], sets: 4, reps: "8", detail: em }] });
    return { ...w, sid, peId: (await tr.getSession(w.userId, sid)).exercises[0].id };
  }
  it("8. se guarda, se recupera al recargar, la pausa lo interrumpe y terminar lo cierra", async () => {
    const w = await emomSession();
    const now = new Date();
    const r = await tr.setSessionInterval(w.userId, w.sid, { state: { peId: w.peId, block: 1, startedAt: ago(20), emomSec: 60, status: "running" }, at: ago(20), sentAt: now.toISOString() });
    expect(r.applied).toBe(true);
    const s = await tr.getSession(w.userId, w.sid);
    expect(s.interval).toMatchObject({ peId: w.peId, block: 1, status: "running", emomSec: 60 });
    const local = fromServer(s as never);
    expect(local.iv).toMatchObject({ block: 1, status: "running" });
    expect(Math.abs(Date.now() - 20_000 - local.iv!.start)).toBeLessThan(2000); // no se reinicia: sigue desde su inicio
    await tr.sessionAction(w.userId, w.sid, "pause");
    expect((await tr.getSession(w.userId, w.sid)).interval).toMatchObject({ status: "interrupted" }); // no sigue corriendo
    await tr.sessionAction(w.userId, w.sid, "resume");
    expect((await tr.getSession(w.userId, w.sid)).interval).toMatchObject({ status: "interrupted" }); // no se inventa el tiempo
    // Un inicio de hace horas es un dato viejo: no se guarda.
    expect(await tr.setSessionInterval(w.userId, w.sid, { state: { peId: w.peId, block: 1, startedAt: ago(8 * 3600), emomSec: 60, status: "running" }, at: ago(0), sentAt: new Date().toISOString() }))
      .toMatchObject({ applied: false, reason: "stale" });
    await log(w.userId, w.sid, w.peId, 0, null, 8);
    await tr.sessionAction(w.userId, w.sid, "finish");
    expect((await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, w.sid)))[0].intervalState).toBeNull();
  });
  it("9. desde otro dispositivo con el reloj corrido y un envío demorado: misma hora de inicio; gana el más reciente", async () => {
    const w = await emomSession();
    // Teléfono A atrasa 2 min: empezó hace 30 s (su reloj: hace 2 min 30 s) y lo mandó 10 s después.
    const skew = -120_000;
    const startA = new Date(Date.now() - 30_000 + skew), sentA = new Date(Date.now() - 20_000 + skew);
    // El servidor recibe «ahora» un envío que el teléfono hizo hace 20 s (en la cola): se compensa con la hora de envío.
    await tr.setSessionInterval(w.userId, w.sid, { state: { peId: w.peId, block: 0, startedAt: startA.toISOString(), emomSec: 60, status: "running" }, at: startA.toISOString(), sentAt: sentA.toISOString() }, new Date(Date.now() - 20_000));
    const st = (await tr.getSession(w.userId, w.sid)).interval!;
    expect(Math.abs(Date.parse(st.startedAt) - (Date.now() - 30_000))).toBeLessThan(2000);
    // B, con otro reloj, ve el mismo intervalo en curso al abrir la sesión.
    expect(fromServer(await tr.getSession(w.userId, w.sid) as never).iv).toMatchObject({ block: 0, status: "running" });
    // Un cambio más viejo de B (la cola atrasada) no pisa.
    expect(await tr.setSessionInterval(w.userId, w.sid, { state: null, at: ago(120), sentAt: new Date().toISOString() })).toMatchObject({ applied: false });
    expect((await tr.getSession(w.userId, w.sid)).interval).not.toBeNull();
    expect(await err(tr.setSessionInterval(w.userId, w.sid, { state: { peId: randomUUID(), block: 0, startedAt: ago(1), emomSec: 60, status: "running" }, at: ago(0), sentAt: new Date().toISOString() }))).toMatchObject({ code: "invalid" });
  });
});

describe("D184 · 11. compatibilidad histórica y relleno de 0040", () => {
  it("registros sin columnas de etapa se leen igual; el relleno es idempotente, no toca resultados y se revierte exacto", async () => {
    const w = await student();
    const cluster = { ...emptyDetail(), technique: "cluster" as const, setPlan: [0, 1, 2].map(() => ({ kind: "cluster" as const, reps: "3", weightKg: 50, pct1rm: null, rir: null, rpe: null, restSec: 20, note: null })) };
    const sid = randomUUID();
    await tr.startSoloRoutine(w.userId, { id: sid, dayName: "Viejo", exercises: [{ exerciseId: EX["Remo rutina"], sets: 4, reps: "10", detail: drop(2, "10") }, { exerciseId: EX["Curl rutina"], sets: 3, reps: "3" }] });
    const s = await tr.getSession(w.userId, sid);
    for (const i of [0, 1, 2, 3]) await log(w.userId, sid, s.exercises[0].id, i, 30 - i, 10);
    for (const i of [0, 1, 2]) await log(w.userId, sid, s.exercises[1].id, i, 12, 3);
    // Simula filas anteriores a D183: columnas nulas y un cluster viejo (ambiguo) en la versión congelada.
    await db.update(schema.setLog).set({ specId: null, setKind: null, blockIndex: null, stageIndex: null }).where(eq(schema.setLog.sessionId, sid));
    await db.update(schema.programExercise).set({ detail: cluster }).where(eq(schema.programExercise.id, s.exercises[1].id));
    const read = await tr.sessionSummary(w.userId, sid); // la app sigue leyendo bien con columnas nulas
    expect(read.metrics).toMatchObject({ mainDone: 2 + 3, stagesDone: 2 }); // el cluster viejo, como antes: 3 series separadas
    expect(planBackfill([{ id: "x", setIndex: 0, sets: 3, detail: cluster }]).ambiguous).toEqual(["x"]);

    const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const dry = await runBackfill(sql, { apply: false, batch: 2 });
      expect(dry.unchanged).toBe(true);
      expect(dry.after.missing).toBe(dry.before.missing); // la simulación no escribe
      const logged: string[] = [];
      const a = await runBackfill(sql, { apply: true, batch: 2, log: async (u) => { logged.push(...u.map((x) => x.id)); } });
      expect(a.unchanged).toBe(true); // mismas filas, reps, tonelaje y huella de (id, peso, reps, RIR, revisión)
      const rows = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid));
      expect(rows.filter((r) => r.programExerciseId === s.exercises[0].id).map((r) => `${r.setIndex}:${r.setKind}:${r.blockIndex}.${r.stageIndex}`).sort())
        .toEqual(["0:work:0.0", "1:work:1.0", "2:drop:1.1", "3:drop:1.2"]);
      expect(rows.filter((r) => r.programExerciseId === s.exercises[1].id).every((r) => r.specId == null)).toBe(true); // ambiguo: no se inventa
      expect((await runBackfill(sql, { apply: true })).filled).toBe(0 + (await runBackfill(sql, { apply: false })).filled); // idempotente
      const mine = logged.filter((id) => rows.some((r) => r.id === id));
      expect(await rollbackBackfill(sql, mine)).toBe(4);
      expect((await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid))).every((r) => r.specId == null)).toBe(true);
    } finally { await sql.end(); }
  });
});

describe("D184 · regresión: lo que viaja por la API conserva identidad, etapas, EMOM y AMRAP por tiempo", () => {
  it("el esquema HTTP no descarta los campos de D183 ni corta los planes de más de 20 filas", () => {
    const d = applyMethod(null, { sets: 10, reps: "8", rir: null }, "drop_set", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { stages: 2 }).detail; // 30 filas
    const t = applyMethod(null, { sets: 1, reps: "AMRAP", rir: null }, "amrap_time", [0], { durationSec: 600, countUnit: "rounds" }).detail;
    const e = applyMethod(null, { sets: 4, reps: "8", rir: null }, "emom", [0, 1, 2, 3], { emomSec: 45 }).detail;
    const back = DetailZ.parse(JSON.parse(JSON.stringify(d)))!;
    expect(back.setPlan).toHaveLength(30);
    expect(back.setPlan!.map((r) => [r.id, r.block, r.stage])).toEqual(d.setPlan!.map((r) => [r.id, r.block, r.stage]));
    expect(DetailZ.parse(JSON.parse(JSON.stringify(t)))!.setPlan![0]).toMatchObject({ durationSec: 600, countUnit: "rounds" });
    expect(DetailZ.parse(JSON.parse(JSON.stringify(e)))).toMatchObject({ emomSec: 45 });
  });
});

describe("D184 · detección compartida", () => {
  it("la misma función decide en la importación y en la vista previa", () => {
    expect(detectMethod("Drop set")).toMatchObject({ technique: "drop_set", confident: true });
  });
});
