import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { soloPlan } from "@/server/training/adaptive";
import { soloRoutine } from "@/server/training/solo-routine";
import * as own from "@/server/training/own-routines";
import { resetRateLimits } from "@/server/access/util";

// Adaptive Coach fase 1 (D108): «entrenar por mi cuenta» con datos existentes y reglas; nunca IA ni rutina inventada.
let n = 0;
async function verified() {
  const email = `ad${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Adaptive", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let SQ = "";
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Sentadilla", muscleGroup: "Piernas" }).onConflictDoNothing().returning();
  SQ = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla")))[0].id;
});
beforeEach(() => resetRateLimits());
// D153/D155: las propuestas se prueban con reglas (sin llamar a OpenAI desde las pruebas).
const withoutAi = async <T,>(fn: () => Promise<T>) => {
  const k = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try { return await fn(); } finally { if (k) process.env.OPENAI_API_KEY = k; }
};

async function member(withProgram = true) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach adaptive ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  if (withProgram) {
    const ex = (sets: number) => ({ exerciseId: SQ, name: "Sentadilla", sets, reps: "6-8", rir: 2, restSec: 120 });
    const pid = await tr.createTemplate(coach.id, org.id, { name: "Base", weeks: 4, note: "", days: [{ name: "Día A", exercises: [ex(2)] }, { name: "Día B", exercises: [ex(3)] }] });
    await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  }
  return u.id;
}

describe("Adaptive Coach · entrenar por mi cuenta", () => {
  it("muestra la rutina asignada; con sesión abierta ofrece continuar; después de entrenar hoy propone descansar", async () => {
    const user = await member();
    const p1 = await soloPlan(user, "coach_absent");
    expect(p1).toMatchObject({ mode: "original", adp: "ADP-01", usesAI: false, title: "Hoy te toca Día A" });
    const sid = randomUUID();
    await tr.startSession(user, { id: sid, dayId: p1.options[0].dayId! });
    const pe = (await tr.getSession(user, sid)).exercises[0];
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2 });
    expect(await soloPlan(user, "solo")).toMatchObject({ mode: "continue", reasons: ["Hiciste 1 de 2 series. Lo hecho queda guardado: no se repite."] });
    await tr.sessionAction(user, sid, "finish");
    const p3 = await soloPlan(user, "solo");
    expect(p3).toMatchObject({ mode: "extra_day", adp: "ADP-03" });
    expect(p3.options.find((o) => o.action === "start")).toMatchObject({ label: "Hacer igual Día B", caution: true });
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, user), eq(schema.auditEvent.action, "adaptive.solo_plan")));
    expect(ev).toHaveLength(3);
    expect(ev.every((e) => (e.meta as { usesAI: boolean }).usesAI === false)).toBe(true);
  });
  it("sin programa el plan con reglas no inventa un día del programa", async () => {
    const user = await member(false);
    const p = await soloPlan(user, "solo");
    expect(p.mode).toBe("no_program");
    expect(p.options.some((o) => o.action === "start")).toBe(false);
  });

  it("D153: sin rutina asignada, REPI arma la rutina de hoy con la biblioteca y se puede entrenar; no pasa a ser el programa", async () => {
    const user = await member(false);
    const r = await withoutAi(() => soloRoutine(user)); // con reglas, sin OpenAI
    expect(r.kind).toBe("routine");
    expect(r.exercises.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r.exercises.map((e) => e.group)).size).toBe(r.exercises.length); // un ejercicio por grupo
    const sid = randomUUID();
    await tr.startSoloRoutine(user, { id: sid, dayName: r.dayName, exercises: r.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, weightKg: 40, note: e.note })) });
    expect((await tr.startSoloRoutine(user, { id: sid, dayName: r.dayName, exercises: [{ exerciseId: r.exercises[0].exerciseId, sets: 1, reps: "8" }] })).id).toBe(sid); // reintento idempotente
    const s = await tr.getSession(user, sid);
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(r.exercises.map((e) => e.exerciseId));
    expect(s.exercises[0].note).toMatch(/^Sugerido: 40 kg/);
    expect(s.outdated).toBe(false);
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    // Sigue sin programa asignado (no reemplaza lo que arme el coach) y el entrenamiento abierto se ofrece para continuar.
    const t = await tr.myTraining(user);
    expect(t.state).toBe("no_program");
    expect(t.openSession).toBe(sid);
    expect((await soloPlan(user, "solo")).mode).toBe("continue");
    await expect(tr.startSoloRoutine(user, { id: randomUUID(), dayName: "Otra", exercises: [{ exerciseId: r.exercises[0].exerciseId, sets: 1, reps: "8" }] })).rejects.toMatchObject({ code: "open_session" });
    expect((await tr.sessionAction(user, sid, "finish")).status).toBe("completed");
    expect((await tr.myHistory(user))[0]).toMatchObject({ id: sid, dayName: "Rutina de hoy", volumeKg: 400 });
    // Validaciones: ejercicio fuera de la biblioteca o series fuera de rango.
    await expect(tr.startSoloRoutine(user, { id: randomUUID(), dayName: "X", exercises: [{ exerciseId: randomUUID(), sets: 3, reps: "8" }] })).rejects.toMatchObject({ code: "invalid" });
    await expect(tr.startSoloRoutine(user, { id: randomUUID(), dayName: "X", exercises: [{ exerciseId: r.exercises[0].exerciseId, sets: 50, reps: "8" }] })).rejects.toMatchObject({ code: "invalid" });
  });

  it("D153: con rutina asignada se usa la del programa, y sin coach ni gym no hay rutina", async () => {
    const withProgram = await member();
    await expect(soloRoutine(withProgram)).rejects.toMatchObject({ code: "has_program" });
    const alone = await verified();
    await expect(soloRoutine(alone.id)).rejects.toMatchObject({ code: "no_relation" });
    await expect(tr.startSoloRoutine(alone.id, { id: randomUUID(), dayName: "X", exercises: [{ exerciseId: SQ, sets: 3, reps: "8" }] })).rejects.toMatchObject({ code: "no_relation" });
  });

  it("D155: el profe carga datos y REPI propone un programa completo y válido con la biblioteca; sin coach no se puede", async () => {
    const coach = await verified();
    const org = await acc.createCoachOrganization(coach.id, { brand: `Coach D155 ${n}` });
    const d = await withoutAi(() => tr.coachProgramDraft(coach.id, org.id, { goal: "muscle", daysPerWeek: 4, minutes: 45, level: "intermediate", limitations: "molestia en el hombro" }));
    expect(d.byRules).toBe(true);
    expect(d.doc.days.map((x) => x.name)).toEqual(["Torso A", "Piernas A", "Torso B", "Piernas B"]);
    expect(d.doc.days.every((x) => x.exercises.length >= 3)).toBe(true);
    expect(d.caution).toMatch(/limitaciones/);
    expect(d.doc.name).not.toMatch(/hombro|molest/i); // lo de salud nunca queda en el nombre del programa
    const pid = await tr.createTemplate(coach.id, org.id, d.doc); // se guarda como cualquier programa
    expect(pid).toBeTruthy();
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, coach.id), eq(schema.auditEvent.action, "program.ai_draft")));
    expect(JSON.stringify(ev[0].meta)).not.toContain("hombro"); // lo escrito sobre lesiones no se guarda
    const other = await verified();
    await expect(tr.coachProgramDraft(other.id, org.id, { daysPerWeek: 3, level: "beginner" })).rejects.toBeTruthy();
  });

  it("D161: un cambio puntual sobre la propuesta (ya editada a mano) cambia sólo eso; sin REPI no se rearma de cero", async () => {
    const coach = await verified();
    const org = await acc.createCoachOrganization(coach.id, { brand: `Coach D161 ${n}` });
    const brief = { goal: "muscle" as const, daysPerWeek: 2, minutes: 45, level: "beginner" as const };
    const d = await withoutAi(() => tr.coachProgramDraft(coach.id, org.id, brief));
    // El profe la editó a mano: dio vuelta los dos primeros ejercicios del día 1 y cambió las series.
    const day0 = d.doc.days[0].exercises;
    const current = { ...d.doc, days: [{ ...d.doc.days[0], exercises: [{ ...day0[1], sets: 5 }, day0[0], ...day0.slice(2)] }, ...d.doc.days.slice(1)] };
    await expect(withoutAi(() => tr.coachProgramDraft(coach.id, org.id, { ...brief, change: "cambiá el primero", current })))
      .rejects.toMatchObject({ code: "ai_unavailable" });
    await expect(withoutAi(() => tr.coachProgramDraft(coach.id, org.id, { ...brief, change: "cambiá el primero",
      current: { ...current, days: [{ ...current.days[0], exercises: [{ ...current.days[0].exercises[0], exerciseId: randomUUID() }] }] } })))
      .rejects.toMatchObject({ code: "ai_unavailable" }); // sin REPI corta antes de mirar los ejercicios
    // Con REPI (respuesta simulada): recibe la propuesta editada y el pedido; reemplaza sólo el primer ejercicio.
    const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test";
    let sent: { pedidoDeCambio: string; programaActual: { days: { exercises: { code: string; sets: number }[] }[] }; biblioteca: { code: string }[] } | null = null;
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const req = JSON.parse(init.body);
      sent = JSON.parse(req.messages[1].content[0].text);
      const cur = sent!.programaActual;
      const used = new Set(cur.days.flatMap((x) => x.exercises.map((e) => e.code)));
      const swap = sent!.biblioteca.find((b) => !used.has(b.code))!.code;
      const out = { headline: d.headline, summary: "Cambié el primer ejercicio.", caution: null, name: d.doc.name, weeks: d.doc.weeks, note: d.doc.note,
        days: cur.days.map((x, i) => ({ name: d.doc.days[i].name, exercises: x.exercises.map((e, j) => ({ code: i === 0 && j === 0 ? swap : e.code, sets: e.sets, reps: "8-12", rir: 2, restSec: 90, note: "" })) })) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200 });
    });
    try {
      const r = await tr.coachProgramDraft(coach.id, org.id, { ...brief, change: "cambiá el primero", current });
      expect(sent!.pedidoDeCambio).toBe("cambiá el primero");
      expect(sent!.programaActual.days[0].exercises[0].sets).toBe(5); // viajó lo editado a mano
      expect(r.byRules).toBe(false);
      expect(r.doc.days[0].exercises[0].exerciseId).not.toBe(current.days[0].exercises[0].exerciseId);
      expect(r.doc.days[0].exercises.slice(1).map((e) => e.exerciseId)).toEqual(current.days[0].exercises.slice(1).map((e) => e.exerciseId));
      expect(r.doc.days[1].exercises.map((e) => e.exerciseId)).toEqual(current.days[1].exercises.map((e) => e.exerciseId));
      // Un ejercicio que no es de la biblioteca de esta organización no viaja.
      await expect(tr.coachProgramDraft(coach.id, org.id, { ...brief, change: "cambiá el primero",
        current: { ...current, days: [{ ...current.days[0], exercises: [{ ...current.days[0].exercises[0], exerciseId: randomUUID() }] }] } }))
        .rejects.toMatchObject({ code: "invalid" });
    } finally {
      vi.unstubAllGlobals();
      if (key) process.env.OPENAI_API_KEY = key; else delete process.env.OPENAI_API_KEY;
    }
  });
});

describe("Mis rutinas (D158)", () => {
  it("el alumno sin programa arma, guarda y entrena su propia rutina; registra series, esfuerzo y nota", async () => {
    const user = await member(false);
    const lib = await own.myExerciseLibrary(user);
    expect(lib.length).toBeGreaterThan(50);
    const curl = lib.find((e) => e.group === "Brazos" && e.kind === "load_reps")!;
    const { id } = await own.saveOwnRoutine(user, { name: "  Día A · piernas  ", exercises: [
      { exerciseId: SQ, sets: 3, reps: "8-10", weightKg: 60, restSec: 120, note: "pausa abajo" },
      { exerciseId: curl.id, sets: 2, reps: "12", weightKg: null, restSec: null, note: null },
    ] });
    const [r] = await own.listOwnRoutines(user);
    expect(r).toMatchObject({ id, name: "Día A · piernas", lastUsedAt: null });
    expect(r.exercises.map((e) => e.name)).toEqual(["Sentadilla", curl.name]);
    // Entrenar: la sesión usa su rutina; el peso propio queda como plan de la serie (nunca hizo el ejercicio).
    const sid = randomUUID();
    await own.startOwnRoutine(user, id, sid);
    const g = await tr.getSession(user, sid);
    expect(g.exercises.map((e) => e.name)).toEqual(["Sentadilla", curl.name]);
    expect(g.exercises[0].detail?.setPlan?.map((x) => x.weightKg)).toEqual([60, 60, 60]);
    expect(g.exercises[0].note).toBe("pausa abajo");
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: g.exercises[0].id, setIndex: 0, weightKg: 62.5, reps: 9, rir: 2, note: "bien" });
    await tr.sessionAction(user, sid, "finish");
    expect((await own.listOwnRoutines(user))[0].lastUsedAt).not.toBeNull();
    expect((await own.listOwnRoutines(user))[0].exercises[0].prev).toEqual({ weightKg: 62.5, reps: 9 });
    // La segunda vez manda su última marca (y la sugerencia de REPI), no el peso fijo de la rutina.
    const sid2 = randomUUID();
    await own.startOwnRoutine(user, id, sid2);
    expect((await tr.getSession(user, sid2)).exercises[0].detail).toBeNull();
    await tr.sessionAction(user, sid2, "finish");
    // Editar, validar y borrar: sólo las propias.
    await own.saveOwnRoutine(user, { id, name: "Día A", exercises: [{ exerciseId: SQ, sets: 4, reps: "6", weightKg: 70, restSec: 150, note: null }] });
    expect((await own.listOwnRoutines(user))[0]).toMatchObject({ name: "Día A", exercises: [{ sets: 4, reps: "6", weightKg: 70 }] });
    await expect(own.saveOwnRoutine(user, { name: "X", exercises: [{ exerciseId: SQ, sets: 3, reps: "8", weightKg: null, restSec: null, note: null }] })).rejects.toMatchObject({ code: "invalid" });
    await expect(own.saveOwnRoutine(user, { name: "Sin nada", exercises: [] })).rejects.toMatchObject({ code: "invalid" });
    await expect(own.saveOwnRoutine(user, { name: "Ajena", exercises: [{ exerciseId: randomUUID(), sets: 3, reps: "8", weightKg: null, restSec: null, note: null }] })).rejects.toMatchObject({ code: "invalid" });
    const other = await member(false);
    await expect(own.startOwnRoutine(other, id, randomUUID())).rejects.toMatchObject({ code: "not_found" });
    await expect(own.deleteOwnRoutine(other, id)).rejects.toMatchObject({ code: "not_found" });
    await own.deleteOwnRoutine(user, id);
    expect(await own.listOwnRoutines(user)).toEqual([]);
  });
});

describe("entrenamientos olvidados (D160)", () => {
  it("se cierran solos tras 6 horas sin actividad, en la última actividad; sin series se descartan", async () => {
    const user = await member(false);
    const { id } = await own.saveOwnRoutine(user, { name: "Olvidada", exercises: [{ exerciseId: SQ, sets: 3, reps: "8", weightKg: null, restSec: null, note: null }] });
    const t0 = new Date(Date.now() - 60_000);
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    const sid = randomUUID();
    await own.startOwnRoutine(user, id, sid, t0);
    const g = await tr.getSession(user, sid);
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: g.exercises[0].id, setIndex: 0, weightKg: 80, reps: 8, rir: 2 }, at(10));
    await tr.closeIdleWorkouts(at(3 * 60)); // 3 horas: sigue abierto
    expect((await tr.getSession(user, sid)).status).toBe("in_progress");
    await tr.closeIdleWorkouts(at(10 + 6 * 60 + 1));
    const done = await tr.getSession(user, sid);
    expect(done.status).toBe("completed");
    expect(new Date(done.endedAt!).getTime()).toBe(at(10).getTime()); // termina en la última serie, sin sumar horas
    expect(done.activeMs).toBeLessThanOrEqual(10 * 60_000 + 1000);
    // Sin series: se descarta.
    const sid2 = randomUUID();
    await own.startOwnRoutine(user, id, sid2, at(7 * 60));
    await tr.closeIdleWorkouts(at(14 * 60));
    expect((await tr.getSession(user, sid2)).status).toBe("abandoned");
  });
});

describe("subir la rutina propia (D162)", () => {
  it("una planilla se lee sin IA, se empareja con la biblioteca y «Te toca hoy» sigue el orden de los días", async () => {
    const user = await member(false);
    const csv = "Día,Ejercicio,Series,Reps,Peso\nDía A,Sentadilla,4,8-10,60\nDía A,Ejercicio inventado xyz,3,12,\nDía B,Press de banca,3,10,40\n";
    const p = await withoutAi(() => own.previewRoutineImport(user, { fileName: "rutina.csv", kind: "text", text: csv }));
    expect(p.source).toBe("csv");
    expect(p.days.map((d) => d.name)).toEqual(["Día A", "Día B"]);
    expect(p.days[0].exercises[0]).toMatchObject({ written: "Sentadilla", exerciseId: SQ, sets: 4, reps: "8-10", weightKg: 60 });
    expect(p.days[0].exercises[1]).toMatchObject({ written: "Ejercicio inventado xyz", exerciseId: null }); // se elige a mano o se quita
    expect(p.days[1].exercises[0].exerciseId).toBeTruthy();
    // Una foto sin REPI disponible no se puede leer (la planilla sí).
    await expect(withoutAi(() => own.previewRoutineImport(user, { fileName: "foto.jpg", kind: "image", dataUrl: "data:image/jpeg;base64,AAAA" }))).rejects.toMatchObject({ code: "ai_unavailable" });
    // Guardadas en orden, como días de un programa: toca la A; después de entrenarla, la B; después, otra vez la A.
    for (const d of p.days) await own.saveOwnRoutine(user, { name: d.name, exercises: d.exercises.filter((e) => e.exerciseId).map((e) => ({ exerciseId: e.exerciseId!, sets: e.sets, reps: e.reps, weightKg: e.weightKg, restSec: e.restSec, note: e.note })) });
    const next = async () => (await own.listOwnRoutines(user)).find((r) => r.next)?.name;
    expect(await next()).toBe("Día A");
    const [a, b] = await own.listOwnRoutines(user);
    const s1 = randomUUID();
    await own.startOwnRoutine(user, a.id, s1, new Date(Date.now() - 2 * 86_400_000));
    await tr.sessionAction(user, s1, "finish");
    expect(await next()).toBe("Día B");
    const s2 = randomUUID();
    await own.startOwnRoutine(user, b.id, s2, new Date(Date.now() - 86_400_000));
    await tr.sessionAction(user, s2, "finish");
    expect(await next()).toBe("Día A");
  });
});

describe("ejercicios propios del alumno (D163)", () => {
  it("crea lo que no está en la biblioteca, lo usa y entrena; sólo lo ve él (ni otros alumnos ni el coach)", async () => {
    const user = await member(false);
    const e = await own.createMyExercise(user, { name: "  Camilla de isquios  ", group: "Piernas", kind: "load_reps" });
    expect(e).toMatchObject({ name: "Camilla de isquios", group: "Piernas", mine: true, existed: false });
    expect((await own.createMyExercise(user, { name: "camilla de ISQUIOS", group: "Piernas", kind: "load_reps" })).id).toBe(e.id); // sin duplicar
    // Con el nombre de uno de la biblioteca devuelve ese, no crea otro.
    const sq = await own.createMyExercise(user, { name: "Sentadilla", group: "Piernas", kind: "load_reps" });
    expect([sq.id, sq.mine]).toEqual([SQ, false]);
    expect((await own.myExerciseLibrary(user)).find((x) => x.id === e.id)).toMatchObject({ mine: true });
    await expect(own.createMyExercise(user, { name: "X", group: "Piernas", kind: "load_reps" })).rejects.toMatchObject({ code: "invalid" });
    await expect(own.createMyExercise(user, { name: "Algo", group: "Inventado", kind: "load_reps" })).rejects.toMatchObject({ code: "invalid" });
    // Lo usa en su rutina y lo entrena.
    const { id } = await own.saveOwnRoutine(user, { name: "Piernas", exercises: [{ exerciseId: e.id, sets: 3, reps: "12", weightKg: 40, restSec: 60, note: null }] });
    const sid = randomUUID();
    await own.startOwnRoutine(user, id, sid);
    const g = await tr.getSession(user, sid);
    expect(g.exercises[0].name).toBe("Camilla de isquios");
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: g.exercises[0].id, setIndex: 0, weightKg: 42.5, reps: 12, rir: 2 });
    await tr.sessionAction(user, sid, "finish");
    expect((await own.listOwnRoutines(user))[0].exercises[0].prev).toEqual({ weightKg: 42.5, reps: 12 });
    // Otro alumno no lo ve ni lo puede usar; tampoco aparece en el catálogo ni en la biblioteca de un coach.
    const other = await member(false);
    expect((await own.myExerciseLibrary(other)).some((x) => x.id === e.id)).toBe(false);
    await expect(own.saveOwnRoutine(other, { name: "Ajena", exercises: [{ exerciseId: e.id, sets: 3, reps: "8", weightKg: null, restSec: null, note: null }] })).rejects.toMatchObject({ code: "invalid" });
    const coach = await verified();
    const org = await acc.createCoachOrganization(coach.id, { brand: `Coach D163 ${n}` });
    expect((await tr.listLibrary(coach.id, org.id)).some((x) => x.id === e.id)).toBe(false);
  });
});
