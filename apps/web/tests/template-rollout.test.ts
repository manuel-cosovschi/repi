// D194 · «Actualizar programas de alumnos» desde una plantilla. Base de prueba descartable (repi_test), sin simulaciones:
// lista y versiones, comparación con personalizaciones, aplicación elegida (versión nueva con motivo), conflictos de versión,
// idempotencia, permisos, entrenamiento abierto («Aplicar ahora» sin tocar lo hecho) e historial intacto.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate, type ExerciseDetail, type ProgramDoc, type SetSpec } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as ro from "@/server/training/template-rollout";
import { resetRateLimits } from "@/server/access/util";
import { fromServer, setKey } from "@/lib/offline/store";

let n = 0;
async function verified(name: string) {
  const email = `tro${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let HACK = "", PRESS = "";
beforeAll(async () => {
  const ins = async (name: string) => (await db.insert(schema.exercise).values({ name, muscleGroup: "Piernas" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  HACK = await ins("Sentadilla hack TRO");
  PRESS = await ins("Prensa TRO");
});
beforeEach(() => resetRateLimits());

const S = (reps: string, weightKg: number | null): SetSpec => ({ kind: "work", reps, weightKg, pct1rm: null, rir: 1, rpe: null, restSec: 120, note: null });
const W = (kg: number[]): ExerciseDetail => ({ technique: "custom", setPlan: kg.map((w, i) => S(String(12 - i * 2), w)) } as ExerciseDetail);
type E = { id?: string; sets?: number; detail?: ExerciseDetail; note?: string | null };
const doc = (hack: E = {}, press: E = {}): ProgramDoc => ({ name: "Piernas", weeks: 4, note: "", days: [{ name: "Piernas", exercises: [
  { exerciseId: HACK, name: "Sentadilla hack TRO", sets: hack.sets ?? 3, reps: "8-12", rir: 1, restSec: 120, note: hack.note ?? null, ...(hack.detail ? { detail: hack.detail } : {}) },
  { exerciseId: PRESS, name: "Prensa TRO", sets: press.sets ?? 3, reps: "8-12", rir: 1, restSec: 120, note: null },
] }] });

async function world() {
  const coach = await verified("Coach TRO");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach TRO ${n}` });
  const kids = [];
  for (const name of ["Ana TRO", "Bruno TRO", "Carla TRO"]) {
    const u = await verified(name);
    const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
    const rel = await acc.acceptInvitation(u.id, inv.code, []);
    kids.push({ user: u.id, rel: rel.relationId });
  }
  const tpl = await tr.createTemplate(coach.id, org.id, doc());
  await tr.assignProgram(coach.id, org.id, tpl, { coachClientIds: kids.map((k) => k.rel), startsOn: localDate(new Date()) });
  const copyOf = async (rel: string) => (await db.select().from(schema.programAssignment).where(eq(schema.programAssignment.coachClientId, rel)).orderBy(desc(schema.programAssignment.assignedAt)).limit(1))[0].programId;
  const [ana, bruno, carla] = await Promise.all(kids.map(async (k) => ({ ...k, pid: await copyOf(k.rel) })));
  return { coach: coach.id, org: org.id, tpl, ana, bruno, carla };
}
const hackOf = async (user: string) => { const t = await tr.myTraining(user); if (t.state !== "ready") throw new Error(t.state); return t.program.days[0].exercises[0]; };
const rid = () => randomUUID().replace(/-/g, "");

describe("D194 · actualizar programas de alumnos desde la plantilla", () => {
  it("lista alumnos y versiones, compara con sus personalizaciones y aplica sólo lo elegido (versión nueva con motivo)", async () => {
    const w = await world();
    // Bruno tiene una personalización propia en la sentadilla (cargas e indicación).
    await tr.saveProgram(w.coach, w.org, w.bruno.pid, doc({ detail: W([60, 65, 70]), note: "rodilla: rango corto" }));
    // El profe edita la plantilla: cargas en la sentadilla y una serie más de prensa.
    await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([80, 90, 100]) }, { sets: 4 }));
    const pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    expect(pv.template).toMatchObject({ name: "Piernas", version: 2 });
    expect(pv.students.map((s) => [s.name, s.version, s.baseVersion, s.ownChanges, s.upToDate, s.training])).toEqual([
      ["Ana TRO", 1, 1, false, false, false], ["Bruno TRO", 1, 1, true, false, false], ["Carla TRO", 1, 1, false, false, false]]);
    const ana = pv.students.find((s) => s.name === "Ana TRO")!, bruno = pv.students.find((s) => s.name === "Bruno TRO")!;
    expect(ana.changes.map((c) => [c.kind, c.conflict])).toEqual([["modify", false], ["modify", false]]);
    const bHack = bruno.changes.find((c) => c.key.startsWith(`ex:0:${HACK}`))!;
    expect([bHack.conflict, bHack.student]).toEqual([true, expect.stringContaining("60, 65, 70 kg")]);
    // Aplica a Ana y a Bruno (Carla no): por defecto, sin los conflictos.
    const defaults = (s: typeof ana) => s.changes.filter((c) => !c.conflict).map((c) => c.key);
    const r = await ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [
      { programId: ana.programId, fingerprint: ana.fingerprint, apply: defaults(ana) }, { programId: bruno.programId, fingerprint: bruno.fingerprint, apply: defaults(bruno) }] });
    expect(r.results.map((x) => x.version)).toEqual([2, 2]);
    // Ana: las cargas del profe llegan a SU programa; Bruno conserva lo suyo y recibe la prensa; Carla no cambia.
    expect((await hackOf(w.ana.user)).detail?.setPlan?.map((x) => x.weightKg)).toEqual([80, 90, 100]);
    const b = await tr.myTraining(w.bruno.user);
    if (b.state !== "ready") throw new Error();
    expect(b.program.days[0].exercises[0].detail?.setPlan?.map((x) => x.weightKg)).toEqual([60, 65, 70]);
    expect((await tr.getProgram(w.coach, w.org, w.bruno.pid)).doc.days[0].exercises[0].note).toBe("rodilla: rango corto");
    expect(b.program.days[0].exercises[1].sets).toBe(4);
    expect((await hackOf(w.carla.user)).detail ?? null).toBeNull();
    // Aviso al alumno por el mecanismo existente: programa actualizado, con autor y motivo.
    const a = await tr.myTraining(w.ana.user);
    if (a.state !== "ready") throw new Error();
    expect(a.program.update).toMatchObject({ kind: "updated", author: "Coach TRO", reason: "Actualización desde la plantilla «Piernas» (versión 2)", hasPrevious: true });
    // Después: Ana y Bruno al día (lo de Bruno es suyo, no un cambio pendiente); Carla sigue con cambios pendientes.
    const after = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    expect(after.students.map((s) => [s.name, s.version, s.baseVersion, s.upToDate, s.ownChanges])).toEqual([
      ["Ana TRO", 2, 2, true, false], ["Bruno TRO", 2, 2, true, true], ["Carla TRO", 1, 1, false, false]]);
    // La plantilla quedó congelada: una edición posterior crea su versión 3 (la base de Ana y Bruno no cambia debajo).
    expect((await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([82.5, 92.5, 102.5]) }, { sets: 4 }))).version).toBe(3);
  });

  it("el profe puede elegir la plantilla en un conflicto (reemplaza la personalización a propósito)", async () => {
    const w = await world();
    await tr.saveProgram(w.coach, w.org, w.bruno.pid, doc({ detail: W([60, 65, 70]) }));
    await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([80, 90, 100]) }));
    const pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    const bruno = pv.students.find((s) => s.name === "Bruno TRO")!;
    await ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: bruno.programId, fingerprint: bruno.fingerprint, apply: bruno.changes.map((c) => c.key) }] });
    expect((await hackOf(w.bruno.user)).detail?.setPlan?.map((x) => x.weightKg)).toEqual([80, 90, 100]);
  });

  it("idempotencia y conflictos de versión: reintento, plantilla cambiada y programa del alumno cambiado", async () => {
    const w = await world();
    await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([80, 90, 100]) }));
    let pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    const ana = pv.students[0];
    const req = { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: ana.programId, fingerprint: ana.fingerprint, apply: ana.changes.map((c) => c.key) }] };
    const first = await ro.applyTemplateRollout(w.coach, w.org, w.tpl, req);
    const again = await ro.applyTemplateRollout(w.coach, w.org, w.tpl, req);
    expect([first.repeated, again.repeated, again.results]).toEqual([false, true, first.results]);
    expect(await db.select().from(schema.programVersion).where(eq(schema.programVersion.programId, ana.programId))).toHaveLength(2);
    // La plantilla cambia después de la vista previa → 409.
    pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    const bruno = pv.students.find((s) => s.name === "Bruno TRO")!;
    await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([85, 95, 105]) }));
    await expect(ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: bruno.programId, fingerprint: bruno.fingerprint, apply: [] }] }))
      .rejects.toMatchObject({ code: "conflict" });
    // El programa del alumno cambia después de la vista previa → 409, y no se escribe nada.
    pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    const carla = pv.students.find((s) => s.name === "Carla TRO")!;
    await tr.saveProgram(w.coach, w.org, carla.programId, doc({}, { sets: 5 }));
    await expect(ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: carla.programId, fingerprint: carla.fingerprint, apply: carla.changes.map((c) => c.key) }] }))
      .rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await hackOf(w.carla.user)).detail ?? null).toBeNull();
    // Un cambio que no está en la comparación vigente se rechaza.
    pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    const c2 = pv.students.find((s) => s.name === "Carla TRO")!;
    await expect(ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: c2.programId, fingerprint: c2.fingerprint, apply: ["ex:0:inventado#0:add"] }] }))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("permisos: otro coach, otra plantilla, un programa que no salió de ella y una relación terminada", async () => {
    const w = await world();
    const other = await world();
    await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([80, 90, 100]) }));
    await expect(ro.templateRolloutPreview(other.coach, w.org, w.tpl)).rejects.toMatchObject({ code: "not_found" }); // no revela que existe
    await expect(ro.templateRolloutPreview(other.coach, other.org, w.tpl)).rejects.toMatchObject({ code: "not_found" });
    const pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    // Programa de un alumno de otro coach (otra organización) o de otra plantilla: 404, sin escribir nada.
    await expect(ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: other.ana.pid, fingerprint: pv.students[0].fingerprint, apply: [] }] }))
      .rejects.toMatchObject({ code: "not_found" });
    // Relación terminada: deja de aparecer.
    await tr.setClientStatus(w.coach, w.org, w.carla.rel, "ended");
    expect((await ro.templateRolloutPreview(w.coach, w.org, w.tpl)).students.map((s) => s.name)).toEqual(["Ana TRO", "Bruno TRO"]);
  });

  it("alumno entrenando: aviso y «Aplicar ahora» sin tocar lo hecho; el historial no cambia", async () => {
    const w = await world();
    // Un entrenamiento terminado (historial) y otro abierto con una serie hecha.
    const t0 = await tr.myTraining(w.ana.user);
    if (t0.state !== "ready") throw new Error();
    const done = randomUUID();
    await tr.startSession(w.ana.user, { id: done, dayId: t0.program.days[0].id });
    let s = await tr.getSession(w.ana.user, done);
    await tr.logSet(w.ana.user, done, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 70, reps: 10, rir: 2 });
    await tr.sessionAction(w.ana.user, done, "finish");
    const histBefore = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, done));
    const [doneBefore] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, done));
    const sid = randomUUID();
    await tr.startSession(w.ana.user, { id: sid, dayId: (await tr.myTraining(w.ana.user) as { program: { days: { id: string }[] } }).program.days[0].id });
    s = await tr.getSession(w.ana.user, sid);
    await tr.logSet(w.ana.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 72.5, reps: 10, rir: 2 });
    await tr.saveProgram(w.coach, w.org, w.tpl, doc({ detail: W([80, 90, 100]) }));
    const pv = await ro.templateRolloutPreview(w.coach, w.org, w.tpl);
    const ana = pv.students.find((x) => x.name === "Ana TRO")!;
    expect(ana.training).toBe(true);
    await ro.applyTemplateRollout(w.coach, w.org, w.tpl, { requestId: rid(), template: pv.template.fingerprint, targets: [{ programId: ana.programId, fingerprint: ana.fingerprint, apply: ana.changes.map((c) => c.key) }] });
    expect((await tr.getSession(w.ana.user, sid)).outdated).toBe(true);
    const up = await tr.upgradeSession(w.ana.user, sid);
    const local = fromServer(up.session as never);
    const hx = up.session.exercises[0];
    expect([0, 1, 2].map((i) => [local.sets[setKey(hx.id, i)].w, local.sets[setKey(hx.id, i)].done])).toEqual([[72.5, true], [90, false], [100, false]]);
    // El entrenamiento terminado sigue con su versión y sus series.
    const [doneAfter] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, done));
    expect(doneAfter.versionId).toBe(doneBefore.versionId);
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, done))).toEqual(histBefore);
  });
});
