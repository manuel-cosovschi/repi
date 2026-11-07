import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { resetRateLimits } from "@/server/access/util";
import * as tr from "@/server/training/services";
import { listMemory } from "@/server/brain/memory";
import { sessionReviewFor } from "@/server/brain/review";
import { coachWorld, daysAgo, err, pastSession, startToday } from "./brain-chat.world";

// D209 · C1 · Cierre de sesión con datos reales (review.sessionReviewFor → sessionReview del dominio): previstas contra hechas,
// comparación con la sesión comparable anterior, marcas contra la historia previa, omitidos, reemplazos, anuladas excluidas y
// el resultado guardado en la memoria (casos 10, 11, 41).
beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const log = (user: string, sid: string, pe: string, i: number, w: number, r: number, rir = 2) =>
  tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe, setIndex: i, weightKg: w, reps: r, rir });

describe("cierre de la sesión", () => {
  it("previstas contra hechas, comparación con la anterior, marca auténtica, omitido por tiempo y parcial", async () => {
    const w = await coachWorld();
    await pastSession(w.user, daysAgo(7), { "Press banca": [[60, 8, 2], [60, 8, 2], [60, 8, 2]], "Remo con barra": [[50, 10, 2], [50, 10, 2], [50, 10, 2]] });
    const { sid, pe } = await startToday(w.user);
    await tr.setExerciseChange(w.user, sid, { programExerciseId: pe["Jalón al pecho"], change: { kind: "skip", reason: "no_time" } });
    for (const i of [0, 1, 2]) await log(w.user, sid, pe["Press banca"], i, 62.5, 8);
    await log(w.user, sid, pe["Remo con barra"], 0, 50, 10);
    await tr.sessionAction(w.user, sid, "finish");

    const { review: rv, status } = await sessionReviewFor(w.user, sid);
    expect(status).toBe("completed");
    expect([rv.planned, rv.done]).toEqual([9, 4]);
    expect(rv.text).toMatch(/^Hoy completaste 4 de las 9 series previstas\. En Press banca levantaste 62,5 kg, la carga más alta que registraste/);
    expect(rv.text).toContain("Jalón al pecho quedó sin hacer.");
    expect(rv.skipped).toEqual(["Jalón al pecho"]);
    expect(rv.exercises.find((e) => e.name === "Remo con barra")).toMatchObject({ status: "partial", doneMain: 1, plannedMain: 3 });
    expect(rv.marks[0]).toMatchObject({ type: "load", value: 62.5, previous: 60, tie: false });
    expect(rv.adaptations).toContain("acortaste la sesión por falta de tiempo");
    expect(rv.evidence.basis).toMatch(/^Comparé cada ejercicio con su sesión comparable anterior: Press banca \(\d{2}\/\d{2}\), Remo con barra \(\d{2}\/\d{2}\)\.$/);
    expect(rv.evidence.excluded).toContain("anuladas");

    // El resultado queda en la memoria una sola vez (leer el cierre dos veces no lo duplica).
    await sessionReviewFor(w.user, sid);
    const out = (await listMemory(w.user)).filter((m) => m.kind === "outcome" && m.key === `session_review:${sid}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "system", value: { planned: 9, done: 4, marks: 1, skipped: 1 } });
  });

  it("las series anuladas no cuentan ni hacen récord; la primera vez no es marca (casos 10, 41)", async () => {
    const w = await coachWorld();
    const first = await pastSession(w.user, daysAgo(10), { "Press banca": [[60, 8, 2], [60, 8, 2], [60, 8, 2]] });
    const r1 = await sessionReviewFor(w.user, first);
    expect(r1.review.marks).toEqual([]);
    expect(r1.review.exercises.find((e) => e.name === "Press banca")?.comparison).toBe("first");

    const { sid, pe } = await startToday(w.user);
    await log(w.user, sid, pe["Press banca"], 0, 80, 8);
    await log(w.user, sid, pe["Press banca"], 1, 60, 8);
    await db.update(schema.setLog).set({ voidedAt: new Date() }).where(and(eq(schema.setLog.sessionId, sid), eq(schema.setLog.setIndex, 0)));
    await tr.sessionAction(w.user, sid, "finish");
    const { review: rv } = await sessionReviewFor(w.user, sid);
    // 60 × 8 iguala lo anterior (empate, no récord); los 80 kg anulados no existen para el cierre.
    expect(rv.marks.filter((m) => !m.tie)).toEqual([]);
    expect(rv.marks.some((m) => m.value === 80)).toBe(false);
    expect(rv.exercises.find((e) => e.name === "Press banca")).toMatchObject({ doneMain: 1, comparison: "fewer" });
    expect(rv.text).not.toContain("80");
  });

  it("abierta: parcial y sin memoria; anulada: 409; de otra persona: 404", async () => {
    const w = await coachWorld();
    const { sid, pe } = await startToday(w.user);
    await log(w.user, sid, pe["Press banca"], 0, 60, 8);
    const open = await sessionReviewFor(w.user, sid);
    expect(open.status).toBe("in_progress");
    expect(open.review.done).toBe(1);
    expect((await listMemory(w.user)).filter((m) => m.kind === "outcome")).toHaveLength(0);
    const other = await coachWorld();
    expect(await err(sessionReviewFor(other.user, sid))).toMatchObject({ code: "not_found", status: 404 });
    expect(await err(sessionReviewFor(w.user, "no-existe"))).toMatchObject({ status: 404 });
    await tr.sessionAction(w.user, sid, "finish");
    await db.update(schema.workoutSession).set({ status: "voided", voidedAt: new Date() }).where(eq(schema.workoutSession.id, sid));
    expect(await err(sessionReviewFor(w.user, sid))).toMatchObject({ code: "voided", status: 409 });
  });
});

describe("marcas contra la historia previa (revisión AC3: hallazgo 7)", () => {
  it("el 1RM estimado previo sale de cada serie de 1 a 12: una AMRAP de 14 a la misma carga no tapa la serie de 10", async () => {
    const w = await coachWorld();
    await pastSession(w.user, daysAgo(14), { "Press banca": [[60, 14, 0]] });
    await pastSession(w.user, daysAgo(7), { "Press banca": [[60, 10, 2], [50, 10, 2]] });
    const { sid, pe } = await startToday(w.user);
    await log(w.user, sid, pe["Press banca"], 0, 55, 12); // 1RM estimado 77: por debajo de 60 × 10 (80)
    await tr.sessionAction(w.user, sid, "finish");
    const { review: rv } = await sessionReviewFor(w.user, sid);
    expect(rv.marks.filter((m) => m.type === "e1rm")).toEqual([]);
    expect(rv.text).not.toContain("superaste tu mejor marca estimada");
  });
});
