// Nombres frecuentes escritos en notas. Sólo equivalencias explícitas: un nombre incompleto
// como «Polea» o «Press inclinado» no alcanza para elegir un implemento o una variante.
// SI2 (Smart Import 2.0): abreviaturas («c/», «manc», «máq»), plurales, orden de palabras y nombres en inglés frecuentes.
// Nunca confunde variantes: si lo escrito dice «inclinado», «Smith», «sentado» o «mancuernas», el candidato tiene que decir lo
// mismo (`variantConflict`). Cuando hay varias opciones posibles, `rankExerciseCandidates` las ofrece para que la persona elija.
import { exerciseKey } from "./exercise-catalog";
import { EXERCISE_SYNONYMS } from "./exercise-guess";

const STOP = new Set(["de", "del", "con", "en", "la", "el", "los", "las", "a", "al", "y", "un", "una", "for", "the", "with", "on"]);
// Abreviaturas de cuaderno y planilla → palabra completa (sobre la clave sin tildes).
const ABBR: [RegExp, string][] = [
  [/\bmancs?\b|\bmanc\b|\bmancuerna\b|\bdb\b|\bdumbbells?\b/g, "mancuernas"],
  [/\bmaq\b|\bmaqu?\b|\bmachine\b/g, "maquina"],
  [/\bbb\b|\bbarbell\b/g, "barra"],
  [/\bmultipower\b|\bmulti power\b|\bsmith\b/g, "smith"],
  [/\bcable\b|\bpoleas\b/g, "polea"],
  [/\binclinada\b|\bincline\b|\binclin\b|\binc\b/g, "inclinado"],
  [/\bdeclinada\b|\bdecline\b|\bdecl\b/g, "declinado"],
  [/\bseated\b|\bsentada\b|\bsent\b/g, "sentado"],
  [/\blying\b|\btumbado\b|\bacostada\b|\bprono\b/g, "acostado"],
  [/\bstanding\b|\bparado\b|\bde pie\b/g, "depie"],
  [/\bext\b/g, "extension"], [/\belev\b/g, "elevaciones"], [/\bsentadillas\b/g, "sentadilla"],
];
const abbr = (k: string) => ABBR.reduce((s, [re, to]) => s.replace(re, to), ` ${k} `).replace(/\s+/g, " ").trim();
/** Singular aproximado en español: «elevaciones laterales» → «elevacion lateral»; «poleas» → «polea». */
const stem = (w: string) => (w.length <= 3 ? w : w.endsWith("ones") ? w.slice(0, -2) : /[lrndz]es$/.test(w) ? w.slice(0, -2) : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) => abbr(exerciseKey(s.replace(/\bc\s*\/\s*/gi, "con ").replace(/\bs\s*\/\s*/gi, "sin "))).split(" ").filter((w) => w && !STOP.has(w));
const looseKey = (s: string) => words(s).join(" ");
const stemKey = (s: string) => words(s).map(stem).join(" ");
const bagKey = (s: string) => [...new Set(words(s).map(stem))].sort().join(" ");

const ALIASES: [string[], string][] = [
  [["Press plano", "Press plano con barra", "Press de banca plano", "Banco plano", "Bench press", "Flat bench press", "Press de pecho con barra"], "Press de banca"],
  [["Press plano con mancuernas", "Press plano con mancuerna", "Press banca con mancuerna", "Dumbbell bench press"], "Press de banca con mancuernas"],
  [["Press inclinado con mancuernas", "Incline dumbbell press"], "Press inclinado mancuernas"],
  [["Incline bench press", "Banco inclinado con barra"], "Press inclinado con barra"],
  [["Sentadillas", "Squat", "Barbell squat", "Back squat", "Sentadilla libre", "Sentadilla trasera"], "Sentadilla"],
  [["Front squat"], "Sentadilla frontal"], [["Goblet squat"], "Sentadilla goblet"],
  [["Sentadilla smith", "Sentadilla en smith", "Smith squat"], "Sentadilla en multipower"],
  [["Bulgarian split squat", "Bulgara", "Búlgaras"], "Sentadilla búlgara"],
  [["Peso muerto convencional", "Deadlift", "Conventional deadlift"], "Peso muerto"],
  [["Romanian deadlift", "RDL", "Peso muerto piernas rigidas"], "Peso muerto rumano"],
  [["Lat pulldown", "Jalon al pecho en polea", "Polea al pecho", "Jalon frontal", "Pulldown", "Polea alta al pecho"], "Jalón al pecho"],
  [["Triceps en polea", "Extensiones de triceps en polea", "Tricep pushdown", "Triceps pushdown", "Pushdown"], "Extensión de tríceps en polea"],
  [["Rope pushdown", "Triceps con soga", "Triceps soga"], "Extensión de tríceps con soga"],
  [["Leg press", "Prensa 45", "Prensa inclinada"], "Prensa"],
  [["Leg extension", "Sillon de cuadriceps", "Sillon cuadriceps", "Extension de piernas", "Cuadriceps en maquina"], "Extensión de cuádriceps"],
  [["Lying leg curl", "Camilla de isquios", "Camilla isquiotibiales", "Femoral acostado", "Isquios acostado"], "Curl femoral acostado"],
  [["Seated leg curl", "Femoral sentado", "Isquios sentado"], "Curl femoral sentado"],
  [["Military press", "Overhead press", "OHP", "Press militar de pie"], "Press militar"],
  [["Pull up", "Pull ups", "Pull-ups", "Dominadas pronas"], "Dominadas"], [["Chin up", "Chin ups", "Chin-ups"], "Dominadas supinas"],
  [["Push up", "Push ups", "Push-ups", "Lagartijas"], "Flexiones"], [["Dips", "Fondos"], "Fondos en paralelas"],
  [["Lunges", "Zancadas"], "Estocadas"], [["Walking lunges", "Zancadas caminando"], "Estocadas caminando"],
  [["Lateral raise", "Lateral raises", "Vuelos laterales"], "Elevaciones laterales"],
  [["Barbell curl", "Bicep curl con barra", "Biceps con barra"], "Curl con barra"], [["Hammer curl", "Biceps martillo"], "Curl martillo"],
  [["Skull crusher", "Skull crushers", "Rompecraneos"], "Press francés"],
  [["Seated row", "Cable row", "Remo bajo", "Remo sentado en polea", "Remo en polea baja"], "Remo en polea"],
  [["Barbell row", "Bent over row", "Remo inclinado con barra"], "Remo con barra"],
  [["One arm dumbbell row", "Remo a una mano", "Serrucho"], "Remo con mancuerna a una mano"],
  [["Pec deck", "Peck deck", "Contractor", "Mariposa"], "Aperturas en máquina (pec deck)"],
  [["Cruces en polea", "Cruce en polea", "Crossover", "Cable crossover"], "Cruce de poleas"],
  [["Hip thrusts", "Empuje de cadera"], "Hip thrust"], [["Standing calf raise", "Gemelos parado", "Pantorrillas de pie"], "Gemelos de pie"],
  [["Seated calf raise", "Pantorrillas sentado"], "Gemelos sentado"], [["Crunch", "Crunches", "Abdominales"], "Abdominales (crunch)"],
  [["Plank"], "Plancha"], [["Face pulls"], "Face pull"], [["Arnold press"], "Press Arnold"], [["Upright row"], "Remo al mentón"],
];
// Ejercicios por tiempo: los sinónimos del catálogo también nombran al ejercicio («Cinta caminadora» → «Cinta (caminata)»).
const aliases = new Map([...ALIASES, ...Object.entries(EXERCISE_SYNONYMS).map(([name, xs]) => [[...xs], name] as [string[], string])]
  .flatMap(([written, name]) => written.map((s) => [stemKey(s), name] as const)));

// Familias de variantes: lo escrito y el candidato tienen que coincidir dentro de cada familia que lo escrito nombra.
const FAMILIES: { name: string; tokens: Record<string, string>; implicit?: string }[] = [
  { name: "ángulo", tokens: { inclinado: "inclinado", declinado: "declinado", plano: "plano" }, implicit: "plano" },
  // Implemento o equipo: barra (lo implícito de «Press de banca», «Sentadilla»), mancuernas, Smith, máquina, polea…
  { name: "implemento", tokens: { barra: "barra", mancuernas: "mancuernas", mancuerna: "mancuernas", kettlebell: "kettlebell", disco: "disco", banda: "banda", soga: "soga",
    smith: "smith", maquina: "maquina", polea: "polea", hack: "hack" }, implicit: "barra" },
  { name: "posición", tokens: { sentado: "sentado", acostado: "acostado", depie: "depie", colgado: "colgado" } },
  { name: "agarre", tokens: { supino: "supino", supina: "supino", cerrado: "cerrado", prono: "prono" } },
];
const familyOf = (ws: string[], f: (typeof FAMILIES)[number]) => new Set(ws.map((w) => f.tokens[w] ?? f.tokens[stem(w)]).filter(Boolean));

/**
 * ¿El candidato contradice lo escrito? «Press inclinado» ≠ «Press de banca» (plano), «Sentadilla Smith» ≠ «Sentadilla» (libre),
 * «Remo con barra» ≠ «Remo en máquina», «Curl femoral sentado» ≠ «Curl femoral acostado». Lo que lo escrito no dice no cuenta
 * como contradicción (eso lo resuelve la ambigüedad), salvo el valor implícito de la familia («plano», «barra»). Con `strict`,
 * agregar una variante también es contradicción («Remo» → «Remo en máquina»).
 */
export function variantConflict(written: string, candidate: string, strict = false): boolean {
  const a = words(written), b = words(candidate);
  for (const f of FAMILIES) {
    const wa = familyOf(a, f), wb = familyOf(b, f);
    // `strict` (para validar lo que propone la IA): el candidato tampoco puede agregar una variante que lo escrito no dice.
    if (!wa.size) { if (strict && [...wb].some((x) => x !== f.implicit)) return true; continue; }
    if (!wb.size) { if (f.implicit && [...wa].every((x) => x === f.implicit)) continue; return true; }
    if ([...wa].some((x) => !wb.has(x))) return true;
  }
  return false;
}

/** Resuelve nombres en memoria. La coincidencia de la biblioteca tiene prioridad sobre los alias. */
export function makeExerciseMatcher<T extends { id: string; name: string }>(library: T[]): (written: string) => T | null {
  const levels = [exerciseKey, looseKey, stemKey, bagKey].map(() => new Map<string, T | null>());
  const fns = [exerciseKey, looseKey, stemKey, bagKey];
  const add = (map: Map<string, T | null>, key: string, row: T) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, row);
    else if (map.get(key)?.id !== row.id) map.set(key, null); // nombres iguales con distinta identidad: no adivinar
  };
  for (const row of library) {
    fns.forEach((f, i) => add(levels[i], f(row.name), row));
    // «Aperturas en máquina (pec deck)»: el nombre sin el paréntesis y lo de adentro también lo nombran (si no se repiten).
    const par = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(row.name);
    if (par) for (const alt of [par[1], par[2]]) if (alt.trim().length >= 4) fns.slice(1).forEach((f, i) => add(levels[i + 1], f(alt), row));
  }
  return (written) => {
    for (let i = 0; i < fns.length; i++) {
      const k = fns[i](written);
      if (levels[i].has(k)) return levels[i].get(k) ?? null;
    }
    const canonical = aliases.get(stemKey(written));
    return canonical ? levels[0].get(exerciseKey(canonical)) ?? null : null;
  };
}

/**
 * SI2: alternativas para que la persona elija cuando no hay una coincidencia segura (las que comparten más palabras, sin
 * contradecir la variante escrita). Devuelve hasta `max`, la más parecida primero; vacío si nada se parece lo suficiente.
 */
export function rankExerciseCandidates<T extends { id: string; name: string }>(written: string, library: T[], max = 4): T[] {
  const a = new Set(words(written).map(stem));
  if (!a.size) return [];
  const canonical = aliases.get(stemKey(written));
  const scored = library.map((row) => {
    const b = new Set(words(row.name).map(stem));
    const inter = [...a].filter((w) => b.has(w)).length;
    let score = inter / (a.size + b.size - inter || 1);
    if (canonical && exerciseKey(canonical) === exerciseKey(row.name)) score += 1;
    // La primera palabra suele ser el movimiento («Remo», «Curl», «Press»): pesa más.
    const first = !![...a][0] && b.has([...a][0]);
    if (first) score += 0.15;
    return { row, score, inter, first };
    // Comparten el movimiento («Remo…», «Curl…») o la mayoría de las palabras: «Aductores en máquina» no es opción de «Aperturas en máquina».
  }).filter((x) => x.inter > 0 && (x.first ? x.score >= 0.3 : x.score >= 0.5) && !variantConflict(written, x.row.name));
  scored.sort((x, y) => y.score - x.score || x.row.name.length - y.row.name.length);
  const seen = new Set<string>();
  // Un nombre de una sola palabra («Remo», «Curl») tiene muchas variantes: se ofrecen algunas más.
  return scored.filter((x) => (seen.has(x.row.id) ? false : (seen.add(x.row.id), true))).slice(0, a.size === 1 ? max + 2 : max).map((x) => x.row);
}
