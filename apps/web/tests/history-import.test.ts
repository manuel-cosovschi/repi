// Historial anterior a REPI (D132): vista previa, confirmar, evolución, peso sugerido y quitar. Sin IA en las pruebas.
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as hi from "@/server/training/history-import";
import { ensureExerciseCatalog } from "@/server/training/library";
import { aiSoloAdvice } from "@/server/training/ai-coach";
import { AccessError, resetRateLimits } from "@/server/access/util";

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

  it("sin IA disponible, lo que no es planilla se explica; vacío o formato raro se rechaza", async () => {
    const u = await verified();
    expect((await err(hi.previewHistoryImport(u, { fileName: "notas.txt", kind: "text", text: "lunes sentadilla 3x10 60" })))?.code).toBe("ai_unavailable");
    expect((await err(hi.previewHistoryImport(u, { fileName: "x.png", kind: "image", dataUrl: "data:text/html;base64,PGgxPg==" })))?.code).toBe("invalid");
    expect((await err(hi.previewHistoryImport(u, { fileName: "v.csv", kind: "text", text: "   " })))?.code).toBe("invalid");
    expect((await err(aiSoloAdvice(u)))?.code).toBe("ai_unavailable"); // D133: sin clave, el plan con reglas sigue y la IA avisa
  });
});
