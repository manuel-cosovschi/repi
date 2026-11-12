import { describe, expect, it } from "vitest";
import { PERSONALIZATION_MATRIX, personalUses, personalizeProposal, personalizeTargets } from "./personalize";
import { recommendExercise, type HistRow, type Proposal, type Trend } from "./intelligence";
import { personalProfile, emptyWishes, type TrainingWishes } from "./wishes";

const now = new Date("2026-11-12T15:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const prof = (p: Partial<TrainingWishes>) => personalProfile({ ...emptyWishes(), ...p });
const A = prof({ goal: "muscle", experience: "intermediate", daysPerWeek: 4, minutes: 60 });
const B = prof({ goal: "strength", experience: "advanced", daysPerWeek: 3, minutes: 75 });
const C = prof({ goal: "health", experience: "beginner", daysPerWeek: 2, minutes: 45 });
const row = (s: string, i: number, w: number, r: number, at: string, rir: number | null = 2, extra: Partial<HistRow> = {}): HistRow =>
  ({ sessionId: s, setIndex: i, w, r, rir, feel: null, at, specId: null, kind: "work", stage: 0, reps: "8-12", source: "repi", ...extra } as HistRow);
const hist5 = [1, 2, 3, 4, 5].flatMap((k) => [0, 1, 2].map((i) => row(`s${k}`, i, 60 + k * 2.5, 10, ago(30 - k * 5))));
const ex = { sets: 3, reps: "8-12", rir: null, restSec: 90 };

describe("D217 · personalización (matriz explícita)", () => {
  it("la matriz documenta datos → decisión → regla → lo que ve la persona", () => {
    expect(PERSONALIZATION_MATRIX.length).toBeGreaterThanOrEqual(12);
    for (const r of PERSONALIZATION_MATRIX) expect(r.data && r.decision && r.rule && r.shows).toBeTruthy();
  });
  it("13–14 · objetivos y experiencia distintos: misma carga (no hay % por objetivo), distinto énfasis y guía", () => {
    const base = recommendExercise({ ex, history: hist5, now });
    const a = personalizeTargets(base, A), c = personalizeTargets(base, C);
    expect(a.map((t) => t.weightKg)).toEqual(base.map((t) => t.weightKg));
    expect(c.map((t) => t.weightKg)).toEqual(base.map((t) => t.weightKg));
    expect(a[0].why).toContain("ganar músculo");
    expect(a[0].rirTarget).toBeNull(); // intermedio: no se agrega guía
    expect(c[0].rirTarget).toBe(2); // principiante sin RIR en la rutina: guía de esfuerzo
    expect(c[0].why).toContain("2 repeticiones en reserva");
    expect(c[0].reasons).toContain("profile_beginner_effort");
    expect(a.filter((t) => t.reasons.some((r) => r.startsWith("profile_goal_"))).length).toBe(1); // una sola frase por ejercicio
  });
  it("15 · sin historial: no inventa carga aunque el perfil esté completo (persona C)", () => {
    const t = personalizeTargets(recommendExercise({ ex, history: [], now }), C);
    expect(t.every((x) => x.weightKg == null && x.status === "no_data")).toBe(true);
    expect(t[0].rirTarget).toBeNull(); // sin referencia tampoco se agrega guía
  });
  it("18 · con prescripción humana manda el plan: filas del profe intactas", () => {
    const coach = { ...ex, detail: { setPlan: [0, 1, 2].map(() => ({ kind: "work" as const, reps: "8-12", weightKg: 70, pct1rm: null, rir: null, rpe: null, restSec: null, note: null })) } };
    const base = recommendExercise({ ex: coach as never, history: hist5, now });
    expect(personalizeTargets(base, C)).toEqual(base);
  });
  it("18b · programa del profe sin carga: sin guía de esfuerzo agregada (sólo el énfasis del objetivo)", () => {
    const base = recommendExercise({ ex, history: hist5, now });
    const t = personalizeTargets(base, C, { coachOwned: true });
    expect(t[0].rirTarget).toBeNull();
    expect(t[0].reasons).not.toContain("profile_beginner_effort");
    expect(t[0].reasons).toContain("profile_goal_health");
  });
  it("19–20 · RIR del plan presente: no se pisa (alto o bajo lo decide TI con sus guardas)", () => {
    const base = recommendExercise({ ex: { ...ex, rir: 1 }, history: hist5, now });
    expect(personalizeTargets(base, C)[0].rirTarget).toBe(1);
  });
  it("6/P6 · principiante con rutina propia al fallo: advertencia, sin cambiar la rutina", () => {
    const base = recommendExercise({ ex, history: hist5, now });
    const t = personalizeTargets(base, C, { failure: true });
    expect(t[0].why).toContain("Al fallo no hace falta");
    expect(t[0].weightKg).toBe(base[0].weightKg);
  });
  it("23 · método avanzado (top set + back-off): sólo la serie principal recibe guía; las etapas no", () => {
    const top = { ...ex, detail: { setPlan: [
      { kind: "top" as const, reps: "4-6", weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null },
      { kind: "backoff" as const, reps: "8-10", weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null },
    ] }, sets: 2 };
    const h = [1, 2, 3].flatMap((k) => [row(`s${k}`, 0, 100, 5, ago(20 - k), 1, { kind: "top" as never, reps: "4-6" }), row(`s${k}`, 1, 85, 9, ago(20 - k), 2, { kind: "backoff" as never, reps: "8-10" })]);
    const t = personalizeTargets(recommendExercise({ ex: top as never, history: h, now }), C);
    expect(t[0].reasons).toContain("profile_beginner_effort");
    expect(t[1].reasons.some((r) => r.startsWith("profile_beginner"))).toBe(false);
    expect(t[1].weightKg).toBe(recommendExercise({ ex: top as never, history: h, now })[1].weightKg);
  });
  it("25/P12 · perfil incompleto: se marca y se dice qué falta", () => {
    const t = personalizeTargets(recommendExercise({ ex, history: hist5, now }), prof({ goal: "muscle" }));
    expect(t[0].reasons).toContain("profile_incomplete");
    const u = personalUses(prof({ goal: "muscle" }), { comparableSessions: 5, coachPlan: false, effort: true });
    expect(u.map((x) => x.key)).toEqual(["history", "effort", "goal", "missing"]);
    expect(u.at(-1)!.text).toContain("tu experiencia");
    expect(personalUses(null, { comparableSessions: 0, coachPlan: true, effort: false })[0].text).toBe("La programación de tu entrenador");
  });
  it("17 · objetivo de fuerza estancado: la propuesta sugiere revisar la progresión (con el entrenador si hay programa) sin cambiar la cifra", () => {
    const tr: Trend = { kind: "plateau", confidence: "consistent", sessions: 5, text: "", basis: "" };
    const pr: Proposal = { kind: "review", text: "Podría convenir revisar.", weightKg: null, reps: null, requiresCoach: true, basis: "" };
    const out = personalizeProposal(pr, tr, B)!;
    expect(out.text).toContain("Si tu objetivo sigue siendo ganar fuerza");
    expect(out.text).toContain("con tu entrenador");
    expect({ ...out, text: "" }).toEqual({ ...pr, text: "" });
    expect(personalizeProposal(pr, tr, null)).toBe(pr);
  });
});
