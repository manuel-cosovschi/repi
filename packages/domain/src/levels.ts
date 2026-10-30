// Nivel REPI y trofeos (D166, F-RC-04). El nivel sube con lo que la persona entrena de verdad: días entrenados, récords
// personales, ejercicios nuevos, kilos movidos y lo que valida el gym (marcas, récords, constancia del mes). Los trofeos
// son familias de tres escalones (bronce, plata, oro) que se desbloquean una vez y quedan. Todo se calcula de los datos:
// nada se carga a mano.

/** [S] Puntos por cada cosa. Los trofeos no suman puntos (no se cuenta dos veces lo mismo). */
export const XP = {
  day: 10, // día con al menos un entrenamiento terminado (uno por día)
  pr: 15, // récord personal: superar el peso máximo propio en un ejercicio (la primera vez no cuenta)
  newExercise: 5, // ejercicio que hace por primera vez
  ton: 2, // cada 1000 kg movidos (peso × repeticiones)
  validated: 30, // marca validada en un desafío del gym
  gymRecord: 60, // récord del gym
  month: 40, // constancia del mes (12 sesiones)
} as const;

export type LevelStats = {
  days: number; prs: number; exercises: number; tons: number; validated: number; gymRecords: number; months: number; fullBodyWeeks: number;
};
export const EMPTY_STATS: LevelStats = { days: 0, prs: 0, exercises: 0, tons: 0, validated: 0, gymRecords: 0, months: 0, fullBodyWeeks: 0 };

export function xpOf(s: LevelStats) {
  return s.days * XP.day + s.prs * XP.pr + s.exercises * XP.newExercise + Math.floor(s.tons) * XP.ton
    + s.validated * XP.validated + s.gymRecords * XP.gymRecord + s.months * XP.month;
}

/** Puntos para pasar del nivel n al n+1: 60 al principio, 40 más por cada nivel (cada nivel cuesta un poco más). */
export const levelCost = (n: number) => 60 + 40 * (n - 1);

export function levelFromXp(xp: number) {
  let level = 1, floor = 0;
  while (xp >= floor + levelCost(level)) { floor += levelCost(level); level++; }
  const cost = levelCost(level);
  return { level, xp, floor, next: floor + cost, toNext: floor + cost - xp, pct: Math.round(((xp - floor) / cost) * 100) };
}

/** Desglose para mostrar de dónde salen los puntos (sólo lo que suma). */
export function xpBreakdown(s: LevelStats) {
  return ([
    ["Días entrenados", s.days, s.days * XP.day],
    ["Récords personales", s.prs, s.prs * XP.pr],
    ["Ejercicios nuevos", s.exercises, s.exercises * XP.newExercise],
    ["Toneladas movidas", Math.floor(s.tons), Math.floor(s.tons) * XP.ton],
    ["Marcas validadas", s.validated, s.validated * XP.validated],
    ["Récords del gym", s.gymRecords, s.gymRecords * XP.gymRecord],
    ["Meses de constancia", s.months, s.months * XP.month],
  ] as const).filter(([, n]) => n > 0).map(([label, count, xp]) => ({ label, count, xp }));
}

export const TROPHY_TIERS = ["bronce", "plata", "oro"] as const;
export type TrophyTier = (typeof TROPHY_TIERS)[number];
export const TIER_LABEL: Record<TrophyTier, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro" };

/** [S] Familias de trofeos: qué cuenta y cuánto pide cada escalón. */
export const TROPHIES = [
  { key: "constancia", name: "Constancia", stat: "days", unit: ["día entrenado", "días entrenados"], tiers: [10, 50, 150] },
  { key: "fuerza", name: "Fuerza", stat: "prs", unit: ["récord personal", "récords personales"], tiers: [5, 25, 75] },
  { key: "volumen", name: "Volumen", stat: "tons", unit: ["tonelada movida", "toneladas movidas"], tiers: [10, 100, 500] },
  { key: "variedad", name: "Variedad", stat: "exercises", unit: ["ejercicio distinto", "ejercicios distintos"], tiers: [10, 30, 60] },
  { key: "cuerpo", name: "Cuerpo completo", stat: "fullBodyWeeks", unit: ["semana de cuerpo completo", "semanas de cuerpo completo"], tiers: [1, 8, 24] },
  { key: "gym", name: "Récords del gym", stat: "gymRecords", unit: ["récord del gym", "récords del gym"], tiers: [1, 3, 10] },
] as const satisfies readonly { key: string; name: string; stat: keyof LevelStats; unit: readonly [string, string]; tiers: readonly [number, number, number] }[];
export type TrophyKey = (typeof TROPHIES)[number]["key"];

export const trophyUnit = (t: (typeof TROPHIES)[number], n: number) => `${n} ${n === 1 ? t.unit[0] : t.unit[1]}`;

/** Estado de cada familia: escalón alcanzado (0 = ninguno), valor actual y cuánto falta para el siguiente. */
export function trophyState(s: LevelStats) {
  return TROPHIES.map((t) => {
    const value = Math.floor(s[t.stat]);
    const tier = t.tiers.filter((x) => value >= x).length; // 0..3
    const goal = tier < 3 ? t.tiers[tier] : null;
    const prev = tier > 0 ? t.tiers[tier - 1] : 0;
    return {
      key: t.key, name: t.name, tier, tierName: tier ? TROPHY_TIERS[tier - 1] : null, value, goal,
      pct: goal == null ? 100 : Math.round(((value - prev) / (goal - prev)) * 100), next: goal == null ? null : trophyUnit(t, goal),
    };
  });
}

/** Clave estable de un escalón (se guarda como logro y no se vuelve a otorgar). */
export const trophySource = (key: TrophyKey, tier: TrophyTier) => `${key}:${tier}`;

/** [S] Zonas que pide una semana de cuerpo completo (Glúteos cuenta como piernas). */
export const FULL_BODY_ZONES = ["Pecho", "Espalda", "Piernas", "Hombros", "Brazos", "Core"] as const;
export const zoneOf = (group: string) => (group === "Glúteos" ? "Piernas" : group);
export const isFullBody = (groups: Iterable<string>) => {
  const have = new Set([...groups].map(zoneOf));
  return FULL_BODY_ZONES.every((z) => have.has(z));
};
