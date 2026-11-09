// REPI Control (D216): la pantalla de rutinas muestra los objetivos (profesor, Training Intelligence y la última vez) y registra
// lo que el socio hizo con los servicios de siempre. Pruebas de aceptación del máster, con datos sintéticos en la base de pruebas.
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as k from "@/server/gym/kiosk";
import * as kt from "@/server/gym/kiosk-training";
import { historyList } from "@/server/training/history";
import { AccessError, resetRateLimits } from "@/server/access/util";

const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
let n = 0;
async function person(name: string) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email: `klog${++n}.${Date.now()}@test.repi.local`, emailVerified: true });
  return id;
}
let EX: string, EX2: string;
beforeAll(async () => {
  const mk = async (name: string, group: string) => {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: group }).onConflictDoNothing().returning();
    return e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  };
  EX = await mk("Sentadilla kiosco", "Piernas");
  EX2 = await mk("Press kiosco", "Pecho");
});
beforeEach(() => resetRateLimits());

// Día A: sentadilla 3 × 8-10 (RIR 2) y press con un top set de 100 kg indicado por el profe y un back-off. Día B: sentadilla 4 × 6.
const DOC = (name = "Programa sala") => ({ name, weeks: 6, note: "Calentá 10 min", days: [
  { name: "Día A", exercises: [
    { exerciseId: EX, name: "Sentadilla kiosco", sets: 3, reps: "8-10", rir: 2, restSec: 120, note: "Bajá controlado" },
    { exerciseId: EX2, name: "Press kiosco", sets: 2, reps: "5", rir: 1, restSec: 180, note: null, detail: { technique: "top_backoff" as const, setPlan: [
      { kind: "top" as const, reps: "3-5", weightKg: 100, rir: 1 }, { kind: "backoff" as const, reps: "8", weightKg: null, rir: 2 },
    ], group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null } },
  ] },
  { name: "Día B", exercises: [{ exerciseId: EX, name: "Sentadilla kiosco", sets: 4, reps: "6", rir: 1, restSec: 150, note: null }] },
] });

async function world() {
  const owner = await person("Dueña Registro");
  const [org] = await db.insert(schema.organization).values({ kind: "gym", name: `Gym Registro ${n}`, status: "active", commercialStatus: "enabled", routinePolicy: "supervised", kioskEnabled: true, createdBy: owner }).returning();
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  await db.insert(schema.staffMembership).values({ userId: owner, orgId: org.id, role: "owner" });
  const t1 = await person("Profe Sala");
  await db.insert(schema.staffMembership).values({ userId: t1, orgId: org.id, locationId: A.id, role: "floor_trainer" });
  const recep = await person("Recepción");
  await db.insert(schema.staffMembership).values({ userId: recep, orgId: org.id, locationId: A.id, role: "reception" });
  const member = async (name: string) => {
    const u = await person(name);
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "test" });
    return { userId: u, memberId: m.id };
  };
  const ana = await member("Ana Pérez");
  const beto = await member("Beto Gómez");
  await gym.startShift(t1, org.id, A.id).catch(() => {});
  await gym.saveMemberProgram(t1, org.id, ana.memberId, { doc: DOC(), reason: "Programa inicial" });
  await gym.saveMemberProgram(t1, org.id, beto.memberId, { doc: DOC("Programa Beto"), reason: "Programa inicial" });
  // Programas vigentes desde hace dos semanas (para registrar entrenamientos de días anteriores desde la app).
  await db.update(schema.programAssignment).set({ startsOn: new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10) })
    .where(sql`gym_member_id in (${ana.memberId}, ${beto.memberId})`);
  const dev = await k.createKiosk(owner, org.id, A.id, "Tablet sala");
  const secret = dev.link.split("#k=")[1];
  const credA = await k.issueCredential(recep, org.id, ana.memberId);
  const credB = await k.issueCredential(recep, org.id, beto.memberId);
  return { org: org.id, A: A.id, owner, t1, recep, ana, beto, dev, secret, credA, credB };
}
type W = Awaited<ReturnType<typeof world>>;
const login = async (w: W, who: "a" | "b" = "a", now = new Date()) => (await k.kioskIdentify(w.secret, who === "a" ? w.credA : w.credB, now)).token;

/** Un entrenamiento terminado desde la app, hace `daysAgo` días, con sentadilla `kg × reps` en todas las series. */
async function appWorkout(userId: string, kg: number, reps: number, daysAgo: number) {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  const t = await tr.myTraining(userId, when);
  if (t.state !== "ready") throw new Error("sin programa");
  const day = t.program.days[0];
  const sid = randomUUID();
  await tr.startSession(userId, { id: sid, dayId: day.id }, when);
  const sq = day.exercises[0];
  for (let i = 0; i < sq.sets; i++) await tr.logSet(userId, sid, { id: randomUUID(), programExerciseId: sq.id, setIndex: i, weightKg: kg, reps, rir: 2 }, new Date(when.getTime() + (i + 1) * 60_000));
  await tr.sessionAction(userId, sid, "finish", new Date(when.getTime() + 30 * 60_000));
  return sid;
}
const sets = (vals: { kg: number | null; reps: number | null; skipped?: boolean }[], from = 0) =>
  vals.map((v, i) => ({ id: randomUUID(), setIndex: from + i, weightKg: v.kg, reps: v.reps, rir: 2, skipped: v.skipped }));

describe("objetivos en la pantalla (D216)", () => {
  it("separa lo indicado por el profesor, lo que recomienda REPI y la última vez; sin historial no inventa cargas", async () => {
    const w = await world();
    // Beto nunca entrenó: lo indicado, sin recomendación ni referencia, y el borrador sin peso.
    const vb = await k.kioskProgram(w.secret, await login(w, "b"));
    const sq = vb.program!.days[0].exercises[0];
    expect(sq.rows).toHaveLength(3);
    expect(sq.rows[0]).toMatchObject({ label: "Serie 1", coach: { reps: "8-10", rir: 2, weightKg: null }, last: null, draft: { weightKg: null, reps: 8 } });
    expect(sq.rows[0].repi?.weightKg ?? null).toBeNull();
    // El top set del press lleva la carga del profe: REPI la respeta (no la reemplaza) y el borrador la usa.
    const press = vb.program!.days[0].exercises[1];
    expect(press.method).toBe("Top set + back-off");
    expect(press.rows[0]).toMatchObject({ label: "Top set", coach: { reps: "3-5", weightKg: 100 }, draft: { weightKg: 100 } });
    expect(press.rows[1].label).toBe("Back-off");
    expect(press.rows[1].draft.weightKg).toBeNull(); // sin referencia ni carga indicada: la elige la persona
    // Ana completó su rango con 60 kg: Training Intelligence propone subir y la pantalla muestra la última vez.
    await appWorkout(w.ana.userId, 60, 10, 3);
    const va = await k.kioskProgram(w.secret, await login(w));
    const r0 = va.program!.days[0].exercises[0].rows[0];
    expect(r0.last).toMatchObject({ weightKg: 60, reps: 10 });
    expect(r0.repi?.weightKg).toBeGreaterThan(60);
    expect(r0.repi?.action).toBe("increase_load");
    expect(r0.draft.weightKg).toBe(r0.repi?.weightKg);
  });

  it("la recomendación es la del motor de siempre: la misma que la sesión emite y la app muestra", async () => {
    const w = await world();
    await appWorkout(w.ana.userId, 60, 10, 3);
    const tok = await login(w);
    const v = await k.kioskProgram(w.secret, tok);
    const preview = v.program!.days[0].exercises[0].rows.map((r) => r.repi?.weightKg ?? null);
    const st = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 });
    expect(st.workout.exercises[0].rows.map((r) => r.repi?.weightKg ?? null)).toEqual(preview);
    const app = await tr.getSession(w.ana.userId, st.workout.id);
    expect(app.exercises[0].targets.map((t) => t.weightKg)).toEqual(preview);
  });

  it("mirar la rutina no crea sesiones ni objetivos", async () => {
    const w = await world();
    const count = async () => (await db.execute<{ s: number; t: number }>(sql`select (select count(*) from workout_session where user_id = ${w.ana.userId})::int as s,
      (select count(*) from training_target where user_id = ${w.ana.userId})::int as t`))[0];
    const before = await count();
    await k.kioskProgram(w.secret, await login(w));
    expect(await count()).toEqual(before);
  });

  it("no muestra datos de salud: las explicaciones con molestias o descanso quedan neutras", () => {
    const base = { setIndex: 0, specId: "r0", kind: "work" as const, block: 0, stage: 0, status: "limited" as const, action: "hold" as const, source: "rules" as const, quality: "high" as const,
      weightKg: 60, repsMin: 8, repsMax: 10, repsTarget: 8, rirTarget: 2, rpeTarget: null, restSec: 120, restSuggestSec: null, pending: false, reasons: [], text: "60 kg × 8–10",
      prev: null, refs: [{ sessionId: "s", setLogId: "l", at: "", w: 60, r: 10, rir: 2 }], coach: null, algo: "ti2.1" };
    const pain = kt.kioskTarget({ ...base, guards: ["pain_exercise"], why: "Marcaste molestia en este ejercicio: hoy no se sube la carga.", review: "Tenés una molestia o lesión registrada" })!;
    expect(pain.weightKg).toBe(60);
    expect(pain.why).not.toMatch(/molest|lesi/i);
    expect(pain.review).toBeNull();
    expect(JSON.stringify(pain)).not.toMatch(/guards|refs|sessionId/);
    const tired = kt.kioskTarget({ ...base, guards: ["low_readiness"], why: "Hoy marcaste poca energía o mal descanso: mantené la carga.", review: null })!;
    expect(tired.why).not.toMatch(/energ|descanso/i);
  });
});

describe("registro desde la pantalla (D216)", () => {
  it("guarda de verdad en las tablas de siempre, con el origen; un reintento no duplica; corregir respeta revisiones", async () => {
    const w = await world();
    const tok = await login(w);
    const { workout } = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 });
    const sq = workout.exercises[0];
    const payload = { sessionId: workout.id, programExerciseId: sq.id, sets: sets([{ kg: 60, reps: 10 }, { kg: 60, reps: 9 }, { kg: 57.5, reps: 8 }]) };
    const r1 = await kt.kioskLogExercise(w.secret, tok, payload);
    expect(r1.results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(r1.exercise!.done).toBe(3);
    expect(r1.exercise!.rows.every((r) => r.logged?.atKiosk)).toBe(true);
    const rows = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, workout.id));
    expect(rows.map((r) => [r.setIndex, r.weightKg, r.reps, r.kioskId]).sort()).toEqual([[0, "60", 10, w.dev.id], [1, "60", 9, w.dev.id], [2, "57.5", 8, w.dev.id]]);
    // Corte de red: la pantalla reenvía lo mismo. No hay series nuevas ni revisiones nuevas.
    const r2 = await kt.kioskLogExercise(w.secret, tok, payload);
    expect(r2.results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    const again = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, workout.id));
    expect(again).toHaveLength(3);
    expect(again.every((r) => r.revision === 1)).toBe(true);
    // Corrección de la serie 3 (misma fila, revisión vista): se actualiza. Con una revisión vieja queda el conflicto y no se pisa.
    const s2 = r2.exercise!.rows[2].logged!;
    const fix = await kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: sq.id, sets: [{ id: s2.id, setIndex: 2, weightKg: 60, reps: 8, rir: 1, baseRevision: s2.revision }] });
    expect(fix.results[0]).toMatchObject({ status: "ok", revision: 2 });
    const stale = await kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: sq.id, sets: [{ id: s2.id, setIndex: 2, weightKg: 70, reps: 8, rir: 1, baseRevision: 1 }] });
    expect(stale.results[0].status).toBe("conflict");
    const [kept] = await db.select().from(schema.setLog).where(and(eq(schema.setLog.sessionId, workout.id), eq(schema.setLog.setIndex, 2), eq(schema.setLog.programExerciseId, sq.id)));
    expect(kept.weightKg).toBe("60");
    // Auditoría del origen: pantalla y credencial, sin datos de la persona.
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, workout.id), eq(schema.auditEvent.action, "kiosk.sets_logged")));
    expect(ev.length).toBeGreaterThanOrEqual(3);
    expect(ev[0].meta).toMatchObject({ kioskId: w.dev.id, programExerciseId: sq.id });
    const [started] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, workout.id));
    expect(started.kioskId).toBe(w.dev.id);
    expect(started.gymMemberId).toBe(w.ana.memberId);
  });

  it("series de un método: etapas sin hacer quedan omitidas; una serie principal sin hacer no se registra; no se aceptan filas fuera del plan", async () => {
    const w = await world();
    const tok = await login(w);
    const { workout } = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 });
    const press = workout.exercises[1];
    const r = await kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: press.id, sets: sets([{ kg: 100, reps: 4 }, { kg: null, reps: null, skipped: true }]) });
    expect(r.results.map((x) => x.status)).toEqual(["ok", "not_done"]);
    expect(r.exercise!.done).toBe(1);
    expect((await err(kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: press.id, sets: sets([{ kg: 50, reps: 5 }], 5) })))?.code).toBe("invalid");
    expect((await err(kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: press.id, sets: sets([{ kg: null, reps: null }]) })))?.code).toBe("invalid");
    const otherDay = (await tr.myTraining(w.ana.userId)).program!.days[1].exercises[0];
    expect((await err(kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: otherDay.id, sets: sets([{ kg: 50, reps: 5 }]) })))?.code).toBe("invalid");
  });

  it("app y pantalla comparten la misma sesión: se sigue donde quedó, sin sesiones paralelas, y se termina una sola vez", async () => {
    const w = await world();
    const t = await tr.myTraining(w.ana.userId);
    const sid = randomUUID();
    await tr.startSession(w.ana.userId, { id: sid, dayId: t.program!.days[0].id });
    const sq = t.program!.days[0].exercises[0];
    await tr.logSet(w.ana.userId, sid, { id: randomUUID(), programExerciseId: sq.id, setIndex: 0, weightKg: 55, reps: 10, rir: 2 });
    // En la pantalla: «Registrar mi entrenamiento» continúa la de la app, con su serie.
    const tok = await login(w);
    expect((await k.kioskProgram(w.secret, tok)).workout).toMatchObject({ id: sid, sets: 1 });
    const st = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 1 });
    expect(st).toMatchObject({ resumed: true, workout: { id: sid } });
    expect(st.workout.exercises[0].rows[0].logged).toMatchObject({ weightKg: 55, reps: 10, atKiosk: false });
    await kt.kioskLogExercise(w.secret, tok, { sessionId: sid, programExerciseId: sq.id, sets: sets([{ kg: 55, reps: 9 }, { kg: 55, reps: 8 }], 1) });
    await k.kioskEnd(w.secret, tok); // se va a hacer el press; el entrenamiento queda abierto
    // Vuelve más tarde con otra consulta: encuentra lo guardado.
    const tok2 = await login(w);
    const back = await kt.kioskWorkout(w.secret, tok2);
    expect(back.workout?.id).toBe(sid);
    expect(back.workout?.exercises[0].done).toBe(3);
    // La app ve las mismas tres series en la misma sesión.
    const app = await tr.getSession(w.ana.userId, sid);
    expect(app.exercises[0].logs.map((l) => l.reps)).toEqual([10, 9, 8]);
    const all = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.userId, w.ana.userId));
    expect(all).toHaveLength(1);
    // Terminar en la pantalla es «Finalizar» de la app.
    expect((await kt.kioskFinishWorkout(w.secret, tok2, sid)).status).toBe("completed");
    expect((await tr.getSession(w.ana.userId, sid)).status).toBe("completed");
    expect((await err(kt.kioskLogExercise(w.secret, tok2, { sessionId: sid, programExerciseId: sq.id, sets: sets([{ kg: 1, reps: 1 }]) })))?.code).toBe("workout_closed");
  });

  it("si hay otro entrenamiento abierto fuera de este gimnasio, la pantalla no lo toca", async () => {
    const w = await world();
    const w2 = await world();
    // Ana también es socia del otro gimnasio y entrena ahí desde la app.
    const [m2] = await db.insert(schema.gymMember).values({ orgId: w2.org, locationId: w2.A, userId: w.ana.userId, status: "active" }).returning();
    await gym.saveMemberProgram(w2.t1, w2.org, m2.id, { doc: DOC("Otro gym"), reason: "Inicial" });
    await tr.setActiveRelation(w.ana.userId, m2.id);
    const t = await tr.myTraining(w.ana.userId);
    const sid = randomUUID();
    await tr.startSession(w.ana.userId, { id: sid, dayId: t.program!.days[0].id });
    const tok = await login(w);
    const v = await k.kioskProgram(w.secret, tok);
    expect(v).toMatchObject({ workout: null, otherOpen: true });
    expect(JSON.stringify(v)).not.toContain("Otro gym");
    expect((await err(kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 })))?.code).toBe("other_open");
    expect((await err(kt.kioskLogExercise(w.secret, tok, { sessionId: sid, programExerciseId: t.program!.days[0].exercises[0].id, sets: sets([{ kg: 1, reps: 1 }]) })))?.status).toBe(404);
    expect((await tr.getSession(w.ana.userId, sid)).status).toBe("in_progress");
  });

  it("historial, estadísticas, progresión y el profesor ven lo registrado en la pantalla", async () => {
    const w = await world();
    const tok = await login(w);
    const { workout } = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 });
    await kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: workout.exercises[0].id, sets: sets([{ kg: 62.5, reps: 10 }, { kg: 62.5, reps: 10 }, { kg: 62.5, reps: 9 }]) });
    await kt.kioskFinishWorkout(w.secret, tok, workout.id);
    // Historial y estadísticas de la app.
    const h = await historyList(w.ana.userId);
    expect(h.sessions.map((x) => x.id)).toContain(workout.id);
    const me = await tr.myTraining(w.ana.userId);
    expect(me.stats.weekDone).toBe(1);
    expect(me.stats.volumeThisWeek).toBeGreaterThan(0);
    // El profesor de sala: la ficha muestra la sesión marcada como hecha en la pantalla, y Training Intelligence la usa.
    const md = await gym.memberDetail(w.t1, w.org, w.ana.memberId);
    const log = (md as { log: { id: string; atKiosk: boolean; exercises: { sets: { atKiosk?: boolean }[] }[] }[] }).log.find((x) => x.id === workout.id)!;
    expect(log.atKiosk).toBe(true);
    expect(log.exercises[0].sets.every((s) => s.atKiosk)).toBe(true);
    const intel = await gym.memberIntelligence(w.t1, w.org, w.ana.memberId) as { exercises: { exerciseId: string; last?: unknown }[] };
    expect(intel.exercises.some((e) => e.exerciseId === EX)).toBe(true);
    // La próxima consulta progresa desde lo registrado en la pantalla.
    const next = await k.kioskProgram(w.secret, await login(w));
    expect(next.program!.days[0].exercises[0].rows[0].last).toMatchObject({ weightKg: 62.5, reps: 10 });
  });

  it("la pantalla no cambia la planificación y un programa nuevo no altera resultados anteriores", async () => {
    const w = await world();
    const snap = async () => (await db.execute<{ v: string }>(sql`select md5(string_agg(pv.id || pv.number || pe.sets || pe.reps || coalesce(pe.rest_sec::text, '') || coalesce(pe.detail::text, ''), ',' order by pv.id, pe.id)) as v
      from program_version pv join program p on p.id = pv.program_id join program_assignment pa on pa.program_id = p.id
      join program_day pd on pd.version_id = pv.id join program_exercise pe on pe.day_id = pd.id where pa.gym_member_id = ${w.ana.memberId}`))[0].v;
    const before = await snap();
    const tok = await login(w);
    const { workout } = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 });
    await kt.kioskLogExercise(w.secret, tok, { sessionId: workout.id, programExerciseId: workout.exercises[0].id, sets: sets([{ kg: 60, reps: 10 }, { kg: 60, reps: 10 }, { kg: 60, reps: 10 }]) });
    await kt.kioskFinishWorkout(w.secret, tok, workout.id);
    expect(await snap()).toBe(before);
    const [s0] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, workout.id));
    const logs0 = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, workout.id));
    // El profe publica otra versión: la sesión terminada conserva su versión y sus resultados.
    await gym.saveMemberProgram(w.t1, w.org, w.ana.memberId, { doc: { ...DOC(), days: [{ ...DOC().days[1], name: "Día nuevo" }] }, reason: "Cambio" });
    const [s1] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, workout.id));
    expect(s1.versionId).toBe(s0.versionId);
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, workout.id))).toEqual(logs0);
  });
});

describe("seguridad del registro (D216)", () => {
  it("un socio no ve ni escribe el entrenamiento de otro; sin identidad válida no se registra nada", async () => {
    const w = await world();
    const ta = await login(w);
    const { workout } = await kt.kioskStartWorkout(w.secret, ta, { opId: randomUUID(), dayIndex: 0 });
    const pe = workout.exercises[0].id;
    await k.kioskEnd(w.secret, ta);
    const tb = await login(w, "b");
    expect((await kt.kioskWorkout(w.secret, tb)).workout).toBeNull();
    expect((await err(kt.kioskLogExercise(w.secret, tb, { sessionId: workout.id, programExerciseId: pe, sets: sets([{ kg: 1, reps: 1 }]) })))?.status).toBe(404);
    expect((await err(kt.kioskFinishWorkout(w.secret, tb, workout.id)))?.status).toBe(404);
    for (const bad of ["", "x".repeat(43), ta]) expect((await err(kt.kioskLogExercise(w.secret, bad, { sessionId: workout.id, programExerciseId: pe, sets: sets([{ kg: 1, reps: 1 }]) })))?.code).toBe("session_over");
    expect((await err(kt.kioskLogExercise("y".repeat(43), tb, { sessionId: workout.id, programExerciseId: pe, sets: sets([{ kg: 1, reps: 1 }]) })))?.status).toBe(401);
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, workout.id))).toHaveLength(0);
  });

  it("una pantalla revocada, una credencial revocada o el kiosco deshabilitado no registran", async () => {
    const w = await world();
    const tok = await login(w);
    const { workout } = await kt.kioskStartWorkout(w.secret, tok, { opId: randomUUID(), dayIndex: 0 });
    const body = () => ({ sessionId: workout.id, programExerciseId: workout.exercises[0].id, sets: sets([{ kg: 50, reps: 10 }]) });
    await db.update(schema.organization).set({ kioskEnabled: false }).where(eq(schema.organization.id, w.org));
    expect((await err(kt.kioskLogExercise(w.secret, tok, body())))?.code).toBe("kiosk_off");
    await db.update(schema.organization).set({ kioskEnabled: true }).where(eq(schema.organization.id, w.org));
    await k.revokeCredential(w.recep, w.org, w.ana.memberId);
    expect((await err(kt.kioskLogExercise(w.secret, tok, body())))?.code).toBe("session_over");
    const c = await k.issueCredential(w.recep, w.org, w.ana.memberId);
    const tok2 = (await k.kioskIdentify(w.secret, c)).token;
    await k.revokeKiosk(w.owner, w.org, w.dev.id);
    expect((await err(kt.kioskLogExercise(w.secret, tok2, body())))?.code).toBe("invalid_kiosk");
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, workout.id))).toHaveLength(0);
    // El entrenamiento sigue siendo de la persona: lo puede terminar desde la app.
    expect((await tr.getSession(w.ana.userId, workout.id)).status).toBe("in_progress");
  });

  it("la consulta se estira mientras se usa, con un tope absoluto; cerrada, no escribe", async () => {
    const w = await world();
    const t0 = new Date();
    const tok = await login(w, "a", t0);
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    for (const m of [4, 8, 12, 16]) expect((await k.kioskProgram(w.secret, tok, at(m))).person.firstName).toBe("Ana");
    expect((await err(k.kioskProgram(w.secret, tok, at(k.KIOSK_SESSION_MAX_MS / 60_000 + 0.5))))?.code).toBe("session_over");
    const tok2 = await login(w);
    expect((await err(k.kioskProgram(w.secret, tok2, new Date(Date.now() + k.KIOSK_SESSION_MS + 1000))))?.code).toBe("session_over");
  });

  it("modo normal: lo registrado en la app no lleva marca de pantalla y nada de esto cambia la app", async () => {
    const w = await world();
    const sid = await appWorkout(w.ana.userId, 50, 8, 1);
    const rows = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid));
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.kioskId === null)).toBe(true);
    const [s] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid));
    expect(s.kioskId).toBeNull();
    expect(await db.select().from(schema.setLog).where(and(eq(schema.setLog.sessionId, sid), isNotNull(schema.setLog.kioskId)))).toHaveLength(0);
  });
});
