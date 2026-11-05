// D195 · Historial corregible (bloque 05/06): corregir, anular y restaurar series y sesiones terminadas, con auditoría,
// idempotencia, conflictos entre dispositivos, permisos y recálculo de todo lo derivado (volumen, récords, niveles, Training
// Intelligence). Base de prueba descartable (repi_test), sin simulaciones de datos reales.
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMethod, localDate, type ExerciseDetail, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as h from "@/server/training/history";
import * as ti from "@/server/training/intelligence";
import * as lv from "@/server/community/levels";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name = "Persona HC") {
  const email = `hc${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let BENCH = "", ROW = "", PLANK = "";
beforeAll(async () => {
  const ins = async (name: string, kind: "load_reps" | "time" = "load_reps") => (await db.insert(schema.exercise).values({ name, muscleGroup: "Pecho", kind }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  BENCH = await ins("Press banca HC");
  ROW = await ins("Remo HC");
  PLANK = await ins("Plancha HC", "time");
});
beforeEach(() => resetRateLimits());

type Ex = { exerciseId: string; name: string; sets: number; reps: string; detail?: ExerciseDetail | null };
const doc = (exs: Ex[]): ProgramDoc => ({ name: "Torso", weeks: 4, note: "",
  days: [{ name: "Torso", exercises: exs.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: 2, restSec: 90, note: null, ...(e.detail ? { detail: e.detail } : {}) })) }] });

async function world(exs?: Ex[]) {
  const coach = await verified("Coach HC");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach HC ${n}` });
  const u = await verified("Alumno HC");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, ["training"]);
  const tpl = await tr.createTemplate(coach.id, org.id, doc(exs ?? [{ exerciseId: BENCH, name: "Press banca HC", sets: 3, reps: "8-10" }, { exerciseId: ROW, name: "Remo HC", sets: 2, reps: "10" }]));
  await tr.assignProgram(coach.id, org.id, tpl, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return { coach: coach.id, org: org.id, user: u.id, rel: rel.relationId };
}
/** Una sesión terminada con las series indicadas por ejercicio (peso × reps). */
async function trained(user: string, sets: [number, number][][], back?: Date) {
  const at = new Date();
  const t = await tr.myTraining(user);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program.days[0].id }, at);
  const s = await tr.getSession(user, sid, at);
  for (let e = 0; e < sets.length; e++) for (let i = 0; i < sets[e].length; i++) {
    const [w, r] = sets[e][i];
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[e].id, setIndex: i, weightKg: w, reps: r, rir: 2 }, at);
  }
  await tr.sessionAction(user, sid, "finish", at);
  if (back) { // la sesión se hizo antes: se corre todo hacia atrás (el programa empieza hoy y el servidor acota la hora del cliente)
    const d = sql`${at.getTime() - back.getTime()} * interval '1 millisecond'`;
    await db.update(schema.workoutSession).set({ startedAt: sql`started_at - ${d}`, endedAt: sql`ended_at - ${d}` }).where(eq(schema.workoutSession.id, sid));
    await db.update(schema.setLog).set({ completedAt: sql`completed_at - ${d}` }).where(eq(schema.setLog.sessionId, sid));
  }
  return { sid, pe: s.exercises.map((e) => e.id) };
}
const logsOf = (sid: string) => db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid)).orderBy(schema.setLog.programExerciseId, schema.setLog.setIndex);
const req = () => randomUUID();
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; status: number; data?: Record<string, unknown> }; } };
const ago = (d: number) => new Date(Date.now() - d * 86_400_000);

describe("corregir una serie", () => {
  it("80 kg × 8 → 85 kg × 8: guarda antes y después, quién y cuándo; sube la revisión; reintento sin duplicar", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[80, 8], [80, 8], [80, 8]]]);
    const [s0] = await logsOf(sid);
    const r = req();
    const out = await h.correctSet(w.user, sid, s0.id, { requestId: r, baseRevision: s0.revision, values: { weightKg: 85 }, reason: "Cargué mal el disco" });
    expect(out.set).toMatchObject({ weightKg: 85, reps: 8, revision: s0.revision + 1 });
    const again = await h.correctSet(w.user, sid, s0.id, { requestId: r, baseRevision: s0.revision, values: { weightKg: 85 } });
    expect(again.repeated).toBe(true);
    const cs = await db.select().from(schema.trainingCorrection).where(eq(schema.trainingCorrection.setLogId, s0.id));
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ action: "set_edit", before: { weightKg: 80 }, after: { weightKg: 85 }, actorUserId: w.user, reason: "Cargué mal el disco" });
    // La auditoría global no guarda valores.
    const [a] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "history.set_corrected"), eq(schema.auditEvent.resourceId, s0.id)));
    expect(JSON.stringify(a.meta)).not.toContain("85");
  });

  it("repeticiones, RIR, sensación y nota; el programa y su versión congelada no cambian", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[60, 10]]]);
    const vers = await db.select().from(schema.programVersion);
    const pes = await db.select().from(schema.programExercise);
    const [s0] = await logsOf(sid);
    await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { reps: 9, rir: 0, feel: "limite", note: "  agarre   cerrado " } });
    const [after] = await logsOf(sid);
    expect(after).toMatchObject({ reps: 9, rir: 0, feel: "limite", note: "agarre cerrado" });
    expect(await db.select().from(schema.programVersion)).toEqual(vers);
    expect(await db.select().from(schema.programExercise)).toEqual(pes);
  });

  it("usa el validador del registro: peso inválido o 0 repeticiones no guardan nada", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[60, 10]]]);
    const [s0] = await logsOf(sid);
    expect((await err(h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 60.555 } })))?.code).toBe("invalid");
    expect((await err(h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { reps: 0 } })))?.code).toBe("invalid");
    expect((await err(h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 1200 } })))?.code).toBe("invalid");
    expect((await logsOf(sid))[0]).toEqual(s0);
    expect(await db.select().from(schema.trainingCorrection).where(eq(schema.trainingCorrection.sessionId, sid))).toHaveLength(0);
  });

  it("un cambio grande pide confirmación; lb llega convertido a kg con 2 decimales", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[200, 10]]]);
    const [s0] = await logsOf(sid);
    const e = await err(h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 100 } }));
    expect(e).toMatchObject({ code: "confirm_required", data: { warnings: ["large_load_change"] } });
    const ok = await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 102.06 }, confirm: true }); // 225 lb
    expect(ok.set.weightKg).toBe(102.06);
  });

  it("conflicto entre dispositivos: revisión vieja → 409 con los valores vigentes; un registro atrasado del teléfono queda en conflicto", async () => {
    const w = await world();
    const { sid, pe } = await trained(w.user, [[[70, 8]]]);
    const [s0] = await logsOf(sid);
    await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 72.5 } });
    const e = await err(h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 75 } }));
    expect(e).toMatchObject({ code: "correction_conflict", status: 409, data: { current: { weightKg: 72.5 } } });
    // Otro teléfono, que todavía tenía la revisión 1, manda su versión: no pisa la corrección, guarda las dos.
    const late = await tr.logSet(w.user, sid, { id: s0.id, programExerciseId: pe[0], setIndex: 0, weightKg: 70, reps: 9, rir: 2, baseRevision: s0.revision });
    expect(late.status).toBe("conflict");
    expect((await logsOf(sid))[0].weightKg).toBe("72.5");
  });

  it("nadie más corrige: otra persona y el coach reciben 404; el coach ve la marca «corregida»", async () => {
    const w = await world();
    const other = await verified("Otra HC");
    const { sid } = await trained(w.user, [[[50, 10]]]);
    const [s0] = await logsOf(sid);
    expect((await err(h.correctSet(other.id, sid, s0.id, { requestId: req(), baseRevision: 1, values: { weightKg: 55 } })))?.status).toBe(404);
    expect((await err(h.correctSet(w.coach, sid, s0.id, { requestId: req(), baseRevision: 1, values: { weightKg: 55 } })))?.status).toBe(404);
    expect((await err(h.historySession(w.coach, sid)))?.status).toBe(404);
    expect((await err(h.sessionVoided(w.coach, sid, { requestId: req(), voided: true })))?.status).toBe(404);
    await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 52.5 } });
    const d = await tr.clientDetail(w.coach, w.org, w.rel);
    const set = d.sessions.find((x) => x.id === sid)!.exercises[0].sets[0];
    expect(set).toMatchObject({ weightKg: 52.5, corrected: true });
  });

  it("una sesión abierta no se corrige desde el historial", async () => {
    const w = await world();
    const t = await tr.myTraining(w.user);
    if (t.state !== "ready") throw new Error();
    const sid = randomUUID();
    await tr.startSession(w.user, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(w.user, sid);
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 50, reps: 10, rir: 2 });
    const [s0] = await logsOf(sid);
    expect((await err(h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: 1, values: { weightKg: 55 } })))?.code).toBe("open");
  });

  it("registros anteriores a 0040 (sin tipo ni etapa guardados) se corrigen igual", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[40, 12]]]);
    const [s0] = await logsOf(sid);
    await db.update(schema.setLog).set({ specId: null, setKind: null, blockIndex: null, stageIndex: null }).where(eq(schema.setLog.id, s0.id));
    const out = await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { reps: 11 } });
    expect(out.set.reps).toBe(11);
  });

  it("después de cambiar de coach (relación terminada) la persona sigue corrigiendo su propio historial", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[45, 10]]]);
    await tr.setClientStatus(w.coach, w.org, w.rel, "ended");
    const [s0] = await logsOf(sid);
    expect((await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 47.5 } })).set.weightKg).toBe(47.5);
  });
});

describe("anular y restaurar", () => {
  it("una serie anulada deja de sumar volumen y series; restaurarla la devuelve; la fila nunca se borra", async () => {
    const w = await world();
    const { sid } = await trained(w.user, [[[100, 10], [100, 10], [100, 10]]]);
    const before = (await h.historyList(w.user)).sessions.find((s) => s.id === sid)!;
    expect(before).toMatchObject({ sets: 3, volumeKg: 3000 });
    const [, s1] = await logsOf(sid);
    await h.setVoided(w.user, sid, s1.id, { requestId: req(), voided: true, reason: "La marqué de más" });
    const mid = (await h.historyList(w.user)).sessions.find((s) => s.id === sid)!;
    expect(mid).toMatchObject({ sets: 2, volumeKg: 2000, voidedSets: 1, corrected: true });
    expect(await logsOf(sid)).toHaveLength(3);
    expect((await tr.sessionSummary(w.user, sid)).volumeKg).toBe(2000);
    // No se corrige una serie anulada (primero se restaura).
    expect((await err(h.correctSet(w.user, sid, s1.id, { requestId: req(), baseRevision: s1.revision + 1, values: { reps: 9 } })))?.code).toBe("set_voided");
    await h.setVoided(w.user, sid, s1.id, { requestId: req(), voided: false });
    expect((await h.historyList(w.user)).sessions.find((s) => s.id === sid)).toMatchObject({ sets: 3, volumeKg: 3000 });
    const acts = (await db.select().from(schema.trainingCorrection).where(eq(schema.trainingCorrection.setLogId, s1.id))).map((c) => c.action).sort();
    expect(acts).toEqual(["set_restore", "set_void"]);
  });

  it("anular la sesión: sale de semana, progreso, niveles e historial activo; nada se borra; un teléfono atrasado no la revive; restaurar", async () => {
    const w = await world();
    const { sid, pe } = await trained(w.user, [[[60, 10], [60, 10]]]);
    const weekBefore = (await tr.myTraining(w.user) as { stats: { weekDone: number } }).stats.weekDone;
    const levelBefore = await lv.levelStats(w.user);
    const rows = await logsOf(sid);
    const out = await h.sessionVoided(w.user, sid, { requestId: req(), voided: true, reason: "Era de prueba" });
    expect(out.status).toBe("voided");
    const [s] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid));
    expect(s).toMatchObject({ status: "voided", voidedBy: w.user, voidReason: "Era de prueba" });
    expect(await logsOf(sid)).toEqual(rows);
    expect((await tr.myHistory(w.user)).some((x) => x.id === sid)).toBe(false);
    expect((await h.historyList(w.user)).sessions.find((x) => x.id === sid)?.status).toBe("voided");
    expect((await tr.myTraining(w.user) as { stats: { weekDone: number } }).stats.weekDone).toBe(weekBefore - 1);
    expect((await lv.levelStats(w.user)).tons).toBeLessThan(levelBefore.tons);
    const late = await err(tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: pe[1], setIndex: 0, weightKg: 30, reps: 10, rir: 2 }));
    expect(late?.code).toBe("voided");
    expect((await tr.sessionAction(w.user, sid, "finish")).status).toBe("voided");
    expect((await err(h.correctSet(w.user, sid, rows[0].id, { requestId: req(), baseRevision: rows[0].revision, values: { reps: 9 } })))?.code).toBe("voided");
    await h.sessionVoided(w.user, sid, { requestId: req(), voided: false });
    expect((await tr.myHistory(w.user)).some((x) => x.id === sid)).toBe(true);
    expect((await tr.myTraining(w.user) as { stats: { weekDone: number } }).stats.weekDone).toBe(weekBefore);
    const acts = (await db.select().from(schema.trainingCorrection).where(eq(schema.trainingCorrection.sessionId, sid))).map((c) => c.action).sort();
    expect(acts).toEqual(["session_restore", "session_void"]);
  });
});

describe("recálculo de lo derivado", () => {
  it("200 kg × 10 cargado por error: corregido a 100, deja de ser récord; la sesión siguiente compara contra lo corregido", async () => {
    const w = await world([{ exerciseId: BENCH, name: "Press banca HC", sets: 1, reps: "10" }]);
    await trained(w.user, [[[100, 10]]], ago(6));
    const b = await trained(w.user, [[[200, 10]]], ago(4));
    expect((await tr.sessionSummary(w.user, b.sid)).prs).toHaveLength(1);
    const [s0] = await logsOf(b.sid);
    await h.correctSet(w.user, b.sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 100 }, confirm: true });
    expect((await tr.sessionSummary(w.user, b.sid)).prs).toHaveLength(0);
    const c = await trained(w.user, [[[110, 10]]], ago(2));
    const pr = (await tr.sessionSummary(w.user, c.sid)).prs[0];
    expect(pr.previous.weightKg).toBe(100);
    // Niveles: el récord falso no cuenta.
    const st = await lv.levelStats(w.user);
    expect(st.prs).toBe(1);
  });

  it("Training Intelligence: la historia usa el valor corregido y excluye anuladas; los objetivos ya emitidos quedan como estaban", async () => {
    const w = await world([{ exerciseId: BENCH, name: "Press banca HC", sets: 2, reps: "8-10" }]);
    const a = await trained(w.user, [[[60, 10], [60, 10]]], ago(3));
    const targetsBefore = await db.select().from(schema.trainingTarget).where(eq(schema.trainingTarget.sessionId, a.sid));
    const [s0, s1] = await logsOf(a.sid);
    await h.correctSet(w.user, a.sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { weightKg: 50 } });
    await h.setVoided(w.user, a.sid, s1.id, { requestId: req(), voided: true });
    const hist = (await ti.historyRows(w.user, [BENCH])).get(BENCH) ?? [];
    expect(hist.map((x) => x.w)).toEqual([50]);
    expect(hist.some((x) => x.setLogId === s1.id)).toBe(false);
    expect(await db.select().from(schema.trainingTarget).where(eq(schema.trainingTarget.sessionId, a.sid))).toEqual(targetsBefore);
    // La sesión nueva toma la referencia corregida.
    const t = await tr.myTraining(w.user);
    if (t.state !== "ready") throw new Error();
    const sid = randomUUID();
    await tr.startSession(w.user, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(w.user, sid);
    expect(s.exercises[0].targets?.[0]?.prev?.w).toBe(50);
    expect(s.exercises[0].prev?.weightKg).toBe(50);
  });

  it("drop set: anular una etapa resta la etapa (no la serie); agregar una etapa omitida deshace la omisión", async () => {
    const drop = applyMethod(null, { sets: 1, reps: "10", rir: 2 }, "drop_set", [0]).detail;
    const w = await world([{ exerciseId: BENCH, name: "Press banca HC", sets: drop.setPlan!.length, reps: "10", detail: drop }]);
    const t = await tr.myTraining(w.user);
    if (t.state !== "ready") throw new Error();
    const sid = randomUUID();
    await tr.startSession(w.user, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(w.user, sid);
    const pe = s.exercises[0].id;
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 60, reps: 10, rir: 1 });
    await tr.setStageSkip(w.user, sid, { programExerciseId: pe, setIndex: 1, skipped: true });
    await tr.sessionAction(w.user, sid, "finish");
    const d0 = await h.historySession(w.user, sid);
    expect(d0.exercises[0].rows[1]).toMatchObject({ stage: 1, skipped: true, log: null });
    const added = await h.addMissingSet(w.user, sid, { requestId: req(), programExerciseId: pe, setIndex: 1, values: { weightKg: 45, reps: 8 }, reason: "Me olvidé de marcarla" });
    expect(added.set).toMatchObject({ weightKg: 45, reps: 8 });
    const d1 = await h.historySession(w.user, sid);
    expect(d1.exercises[0].rows[1]).toMatchObject({ skipped: false, log: { weightKg: 45, added: true } });
    expect(d1.metrics).toMatchObject({ sets: 1, stages: 1 });
    expect((await err(h.addMissingSet(w.user, sid, { requestId: req(), programExerciseId: pe, setIndex: 1, values: { reps: 8 } })))?.code).toBe("exists");
    expect((await err(h.addMissingSet(w.user, sid, { requestId: req(), programExerciseId: pe, setIndex: 5, values: { reps: 8 } })))?.code).toBe("invalid");
    await h.setVoided(w.user, sid, added.set!.id, { requestId: req(), voided: true });
    expect((await h.historySession(w.user, sid)).metrics).toMatchObject({ sets: 1, stages: 0 });
  });

  it("series por tiempo: los segundos se corrigen con su propio tope y no suman volumen", async () => {
    const w = await world([{ exerciseId: PLANK, name: "Plancha HC", sets: 1, reps: "60s" }]);
    const { sid } = await trained(w.user, [[[0, 60]]]);
    const [s0] = await logsOf(sid);
    const out = await h.correctSet(w.user, sid, s0.id, { requestId: req(), baseRevision: s0.revision, values: { reps: 240 }, confirm: true });
    expect(out.set.reps).toBe(240);
    expect((await h.historyList(w.user)).sessions.find((x) => x.id === sid)?.volumeKg).toBe(0);
  });

  it("sustitución: la serie agregada queda con el ejercicio que realmente se hizo", async () => {
    const w = await world([{ exerciseId: BENCH, name: "Press banca HC", sets: 2, reps: "10" }]);
    const t = await tr.myTraining(w.user);
    if (t.state !== "ready") throw new Error();
    const sid = randomUUID();
    await tr.startSession(w.user, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(w.user, sid);
    const pe = s.exercises[0].id;
    await tr.setExerciseChange(w.user, sid, { programExerciseId: pe, change: { kind: "substitute", reason: "busy", exerciseId: ROW } });
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    await tr.sessionAction(w.user, sid, "finish");
    const added = await h.addMissingSet(w.user, sid, { requestId: req(), programExerciseId: pe, setIndex: 1, values: { weightKg: 40, reps: 9 } });
    const [row] = await db.select().from(schema.setLog).where(eq(schema.setLog.id, added.set!.id));
    expect(row.exerciseId).toBe(ROW);
    const d = await h.historySession(w.user, sid);
    expect(d.exercises[0]).toMatchObject({ doneName: "Remo HC", change: { kind: "substitute", substitute: "Remo HC" } });
  });
});
