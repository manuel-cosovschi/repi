// Lo que la persona busca entrenando (D139): objetivo, días y minutos disponibles, qué le gusta y qué prefiere evitar.
// Lo usa la IA de «No vino el profe» para ajustar la sugerencia. No es un dato de salud: las molestias van por «Molestia».

export const TRAINING_WISH_GOALS = {
  strength: "Ganar fuerza",
  muscle: "Ganar músculo",
  fat_loss: "Bajar grasa",
  health: "Salud y energía",
  sport: "Rendir en un deporte",
  habit: "Sostener el hábito",
} as const;
export type TrainingWishGoal = keyof typeof TRAINING_WISH_GOALS;

export type TrainingWishes = { goal: TrainingWishGoal | null; daysPerWeek: number | null; minutes: number | null; likes: string | null; avoid: string | null };
export const WISH_TEXT_MAX = 200;
export const emptyWishes = (): TrainingWishes => ({ goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null });

const text = (v: unknown) => {
  if (v == null) return null;
  if (typeof v !== "string") throw new Error("Texto inválido.");
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > WISH_TEXT_MAX) throw new Error(`Hasta ${WISH_TEXT_MAX} caracteres.`);
  return t || null;
};
const int = (v: unknown, min: number, max: number, what: string) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what}: entre ${min} y ${max}.`);
  return n;
};

/** Valida y normaliza. Devuelve `{ ok: false, error }` con un mensaje para mostrar. */
export function cleanWishes(input: unknown): { ok: true; wishes: TrainingWishes } | { ok: false; error: string } {
  const x = (input ?? {}) as Record<string, unknown>;
  try {
    if (x.goal != null && !(typeof x.goal === "string" && x.goal in TRAINING_WISH_GOALS)) throw new Error("Elegí un objetivo de la lista.");
    return { ok: true, wishes: {
      goal: (x.goal ?? null) as TrainingWishGoal | null,
      daysPerWeek: int(x.daysPerWeek, 1, 7, "Días por semana"),
      minutes: int(x.minutes, 15, 240, "Minutos por entrenamiento"),
      likes: text(x.likes),
      avoid: text(x.avoid),
    } };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export const hasWishes = (w: TrainingWishes | null | undefined) => !!w && Object.values(w).some((v) => v != null);
