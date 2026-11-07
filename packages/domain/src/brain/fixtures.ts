// AC3 · Fixtures sintéticos para las pruebas del núcleo. No se exportan desde el barril `brain.ts`: sólo los usan los *.test.ts.
import type { AgeBand, BrainContext, ExerciseRef, MemoryItem } from "./types";
import { fact, noFact } from "./context";

/** Sábado 07/11/2026, 12:00 en Buenos Aires. */
export const NOW = "2026-11-07T15:00:00.000Z";
export const daysAgo = (n: number, from = NOW) => new Date(Date.parse(from) - n * 86_400_000).toISOString();

export const EX: Record<"pb" | "pi" | "rm" | "rb" | "sq" | "jp" | "dom" | "jpu" | "curl", ExerciseRef> = {
  pb: { id: "ex-pb", name: "Press banca", short: "PB" },
  pi: { id: "ex-pi", name: "Press inclinado con mancuernas", short: "PI" },
  rm: { id: "ex-rm", name: "Remo en máquina", short: "RM" },
  rb: { id: "ex-rb", name: "Remo con barra", short: "RB" },
  sq: { id: "ex-sq", name: "Sentadilla", short: "SQ" },
  jp: { id: "ex-jp", name: "Jalón al pecho", short: "JP" },
  dom: { id: "ex-dom", name: "Dominadas", short: "DO" },
  jpu: { id: "ex-jpu", name: "Jalón unilateral en polea", short: "JU" },
  curl: { id: "ex-curl", name: "Curl femoral", short: "CF" },
};
export const ALL_EX = Object.values(EX);

type CtxOver = { age?: AgeBand } & { [K in keyof BrainContext]?: Partial<BrainContext[K]> };
/** Contexto de una persona adulta con programa del entrenador, sin sesión abierta. Cada clave pisa sólo lo que trae. */
export function makeCtx(o: CtxOver = {}): BrainContext {
  const base: BrainContext = {
    version: "v1", now: NOW, section: "home",
    person: {
      age: fact<AgeBand>(o.age ?? "adult", "profile", null, "declared"), unit: "kg",
      experience: fact<string | null>("intermedio", "wishes", null, "declared"), goals: fact(["fuerza"], "wishes", null, "declared"),
      weeklyTarget: fact<number | null>(4, "wishes", null, "declared"), minutesAvailable: fact<number | null>(60, "wishes", null, "declared"),
      likes: fact<string[]>([], "wishes", null, "declared"), avoids: fact<string[]>([], "wishes", null, "declared"),
    },
    relation: { kind: "coach", orgName: "Estudio Marta Pérez", hasCoach: true },
    program: {
      name: "Plan de Marta para Juan", versionId: "ver-2", owner: "coach", changedAt: daysAgo(3),
      days: [{ key: "d1", name: "Torso A", exercises: 5 }, { key: "d2", name: "Piernas A", exercises: 4 }], nextDay: { key: "d1", name: "Torso A" }, imported: null,
    },
    session: { open: false, id: null, dayName: null, startedAt: null, current: null, pending: [], done: [], substitutions: 0, offlinePending: false },
    history: { sessions30d: 10, sessions7d: 3, lastSessionAt: daysAgo(2), daysSinceLast: 2, voided30d: 0 },
    readiness: { energy: noFact<number | null>(null, "check_in"), sleep: noFact<number | null>(null, "check_in"), mood: noFact<number | null>(null, "check_in"), lastRpe: fact<number | null>(7, "session", daysAgo(2)) },
    restrictions: fact([], "pain_report", null, "recorded", "high", { consent: "health" }),
    body: fact(null, "body", null),
    memory: [],
    missing: [],
  };
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === "age" || v == null) continue;
    const cur = (base as Record<string, unknown>)[k];
    out[k] = cur && typeof cur === "object" && !Array.isArray(cur) && typeof v === "object" && !Array.isArray(v) ? { ...cur, ...v } : v;
  }
  return out as BrainContext;
}

export const mem = (p: Partial<MemoryItem> & Pick<MemoryItem, "kind" | "key">): MemoryItem =>
  ({ id: `m-${p.key}`, value: true, text: p.text ?? `Recuerdo ${p.key}`, source: "user", ref: null, createdAt: NOW, expiresAt: null, ...p });
