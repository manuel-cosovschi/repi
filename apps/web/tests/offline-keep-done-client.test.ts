// FSA1 (MEMBER-03): una copia vieja de la sesión (otra pestaña del mismo teléfono, o la cola escribiendo una lectura anterior
// a la última serie) borraba en el teléfono una serie ya registrada; la cola, al no verla hecha, descartaba su envío y la serie
// se perdía sin aviso. Ahora lo guardado conserva las series hechas: sólo la copia del servidor puede reemplazarlas. Puro.
import { describe, expect, it } from "vitest";
import { keepDone, type LocalSession, type LocalSet } from "@/lib/offline/store";

const set = (p: Partial<LocalSet> = {}): LocalSet => ({ id: "a", w: 60, r: 8, rir: null, done: false, revision: 0, at: null, ...p });
const sess = (sets: Record<string, LocalSet>): LocalSession => ({
  id: "s1", dayId: "d1", dayName: "Día A", note: "", startedAt: "2026-11-09T12:00:00.000Z", status: "in_progress", activeMs: 0, lastResumedAt: null,
  endedAt: null, rpe: null, sessionNote: null, revision: 1, synced: true, updatedAt: "2026-11-09T12:00:00.000Z", exercises: [], sets,
});

describe("keepDone: una copia vieja no deshace series registradas", () => {
  it("la serie hecha en otra pestaña (o mientras la cola escribía) queda hecha, con sus valores", () => {
    const stored = sess({ "e:0": set({ done: true, w: 60, at: "x" }), "e:1": set({ id: "b", done: true, w: 62.5, r: 6, at: "y" }) });
    const stale = sess({ "e:0": set({ done: true, w: 60, at: "x" }), "e:1": set({ id: "c", w: 65 }) }); // la otra pestaña: serie 2 pendiente, peso cambiado
    const out = keepDone(stale, stored);
    expect(out.sets["e:1"]).toEqual(stored.sets["e:1"]);
    expect(out.sets["e:0"]).toBe(stale.sets["e:0"]);
  });
  it("lo nuevo de la pantalla gana en todo lo demás: series hechas ahora, correcciones, borradores", () => {
    const stored = sess({ "e:0": set({ done: true, w: 60 }), "e:1": set({ w: 60 }) });
    const next = sess({ "e:0": set({ done: true, w: 62.5 }), "e:1": set({ done: true, w: 60, at: "z" }) });
    expect(keepDone(next, stored)).toBe(next);
    const draft = sess({ "e:0": set({ done: true, w: 60 }), "e:1": set({ w: 70 }) });
    expect(keepDone(draft, stored)).toBe(draft);
  });
  it("sin nada guardado, o con una fila que ya no está en la copia (rutina cambiada), no inventa nada", () => {
    const next = sess({ "e:0": set() });
    expect(keepDone(next, undefined)).toBe(next);
    expect(keepDone(next, sess({ "old:0": set({ done: true }) })).sets).toEqual({ "e:0": set() });
  });
});
