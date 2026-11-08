// Ejercicios por tiempo (07/11/2026): perfiles, catálogo, deducción por nombre, validación por actividad, texto y registro.
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MAX_SEC, ACTIVITY_PROFILES, METRICS_PROFILES, PROFILE_FIELDS, activityValuesText, catalogProfile, cleanSetMetrics, defaultsFor, guessMetricsProfile,
  isActivityProfile, isTimedRow, kindOfProfile, parseDistance, prescriptionText, profileFromKind, profileOf, sameMetrics, validateActivity,
} from "./activity";
import { EXERCISE_CATALOG, EXERCISE_GROUPS, exerciseKey } from "./exercise-catalog";
import { guessExerciseGroup, guessExerciseKind, guessProfile } from "./exercise-guess";
import { canSubstitute } from "./session-changes";
import { parseExerciseLine } from "./program-import";
import { emptyDetail, type ExerciseDetail } from "./prescription";
import { validateProgramDoc, type ProgramDoc } from "./training";

describe("perfiles de métricas", () => {
  it("las actividades son un subconjunto y se registran por tiempo", () => {
    expect(ACTIVITY_PROFILES.every((p) => (METRICS_PROFILES as readonly string[]).includes(p))).toBe(true);
    expect(isActivityProfile("treadmill")).toBe(true);
    expect(isActivityProfile("hold")).toBe(false);
    expect(isActivityProfile("strength")).toBe(false);
    expect(isActivityProfile("cualquiera")).toBe(false);
    expect(kindOfProfile("strength")).toBe("load_reps");
    expect(kindOfProfile("bodyweight")).toBe("bodyweight");
    expect(kindOfProfile("hold")).toBe("time");
    expect(kindOfProfile("treadmill")).toBe("time");
  });
  it("la cinta muestra sólo velocidad e inclinación además de la duración", () => {
    expect(PROFILE_FIELDS.treadmill).toEqual(["speedKmh", "incline"]);
    expect(PROFILE_FIELDS.duration).toEqual([]);
  });
  it("perfil por defecto según el tipo de registro", () => {
    expect(profileFromKind("load_reps")).toBe("strength");
    expect(profileFromKind("bodyweight")).toBe("bodyweight");
    expect(profileFromKind("time", "Core")).toBe("hold");
    expect(profileFromKind("time", "Cardio")).toBe("duration");
    expect(profileFromKind(null)).toBe("strength");
  });
});

describe("catálogo con perfil", () => {
  it("cada fila tiene un perfil válido y coherente con su tipo de registro", () => {
    for (const [name, group, kind, profile] of EXERCISE_CATALOG) {
      expect((METRICS_PROFILES as readonly string[]).includes(profile), name).toBe(true);
      expect(kindOfProfile(profile), name).toBe(kind);
      expect((EXERCISE_GROUPS as readonly string[]).includes(group)).toBe(true);
    }
  });
  it("las máquinas de cardio son actividades; plancha y movilidad, aguante", () => {
    expect(catalogProfile("Cinta (caminata)")).toBe("treadmill");
    expect(catalogProfile("Cinta (trote)")).toBe("treadmill");
    expect(catalogProfile("Bicicleta fija")).toBe("bike");
    expect(catalogProfile("Bicicleta de aire")).toBe("bike");
    expect(catalogProfile("Remo ergómetro")).toBe("rower");
    expect(catalogProfile("Elíptico")).toBe("elliptical");
    expect(catalogProfile("Escaladora")).toBe("stair");
    expect(catalogProfile("Soga (saltar la cuerda)")).toBe("duration");
    expect(catalogProfile("Jumping jacks")).toBe("duration");
    expect(catalogProfile("Plancha")).toBe("hold");
    expect(catalogProfile("Battle ropes")).toBe("hold"); // series de segundos, como hasta ahora
    expect(catalogProfile("Movilidad torácica")).toBe("hold");
    expect(catalogProfile("Press de banca")).toBe("strength");
    expect(catalogProfile("Flexiones")).toBe("bodyweight");
    expect(catalogProfile("Bicicleta abdominal")).toBe("bodyweight");
    expect(catalogProfile("remo ERGOMETRO")).toBe("rower"); // sin tildes ni mayúsculas
    expect(catalogProfile("Ejercicio inventado")).toBeNull();
  });
  it("todo el cardio del catálogo es una actividad", () => {
    const cardio = EXERCISE_CATALOG.filter(([, g]) => g === "Cardio");
    expect(cardio.length).toBeGreaterThanOrEqual(10);
    expect(cardio.every(([, , , p]) => isActivityProfile(p))).toBe(true);
  });
  it("«Cinta caminadora» es un sinónimo, no una fila duplicada", () => {
    expect(EXERCISE_CATALOG.some(([n]) => exerciseKey(n) === exerciseKey("Cinta caminadora"))).toBe(false);
    expect(EXERCISE_CATALOG.filter(([n]) => n.startsWith("Cinta")).map(([n]) => n)).toEqual(["Cinta (caminata)", "Cinta (trote)"]);
  });
});

describe("perfil de un ejercicio (profileOf)", () => {
  it("el perfil guardado manda", () => {
    expect(profileOf({ profile: "bike", name: "Cinta (caminata)", kind: "time" })).toBe("bike");
    expect(profileOf({ metricsProfile: "rower", name: "Máquina 7", kind: "load_reps" })).toBe("rower");
    expect(profileOf({ profile: "inválido", name: "Plancha", kind: "time" })).toBe("hold");
  });
  it("después el catálogo, después el nombre, después el tipo", () => {
    expect(profileOf({ name: "Cinta (caminata)", kind: "time", muscleGroup: "Cardio" })).toBe("treadmill");
    expect(profileOf({ name: "Bicicleta abdominal", kind: "bodyweight" })).toBe("bodyweight");
    // Una «Cinta caminadora» propia que se creó como «peso y repeticiones» (el editor arrancaba ahí) se configura como cinta.
    expect(profileOf({ name: "Cinta caminadora", kind: "load_reps", muscleGroup: "Cardio" })).toBe("treadmill");
    expect(profileOf({ name: "Bici de spinning", kind: "load_reps", muscleGroup: "Cardio" })).toBe("bike");
    // El aguante por nombre sólo si se registra por tiempo: «Plancha con chaleco» con peso sigue siendo con peso.
    expect(profileOf({ name: "Plancha con chaleco", kind: "load_reps" })).toBe("strength");
    expect(profileOf({ name: "Plancha con chaleco", kind: "time" })).toBe("hold");
    expect(profileOf({ name: "Máquina 7 del gym", kind: "time", muscleGroup: "Cardio" })).toBe("duration");
    expect(profileOf({ name: "Máquina 7 del gym", kind: "time", muscleGroup: "Core" })).toBe("hold");
    expect(profileOf({ name: "Remo con barra", kind: "load_reps" })).toBe("strength");
    expect(profileOf({ kind: "time", group: "Cardio" })).toBe("duration");
  });
  it("el nombre no contradice el tipo elegido: «Abdominales bicicleta» o «Abducción con cinta elástica» no se vuelven cardio", () => {
    // Ejercicios propios anteriores a 0052 (sin perfil guardado): la persona eligió «Peso corporal» o «Con peso».
    expect(profileOf({ name: "Abdominales bicicleta", kind: "bodyweight", muscleGroup: "Core" })).toBe("bodyweight");
    expect(profileOf({ name: "Crunch bicicleta", kind: "bodyweight", muscleGroup: "Core" })).toBe("bodyweight");
    expect(profileOf({ name: "Bike crunch", kind: "bodyweight", muscleGroup: "Core" })).toBe("bodyweight");
    expect(profileOf({ name: "Abducción con cinta elástica", kind: "load_reps", muscleGroup: "Glúteos" })).toBe("strength");
    // Aunque el nombre diga «bici», fuera de Cardio un ejercicio con peso sigue con peso.
    expect(profileOf({ name: "Bici de spinning", kind: "load_reps", muscleGroup: "Piernas" })).toBe("strength");
    // Sin tipo (no se sabe cómo se registra) o «por tiempo», el nombre decide.
    expect(profileOf({ name: "Bici de spinning" })).toBe("bike");
    expect(profileOf({ name: "Bici de spinning", kind: "time", muscleGroup: "Piernas" })).toBe("bike");
    // Los reemplazos siguen al tipo: «Abdominales bicicleta» se cambia por otro abdominal, no por la cinta.
    const orig = { id: "a", name: "Abdominales bicicleta", kind: "bodyweight" as const, muscleGroup: "Core" };
    expect(canSubstitute(orig, { id: "b", name: "Abdominales (crunch)", kind: "bodyweight", muscleGroup: "Core" })).toBe(true);
    expect(canSubstitute(orig, { id: "c", name: "Cinta (caminata)", kind: "time", muscleGroup: "Cardio" })).toBe(false);
  });
  it("sugerencias del alta y del importador para la musculación con nombre de máquina", () => {
    expect(guessExerciseGroup("Abdominales bicicleta")).toBe("Core");
    expect(guessExerciseGroup("Abducción con cinta elástica")).toBe("Glúteos");
    expect(guessExerciseKind("Abdominales bicicleta")).toBe("bodyweight");
    expect(guessExerciseKind("Abducción con cinta elástica")).toBe("load_reps");
    // Antes del arreglo, el importador marcaba las repeticiones como dudosas (lo tomaba por una bici).
    expect(parseExerciseLine("Abdominales bicicleta 3x20")?.issues).toEqual([]);
  });
  it("sugerencia al crear un ejercicio propio", () => {
    expect(guessMetricsProfile("Cinta caminadora")).toBe("treadmill");
    expect(guessMetricsProfile("Elíptica")).toBe("elliptical");
    expect(guessMetricsProfile("Stairmaster")).toBe("stair");
    expect(guessMetricsProfile("Plancha lateral con giro")).toBe("hold");
    expect(guessMetricsProfile("Remo gorila")).toBe("strength");
    expect(guessMetricsProfile("Dominadas", "bodyweight")).toBe("bodyweight");
  });
});

describe("deducción por nombre (guessProfile)", () => {
  it("reconoce las actividades", () => {
    const cases: [string, string | null][] = [
      ["Cinta caminadora", "treadmill"], ["Caminadora", "treadmill"], ["Treadmill", "treadmill"], ["Cinta (trote)", "treadmill"], ["Trotadora", "treadmill"],
      ["Bicicleta fija", "bike"], ["Bici", "bike"], ["Spinning", "bike"], ["Assault bike", "bike"], ["Cicloergómetro", "bike"],
      ["Remo ergómetro", "rower"], ["Remoergómetro", "rower"], ["Remo indoor", "rower"], ["Rower", "rower"], ["Concept 2", "rower"],
      ["Elíptico", "elliptical"], ["Elíptica", "elliptical"], ["Escaladora", "stair"], ["Stair climber", "stair"], ["Stepper", "stair"],
      ["Soga", "duration"], ["Saltar la soga", "duration"], ["Jumping jacks", "duration"], ["Skierg", "duration"], ["Trote", "duration"],
      ["Plancha", "hold"], ["Wall sit", "hold"], ["Sentadilla isométrica", "hold"],
    ];
    for (const [n, p] of cases) expect(guessProfile(n), n).toBe(p);
  });
  it("no confunde la musculación con nombre parecido", () => {
    for (const n of ["Remo con barra", "Remo en máquina", "Remo", "Bicicleta abdominal", "Extensión de tríceps con soga", "Remo con soga en polea", "Caminata lateral con banda", "Step up al cajón", "Curl de bíceps", "Press de banca",
      "Abdominales bicicleta", "Crunch bicicleta", "Bike crunch", "Bicycle crunch", "Abducción con cinta elástica", "Sentadilla con cinta", "Remo con banda elástica"])
      expect(guessProfile(n), n).toBeNull();
    expect(guessProfile("Plancha con banda")).toBe("hold"); // el aguante no es cardio: sigue valiendo
    expect(guessProfile("Salto con soga")).toBe("duration");
    // «Banda caminadora» es la cinta, no una banda elástica.
    expect(guessProfile("Banda caminadora")).toBe("treadmill");
    expect(guessExerciseGroup("Banda caminadora")).toBe("Cardio");
  });
});

describe("validateActivity", () => {
  it("cinta: duración, velocidad e inclinación; descarta lo que no es de la cinta", () => {
    expect(validateActivity({ profile: "treadmill", speedKmh: "5,5", incline: 3, level: 8 }, { reps: "10 min" })).toEqual({ ok: true, activity: { profile: "treadmill", speedKmh: 5.5, incline: 3 } });
    // Redondea al paso (0,1 km/h; 0,5 de inclinación) y la inclinación puede ser negativa.
    expect(validateActivity({ profile: "treadmill", speedKmh: 5.04, incline: -1.2 })).toEqual({ ok: true, activity: { profile: "treadmill", speedKmh: 5, incline: -1 } });
    // Sin velocidad ni inclinación también vale (sólo la duración).
    expect(validateActivity({ profile: "treadmill", speedKmh: null, incline: "" }, { reps: "600 s" })).toEqual({ ok: true, activity: { profile: "treadmill" } });
  });
  it("rangos con mensajes claros", () => {
    expect(validateActivity({ profile: "treadmill", speedKmh: 30 })).toEqual({ ok: false, error: "La velocidad va de 0,5 a 25 km/h." });
    expect(validateActivity({ profile: "treadmill", incline: 41 })).toMatchObject({ ok: false, error: expect.stringContaining("sin %") });
    expect(validateActivity({ profile: "treadmill", incline: "3%" })).toMatchObject({ ok: false });
    expect(validateActivity({ profile: "bike", level: 0 })).toEqual({ ok: false, error: "El nivel va de 1 a 30." });
    expect(validateActivity({ profile: "bike", cadenceRpm: 300 })).toMatchObject({ ok: false });
    expect(validateActivity({ profile: "rower", pace500Sec: 30 })).toMatchObject({ ok: false });
    expect(validateActivity({ profile: "hold" })).toMatchObject({ ok: false });
    expect(validateActivity(null)).toMatchObject({ ok: false });
  });
  it("la duración: un tiempo de hasta 4 horas", () => {
    expect(validateActivity({ profile: "bike" }, { reps: "240 min" }).ok).toBe(true);
    expect(validateActivity({ profile: "bike" }, { reps: "241 min" })).toEqual({ ok: false, error: "La duración va de 1 segundo a 4 horas." });
    expect(validateActivity({ profile: "treadmill" }, { reps: "10-12" })).toEqual({ ok: false, error: "Indicá la duración en minutos (por ejemplo, 10 min)." });
    expect(validateActivity({ profile: "treadmill" }, { reps: "" })).toMatchObject({ ok: false });
  });
  it("remo: por duración o por distancia («500 m» son metros, no minutos)", () => {
    expect(validateActivity({ profile: "rower", pace500Sec: 125 }, { reps: "500 m" })).toEqual({ ok: true, activity: { profile: "rower", pace500Sec: 125, distanceM: 500 } });
    expect(validateActivity({ profile: "rower" }, { reps: "2 km" })).toEqual({ ok: true, activity: { profile: "rower", distanceM: 2000 } });
    expect(validateActivity({ profile: "rower", level: 5 }, { reps: "20 min" })).toEqual({ ok: true, activity: { profile: "rower", level: 5 } });
    expect(validateActivity({ profile: "rower" }, { reps: "al fallo" })).toMatchObject({ ok: false, error: expect.stringContaining("distancia") });
    expect(validateActivity({ profile: "treadmill" }, { reps: "2 km" })).toMatchObject({ ok: false });
  });
  it("distancias escritas", () => {
    expect(parseDistance("500 m")).toBe(500);
    expect(parseDistance("1,5 km")).toBe(1500);
    expect(parseDistance("750 metros")).toBe(750);
    expect(parseDistance("20 m")).toBeNull(); // «20 m» = 20 minutos
    expect(parseDistance("5 km/h")).toBeNull();
    expect(parseDistance("10")).toBeNull();
  });
});

describe("isTimedRow: el predicado único de «por tiempo»", () => {
  it("segundos, minutos y actividades", () => {
    expect(isTimedRow({ reps: "40 s" })).toBe(true);
    expect(isTimedRow({ reps: "10 min" })).toBe(true);
    expect(isTimedRow({ reps: "1:30" })).toBe(true);
    expect(isTimedRow({ reps: "10-12" })).toBe(false);
    expect(isTimedRow({ reps: "al fallo" })).toBe(false);
    expect(isTimedRow({ reps: null })).toBe(false);
    // Con actividad cuenta como tiempo aunque diga «500 m» (remo por distancia).
    expect(isTimedRow({ reps: "500 m", detail: { activity: { profile: "rower", distanceM: 500 } } })).toBe(true);
    expect(isTimedRow({ reps: "10-12", detail: { activity: { profile: "nada" } } })).toBe(false);
    expect(isTimedRow({ reps: "10", detail: null })).toBe(false);
  });
});

describe("valores por defecto al agregar", () => {
  it("cada perfil propone algo que el validador del programa acepta", () => {
    for (const p of METRICS_PROFILES) {
      const d = defaultsFor(p);
      const detail: ExerciseDetail | null = d.activity ? { ...emptyDetail(), activity: d.activity } : null;
      const doc: ProgramDoc = { name: "P", weeks: 4, note: "", days: [{ name: "Día 1", exercises: [{ exerciseId: "x", name: "E", sets: d.sets, reps: d.reps, rir: d.rir, restSec: d.restSec, detail }] }] };
      const v = validateProgramDoc(doc);
      expect(v.ok, p).toBe(true);
      if (v.ok) expect(v.doc.days[0].exercises[0].detail?.activity ?? null, p).toEqual(d.activity);
    }
  });
  it("cinta: un bloque de 10 minutos sin RIR ni descanso (no 3 × 10-12 con RIR 2)", () => {
    expect(defaultsFor("treadmill")).toEqual({ sets: 1, reps: "10 min", rir: null, restSec: 0, activity: { profile: "treadmill", speedKmh: 5, incline: 0 } });
    expect(defaultsFor("hold")).toMatchObject({ sets: 3, reps: "40 s", rir: null });
    expect(defaultsFor("strength")).toMatchObject({ sets: 3, rir: 2, activity: null });
  });
});

describe("prescriptionText", () => {
  const act = (activity: ExerciseDetail["activity"]): ExerciseDetail => ({ ...emptyDetail(), activity });
  it("el ejemplo del titular: «10 min · 5 km/h · incl. 3»", () => {
    expect(prescriptionText({ sets: 1, reps: "10 min", detail: act({ profile: "treadmill", speedKmh: 5, incline: 3 }) })).toBe("10 min · 5 km/h · incl. 3");
    expect(prescriptionText({ sets: 1, reps: "600 s", detail: act({ profile: "treadmill", speedKmh: 5.5, incline: 2.5 }) })).toBe("10 min · 5,5 km/h · incl. 2,5");
    expect(prescriptionText({ sets: 1, reps: "10 min", detail: act({ profile: "treadmill" }) })).toBe("10 min");
  });
  it("otras actividades con sus campos", () => {
    expect(prescriptionText({ sets: 3, reps: "5 min", detail: act({ profile: "bike", level: 8, cadenceRpm: 90 }) })).toBe("3 × 5 min · nivel 8 · 90 rpm");
    expect(prescriptionText({ sets: 1, reps: "500 m", detail: act({ profile: "rower", distanceM: 500, pace500Sec: 125 }) })).toBe("500 m · 2:05 /500 m");
    expect(prescriptionText({ sets: 1, reps: "20 min", detail: act({ profile: "rower", distanceM: 4000, level: 5 }) })).toBe("20 min · nivel 5 · 4000 m");
    expect(prescriptionText({ sets: 1, reps: "5 min", detail: act({ profile: "duration" }) })).toBe("5 min");
  });
  it("musculación y aguante como siempre", () => {
    expect(prescriptionText({ sets: 3, reps: "8-12", rir: 2 })).toBe("3 × 8-12");
    expect(prescriptionText({ sets: 3, reps: "8-12", rir: 2 }, { rir: true })).toBe("3 × 8-12 · RIR 2");
    expect(prescriptionText({ sets: 3, reps: "40 s", rir: null }, { rir: true })).toBe("3 × 40 s");
    // Con un drop set (1 serie + 2 drops = 3 filas), se cuenta la serie principal.
    const plan = { ...emptyDetail(), technique: "drop_set" as const, setPlan: [
      { kind: "work" as const, reps: "10", weightKg: 50, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, block: 0, stage: 0 },
      { kind: "drop" as const, reps: "8", weightKg: 40, pct1rm: null, rir: null, rpe: null, restSec: 0, note: null, block: 0, stage: 1 },
      { kind: "drop" as const, reps: "8", weightKg: 30, pct1rm: null, rir: null, rpe: null, restSec: 0, note: null, block: 0, stage: 2 },
    ] };
    expect(prescriptionText({ sets: 3, reps: "10", detail: plan })).toBe("1 × 10");
  });
});

describe("registro: cleanSetMetrics y sameMetrics", () => {
  it("guarda sólo los campos del perfil, en rango y al paso", () => {
    expect(cleanSetMetrics("treadmill", { speedKmh: 5.55, incline: "4", level: 3, junk: 1 })).toEqual({ ok: true, metrics: { speedKmh: 5.6, incline: 4 } });
    expect(cleanSetMetrics("bike", { level: 12, cadenceRpm: 85.4 })).toEqual({ ok: true, metrics: { level: 12, cadenceRpm: 85 } });
    expect(cleanSetMetrics("rower", { distanceM: 2010.4, pace500Sec: 121 })).toEqual({ ok: true, metrics: { distanceM: 2010, pace500Sec: 121 } });
  });
  it("vacío o fuera de una actividad = sin métricas", () => {
    expect(cleanSetMetrics("treadmill", {})).toEqual({ ok: true, metrics: null });
    expect(cleanSetMetrics("treadmill", null)).toEqual({ ok: true, metrics: null });
    expect(cleanSetMetrics("strength", { speedKmh: 5 })).toEqual({ ok: true, metrics: null });
    expect(cleanSetMetrics(null, { speedKmh: 5 })).toEqual({ ok: true, metrics: null });
    expect(cleanSetMetrics("duration", { speedKmh: 5 })).toEqual({ ok: true, metrics: null });
  });
  it("rechaza valores fuera de rango o con otro formato", () => {
    expect(cleanSetMetrics("treadmill", { speedKmh: 26 })).toEqual({ ok: false, field: "speedKmh", error: "La velocidad va de 0,5 a 25 km/h." });
    expect(cleanSetMetrics("treadmill", { incline: "mucho" })).toMatchObject({ ok: false, field: "incline" });
    expect(cleanSetMetrics("treadmill", [5])).toMatchObject({ ok: false });
    expect(cleanSetMetrics("treadmill", "5")).toMatchObject({ ok: false });
  });
  it("comparación sin importar el orden; vacío = null", () => {
    expect(sameMetrics({ speedKmh: 5, incline: 3 }, { incline: 3, speedKmh: 5 })).toBe(true);
    expect(sameMetrics(null, {})).toBe(true);
    expect(sameMetrics(undefined, { speedKmh: null })).toBe(true);
    expect(sameMetrics({ speedKmh: 5 }, { speedKmh: 5.5 })).toBe(false);
    expect(sameMetrics({ speedKmh: 5 }, null)).toBe(false);
  });
  it("texto de los valores registrados y tope de 4 horas", () => {
    expect(activityValuesText({ incline: 4, speedKmh: 5.5 })).toBe("5,5 km/h · incl. 4");
    expect(activityValuesText(null)).toBe("");
    expect(ACTIVITY_MAX_SEC).toBe(14400);
  });
});
