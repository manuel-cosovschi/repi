// Historial anterior a REPI (D132): vista previa, confirmar, evolución, peso sugerido y quitar. Sin IA en las pruebas.
import { desc, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as hi from "@/server/training/history-import";
import { ensureExerciseCatalog } from "@/server/training/library";
import { aiSoloAdvice } from "@/server/training/ai-coach";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { myExerciseProgress, myProgressExercises } from "@/server/progress/exercises";
import { createThreeYearHistory } from "../../../packages/domain/tests/fixtures/three-year-history";

beforeAll(() => { delete process.env.OPENAI_API_KEY; });
beforeEach(() => resetRateLimits());
let n = 0;
async function verified(name = "Persona Historial") {
  const email = `hi${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

describe("historial anterior", () => {
  it("una vista previa antigua recortada no puede confirmarse como si estuviera completa", async () => {
    const u = await verified();
    const preview = await hi.previewHistoryImport(u, { fileName: "Historial antiguo", kind: "text", text: "Fecha,Ejercicio,Reps,Peso\n01/01/2024,Sentadilla,10,60" });
    const [draft] = await db.select().from(schema.historyImport).where(eq(schema.historyImport.id, preview.id));
    await db.update(schema.historyImport).set({ parsed: { ...(draft.parsed as object), capped: true } }).where(eq(schema.historyImport.id, preview.id));
    await expect(hi.confirmHistoryImport(u, preview.id)).rejects.toMatchObject({ code: "incomplete" });
    expect(await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.importId, preview.id))).toHaveLength(0);
    await hi.removeHistoryImport(u, preview.id);
  });

  it("importa tres años y 21.900 series; el gráfico conserva también las posteriores a las primeras 5000", async () => {
    await ensureExerciseCatalog();
    const u = await verified("Historial de tres años");
    const fixture = createThreeYearHistory();
    // Todas las series pertenecen al mismo ejercicio para superar también el antiguo límite del gráfico por ejercicio.
    const text = fixture.text.replace(/^(?:Press plano|Sentadilla|Remo|Peso muerto|Dominadas|Polea)(?= \()/gm, "Press de banca");
    const p = await hi.previewHistoryImport(u, { fileName: "Tres años de notas", kind: "text", text });
    try {
      expect(p).toMatchObject({ source: "notes", capped: false, dropped: 0, summary: { sessions: 730, exercises: 1, sets: 21_900, from: "2023-01-01", to: "2025-12-29" } });
      expect(p.sample[0].day).toBe("2025-12-29");
      await hi.confirmHistoryImport(u, p.id);
      await hi.confirmHistoryImport(u, p.id); // Un reintento tampoco duplica una importación grande.
      const [stored] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.historyEntry).where(eq(schema.historyEntry.importId, p.id));
      expect(stored.count).toBe(21_900);
      const [last] = await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.importId, p.id))
        .orderBy(desc(schema.historyEntry.day), desc(schema.historyEntry.setIndex)).limit(1);
      expect(last).toMatchObject({ day: "2025-12-29", weightKg: "99.75", reps: 17, setIndex: 29 });
      const mine = await hi.myHistoryImports(u);
      expect(mine.imports[0]).toMatchObject({ sets: 21_900, fromDay: "2023-01-01", toDay: "2025-12-29" });
      expect(mine.evolution[0]).toMatchObject({ sessions: 730, first: { day: "2023-01-01" }, last: { day: "2025-12-29", weightKg: 99.75, reps: 17 } });
      const list = await myProgressExercises(u);
      const bench = list.exercises.find((exercise) => exercise.name === "Press de banca")!;
      const graph = await myExerciseProgress(u, bench.id, "all");
      expect(graph).toMatchObject({ truncated: false, totals: { sessions: 730, sets: 21_900, firstDay: "2023-01-01" } });
      expect(graph.points[0].day).toBe("2023-01-01");
      expect(graph.points.at(-1)).toMatchObject({ day: "2025-12-29", sets: 30, topKg: 99.75, repsAtTop: 17 });
      expect((await hi.importedLastSets(u, [bench.id])).get(bench.id)).toEqual({ day: "2025-12-29", weightKg: 99.75, reps: 17 });
    } finally { await hi.removeHistoryImport(u, p.id); }
    expect((await hi.myHistoryImports(u)).imports).toHaveLength(0);
  }, 60_000);

  it("notas del celular sin IA: las series completas alimentan progreso y pesos iniciales de la rutina", async () => {
    await ensureExerciseCatalog();
    const u = await verified();
    const text = "12/03/2024\nPress plano (105kg)\n5;5;5;4\n\n19/03/2024\nPress plano (107,5kg)\n6;5;5\nPolea (5 ladrillos)\n17;16;13";
    const p = await hi.previewHistoryImport(u, { fileName: "Notas del celular", kind: "text", text });
    expect(p).toMatchObject({ source: "notes", dropped: 0, capped: false, summary: { sessions: 2, exercises: 2, sets: 10, from: "2024-03-12", to: "2024-03-19" } });
    expect(p.exercises.find((e) => e.name === "Press plano")).toMatchObject({ matched: "Press de banca", sets: 7 });
    expect(p.exercises.find((e) => e.name === "Polea")).toMatchObject({ matched: null, sets: 3 });
    expect((await hi.myHistoryImports(u)).imports).toHaveLength(0);

    await hi.confirmHistoryImport(u, p.id);
    const rows = await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.importId, p.id));
    expect(rows).toHaveLength(10);
    const unknown = rows.filter((r) => r.exerciseName === "Polea");
    expect(unknown.map((r) => r.reps).sort((a, b) => a! - b!)).toEqual([13, 16, 17]);
    for (const row of unknown) expect(row).toMatchObject({ exerciseId: null, weightKg: null });

    const list = await myProgressExercises(u);
    const bench = list.exercises.find((e) => e.name === "Press de banca")!;
    expect(bench).toMatchObject({ imported: true, sessions: 2, lastDay: "2024-03-19" });
    const graph = await myExerciseProgress(u, bench.id, "all");
    expect(graph.totals).toMatchObject({ sessions: 2, sets: 7, volumeKg: 3715, firstDay: "2024-03-12" });
    expect(graph.points.map((point) => ({ day: point.day, source: point.source, sets: point.sets, topKg: point.topKg }))).toEqual([
      { day: "2024-03-12", source: "import", sets: 4, topKg: 105 },
      { day: "2024-03-19", source: "import", sets: 3, topKg: 107.5 },
    ]);
    expect((await hi.importedLastSets(u, [bench.id])).get(bench.id)).toEqual({ day: "2024-03-19", weightKg: 107.5, reps: 5 });
    await hi.removeHistoryImport(u, p.id);
    expect((await myProgressExercises(u)).exercises).toHaveLength(0);
  });

  it("planilla: vista previa sin guardar, confirmar suma al progreso, otra persona no la ve y se puede quitar", async () => {
    await ensureExerciseCatalog();
    const u = await verified();
    const csv = "Fecha,Ejercicio,Series,Reps,Peso\n05/01/2024,sentadilla,3,10,60\n12/01/2024,Sentadilla,2,8,70\n12/01/2024,Remo gorila,3,12,20\n31/02/2024,Press de banca,1,5,50\n";
    const p = await hi.previewHistoryImport(u, { fileName: "planilla.csv", kind: "text", text: csv });
    expect(p).toMatchObject({ source: "csv", dropped: 1, summary: { sessions: 2, sets: 8, from: "2024-01-05", to: "2024-01-12" } });
    expect(p.exercises.find((e) => e.name === "Sentadilla")?.matched).toBe("Sentadilla");
    expect(p.exercises.find((e) => e.name === "Remo gorila")?.matched).toBeNull();
    expect((await hi.myHistoryImports(u)).imports).toHaveLength(0); // borrador: todavía no cuenta

    const otro = await verified("Otro");
    expect((await err(hi.confirmHistoryImport(otro, p.id)))?.code).toBe("not_found");
    // DATA-3 (QA 29/10): doble toque simultáneo (dos pedidos a la vez) y un reintento después: no duplica.
    await Promise.all([hi.confirmHistoryImport(u, p.id), hi.confirmHistoryImport(u, p.id)]);
    await hi.confirmHistoryImport(u, p.id);
    expect(await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.importId, p.id))).toHaveLength(8);
    const mine = await hi.myHistoryImports(u);
    expect(mine.evolution.find((e) => e.exercise === "Sentadilla")).toMatchObject({ sessions: 2, first: { weightKg: 60 }, best: { weightKg: 70 } });
    const [sq] = await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla"));
    expect((await hi.importedLastSets(u, [sq.id])).get(sq.id)).toMatchObject({ weightKg: 70, day: "2024-01-12" });

    await hi.removeHistoryImport(u, p.id);
    expect((await hi.myHistoryImports(u)).imports).toHaveLength(0);
    expect(await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.importId, p.id))).toHaveLength(0);
  });

  it("D182 · importar el mismo archivo otra vez no duplica; uno parcialmente igual pide elegir; series iguales legítimas se conservan", async () => {
    await ensureExerciseCatalog();
    const u = await verified();
    const entries = async () => (await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.userId, u))).length;
    const csv = "Fecha,Ejercicio,Series,Reps,Peso\n05/01/2024,Sentadilla,3,10,60\n12/01/2024,Sentadilla,2,8,70\n";
    const a = await hi.previewHistoryImport(u, { fileName: "planilla.csv", kind: "text", text: csv });
    expect(a).toMatchObject({ duplicateOf: null, overlap: { sets: 0 } });
    await hi.confirmHistoryImport(u, a.id);
    expect(await entries()).toBe(5);
    // El mismo archivo (otro orden de filas, otra escritura del nombre): se detecta en la vista previa y al confirmar no suma nada.
    const same = await hi.previewHistoryImport(u, { fileName: "copia.csv", kind: "text", text: "Fecha,Ejercicio,Series,Reps,Peso\n12/01/2024,sentadilla,2,8,70\n05/01/2024,SENTADILLA,3,10,60\n" });
    expect(same.duplicateOf).toMatchObject({ fileName: "planilla.csv" });
    expect(await hi.confirmHistoryImport(u, same.id)).toMatchObject({ sets: 0, duplicate: true });
    expect(await hi.confirmHistoryImport(u, same.id).catch((e) => e.code)).toBe("closed"); // reintento: ya descartado, sin efectos
    expect(await entries()).toBe(5);
    // Parcialmente igual: sin elegir no se carga; «sólo lo nuevo» suma lo que falta; las series que ya estaban no se tocan.
    const part = await hi.previewHistoryImport(u, { fileName: "nueva.csv", kind: "text", text: "Fecha,Ejercicio,Series,Reps,Peso\n12/01/2024,Sentadilla,3,8,70\n19/01/2024,Sentadilla,3,8,72.5\n" });
    expect(part.overlap).toMatchObject({ sets: 2, days: 1 });
    expect(await hi.confirmHistoryImport(u, part.id).catch((e) => e.code)).toBe("overlap");
    expect(await entries()).toBe(5);
    expect(await hi.confirmHistoryImport(u, part.id, "new_only")).toMatchObject({ sets: 4, skipped: 2 });
    expect(await entries()).toBe(9); // 12/01: ahora 3 series de 70 × 8 (la tercera es nueva); 19/01: 3 series
    expect(await hi.confirmHistoryImport(u, part.id, "new_only")).toMatchObject({ ok: true }); // reintento idempotente
    expect(await entries()).toBe(9);
    // «Todo igual»: dos sesiones con los mismos números son posibles y se respetan si la persona lo elige.
    const again = await hi.previewHistoryImport(u, { fileName: "otra.csv", kind: "text", text: "Fecha,Ejercicio,Series,Reps,Peso\n19/01/2024,Sentadilla,1,8,72.5\n26/01/2024,Sentadilla,1,6,75\n" });
    await hi.confirmHistoryImport(u, again.id, "all");
    expect(await entries()).toBe(11);
  });
  it("D182 · dos archivos iguales confirmados a la vez: se carga uno solo", async () => {
    await ensureExerciseCatalog();
    const u = await verified();
    const csv = "Fecha,Ejercicio,Series,Reps,Peso\n03/02/2024,Press de banca,3,8,50\n";
    const [x, y] = [await hi.previewHistoryImport(u, { fileName: "a.csv", kind: "text", text: csv }), await hi.previewHistoryImport(u, { fileName: "b.csv", kind: "text", text: csv })];
    await Promise.all([hi.confirmHistoryImport(u, x.id), hi.confirmHistoryImport(u, y.id)]);
    expect(await db.select().from(schema.historyEntry).where(eq(schema.historyEntry.userId, u))).toHaveLength(3);
  });
  it("sin IA disponible, lo que no es planilla se explica; vacío o formato raro se rechaza", async () => {
    const u = await verified();
    // 09/11: sin ninguna fecha escrita se avisa antes de intentar leer (REPI no inventa fechas); con fecha y sin IA, se explica.
    expect((await err(hi.previewHistoryImport(u, { fileName: "notas.txt", kind: "text", text: "lunes sentadilla 3x10 60" })))?.code).toBe("no_dates");
    expect((await err(hi.previewHistoryImport(u, { fileName: "notas.txt", kind: "text", text: "12/03/2024\nsentadilla tres series pesadas" })))?.code).toBe("ai_unavailable");
    expect((await err(hi.previewHistoryImport(u, { fileName: "x.png", kind: "image", dataUrl: "data:text/html;base64,PGgxPg==" })))?.code).toBe("invalid");
    expect((await err(hi.previewHistoryImport(u, { fileName: "v.csv", kind: "text", text: "   " })))?.code).toBe("invalid");
    expect((await err(aiSoloAdvice(u)))?.code).toBe("ai_unavailable"); // D133: sin clave, el plan con reglas sigue y la IA avisa
  });
  it("FSA1 · la IA que empareja nombres no cambia la variante: lo importado no suma al progreso de otro ejercicio", async () => {
    const lib = [{ id: "a", name: "Remo en máquina" }, { id: "b", name: "Press inclinado con mancuernas" }, { id: "c", name: "Sentadilla" }];
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ map: [
      { written: "Remo", catalog: "Remo en máquina" }, { written: "Press inclinado con barra", catalog: "Press inclinado con mancuernas" }, { written: "Squat trasera", catalog: "Sentadilla" },
    ] }) } }] }), { status: 200 })));
    try {
      const m = await hi.matchExercises(["Remo", "Press inclinado con barra", "Squat trasera"], lib);
      expect([m["Remo"], m["Press inclinado con barra"], m["Squat trasera"]?.id]).toEqual([null, null, "c"]);
    } finally { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; }
  });
});
