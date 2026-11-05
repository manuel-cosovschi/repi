// Regresión de cliente del hotfix #26 (D195): al refrescar los objetivos de una sesión recién iniciada, el teléfono
// conserva la escalera de cargas del equipo y no toca series, borradores, descanso ni intervalo.
import { describe, expect, it } from "vitest";
import { mergeIntel, type LocalSession } from "@/lib/offline/store";

const ex = (id: string, extra: Partial<LocalSession["exercises"][number]> = {}) => ({
  id, exerciseId: `x-${id}`, name: id, sets: 3, reps: "8-10", rir: 2, restSec: 90, note: null, prev: null, targets: null, outlook: null, ladder: null, ...extra,
}) as LocalSession["exercises"][number];

const base = (): LocalSession => ({
  id: "s1", dayId: "d1", dayName: "Día A", note: null, startedAt: "2026-11-05T12:00:00Z", status: "in_progress", activeMs: 0, lastResumedAt: null,
  endedAt: null, rpe: null, sessionNote: null, revision: 3, synced: false, updatedAt: "2026-11-05T12:00:00Z",
  rest: { end: 123, paused: false, left: 0 } as unknown as LocalSession["rest"],
  exercises: [ex("a"), ex("b", { targets: [], ladder: { incrementKg: 2.5, loadsKg: null, source: "location" } as unknown as LocalSession["exercises"][number]["ladder"] }), ex("c", { ladder: { incrementKg: 1, loadsKg: [10, 11], source: "plan" } as unknown as LocalSession["exercises"][number]["ladder"] })],
  sets: { "a:0": { id: "r1", w: 40, r: 8, rir: null, done: true, revision: 1, at: "2026-11-05T12:01:00Z" } } as LocalSession["sets"],
} as unknown as LocalSession);

const ladder = { incrementKg: 5, loadsKg: [20, 25, 30], source: "location" } as unknown as LocalSession["exercises"][number]["ladder"];

describe("refresco de objetivos en el cliente (hotfix #26)", () => {
  it("copia la escalera del servidor junto con los objetivos", () => {
    const m = mergeIntel(base(), { exercises: [{ id: "a", targets: [], outlook: null, ladder }] });
    expect(m.exercises[0].ladder).toEqual(ladder);
    expect(m.exercises[0].targets).toEqual([]);
  });

  it("no pisa un ejercicio que ya tenía objetivos y conserva la escalera local si el servidor no trae ninguna", () => {
    const m = mergeIntel(base(), { exercises: [{ id: "b", targets: [], ladder: null }, { id: "c", targets: [] }] });
    expect(m.exercises[1]).toEqual(base().exercises[1]);
    expect(m.exercises[2].ladder).toEqual(base().exercises[2].ladder);
  });

  it("nunca toca series, borradores, descanso ni revisión", () => {
    const b = base();
    const m = mergeIntel(b, { exercises: [{ id: "a", targets: [], ladder }] });
    expect(m.sets).toEqual(b.sets);
    expect(m.rest).toEqual(b.rest);
    expect(m.revision).toBe(b.revision);
    expect(m.status).toBe("in_progress");
  });
});
