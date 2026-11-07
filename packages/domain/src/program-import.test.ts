// SI2 · casos sintéticos del motor de importación (datos ficticios). Verifican los valores reales del resultado.
import { describe, expect, it } from "vitest";
import { deterministicEnough, fromAiExercise, type AiExercise, importedDetail, importIssueCount, parseExerciseLine, parseRoutineSheet, parseRoutineText, type ImportExercise } from "./program-import";
import { makeExerciseMatcher, rankExerciseCandidates, variantConflict } from "./exercise-match";
import { EXERCISE_CATALOG } from "./exercise-catalog";

const ex = (line: string, hint = {}) => parseExerciseLine(line, hint)!;
const days = (text: string) => parseRoutineText(text).variants[0].days;
const flat = (text: string) => days(text).flatMap((d) => d.exercises);
const pick = (e: Pick<ImportExercise, "written" | "sets" | "reps" | "weightKg">) => ({ written: e.written, sets: e.sets, reps: e.reps, weightKg: e.weightKg });

describe("SI2 · un renglón", () => {
  it("series × repeticiones y carga en sus formatos habituales", () => {
    expect(pick(ex("Press banca — 4 × 10 — 60 kg"))).toEqual({ written: "Press banca", sets: 4, reps: "10", weightKg: 60 });
    expect(pick(ex("Sentadilla 4x8-10 @ 80kg"))).toEqual({ written: "Sentadilla", sets: 4, reps: "8-10", weightKg: 80 });
    expect(pick(ex("Remo c/barra 3x12 40 kg"))).toEqual({ written: "Remo c/barra", sets: 3, reps: "12", weightKg: 40 });
    expect(pick(ex("Press militar 4 series de 10 repeticiones con 30 kg"))).toEqual({ written: "Press militar", sets: 4, reps: "10", weightKg: 30 });
    expect(pick(ex("Press banca 4x10 60"))).toEqual({ written: "Press banca", sets: 4, reps: "10", weightKg: 60 });
    expect(pick(ex("Curl 3x12 22,5kg"))).toEqual({ written: "Curl", sets: 3, reps: "12", weightKg: 22.5 });
    expect(pick(ex("4x10 Sentadilla 60 kg"))).toEqual({ written: "Sentadilla", sets: 4, reps: "10", weightKg: 60 });
  });

  it("caso 4 · cero datos inventados: sin series ni repeticiones quedan vacías y marcadas", () => {
    expect(pick(ex("Press banca"))).toEqual({ written: "Press banca", sets: null, reps: null, weightKg: null });
    const [x] = flat("Día A\nPress banca\nRemo con barra 3x12");
    expect(pick(x)).toEqual({ written: "Press banca", sets: null, reps: null, weightKg: null });
    expect(x.issues.map((i) => [i.field, i.kind])).toEqual([["sets", "missing"], ["reps", "missing"]]);
  });

  it("caso 9 · cargas y repeticiones distintas por serie se conservan serie por serie", () => {
    const e = ex("Press inclinado 3 x 12/10/8 30/35/40 kg");
    expect(e.sets).toBe(3);
    expect(e.perSet).toEqual([{ reps: "12", weightKg: 30 }, { reps: "10", weightKg: 35 }, { reps: "8", weightKg: 40 }]);
    expect(e.reps).toBe("12-10-8");
    expect(e.weightKg).toBeNull();
    const d = importedDetail({ sets: 3, reps: e.reps!, weightKg: null, perSet: e.perSet, rir: null, rpe: null, tempo: null })!;
    expect(d.setPlan!.map((s) => [s.reps, s.weightKg])).toEqual([["12", 30], ["10", 35], ["8", 40]]);
    // Lista de repeticiones sin «x»: tantas series como números.
    expect(pick(ex("Press plano 5;5;5;4 105kg"))).toEqual({ written: "Press plano", sets: 4, reps: "5-5-5-4", weightKg: 105 });
    // Misma carga en todas: no hace falta plan por serie.
    const same = ex("Prensa 3x12-10-8 100kg");
    expect(same.perSet).toEqual([{ reps: "12", weightKg: 100 }, { reps: "10", weightKg: 100 }, { reps: "8", weightKg: 100 }]);
  });

  it("caso 8 · libras a kg con la conversión exacta y aviso", () => {
    const e = ex("Peso muerto 5x5 225 lb");
    expect(e.weightKg).toBe(102.06);
    expect(e.unit).toBe("lb");
    expect(e.issues).toContainEqual(expect.objectContaining({ field: "weight", kind: "info" }));
    // Un archivo en libras: el número suelto se toma en libras pero se marca para revisar.
    const loose = ex("Sentadilla 3x8 135", { lb: true });
    expect(loose.weightKg).toBe(61.23);
    expect(loose.issues).toContainEqual(expect.objectContaining({ field: "weight", kind: "unclear" }));
  });

  it("descanso, RIR, RPE, tempo y notas técnicas", () => {
    const e = ex("Sentadilla 4x6 100kg RIR 2 desc 2 min tempo 3-1-1-0 bajar controlado");
    expect([e.sets, e.reps, e.weightKg, e.rir, e.restSec, e.tempo]).toEqual([4, "6", 100, 2, 120, "3-1-1-0"]);
    expect(e.note).toContain("bajar controlado");
    expect(ex("Remo 3x10 descanso 1'30").restSec).toBe(90);
    expect(ex("Hip thrust 3x10 RPE 8").rpe).toBe(8);
    const d = importedDetail({ sets: 4, reps: "6", weightKg: 100, perSet: null, rir: 2, rpe: null, tempo: "3-1-1-0" })!;
    expect(d.tempo).toBe("3-1-1-0");
    expect(d.setPlan!.every((s) => s.rir === 2 && s.weightKg === 100)).toBe(true);
  });

  it("carga por lado no se toma como total; cargas que no son kg quedan en la nota", () => {
    const side = ex("Hip thrust 4x10 20 kg por lado");
    expect(side.weightKg).toBeNull();
    expect(side.issues).toContainEqual(expect.objectContaining({ field: "weight", kind: "unclear" }));
    const plate = ex("Jalón 3x12 placa 7");
    expect(plate.weightKg).toBeNull();
    expect(plate.note).toContain("placa 7");
  });

  it("caso 17 · lo ilegible se dice, no se completa", () => {
    const e = ex("Press inclinado 4x?? 30kg");
    expect(e.sets).toBe(4);
    expect(e.reps).toBeNull();
    expect(e.issues).toContainEqual(expect.objectContaining({ field: "reps", kind: "unclear" }));
  });

  it("caso 13 · drop set en la última serie: se detecta el método sin cambiar series ni cargas", () => {
    const e = ex("Elevaciones laterales 3x15 10kg drop set en la última");
    expect([e.sets, e.reps, e.weightKg]).toEqual([3, "15", 10]);
    expect(e.technique).toMatch(/drop set/i);
  });

  it("duración y distancia: un bloque", () => {
    expect(pick(ex("Cinta 10 min"))).toEqual({ written: "Cinta", sets: 1, reps: "10 min", weightKg: null });
    expect(pick(ex("Plancha 3x30s"))).toEqual({ written: "Plancha", sets: 3, reps: "30 s", weightKg: null });
    expect(pick(ex("Dominadas 4 x al fallo"))).toEqual({ written: "Dominadas", sets: 4, reps: "al fallo", weightKg: null });
  });
});

describe("SI2 · textos completos", () => {
  it("caso 1 · rutina sencilla de tres días", () => {
    const d = days("Día 1 - Pecho\nPress banca 4x10 60kg\nAperturas 3x12 14 kg\n\nDía 2 - Espalda\nDominadas 4x8\nRemo con barra 4x10 50kg\n\nDía 3 - Piernas\nSentadilla 4x8 80kg\nPrensa 3x12 120kg");
    expect(d.map((x) => [x.name, x.exercises.length])).toEqual([["Día 1 - Pecho", 2], ["Día 2 - Espalda", 2], ["Día 3 - Piernas", 2]]);
    expect(importIssueCount(d)).toEqual({ missing: 0, unclear: 0 });
  });

  it("caso 2 · rutina de seis días con días de la semana y grupos musculares", () => {
    const text = ["LUNES: pecho", "Press banca 4x8", "MARTES: espalda", "Remo 4x10", "MIÉRCOLES: piernas", "Sentadilla 5x5", "JUEVES: hombros", "Press militar 4x10",
      "VIERNES: brazos", "Curl con barra 3x12", "SÁBADO: full body", "Peso muerto 3x5"].join("\n");
    const d = days(text);
    expect(d).toHaveLength(6);
    expect(d[0].name).toBe("LUNES: pecho");
    expect(d[5].exercises[0]).toMatchObject({ written: "Peso muerto", sets: 3, reps: "5" });
  });

  it("caso 4 · captura de WhatsApp pegada: sin prefijos, negritas ni emojis", () => {
    const text = "[12/03/26, 10:15:22] Profe Juan: *DÍA A* 💪\n[12/03/26, 10:15:40] Profe Juan: 1. Sentadilla 4x8 60kg\n[12/03/26, 10:16:01] Profe Juan: 2. Press banca 3x10 40kg ✅\n12/3/26 10:17 - Profe Juan: _Día B_\n12/3/26 10:17 - Profe Juan: Remo con barra 3x12";
    const d = days(text);
    expect(d.map((x) => x.name)).toEqual(["DÍA A", "Día B"]);
    expect(d[0].exercises.map(pick)).toEqual([{ written: "Sentadilla", sets: 4, reps: "8", weightKg: 60 }, { written: "Press banca", sets: 3, reps: "10", weightKg: 40 }]);
  });

  it("caso 7 · abreviaturas y continuación en el renglón siguiente", () => {
    const e = flat("Día A\nPress plano (105kg)\n5;5;5;4\nRemo c/ manc 3x12 c/u 20kg\nExt. cuádriceps 3x15");
    expect(pick(e[0])).toEqual({ written: "Press plano", sets: 4, reps: "5-5-5-4", weightKg: 105 });
    expect(e[1]).toMatchObject({ sets: 3, reps: "12", weightKg: 20 });
    expect(e[2]).toMatchObject({ written: "Ext. cuádriceps", sets: 3, reps: "15" });
  });

  it("caso 14 · superserie A1/A2 y caso 15 · circuito con vueltas", () => {
    const e = flat("Día A\nA1. Press banca 4x10\nA2) Remo con barra 4x10\nCircuito x3:\nBurpees 10\nSentadilla con salto 15 reps\nPlancha 30 s");
    expect(e.slice(0, 2).map((x) => [x.written, x.group, x.groupKind])).toEqual([["Press banca", "A1", "superset"], ["Remo con barra", "A2", "superset"]]);
    expect(e.slice(2).map((x) => [x.written, x.group, x.groupKind, x.rounds])).toEqual([["Burpees", "B1", "circuit", 3], ["Sentadilla con salto", "B2", "circuit", 3], ["Plancha", "B3", "circuit", 3]]);
  });

  it("caso 16 · EMOM y AMRAP se transcriben con su texto para aplicarlos como método", () => {
    const e = flat("Día A\nKettlebell swing EMOM 10 min 15 reps\nBurpees AMRAP 8 min");
    expect(e[0].technique).toMatch(/emom/i);
    expect(e[1].technique).toMatch(/amrap/i);
  });

  it("caso 18 · varios programas en un documento: uno por variante para elegir", () => {
    const p = parseRoutineText("Programa fuerza\nDía 1\nSentadilla 5x5 100kg\nDía 2\nPress banca 5x5 80kg\n\nPrograma hipertrofia\nDía 1\nPrensa 4x12\nDía 2\nRemo 4x12");
    expect(p.variants.map((v) => [v.name, v.days.length])).toEqual([["Programa fuerza", 2], ["Programa hipertrofia", 2]]);
  });

  it("semanas distintas: cada semana es una variante (no se mezclan)", () => {
    const p = parseRoutineText("Semana 1\nDía A\nSentadilla 3x10 60kg\nSemana 2\nDía A\nSentadilla 3x8 65kg");
    expect(p.variants.map((v) => v.name)).toEqual(["Semana 1", "Semana 2"]);
    expect(p.variants[1].days[0].exercises[0].weightKg).toBe(65);
  });

  it("indicaciones generales y renglones que no se entienden quedan a la vista", () => {
    const p = parseRoutineText("Día A\nSentadilla 4x8\nNota: tomar agua entre series y respetar los descansos indicados\n%%%% 12 ###\n%%%% ### ilegible ###");
    expect(p.notes[0]).toMatch(/^Nota/);
    expect(p.unread).toEqual(["%%%% 12 ###", "%%%% ### ilegible ###"]);
    expect(deterministicEnough(p)).toBe(false);
    expect(deterministicEnough(parseRoutineText("Día A\nSentadilla 4x8\nPress banca 3x10"))).toBe(true);
  });

  it("sin encabezados: un solo día «Mi rutina»; bloques separados por renglones en blanco son días", () => {
    expect(days("Sentadilla 4x8\nPress banca 3x10").map((d) => d.name)).toEqual(["Mi rutina"]);
    const d = days("Sentadilla 4x8\nPrensa 3x10\nEstocadas 3x12\n\nPress banca 4x8\nAperturas 3x12\nFondos 3x10");
    expect(d.map((x) => [x.name, x.exercises.length])).toEqual([["Día 1", 3], ["Día 2", 3]]);
  });

  it("caso 21 · un día con muchos ejercicios no pierde ninguno en el motor", () => {
    const text = `Día A\n${Array.from({ length: 25 }, (_, i) => `Ejercicio ${String.fromCharCode(65 + i)} 3x10`).join("\n")}`;
    expect(flat(text)).toHaveLength(25);
  });
});

describe("SI2 · planillas", () => {
  it("columnas en español con valores por serie, libras en el encabezado y descanso", () => {
    const csv = "Día;Ejercicio;Series;Reps;Peso (lb);Descanso;Notas\nDía A;Press banca;3;12/10/8;95/105/115;90;\n;Remo con barra;3;10;;60;agarre prono\nDía B;Sentadilla;;;;;";
    const p = parseRoutineSheet(csv)!;
    const [a, b] = p.variants[0].days;
    expect(a.exercises[0].perSet).toEqual([{ reps: "12", weightKg: 43.09 }, { reps: "10", weightKg: 47.63 }, { reps: "8", weightKg: 52.16 }]);
    expect(a.exercises[0].restSec).toBe(90);
    expect(a.exercises[1]).toMatchObject({ sets: 3, reps: "10", weightKg: null, restSec: 60, note: "agarre prono" });
    expect(b.exercises[0]).toMatchObject({ written: "Sentadilla", sets: null, reps: null });
    expect(importIssueCount(p.variants[0].days).missing).toBe(2);
  });

  it("caso 6 · Excel con varias hojas (una por día) y encabezado que no está en la primera fila", () => {
    const text = "Hoja: Día 1\nRUTINA DE MARTÍN\nExercise,Sets,Reps,Weight\nBench press,4,8,60\nLat pulldown,3,12,45\n\nHoja: Día 2\nExercise,Sets,Reps,Weight\nSquat,5,5,90";
    const p = parseRoutineSheet(text)!;
    expect(p.variants[0].days.map((d) => [d.name, d.exercises.map((e) => e.written)])).toEqual([["Día 1", ["Bench press", "Lat pulldown"]], ["Día 2", ["Squat"]]]);
    expect(p.variants[0].days[1].exercises[0]).toMatchObject({ sets: 5, reps: "5", weightKg: 90 });
  });

  it("hojas por semana: cada una es una variante", () => {
    const p = parseRoutineSheet("Hoja: Semana 1\nDía,Ejercicio,Series,Reps\nA,Sentadilla,3,10\n\nHoja: Semana 2\nDía,Ejercicio,Series,Reps\nA,Sentadilla,3,8")!;
    expect(p.variants.map((v) => v.name)).toEqual(["Semana 1", "Semana 2"]);
  });

  it("columnas «Serie 1, Serie 2…» con repeticiones y carga por celda", () => {
    const p = parseRoutineSheet("Ejercicio,Serie 1,Serie 2,Serie 3\nPress banca,12 x 40 kg,10 x 45 kg,8 x 50 kg")!;
    expect(p.variants[0].days[0].exercises[0]).toMatchObject({ sets: 3, perSet: [{ reps: "12", weightKg: 40 }, { reps: "10", weightKg: 45 }, { reps: "8", weightKg: 50 }] });
  });

  it("planilla sin columnas reconocibles: se lee como texto, fila por fila", () => {
    const p = parseRoutineSheet("DÍA 1,,,\nSentadilla,4,10,60\nPrensa,3,12,100\nDÍA 2,,,\nPress banca,4,8,50")!;
    const d = p.variants[0].days;
    expect(d.map((x) => x.name)).toEqual(["DÍA 1", "DÍA 2"]);
    expect(d[0].exercises[0]).toMatchObject({ written: "Sentadilla", sets: 4, reps: "10", weightKg: 60 });
  });
});

describe("SI2 · lo que transcribe la IA pasa por las mismas reglas", () => {
  const base: AiExercise = { name: "", group: "", section: "", sets: null, reps: null, set_reps: [], set_weights: [], weight: null, unit: null, rest_sec: null, rir: null, rpe: null, tempo: null, technique: "", note: "", unclear: [], source: "" };
  it("sin series ni repeticiones no se completan; libras por serie se convierten", () => {
    const a = fromAiExercise({ ...base, name: "Press banca", source: "Press banca" });
    expect([a.sets, a.reps]).toEqual([null, null]);
    expect(a.issues.map((i) => i.kind)).toEqual(["missing", "missing"]);
    const b = fromAiExercise({ ...base, name: "A1 Sentadilla", sets: 3, set_reps: ["10", "8", "6"], set_weights: [135, 155, 175], unit: "lb", source: "A1 Sentadilla 10/8/6 135/155/175 lb" });
    expect(b.group).toBe("A1");
    expect(b.written).toBe("Sentadilla");
    expect(b.perSet).toEqual([{ reps: "10", weightKg: 61.23 }, { reps: "8", weightKg: 70.31 }, { reps: "6", weightKg: 79.38 }]);
  });
  it("series sin números en la evidencia y campos dudosos quedan para confirmar", () => {
    const a = fromAiExercise({ ...base, name: "Remo", sets: 3, reps: "10", source: "Remo", unclear: ["reps"] });
    expect(a.issues.filter((i) => i.kind === "unclear").map((i) => i.field).sort()).toEqual(["reps", "sets"]);
  });
});

describe("SI2 · emparejar con la biblioteca", () => {
  const lib = EXERCISE_CATALOG.map(([name], i) => ({ id: `e${i}`, name }));
  const match = makeExerciseMatcher(lib);
  const name = (w: string) => match(w)?.name ?? null;
  it("caso 5 · sinónimos, abreviaturas e inglés", () => {
    expect(name("Press banca")).toBe("Press de banca");
    expect(name("Lat pulldown")).toBe("Jalón al pecho");
    expect(name("Remo c/barra")).toBe("Remo con barra");
    expect(name("Bench press")).toBe("Press de banca");
    expect(name("Squat")).toBe("Sentadilla");
    expect(name("Elevación lateral")).toBe("Elevaciones laterales");
    expect(name("Press inclinado c/ mancuernas")).toBe("Press inclinado mancuernas");
    expect(name("Sillón de cuádriceps")).toBe("Extensión de cuádriceps");
    expect(name("Camilla de isquios")).toBe("Curl femoral acostado");
    expect(name("Aperturas en máquina")).toBe("Aperturas en máquina (pec deck)"); // el nombre sin el paréntesis
    expect(name("Pec deck")).toBe("Aperturas en máquina (pec deck)");
    expect(name("Cinta")).toBeNull(); // «Cinta (caminata)» y «Cinta (trote)»: ambiguo, no se elige
  });
  it("no confunde variantes distintas", () => {
    expect(variantConflict("Press inclinado", "Press de banca")).toBe(true);
    expect(variantConflict("Sentadilla smith", "Sentadilla")).toBe(true);
    expect(variantConflict("Remo con barra", "Remo en máquina")).toBe(true);
    expect(variantConflict("Curl femoral sentado", "Curl femoral acostado")).toBe(true);
    expect(variantConflict("Press banca con barra", "Press de banca")).toBe(false);
    expect(variantConflict("Remo", "Remo en máquina", true)).toBe(true); // lo que propone la IA no agrega variantes
    expect(name("Sentadilla smith")).toBe("Sentadilla en multipower");
    expect(name("Press inclinado")).toBeNull();
  });
  it("caso 11 · nombre ambiguo: alternativas relevantes, sin elegir por la persona", () => {
    const alts = rankExerciseCandidates("Press inclinado", lib).map((x) => x.name);
    expect(alts).toEqual(expect.arrayContaining(["Press inclinado con barra", "Press inclinado mancuernas"]));
    expect(alts).not.toContain("Press de banca");
    const fem = rankExerciseCandidates("Femoral", lib).map((x) => x.name);
    expect(fem).toEqual(expect.arrayContaining(["Curl femoral sentado", "Curl femoral acostado"]));
    expect(rankExerciseCandidates("Curl femoral sentado", lib).map((x) => x.name)).not.toContain("Curl femoral acostado");
    expect(rankExerciseCandidates("Aperturas máquina inclinada", lib).map((x) => x.name)).not.toContain("Aductores en máquina");
  });
  it("caso 12 · ejercicio ausente de la biblioteca: sin coincidencia ni alternativas forzadas", () => {
    expect(match("Sentadilla con cadenas y bandas elásticas al pecho")).toBeNull();
    expect(rankExerciseCandidates("Zercher carry", lib)).toEqual([]);
  });
});

describe("SI2 · cardio: ejercicios por tiempo", () => {
  const act = (line: string) => { const e = ex(line); return { written: e.written, sets: e.sets, reps: e.reps, weightKg: e.weightKg, activity: e.activity ?? null }; };
  it("«Cinta 10 min vel 5 incl 3»: duración, velocidad e inclinación; ningún número se toma como carga", () => {
    expect(act("Cinta 10 min vel 5 incl 3")).toEqual({ written: "Cinta", sets: 1, reps: "10 min", weightKg: null, activity: { profile: "treadmill", speedKmh: 5, incline: 3 } });
    expect(act("Cinta caminadora 10' vel 5 incl 3%")).toEqual({ written: "Cinta caminadora", sets: 1, reps: "10 min", weightKg: null, activity: { profile: "treadmill", speedKmh: 5, incline: 3 } });
    // Con «vel» o «incl» antes de la duración, el nombre se corta igual.
    expect(act("Cinta incl 3 vel 5 10 min")).toEqual({ written: "Cinta", sets: 1, reps: "10 min", weightKg: null, activity: { profile: "treadmill", speedKmh: 5, incline: 3 } });
    expect(act("Cinta 10 min")).toEqual({ written: "Cinta", sets: 1, reps: "10 min", weightKg: null, activity: { profile: "treadmill" } });
  });
  it("«km/h» es velocidad, no distancia: «5 km/h» nunca queda como «5 km»", () => {
    expect(act("Cinta 30 min 5 km/h")).toEqual({ written: "Cinta", sets: 1, reps: "30 min", weightKg: null, activity: { profile: "treadmill", speedKmh: 5 } });
    expect(act("Caminata 30 min a 5,5 km/h")).toEqual({ written: "Caminata", sets: 1, reps: "30 min", weightKg: null, activity: { profile: "treadmill", speedKmh: 5.5 } });
    expect(act("Trote 20 min 9 kmh")).toEqual({ written: "Trote", sets: 1, reps: "20 min", weightKg: null, activity: { profile: "treadmill", speedKmh: 9 } });
    expect(ex("Caminata 30 min a 5,5 km/h").note).toBeNull();
  });
  it("«Remo 500 m»: remo ergómetro por distancia (500 metros, no 500 minutos)", () => {
    expect(act("Remo 500 m")).toEqual({ written: "Remo", sets: 1, reps: "500 m", weightKg: null, activity: { profile: "rower", distanceM: 500 } });
    expect(act("Remo 4x500 m")).toEqual({ written: "Remo", sets: 4, reps: "500 m", weightKg: null, activity: { profile: "rower", distanceM: 500 } });
    expect(act("Remo ergómetro 10 min ritmo 2:05 nivel 5")).toEqual({ written: "Remo ergómetro", sets: 1, reps: "10 min", weightKg: null, activity: { profile: "rower", pace500Sec: 125, level: 5 } });
    // «Remo con barra» sigue siendo de espalda.
    expect(act("Remo con barra 4x10 50kg")).toEqual({ written: "Remo con barra", sets: 4, reps: "10", weightKg: 50, activity: null });
  });
  it("bici, elíptico, escaladora y sólo duración con sus campos", () => {
    expect(act("Bici 20 min nivel 8")).toEqual({ written: "Bici", sets: 1, reps: "20 min", weightKg: null, activity: { profile: "bike", level: 8 } });
    expect(act("Bici fija 30 min 90 rpm").activity).toEqual({ profile: "bike", cadenceRpm: 90 });
    expect(act("Bici 20 min cadencia 100").activity).toEqual({ profile: "bike", cadenceRpm: 100 }); // no es un tempo «1-0-0»
    expect(act("Elíptico 15 min nivel 6 incl 4").activity).toEqual({ profile: "elliptical", level: 6, incline: 4 });
    expect(act("Escaladora 10 min nivel 7").activity).toEqual({ profile: "stair", level: 7 });
    expect(act("Soga 5 min").activity).toEqual({ profile: "duration" });
  });
  it("lo que no es de la actividad o está fuera de rango queda en la nota, marcado", () => {
    const fast = ex("Cinta 10 min vel 30");
    expect(fast.activity).toEqual({ profile: "treadmill" });
    expect(fast.note).toBe("30 km/h");
    expect(fast.issues).toContainEqual({ field: "line", kind: "unclear", text: "La velocidad va de 0,5 a 25 km/h." });
    expect(ex("Cinta 10 min con chaleco 5 kg")).toMatchObject({ weightKg: null, note: "con chaleco 5 kg", activity: { profile: "treadmill" } });
    expect(ex("Bici 20 min 25 km/h")).toMatchObject({ note: "25 km/h", activity: { profile: "bike" } });
  });
  it("sin una duración (ni distancia en el remo) queda como antes y se pide revisar", () => {
    const e = ex("Cinta 2 km");
    expect([e.reps, e.activity]).toEqual(["2 km", null]);
    expect(e.issues).toContainEqual({ field: "reps", kind: "unclear", text: "Indicá la duración en minutos (por ejemplo, 10 min)." });
  });
  it("la musculación y el aguante no cambian", () => {
    expect(act("Plancha 3x30s")).toEqual({ written: "Plancha", sets: 3, reps: "30 s", weightKg: null, activity: null });
    expect(act("Press incl 4x10 60kg")).toEqual({ written: "Press incl", sets: 4, reps: "10", weightKg: 60, activity: null });
    expect(act("Press banca 4x10 vel. explosiva 60kg")).toMatchObject({ written: "Press banca", sets: 4, reps: "10", weightKg: 60, activity: null });
  });
  it("continuación en el renglón de abajo y planillas con notas", () => {
    const [c, p] = flat("Día 1\nCinta\n10 min vel 5 incl 3\nPress banca 4x10 60kg");
    expect([c.written, c.sets, c.reps, c.activity]).toEqual(["Cinta", 1, "10 min", { profile: "treadmill", speedKmh: 5, incline: 3 }]);
    expect([p.written, p.activity ?? null]).toEqual(["Press banca", null]);
    const sheet = parseRoutineSheet("Ejercicio,Series,Reps,Notas\nCinta caminadora,1,10 min,vel 5 incl 3\nPress banca,4,10,")!.variants[0].days[0].exercises;
    expect(sheet.map((e) => [e.written, e.sets, e.reps, e.activity ?? null, e.note])).toEqual([["Cinta caminadora", 1, "10 min", { profile: "treadmill", speedKmh: 5, incline: 3 }, null], ["Press banca", 4, "10", null, null]]);
  });
  it("lo transcripto por la IA: la velocidad de la nota no es una carga", () => {
    const base: AiExercise = { name: "Cinta", group: "", section: "", sets: 1, reps: "10 min", set_reps: [], set_weights: [], weight: 5, unit: null, rest_sec: null, rir: null, rpe: null, tempo: null, technique: "", note: "vel 5 incl 3", unclear: [], source: "Cinta 10 min vel 5 incl 3" };
    const e = fromAiExercise(base);
    expect([e.sets, e.reps, e.weightKg, e.activity]).toEqual([1, "10 min", null, { profile: "treadmill", speedKmh: 5, incline: 3 }]);
    expect(e.note).toBe("5 kg");
    expect(fromAiExercise({ ...base, name: "Press banca", reps: "10", note: "", weight: 60 }).activity ?? null).toBeNull();
  });
  it("al guardar: la actividad queda en el detalle; si lo revisado ya no es una duración, se guarda como antes", () => {
    const b = { sets: 1, weightKg: null, perSet: null, rir: null, rpe: null, tempo: null };
    expect(importedDetail({ ...b, reps: "10 min", activity: { profile: "treadmill", speedKmh: 5, incline: 3 } })).toEqual({ technique: "straight", setPlan: null, group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null, activity: { profile: "treadmill", speedKmh: 5, incline: 3 } });
    expect(importedDetail({ ...b, reps: "500 m", activity: { profile: "rower" } })?.activity).toEqual({ profile: "rower", distanceM: 500 });
    expect(importedDetail({ ...b, reps: "10-12", activity: { profile: "treadmill", speedKmh: 5 } })).toBeNull();
  });
  it("la búsqueda por nombre reconoce los sinónimos del catálogo", () => {
    const lib = EXERCISE_CATALOG.map(([n], i) => ({ id: `e${i}`, name: n }));
    const m = makeExerciseMatcher(lib);
    expect(m("Cinta caminadora")?.name).toBe("Cinta (caminata)");
    expect(m("Caminadora")?.name).toBe("Cinta (caminata)");
    expect(m("Treadmill")?.name).toBe("Cinta (caminata)");
    expect(m("Cinta para correr")?.name).toBe("Cinta (trote)");
    expect(m("Spinning")?.name).toBe("Bicicleta fija");
    expect(m("Remo indoor")?.name).toBe("Remo ergómetro");
    expect(m("Elíptica")?.name).toBe("Elíptico");
    expect(m("Cinta")).toBeNull(); // sigue siendo ambiguo
  });
});
