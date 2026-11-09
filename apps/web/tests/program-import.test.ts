// SI2 · Smart Program Import 2.0: integración con la base descartable (repi_test). Datos sintéticos; verifican los valores
// guardados, no sólo que la operación responda. La IA se simula (nunca se llama a OpenAI desde las pruebas).
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate, type ImportOriginExercise, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as gym from "@/server/gym/services";
import * as own from "@/server/training/own-routines";
import { checkUpload, programImportPreview, IMPORT_SYSTEM } from "@/server/training/program-import";
import { myExerciseProgress } from "@/server/progress/exercises";
import { resetRateLimits } from "@/server/access/util";
import { spreadsheetToCsv } from "@/lib/spreadsheet";
import { readFileSync } from "node:fs";

let n = 0;
async function verified(name = "Persona SI2") {
  const email = `si${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
async function coachWithClient() {
  const coach = await verified("Coach SI2");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach SI2 ${n}` });
  const u = await verified("Alumno SI2");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  await acc.acceptInvitation(u.id, inv.code, []);
  return { coach: coach.id, org: org.id, user: u.id };
}
const withoutAi = async <T,>(fn: () => Promise<T>) => {
  const k = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try { return await fn(); } finally { if (k) process.env.OPENAI_API_KEY = k; }
};
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; message: string; status: number }; } };
const noGate = async () => {};
const origin = (written: string, over: Partial<ImportOriginExercise> = {}): ImportOriginExercise => ({ written, exerciseId: "", sets: null, reps: null, weightKg: null, perSet: null, restSec: null, rir: null, rpe: null, tempo: null, technique: null, unknown: [], completed: [], suggested: [], ...over });
const routinesOf = (u: string) => db.select().from(schema.ownRoutine).where(eq(schema.ownRoutine.userId, u));

let BENCH = "", SQUAT = "", ROW = "";
beforeAll(async () => {
  const lib = await own.myExerciseLibrary((await coachWithClient()).user); // asegura el catálogo
  BENCH = lib.find((x) => x.name === "Press de banca")!.id; SQUAT = lib.find((x) => x.name === "Sentadilla")!.id; ROW = lib.find((x) => x.name === "Remo con barra")!.id;
});
beforeEach(() => resetRateLimits());
afterEach(() => vi.unstubAllGlobals());

describe("SI2 · alumno: de la vista previa a «Mis rutinas»", () => {
  it("casos 1, 9, 10 y 25-26 · tres días con cargas por serie y un ejercicio sin series: se completa, se guarda junto, se entrena y alimenta el progreso", async () => {
    const { user } = await coachWithClient();
    const text = "Día 1 - Pecho\nPress banca 3x12/10/8 40/45/50 kg\nRemo c/barra\n\nDía 2\nSentadilla 4x8 80kg desc 2 min\n\nDía 3\nRemo con barra 3x10 50kg RIR 2";
    const p = await withoutAi(() => own.previewRoutineImport(user, { fileName: "Texto pegado", kind: "text", text }));
    const [d1, d2, d3] = p.variants[0].days;
    expect([p.source, p.file, p.limits.free]).toEqual(["text", "text", 30]);
    expect(d1.exercises[0]).toMatchObject({ exerciseId: BENCH, sets: 3, perSet: [{ reps: "12", weightKg: 40 }, { reps: "10", weightKg: 45 }, { reps: "8", weightKg: 50 }] });
    // Caso 10: sin series ni repeticiones no se inventan: vacías y marcadas.
    expect(d1.exercises[1]).toMatchObject({ written: "Remo c/barra", exerciseId: ROW, sets: null, reps: null });
    expect(d1.exercises[1].issues.map((i) => i.kind)).toEqual(["missing", "missing"]);
    expect(d2.exercises[0]).toMatchObject({ exerciseId: SQUAT, restSec: 120 });
    expect(d3.exercises[0]).toMatchObject({ rir: 2 });
    expect(await routinesOf(user)).toHaveLength(0); // la vista previa no guarda nada

    // Lo que manda el teléfono después de revisar (la persona completó el remo: 3 × 12).
    const plan = [{ kind: "work", reps: "12", weightKg: 40 }, { kind: "work", reps: "10", weightKg: 45 }, { kind: "work", reps: "8", weightKg: 50 }].map((x) => ({ ...x, pct1rm: null, rir: null, rpe: null, restSec: null, note: null }));
    const opId = randomUUID();
    const payload = { opId, source: "text" as const, file: "text" as const, routines: [
      { name: d1.name, exercises: [
        { exerciseId: BENCH, sets: 3, reps: "12-10-8", weightKg: null, restSec: null, note: null, detail: { technique: "custom" as const, setPlan: plan as never, group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null } },
        { exerciseId: ROW, sets: 3, reps: "12", weightKg: null, restSec: null, note: null, detail: null }],
        origin: [origin("Press banca", { sets: 3, reps: "12-10-8", perSet: d1.exercises[0].perSet }), origin("Remo c/barra", { unknown: ["sets", "reps"], completed: ["sets", "reps"] })] },
      { name: d2.name, exercises: [{ exerciseId: SQUAT, sets: 4, reps: "8", weightKg: 80, restSec: 120, note: null, detail: null }], origin: [origin("Sentadilla", { sets: 4, reps: "8", weightKg: 80, restSec: 120 })] },
      { name: d3.name, exercises: [{ exerciseId: ROW, sets: 3, reps: "10", weightKg: 50, restSec: null, note: null, detail: null }], origin: [origin("Remo con barra", { sets: 3, reps: "10", weightKg: 50, rir: 2 })] },
    ] };
    const r = await own.saveImportedRoutines(user, payload);
    expect([r.ids.length, r.replay]).toEqual([3, false]);
    const list = await own.listOwnRoutines(user);
    expect(list.map((x) => [x.name, x.imported])).toEqual([["Día 1 - Pecho", true], ["Día 2", true], ["Día 3", true]]); // en el orden del documento
    // Procedencia para Adaptive Coaching 3.0: lo que decía el documento, lo desconocido y cómo se completó.
    const rows = await routinesOf(user);
    const o = rows.find((x) => x.name === "Día 1 - Pecho")!.origin!;
    expect(o).toMatchObject({ kind: "import", opId, day: 0, source: "text", file: "text" });
    expect(o.exercises[1]).toMatchObject({ written: "Remo c/barra", exerciseId: ROW, unknown: ["sets", "reps"], completed: ["sets", "reps"] });

    // Caso 25: se entrena como cualquier rutina propia; los objetivos por serie llegan a la sesión.
    const sid = randomUUID();
    await own.startOwnRoutine(user, list[0].id, sid, new Date(Date.now() - 3_600_000));
    const s = await tr.getSession(user, sid);
    expect(s.exercises[0].detail?.setPlan?.map((x) => [x.reps, x.weightKg])).toEqual([["12", 40], ["10", 45], ["8", 50]]);
    for (const [i, [w, reps]] of [[40, 12], [45, 10], [50, 7]].entries()) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: i, weightKg: w, reps, rir: 1 });
    await tr.sessionAction(user, sid, "finish");
    // Caso 26: lo registrado alimenta el progreso del ejercicio (la rutina importada no reemplaza ningún dato).
    const prog = await myExerciseProgress(user, BENCH, "all");
    expect(JSON.stringify(prog)).toContain("50");
    expect((await tr.lastSetByExercise(user, [BENCH])).get(BENCH)).toMatchObject({ weightKg: 50, reps: 7 });
    // Lo editado después no toca la procedencia (versión vigente ≠ lo que decía el documento).
    await own.saveOwnRoutine(user, { id: list[1].id, name: "Día 2", exercises: [{ exerciseId: SQUAT, sets: 5, reps: "5", weightKg: 90, restSec: 150, note: null }] });
    const after = (await routinesOf(user)).find((x) => x.id === list[1].id)!;
    expect([after.exercises[0].sets, after.origin!.exercises[0].sets]).toEqual([5, 4]);
  });

  it("casos 19-20 · reintento o doble toque con el mismo opId: no duplica; dos guardados a la vez dejan una sola copia", async () => {
    const { user } = await coachWithClient();
    const body = { opId: randomUUID(), source: "sheet" as const, file: "sheet" as const, routines: [
      { name: "Día A", exercises: [{ exerciseId: SQUAT, sets: 3, reps: "10", weightKg: null, restSec: null, note: null, detail: null }], origin: [origin("Sentadilla")] },
      { name: "Día B", exercises: [{ exerciseId: BENCH, sets: 3, reps: "10", weightKg: null, restSec: null, note: null, detail: null }], origin: [origin("Press banca")] },
    ] };
    const [a, b] = await Promise.all([own.saveImportedRoutines(user, body), own.saveImportedRoutines(user, body)]);
    expect(a.ids).toEqual(b.ids);
    expect([a.replay, b.replay].sort()).toEqual([false, true]);
    // Corte de red: el teléfono no recibió la respuesta y vuelve a mandar lo mismo.
    expect(await own.saveImportedRoutines(user, body)).toEqual({ ids: a.ids, replay: true });
    expect(await routinesOf(user)).toHaveLength(2);
    const audits = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, user), eq(schema.auditEvent.action, "own_routine.imported")));
    expect(audits).toHaveLength(1);
  });

  it("caso 20 · todo o nada: un día inválido o la falta de lugar no dejan días sueltos", async () => {
    const { user } = await coachWithClient();
    const ok = { exerciseId: SQUAT, sets: 3, reps: "10", weightKg: null, restSec: null, note: null, detail: null };
    const bad = await err(own.saveImportedRoutines(user, { opId: randomUUID(), source: "text", file: "text", routines: [
      { name: "Día A", exercises: [ok], origin: [] }, { name: "Día B", exercises: [{ ...ok, reps: "" }], origin: [] },
    ] }));
    expect(bad).toMatchObject({ code: "invalid" });
    expect(bad!.message).toMatch(/^Día B:/);
    expect(await routinesOf(user)).toHaveLength(0);
    // Caso 21: más de 12 ejercicios en un día se rechaza entero (el lector ya lo había partido en la vista previa).
    const many = await err(own.saveImportedRoutines(user, { opId: randomUUID(), source: "text", file: "text", routines: [{ name: "Largo", exercises: Array.from({ length: 13 }, () => ok), origin: [] }] }));
    expect(many).toMatchObject({ code: "invalid" });
    // Sin lugar en «Mis rutinas»: dice cuántas entran y no guarda nada.
    for (let i = 0; i < 29; i++) await own.saveOwnRoutine(user, { name: `R${i}`, exercises: [ok] });
    const full = await err(own.saveImportedRoutines(user, { opId: randomUUID(), source: "text", file: "text", routines: [1, 2, 3].map((i) => ({ name: `Día ${i}`, exercises: [ok], origin: [] })) }));
    expect(full).toMatchObject({ code: "capacity" });
    expect(full!.message).toMatch(/Entran 1 rutina más/);
    expect(await routinesOf(user)).toHaveLength(29);
    expect(await err(own.saveImportedRoutines(user, { opId: "x", source: "text", file: "text", routines: [{ name: "A", exercises: [ok], origin: [] }] }))).toMatchObject({ code: "invalid" });
  });

  it("FSA1 · «Mis rutinas»: otra persona no lee, edita, duplica, borra ni empieza una rutina ajena; el tope resiste guardados simultáneos", async () => {
    const { user } = await coachWithClient();
    const other = (await coachWithClient()).user;
    const ok = { exerciseId: SQUAT, sets: 3, reps: "10", weightKg: 60, restSec: null, note: null };
    const { id } = await own.saveOwnRoutine(user, { name: "Mía", exercises: [ok] });
    expect(await own.listOwnRoutines(other)).toEqual([]);
    // Cada intento se crea recién al esperarlo: armar las cuatro promesas juntas dejaba rechazos sin manejar (vitest sale con 1).
    for (const attempt of [() => own.saveOwnRoutine(other, { id, name: "Ajena", exercises: [ok] }), () => own.duplicateOwnRoutine(other, id), () => own.deleteOwnRoutine(other, id), () => own.startOwnRoutine(other, id, randomUUID())]) {
      expect(await err(attempt())).toMatchObject({ code: "not_found", status: 404 });
    }
    expect((await routinesOf(user)).map((r) => [r.name, r.exercises[0].weightKg])).toEqual([["Mía", 60]]);
    // Repetir: cada «Empezar» es una sesión nueva; el mismo id (reintento) no crea otra.
    const s1 = randomUUID();
    await own.startOwnRoutine(user, id, s1);
    await own.startOwnRoutine(user, id, s1);
    expect(await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.userId, user))).toHaveLength(1);
    // Tope: con 28 guardadas, cuatro «Guardar»/«Duplicar» y una importación a la vez dejan exactamente 30.
    for (let i = 0; i < 27; i++) await own.saveOwnRoutine(user, { name: `R${i}`, exercises: [ok] });
    const res = await Promise.allSettled([
      ...[1, 2, 3].map((i) => own.saveOwnRoutine(user, { name: `X${i}`, exercises: [ok] })), own.duplicateOwnRoutine(user, id),
      own.saveImportedRoutines(user, { opId: randomUUID(), source: "text", file: "text", routines: [{ name: "Imp", exercises: [{ ...ok, detail: null }], origin: [] }] }),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await routinesOf(user)).toHaveLength(30);
  });

  it("caso 21 · un día con más ejercicios que el tope se parte en la vista previa, sin perder ninguno", async () => {
    const { user } = await coachWithClient();
    const text = `Día A\n${Array.from({ length: 15 }, (_, i) => `Sentadilla ${i + 1}x10`.replace(/ (\d+)x/, " 3x")).join("\n")}`;
    const p = await withoutAi(() => own.previewRoutineImport(user, { fileName: "t", kind: "text", text }));
    expect(p.variants[0].days.map((d) => [d.name, d.exercises.length])).toEqual([["Día A 1", 12], ["Día A 2", 3]]);
    expect(p.notes.join(" ")).toMatch(/15 ejercicios/);
  });

  it("caso 22 · un ejercicio de otra organización ni se propone ni se puede guardar", async () => {
    const a = await coachWithClient();
    const b = await coachWithClient();
    const secret = await tr.coachCreateExercise(b.coach, b.org, { name: "Remo secreto Zeta", group: "Espalda", kind: "load_reps" });
    const p = await withoutAi(() => own.previewRoutineImport(a.user, { fileName: "t", kind: "text", text: "Día A\nRemo secreto Zeta 3x10\nSentadilla 3x10" }));
    const ex = p.variants[0].days[0].exercises[0];
    expect(ex.exerciseId).toBeNull();
    expect(ex.alternatives.map((x) => x.id)).not.toContain(secret.id);
    const e = await err(own.saveImportedRoutines(a.user, { opId: randomUUID(), source: "text", file: "text", routines: [{ name: "Día A", exercises: [{ exerciseId: secret.id, sets: 3, reps: "10", weightKg: null, restSec: null, note: null, detail: null }], origin: [] }] }));
    expect(e).toMatchObject({ code: "invalid" });
    expect(await routinesOf(a.user)).toHaveLength(0);
    // El alumno de B sí lo ve en su biblioteca.
    const pb = await withoutAi(() => own.previewRoutineImport(b.user, { fileName: "t", kind: "text", text: "Día A\nRemo secreto Zeta 3x10" }));
    expect(pb.variants[0].days[0].exercises[0].exerciseId).toBe(secret.id);
  });

  it("caso 6 · planilla de Excel con varias hojas (convertida en el teléfono) y caso 8 · libras", async () => {
    const { user } = await coachWithClient();
    const text = "Hoja: Lunes\nEjercicio,Series,Reps,Peso (lb)\nBench press,3,10,135\nSquat,3,8,185\n\nHoja: Jueves\nEjercicio,Series,Reps,Peso (lb)\nBarbell row,4,10,95";
    const p = await withoutAi(() => own.previewRoutineImport(user, { fileName: "rutina.xlsx", kind: "text", text, sheet: true }));
    expect([p.source, p.file]).toEqual(["sheet", "sheet"]);
    const days = p.variants[0].days;
    expect(days.map((d) => d.name)).toEqual(["Lunes", "Jueves"]);
    expect(days[0].exercises.map((e) => [e.exerciseId, e.weightKg])).toEqual([[BENCH, 61.23], [SQUAT, 83.91]]);
    expect(days[1].exercises[0]).toMatchObject({ exerciseId: ROW, weightKg: 43.09, unit: "lb" });
  });
});

describe("SI2 · fixture de Excel real (06-varias-hojas.xlsx), convertido como en el teléfono", () => {
  it("tres hojas, una por día; título arriba del encabezado; valores por serie y columnas por serie", async () => {
    const { user } = await coachWithClient();
    const buf = readFileSync(new URL("../../../packages/domain/fixtures/import/06-varias-hojas.xlsx", import.meta.url));
    const text = await spreadsheetToCsv(new File([new Uint8Array(buf)], "06-varias-hojas.xlsx"));
    const p = await withoutAi(() => own.previewRoutineImport(user, { fileName: "06-varias-hojas.xlsx", kind: "text", text, sheet: true }));
    const days = p.variants[0].days;
    expect(days.map((d) => d.name)).toEqual(["Día 1", "Día 2", "Día 3"]);
    expect(days[0].exercises.map((e) => [e.written, e.sets, e.reps, e.weightKg, e.restSec])).toEqual([
      ["Press banca", 4, "10", 60, 90], ["Press inclinado con mancuernas", 3, "12-10-8", null, 90], ["Aperturas en máquina", 3, "15", null, 60]]);
    expect(days[0].exercises[1].perSet).toEqual([{ reps: "12", weightKg: 20 }, { reps: "10", weightKg: 22.5 }, { reps: "8", weightKg: 25 }]);
    expect(days[1].exercises[1]).toMatchObject({ written: "Curl femoral", note: "¿sentado o acostado?" });
    expect(days[2].exercises[0]).toMatchObject({ written: "Remo con barra", sets: 3, perSet: [{ reps: "12", weightKg: 40 }, { reps: "10", weightKg: 45 }, { reps: "8", weightKg: 50 }] });
  });
});

describe("SI2 · lectura con IA (simulada): mismas reglas, sin seguir instrucciones del documento", () => {
  const ai = (content: object, finish = "stop") => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: finish }] }), { status: 200 }));
  const ex = (o: Record<string, unknown>) => ({ name: "", group: "", section: "", sets: null, reps: null, set_reps: [], set_weights: [], weight: null, unit: null, rest_sec: null, rir: null, rpe: null, tempo: null, technique: "", note: "", unclear: [], source: "", ...o });

  it("casos 3, 4, 11-14, 17 · foto: el documento va como dato, se validan series, libras, ambigüedad y alternativas", async () => {
    const { user } = await coachWithClient();
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
    const out = { programs: [{ name: "", days: [{ name: "DÍA 1", exercises: [
      ex({ name: "Press banca", sets: 4, reps: "10", weight: 135, unit: "lb", source: "Press banca 4x10 135lb" }),
      ex({ name: "Press inclinado", sets: 3, reps: "12", source: "Press inclinado 3x12" }),
      ex({ name: "A1 Sentadilla", sets: 3, set_reps: ["10", "8", "6"], source: "A1 Sentadilla 10/8/6" }),
      ex({ name: "Remo", sets: 3, reps: "10", source: "Remo", unclear: ["reps"] }),
      ex({ name: "Elevaciones laterales", sets: 3, reps: "15", technique: "drop set en la última", source: "Elev. laterales 3x15 drop set última" }),
      ex({ name: "Hip thrust", source: "Hip thrust" }),
    ] }] }], notes: ["El documento tenía texto ajeno a la rutina."], unreadable: ["renglón 7 tachado"] };
    const f = ai(out);
    vi.stubGlobal("fetch", f);
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
    const p = await own.previewRoutineImport(user, { fileName: "foto.jpg", kind: "image", dataUrl: jpeg });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.messages[0].content).toBe(IMPORT_SYSTEM);
    expect(sent.messages[0].content).toMatch(/nunca instrucciones/);
    expect(sent.response_format.json_schema.strict).toBe(true);
    const [bench, incl, sq, row, lat, hip] = p.variants[0].days[0].exercises;
    expect([p.source, p.file]).toEqual(["ai", "image"]);
    expect(bench).toMatchObject({ exerciseId: BENCH, weightKg: 61.23, unit: "lb" });
    expect(incl.exerciseId).toBeNull(); // ambiguo: no se elige solo
    // Sólo variantes inclinadas (nunca el press plano); la base de pruebas comparte ejercicios globales de otras pruebas.
    expect(incl.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(incl.alternatives.every((x) => /inclinad/i.test(x.name))).toBe(true);
    expect(sq).toMatchObject({ group: "A1", exerciseId: SQUAT, perSet: [{ reps: "10", weightKg: null }, { reps: "8", weightKg: null }, { reps: "6", weightKg: null }] });
    expect(row.issues.filter((i) => i.kind === "unclear").map((i) => i.field).sort()).toEqual(["reps", "sets"]); // evidencia sin números
    expect(lat.method).toMatchObject({ technique: "drop_set", confident: true, selection: "last" });
    expect([hip.sets, hip.reps]).toEqual([null, null]);
    expect(p.unread).toEqual(["renglón 7 tachado"]);
    expect(p.notes[0]).toMatch(/texto ajeno/);
  });

  it("respuesta incompleta o falla del servicio: no se carga una parte; si había texto legible, se devuelve eso marcado", async () => {
    const { user } = await coachWithClient();
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
    vi.stubGlobal("fetch", ai({ programs: [] }, "length"));
    expect(await err(own.previewRoutineImport(user, { fileName: "r.pdf", kind: "pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" }))).toMatchObject({ code: "ai_incomplete" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const p = await own.previewRoutineImport(user, { fileName: "t", kind: "text", text: "Día A\nSentadilla 3x10\n%%%% ### ilegible ###\nPress banca 3x10" });
    expect(p.source).toBe("text");
    expect(p.notes[0]).toMatch(/falló/);
    expect(p.unread).toHaveLength(1);
  });

  it("caso 18 · varios programas en un PDF: uno por opción", async () => {
    const { user } = await coachWithClient();
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
    vi.stubGlobal("fetch", ai({ programs: [
      { name: "Fuerza", days: [{ name: "Día 1", exercises: [ex({ name: "Sentadilla", sets: 5, reps: "5", source: "Sentadilla 5x5" })] }] },
      { name: "Hipertrofia", days: [{ name: "Día 1", exercises: [ex({ name: "Press banca", sets: 4, reps: "10", source: "Press banca 4x10" })] }, { name: "Día 2", exercises: [ex({ name: "Remo con barra", sets: 4, reps: "10", source: "Remo con barra 4x10" })] }] },
    ], notes: [], unreadable: [] }));
    const p = await own.previewRoutineImport(user, { fileName: "programas.pdf", kind: "pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" });
    expect(p.variants.map((v) => [v.name, v.days.length])).toEqual([["Fuerza", 1], ["Hipertrofia", 2]]);
  });

  it("FSA1 · salida inválida, contradictoria o lenta: nunca un error sin control ni datos presentados como leídos", async () => {
    const { user } = await coachWithClient();
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
    const rawAi = (content: string) => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), { status: 200 }));
    // Estructura distinta de la pedida: «ai_bad_output» (422), no un TypeError (500).
    for (const content of [JSON.stringify({ programs: "abc" }), JSON.stringify(null), JSON.stringify({ programs: [{ name: "", days: [{ name: "", exercises: [5] }] }] })]) {
      vi.stubGlobal("fetch", rawAi(content));
      expect(await err(own.previewRoutineImport(user, { fileName: "f.jpg", kind: "image", dataUrl: jpeg }))).toMatchObject({ code: "ai_bad_output", status: 422 });
    }
    // Un campo con otro tipo queda vacío y marcado como faltante: nunca se convierte («4» texto no son 4 series).
    vi.stubGlobal("fetch", rawAi(JSON.stringify({ programs: [{ name: "", days: [{ name: "Día 1", exercises: [ex({ name: "Sentadilla", sets: "4", reps: 10, weight: "80", source: "Sentadilla 4x10 80" })] }] }], notes: [], unreadable: [] })));
    const typed = (await own.previewRoutineImport(user, { fileName: "f.jpg", kind: "image", dataUrl: jpeg })).variants[0].days[0].exercises[0];
    expect([typed.exerciseId, typed.sets, typed.reps, typed.weightKg]).toEqual([SQUAT, null, null, null]);
    expect(typed.issues.filter((i) => i.kind === "missing").map((i) => i.field).sort()).toEqual(["reps", "sets"]);
    // Con texto legible, una salida inválida devuelve lo leído directo (marcado), como cuando la IA falla.
    vi.stubGlobal("fetch", rawAi(JSON.stringify({ programs: "abc" })));
    const fb = await own.previewRoutineImport(user, { fileName: "t", kind: "text", text: "Día A\nSentadilla 3x10\n%%%% ### ilegible ###\nPress banca 3x10" });
    expect([fb.source, fb.variants[0].days[0].exercises.length]).toEqual(["text", 2]);
    // Carga inventada y series contradictorias: el renglón citado no las dice, así que quedan para confirmar (no «listas»).
    vi.stubGlobal("fetch", rawAi(JSON.stringify({ programs: [{ name: "", days: [{ name: "Día 1", exercises: [
      ex({ name: "Sentadilla", sets: 4, reps: "8", weight: 100, unit: "kg", source: "Sentadilla 4x8" }),
      ex({ name: "Press banca", sets: 5, reps: "12", source: "Press banca 3x10" }),
    ] }] }], notes: [], unreadable: [] })));
    const [sq, bp] = (await own.previewRoutineImport(user, { fileName: "f.jpg", kind: "image", dataUrl: jpeg })).variants[0].days[0].exercises;
    expect(sq.issues.filter((i) => i.kind === "unclear").map((i) => i.field)).toEqual(["weight"]);
    expect(bp.issues.filter((i) => i.kind === "unclear").map((i) => i.field).sort()).toEqual(["reps", "sets"]);
    // Lenta: el pedido se corta por tiempo («ai_unavailable»); con texto legible se devuelve lo leído directo.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(30));
    vi.stubGlobal("fetch", vi.fn((_u: string, init: { signal: AbortSignal }) => new Promise((_r, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" }))))));
    try {
      expect(await err(own.previewRoutineImport(user, { fileName: "f.jpg", kind: "image", dataUrl: jpeg }))).toMatchObject({ code: "ai_unavailable", status: 503 });
      const slow = await own.previewRoutineImport(user, { fileName: "t", kind: "text", text: "Día A\nSentadilla 3x10\n%%%% ### ilegible ###\nPress banca 3x10" });
      expect([slow.source, slow.notes[0]]).toEqual(["text", expect.stringMatching(/falló/)]);
    } finally { spy.mockRestore(); }
    expect(await routinesOf(user)).toHaveLength(0); // leer nunca guarda
  });

  it("tipo de archivo comprobado por su contenido", () => {
    expect(() => checkUpload({ fileName: "x.png", kind: "image", dataUrl: "data:image/png;base64,/9j/4AAQSkZJRgABAQ" })).toThrow(/no es lo que dice ser/);
    expect(() => checkUpload({ fileName: "x.pdf", kind: "pdf", dataUrl: "data:application/pdf;base64,PGh0bWw+" })).toThrow(/no es lo que dice ser/);
    expect(() => checkUpload({ fileName: "x.pdf", kind: "image", dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" })).toThrow();
    expect(() => checkUpload({ fileName: "x.png", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg" })).not.toThrow();
    expect(() => checkUpload({ fileName: "t", kind: "text", text: "x".repeat(400_001) })).toThrow(/supera/);
  });
});

describe("SI2 · entrenadores", () => {
  it("caso 23 · el coach importa un borrador: programa nuevo sin asignar, idempotente, y sólo el coach del espacio", async () => {
    const { coach, org, user } = await coachWithClient();
    const lib = await tr.listLibrary(coach, org);
    const p = await withoutAi(() => programImportPreview(coach, org, lib, { fileName: "t", kind: "text", text: "Día A\nSentadilla 4x8 80kg desc 2 min\nPress banca 3x10 60kg desc 90s" }, noGate));
    expect(p.limits).toEqual({ days: 14, exercisesPerDay: 30 });
    const [sq, bp] = p.variants[0].days[0].exercises;
    const doc: ProgramDoc = { name: "Importado", weeks: 4, note: "", days: [{ name: "Día A", exercises: [
      { exerciseId: sq.exerciseId!, name: "Sentadilla", sets: 4, reps: "8", rir: null, restSec: 120, note: null, detail: null },
      { exerciseId: bp.exerciseId!, name: "Press de banca", sets: 3, reps: "10", rir: null, restSec: 90, note: null, detail: null }] }] };
    const before = (await tr.listTemplates(coach, org)).length;
    const imported = { opId: randomUUID(), source: "text", file: "text" };
    const id = await tr.createTemplate(coach, org, doc, imported);
    expect(await tr.createTemplate(coach, org, doc, imported)).toBe(id); // reintento: el mismo programa
    const list = await tr.listTemplates(coach, org);
    expect(list).toHaveLength(before + 1);
    expect(list.find((x) => x.id === id)).toMatchObject({ name: "Importado", clients: 0 }); // borrador sin asignar
    expect((await tr.myTraining(user)).state).not.toBe("ready"); // el alumno no recibió nada
    expect(await err(tr.listLibrary(user, org))).toBeTruthy(); // un alumno no puede leer como coach
  });

  it("caso 24 · gimnasio: quien arma programas lee la importación sin tocar programas de socios; recepción y socios no", async () => {
    const owner = await verified("Dueño SI2");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner.id));
    const org = await acc.createGymOrganization(owner.id, { name: `Gym SI2 ${n}-${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const staff = async (role: "floor_trainer" | "reception") => { const s = await verified(role); await db.insert(schema.staffMembership).values({ userId: s.id, orgId: org.id, locationId: A.id, role }); return s.id; };
    const floor = await staff("floor_trainer"), reception = await staff("reception");
    await gym.startShift(floor, org.id, A.id);
    const u = await verified("Socio SI2");
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u.id, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    await gym.saveMemberProgram(floor, org.id, m.id, { doc: { name: "Sala", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: SQUAT, name: "Sentadilla", sets: 3, reps: "10", rir: 2, restSec: 90, note: null }] }] }, reason: "Inicial" });
    const versions = async () => (await db.execute(sql`select count(*)::int as n from program_version`)) as unknown as { n: number }[];
    const v0 = (await versions())[0].n;
    const p = await withoutAi(async () => programImportPreview(floor, org.id, await gym.gymLibrary(floor, org.id), { fileName: "t", kind: "text", text: "Día 1\nPress banca 4x10\nRemo con barra 4x10" }, noGate));
    expect(p.variants[0].days[0].exercises.map((e) => e.exerciseId)).toEqual([BENCH, ROW]);
    expect((await versions())[0].n).toBe(v0); // leer no guarda ni versiona nada
    expect(await err(gym.gymLibrary(reception, org.id))).toBeTruthy();
    expect(await err(gym.gymLibrary(u.id, org.id))).toBeTruthy();
    void localDate;
  });
});
