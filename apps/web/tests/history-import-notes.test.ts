// Incidente 09/11: la vista previa mostraba decenas de aclaraciones repetidas y con jerga técnica («weight_kg es null»).
import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: { historyImport: {}, historyEntry: {}, exercise: {}, coachClient: {}, gymMember: {} } }));
vi.mock("@/server/ai/openai", () => ({ aiJson: vi.fn(), aiOn: vi.fn(() => false), aiModel: vi.fn(), aiFastModel: vi.fn() }));
import { cleanNotes } from "@/server/training/history-import";

describe("aclaraciones de la lectura", () => {
  it("quita la jerga técnica, las repetidas y deja como mucho seis", () => {
    const notes = [
      "Se interpretó 'ladrillos' como carga desconocida, por lo que weight_kg es null en esos ejercicios.",
      "Se agruparon series consecutivas del mismo ejercicio y peso en un solo set con reps en array.",
      "No se incluyó «Jpc en banco»: no tenía repeticiones legibles.",
      "No se incluyó «Jpc en banco»: no tenía repeticiones legibles.",
      ...Array.from({ length: 20 }, (_, i) => `Aclaración distinta número ${i + 1}.`),
    ];
    const out = cleanNotes(notes);
    expect(out).toHaveLength(6);
    expect(out[0]).toBe("No se incluyó «Jpc en banco»: no tenía repeticiones legibles.");
    expect(out.join(" ")).not.toMatch(/weight_kg|null|array|reps/);
  });
});
