import { describe, expect, it } from "vitest";
import { guessExerciseGroup, guessExerciseKind, matchesExerciseQuery } from "./exercise-guess";

describe("D186 · ejercicio propio: sugerencias y búsqueda", () => {
  it("propone el grupo por el nombre y no inventa si no lo reconoce", () => {
    expect(guessExerciseGroup("Remo en smith")).toBe("Espalda");
    expect(guessExerciseGroup("Remo ergómetro")).toBe("Cardio");
    expect(guessExerciseGroup("Press banca inclinado con mancuernas")).toBe("Pecho");
    expect(guessExerciseGroup("Elevaciones laterales en polea")).toBe("Hombros");
    expect(guessExerciseGroup("Curl martillo")).toBe("Brazos");
    expect(guessExerciseGroup("Sentadilla búlgara")).toBe("Piernas");
    expect(guessExerciseGroup("Hip thrust en máquina")).toBe("Glúteos");
    expect(guessExerciseGroup("Plancha lateral")).toBe("Core");
    expect(guessExerciseGroup("Máquina 7 del gym")).toBeNull();
  });
  it("propone cómo se registra", () => {
    expect(guessExerciseKind("Remo en smith")).toBe("load_reps");
    expect(guessExerciseKind("Plancha")).toBe("time");
    expect(guessExerciseKind("Dominadas")).toBe("bodyweight");
    expect(guessExerciseKind("Dominadas lastradas")).toBe("load_reps");
  });
  it("busca por palabras sin tildes: «remo smith» y «Remo en smith» encuentran «Remo en máquina Smith»", () => {
    expect(matchesExerciseQuery("Remo en máquina Smith", "Remo en smith")).toBe(true);
    expect(matchesExerciseQuery("Remo en máquina Smith", "remo smith")).toBe(true);
    expect(matchesExerciseQuery("Remo con barra", "remo smith")).toBe(false);
    expect(matchesExerciseQuery("Jalón al pecho", "jalon")).toBe(true);
    expect(matchesExerciseQuery("Cualquiera", "")).toBe(true);
  });
});
