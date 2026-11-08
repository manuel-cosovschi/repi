import { describe, expect, it } from "vitest";
import { exerciseSynonyms, guessExerciseGroup, guessExerciseKind, matchesExerciseQuery } from "./exercise-guess";

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

describe("ejercicios por tiempo · deducción y búsqueda", () => {
  it("«cinta caminadora» encuentra «Cinta (caminata)» (sinónimo) y no «Cinta (trote)»", () => {
    expect(matchesExerciseQuery("Cinta (caminata)", "cinta caminadora")).toBe(true);
    expect(matchesExerciseQuery("Cinta (caminata)", "Cinta Caminadora")).toBe(true);
    expect(matchesExerciseQuery("Cinta (caminata)", "caminadora")).toBe(true);
    expect(matchesExerciseQuery("Cinta (caminata)", "treadmill")).toBe(true);
    expect(matchesExerciseQuery("Cinta (trote)", "cinta caminadora")).toBe(false);
    expect(matchesExerciseQuery("Cinta (trote)", "cinta")).toBe(true);
    expect(matchesExerciseQuery("Bicicleta fija", "spinning")).toBe(true);
    expect(matchesExerciseQuery("Remo con barra", "remo indoor")).toBe(false);
    expect(exerciseSynonyms("cinta (CAMINATA)")).toContain("Cinta caminadora");
    expect(exerciseSynonyms("Press de banca")).toEqual([]);
  });
  it("cómo se registra: las actividades son por tiempo; la musculación parecida no", () => {
    expect(guessExerciseKind("Cinta caminadora")).toBe("time");
    expect(guessExerciseKind("Remo ergómetro")).toBe("time");
    expect(guessExerciseKind("Elíptico")).toBe("time");
    expect(guessExerciseKind("Soga")).toBe("time");
    expect(guessExerciseKind("Extensión de tríceps con soga")).toBe("load_reps"); // antes «soga» la volvía «por tiempo»
    expect(guessExerciseKind("Bicicleta abdominal")).toBe("bodyweight");
    expect(guessExerciseKind("Remo con barra")).toBe("load_reps");
  });
  it("grupo muscular del cardio", () => {
    expect(guessExerciseGroup("Cinta caminadora")).toBe("Cardio");
    expect(guessExerciseGroup("Assault bike")).toBe("Cardio");
    expect(guessExerciseGroup("Soga")).toBe("Cardio");
    expect(guessExerciseGroup("Bicicleta abdominal")).toBe("Core");
    expect(guessExerciseGroup("Extensión de tríceps con soga")).toBe("Brazos");
  });
});
