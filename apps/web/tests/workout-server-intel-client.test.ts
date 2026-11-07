// Revisión AC3 (#10, #23, #32): el mensaje por serie que calcula el servidor. Antes la cola avisaba a la pantalla ANTES de
// escribir su copia (leída antes), que lo borraba enseguida; y se mostraba en cualquier descanso, aunque fuera de otro
// ejercicio (la cola se vacía al reconectar). Ahora la cola lo guarda en su propia escritura y sólo en el descanso que abrió
// esa serie. Puro: no toca la base ni IndexedDB.
import { describe, expect, it } from "vitest";
import { adoptServerIntel, type LocalSession } from "@/lib/offline/store";

const NOW = Date.parse("2026-11-07T15:00:00.000Z");
const ev = { code: "short", text: "Te quedaste corto: en la próxima bajá un poco la carga.", restPlusSec: 60 };
const base = (p: Partial<LocalSession> = {}): LocalSession => ({
  id: "s1", dayId: "d1", dayName: "Día A", note: "", startedAt: "2026-11-07T14:00:00.000Z", status: "in_progress", activeMs: 0, lastResumedAt: null,
  endedAt: null, rpe: null, sessionNote: null, revision: 1, synced: true, updatedAt: "2026-11-07T14:59:00.000Z", exercises: [], sets: {},
  rest: { end: NOW + 60_000, total: 90, left: 90, paused: false, of: { peId: "C", idx: 0 } }, intel: null, intelSeen: [], ...p,
});

describe("mensaje del servidor por serie (cola sin conexión)", () => {
  it("se adopta en el descanso de esa misma serie, con su clave para no repetirlo", () => {
    const s = adoptServerIntel(base(), { peId: "C", idx: 0, event: ev }, NOW);
    expect(s?.intel).toMatchObject({ key: "C:short", text: ev.text, restPlusSec: 60 });
    expect(s?.intelSeen).toEqual(["C:short"]);
  });
  it("el de otro ejercicio o de otra serie (llegó tarde al vaciarse la cola) no aparece en este descanso", () => {
    expect(adoptServerIntel(base(), { peId: "A", idx: 0, event: ev }, NOW)).toBeNull();
    expect(adoptServerIntel(base(), { peId: "C", idx: 1, event: ev }, NOW)).toBeNull();
    // Un descanso guardado por una versión anterior (sin origen) no adopta nada.
    expect(adoptServerIntel(base({ rest: { end: NOW + 60_000, total: 90, left: 90, paused: false } }), { peId: "C", idx: 0, event: ev }, NOW)).toBeNull();
  });
  it("nunca pisa el mensaje de las reglas locales ni repite uno ya mostrado; sin descanso en curso, nada", () => {
    expect(adoptServerIntel(base({ intel: { key: "C:harder", text: "Local", restPlusSec: null, at: "x" } }), { peId: "C", idx: 0, event: ev }, NOW)).toBeNull();
    expect(adoptServerIntel(base({ intelSeen: ["C:short"] }), { peId: "C", idx: 0, event: ev }, NOW)).toBeNull();
    expect(adoptServerIntel(base({ rest: null }), { peId: "C", idx: 0, event: ev }, NOW)).toBeNull();
    expect(adoptServerIntel(base({ rest: { end: null, total: 90, left: 30, paused: true, of: { peId: "C", idx: 0 } } }), { peId: "C", idx: 0, event: ev }, NOW)).toBeNull();
    expect(adoptServerIntel(base({ rest: { end: NOW - 1, total: 90, left: 0, paused: false, of: { peId: "C", idx: 0 } } }), { peId: "C", idx: 0, event: ev }, NOW)).toBeNull();
  });
  it("conserva las series y revisiones de la copia que escribe la cola (una sola escritura)", () => {
    const sets = { "C:0": { id: "x", w: 60, r: 8, rir: 2, done: true, revision: 3, at: "2026-11-07T14:58:00.000Z" } } as LocalSession["sets"];
    const s = adoptServerIntel(base({ sets }), { peId: "C", idx: 0, event: ev }, NOW);
    expect(s?.sets).toBe(sets);
    expect(s?.rest).toEqual(base().rest);
  });
});
