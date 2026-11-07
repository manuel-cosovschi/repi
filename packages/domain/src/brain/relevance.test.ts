import { describe, expect, it } from "vitest";
import { buildCandidates, decide, importUnknownsCandidate, inactivityCandidate, lowEnergyCandidate, prCandidate, programUpdatedCandidate, sessionReviewCandidate, trendCandidate, weeklyTargetCandidate } from "./relevance";
import { DEFAULT_PREFS, type BrainPrefs, type Candidate, type RecentIntervention } from "./types";
import { exerciseTrend, nextProposal, type SessionPoint } from "../intelligence";
import { NOW, daysAgo } from "./fixtures";

const C = (p: Partial<Candidate> & Pick<Candidate, "kind" | "category">): Candidate =>
  ({ dedupeKey: `${p.kind}:k`, title: p.kind, body: p.kind, evidence: null, channel: "card", enoughEvidence: true, ...p });
const R = (p: Partial<RecentIntervention> & Pick<RecentIntervention, "kind">): RecentIntervention =>
  ({ category: "achievement", dedupeKey: `${p.kind}:old`, status: "shown", createdAt: daysAgo(10), channel: "card", ...p });
const opts = (o: Partial<Parameters<typeof decide>[1]> = {}, prefs: Partial<BrainPrefs> = {}) => ({ prefs: { ...DEFAULT_PREFS, ...prefs }, recent: [], now: NOW, age: "adult" as const, ...o });
const reasons = (d: ReturnType<typeof decide>) => d.suppressed.map((s) => [s.candidate.kind, s.reason]);

describe("relevance · prioridad y resumen (caso 48)", () => {
  it("varios eventos a la vez: seguridad primero, luego entrenador, sesión, progreso, logro; máximo dos tarjetas", () => {
    const d = decide([
      C({ kind: "pr", category: "achievement" }), C({ kind: "plateau", category: "progress" }), C({ kind: "program_updated", category: "coach" }),
      C({ kind: "safety", category: "safety", dedupeKey: "safety:x" }), C({ kind: "inactivity", category: "reminder" }),
    ], opts({}, { maxPerDay: 10 }));
    expect(d.emit.map((c) => c.kind)).toEqual(["safety", "program_updated"]); // la seguridad también ocupa lugar: menos ruido
    expect(reasons(d)).toEqual([["plateau", "lower_priority"], ["pr", "lower_priority"], ["inactivity", "lower_priority"]]);
    const noSafety = decide([C({ kind: "pr", category: "achievement" }), C({ kind: "plateau", category: "progress" }), C({ kind: "inactivity", category: "reminder" })], opts({}, { maxPerDay: 10 }));
    expect(noSafety.emit.map((c) => c.kind)).toEqual(["plateau", "pr"]);
  });
  it("no intervenir es una decisión válida: sin candidatos, sin avisos", () => {
    expect(decide([], opts())).toEqual({ emit: [], suppressed: [] });
  });
});

describe("relevance · duplicados, cron y notificaciones leídas (casos 49, 51)", () => {
  it("la misma clave no se repite: ni dentro del lote ni si ya se mostró, leyó o descartó", () => {
    const a = C({ kind: "pr", category: "achievement", dedupeKey: "pr:s1:e1" });
    expect(reasons(decide([a, { ...a }], opts()))).toEqual([["pr", "duplicate"]]); // reintento del cron en el mismo lote
    for (const status of ["shown", "accepted", "dismissed", "pending", "expired", "cancelled"] as const) {
      expect(reasons(decide([a], opts({ recent: [R({ kind: "pr", dedupeKey: "pr:s1:e1", status })] })))).toEqual([["pr", "duplicate"]]);
    }
  });
  it("lo suprimido antes (p. ej. por silencio) puede salir después", () => {
    const a = C({ kind: "pr", category: "achievement", dedupeKey: "pr:s1:e1" });
    expect(decide([a], opts({ recent: [R({ kind: "pr", dedupeKey: "pr:s1:e1", status: "suppressed", createdAt: daysAgo(0.1) })] })).emit).toHaveLength(1);
  });
});

describe("relevance · preferencias de la persona (casos 46–47)", () => {
  it("caso 46 · mensajes desactivados: sólo pasa la seguridad y la ayuda en pantalla", () => {
    const d = decide([C({ kind: "pr", category: "achievement" }), C({ kind: "safety", category: "safety" }), C({ kind: "set_tip", category: "session", channel: "inline" })], opts({}, { proactive: false }));
    expect(d.emit.map((c) => c.kind)).toEqual(["safety", "set_tip"]);
    expect(reasons(d)).toEqual([["pr", "proactive_off"]]);
  });
  it("categorías apagadas: motivación apagada por defecto; logros = «avisos de progreso»; tendencias = «rendimiento»", () => {
    const d = decide([C({ kind: "quote", category: "motivation" }), C({ kind: "pr", category: "achievement" }), C({ kind: "plateau", category: "progress" })], opts({}, { categories: { ...DEFAULT_PREFS.categories, progress: false } }));
    expect(reasons(d)).toEqual([["pr", "category_off"], ["quote", "category_off"]]);
    expect(d.emit.map((c) => c.kind)).toEqual(["plateau"]);
  });
  it("«no mostrar algo parecido» suprime el tipo para siempre (salvo seguridad)", () => {
    const d = decide([C({ kind: "inactivity", category: "reminder", dedupeKey: "inactivity:nuevo" })], opts({ recent: [R({ kind: "inactivity", status: "never", createdAt: daysAgo(200) })] }));
    expect(reasons(d)).toEqual([["inactivity", "never_again"]]);
    expect(decide([C({ kind: "safety", category: "safety", dedupeKey: "s2" })], opts({ recent: [R({ kind: "safety", status: "never" })] })).emit).toHaveLength(1);
  });
  it("caso 47 · horario de silencio (22–08 en hora AR): el push se suprime, la tarjeta en la app no", () => {
    const night = "2026-11-08T02:00:00.000Z"; // 23:00 AR
    const d = decide([C({ kind: "pr", category: "achievement", channel: "push", dedupeKey: "pr:p" }), C({ kind: "pr", category: "achievement", dedupeKey: "pr:c" })], opts({ now: night }, { push: true }));
    expect(reasons(d)).toEqual([["pr", "quiet_hours"]]);
    expect(d.emit.map((c) => c.channel)).toEqual(["card"]);
    expect(decide([C({ kind: "pr", category: "achievement", channel: "push" })], opts({ now: "2026-11-07T15:00:00.000Z" }, { push: true })).emit).toHaveLength(1);
  });
  it("push sin permiso de la persona: nunca", () => {
    expect(reasons(decide([C({ kind: "pr", category: "achievement", channel: "push" })], opts()))).toEqual([["pr", "push_off"]]);
  });
  it("tope diario: cuenta lo ya mostrado hoy (hora AR) y no cuenta seguridad ni mensajes en la sesión", () => {
    const recent = [R({ kind: "pr", dedupeKey: "a", createdAt: "2026-11-07T12:00:00.000Z" }), R({ kind: "weekly_target_met", dedupeKey: "b", createdAt: "2026-11-07T13:00:00.000Z" })];
    const d = decide([C({ kind: "plateau", category: "progress" }), C({ kind: "safety", category: "safety" }), C({ kind: "tip", category: "session", channel: "inline" })], opts({ recent }));
    expect(reasons(d)).toEqual([["plateau", "daily_cap"]]);
    expect(d.emit.map((c) => c.kind)).toEqual(["safety", "tip"]);
    const yesterday = [R({ kind: "pr", dedupeKey: "a", createdAt: "2026-11-07T02:00:00.000Z" })]; // 23:00 AR del viernes
    expect(decide([C({ kind: "plateau", category: "progress" })], opts({ recent: yesterday })).emit).toHaveLength(1);
  });
  it("enfriamiento por tipo, doble si lo descartó", () => {
    const c = C({ kind: "low_energy", category: "session", dedupeKey: "low_energy:hoy" });
    expect(reasons(decide([c], opts({ recent: [R({ kind: "low_energy", createdAt: daysAgo(0.25) })] })))).toEqual([["low_energy", "cooldown"]]); // 6 h < 12 h
    expect(decide([c], opts({ recent: [R({ kind: "low_energy", createdAt: daysAgo(0.75) })] })).emit).toHaveLength(1); // 18 h
    expect(reasons(decide([c], opts({ recent: [R({ kind: "low_energy", status: "dismissed", createdAt: daysAgo(0.75) })] })))).toEqual([["low_energy", "cooldown"]]); // 18 h < 24 h
    expect(decide([c], opts({ recent: [R({ kind: "low_energy", createdAt: daysAgo(0.25) })], cooldowns: { low_energy: 1 } })).emit).toHaveLength(1);
  });
});

describe("relevance · evidencia, novedad y obsolescencia (casos 43, 50, 54)", () => {
  it("caso 43 · evidencia insuficiente o sin novedad: no se emite", () => {
    expect(reasons(decide([C({ kind: "plateau", category: "progress", enoughEvidence: false }), C({ kind: "pr", category: "achievement", novel: false })], opts()))).toEqual([["plateau", "insufficient_evidence"], ["pr", "not_novel"]]);
  });
  it("caso 50 · un cambio de rutina vuelve obsoleto el aviso de la versión anterior; también lo vencido", () => {
    const d = decide([programUpdatedCandidate({ versionId: "v1", byCoach: true, changedAt: daysAgo(3) }), C({ kind: "session_review", category: "session", expiresAt: daysAgo(0.01) })], opts({ programVersionId: "v2" }));
    expect(reasons(d)).toEqual([["program_updated", "obsolete"], ["session_review", "obsolete"]]);
  });
  it("caso 54 · el coach actualiza el programa: una tarjeta por versión", () => {
    const c = programUpdatedCandidate({ versionId: "v2", byCoach: true, changedAt: daysAgo(0) });
    expect(c).toMatchObject({ category: "coach", dedupeKey: "program:v2", programVersionId: "v2", body: "Tu entrenador actualizó tu rutina. Te muestro qué cambió antes de empezar." });
    expect(decide([c], opts({ programVersionId: "v2" })).emit).toHaveLength(1);
    expect(decide([c], opts({ programVersionId: "v2", recent: [R({ kind: "program_updated", category: "coach", dedupeKey: "program:v2" })] })).emit).toHaveLength(0);
  });
});

describe("relevance · menores (caso 59) y edad desconocida (caso 60)", () => {
  it("sin push ni avisos de cuerpo; el resto de las tarjetas sí", () => {
    for (const age of ["minor", "unknown"] as const) {
      const d = decide([C({ kind: "body_goal", category: "progress" }), C({ kind: "pr", category: "achievement", channel: "push", dedupeKey: "p" }), C({ kind: "pr", category: "achievement", dedupeKey: "c" })], opts({ age }, { push: true }));
      expect(reasons(d)).toEqual([["body_goal", "minor"], ["pr", "minor"]]);
      expect(d.emit).toHaveLength(1);
      expect(d.emit[0].channel).toBe("card");
    }
  });
});

describe("relevance · candidatos (casos 41–45)", () => {
  it("caso 41 · logro auténtico: objetivo semanal y marca personal", () => {
    expect(weeklyTargetCandidate({ sessionsThisWeek: 4, target: 4, now: NOW })).toMatchObject({ kind: "weekly_target_met", dedupeKey: "weekly_target:2026-11-02", body: "Completaste cuatro sesiones esta semana, justo la frecuencia que te habías propuesto." });
    expect(weeklyTargetCandidate({ sessionsThisWeek: 5, target: 4, now: NOW })?.body).toMatch(/ya pasaste tu objetivo/);
    expect(weeklyTargetCandidate({ sessionsThisWeek: 3, target: 4, now: NOW })).toBeNull();
    expect(weeklyTargetCandidate({ sessionsThisWeek: 3, target: null, now: NOW })).toBeNull();
    expect(prCandidate({ exercise: { id: "e1", name: "Press banca" }, markText: "levantaste 100 kg, la carga más alta que registraste", sessionId: "s9", at: NOW })).toMatchObject({ dedupeKey: "pr:s9:e1", body: "En Press banca levantaste 100 kg, la carga más alta que registraste." });
  });
  const pts = (xs: [number, number][]): SessionPoint[] => xs.map(([w, r], i) => ({ at: daysAgo((xs.length - i) * 7), w, r, rir: 2, hard: false, completedAll: true, topOfRange: false, score: w * (1 + r / 30) }));
  it("caso 42 · tendencia positiva con evidencia; caso 44 · posible estancamiento con propuesta; caso 43 · insuficiente, nada", () => {
    const up = pts([[55, 10], [57.5, 10], [60, 10], [62.5, 10]]);
    const tu = trendCandidate({ exercise: { id: "e1", name: "Press banca" }, trend: exerciseTrend(up), lastAt: up[3].at, sessions: up });
    expect(tu).toMatchObject({ kind: "progressing", category: "progress", enoughEvidence: true });
    expect(tu!.evidence!.basis).toMatch(/^Comparé las sesiones del \d\d\/\d\d, /);
    const flat = pts([[60, 8], [60, 8], [60, 8], [60, 8], [60, 8]]);
    const tf = exerciseTrend(flat);
    const pl = trendCandidate({ exercise: { id: "e2", name: "Sentadilla" }, trend: tf, proposal: nextProposal(tf, flat, { repsMin: 8, repsMax: 10, coachOwned: true }), lastAt: flat[4].at });
    expect(pl).toMatchObject({ kind: "plateau", enoughEvidence: true });
    expect(pl!.body).toMatch(/estable hace cinco sesiones comparables\. .*entrenador/);
    const few = pts([[60, 8], [60, 8], [60, 8], [60, 8]]); // estancamiento «posible» con 4: no alcanza
    expect(trendCandidate({ exercise: { id: "e2", name: "Sentadilla" }, trend: exerciseTrend(few), lastAt: few[3].at })?.enoughEvidence).toBe(false);
    expect(trendCandidate({ exercise: { id: "e2", name: "Sentadilla" }, trend: exerciseTrend(pts([[60, 8]])), lastAt: NOW })).toBeNull();
  });
  it("caso 45 · baja adherencia sin asumir faltas: «no registraste», nunca «faltaste»", () => {
    const c = inactivityCandidate({ daysSinceLast: 9, lastSessionAt: daysAgo(9), nextDayName: "Torso A" })!;
    expect(c.body).toBe("Hace 9 días que no registrás entrenamientos. ¿Querés retomar con Torso A?");
    expect(`${c.title} ${c.body} ${c.evidence!.basis}`).not.toMatch(/faltaste|abandon|no fuiste|no viniste/i);
    expect(c.evidence!.basis).toMatch(/Si entrenaste sin registrar, no lo sé\./);
    expect(inactivityCandidate({ daysSinceLast: 3, lastSessionAt: daysAgo(3) })).toBeNull();
    expect(inactivityCandidate({ daysSinceLast: null, lastSessionAt: null })).toBeNull();
    // Una sola tarjeta por pausa aunque el cron la genere todos los días (caso 49).
    expect(inactivityCandidate({ daysSinceLast: 10, lastSessionAt: daysAgo(9) })!.dedupeKey).toBe(c.dedupeKey);
  });
  it("rutina importada incompleta, cierre de sesión y poca energía", () => {
    expect(importUnknownsCandidate({ routineId: "r1", name: "Rutina de Sofi", unknown: 2 })?.body).toMatch(/quedaron dos indicaciones sin completar/);
    expect(importUnknownsCandidate({ routineId: "r1", name: "x", unknown: 0 })).toBeNull();
    expect(sessionReviewCandidate({ sessionId: "s1", at: NOW, summary: "Hoy completaste 18 de las 20 series previstas." })).toMatchObject({ dedupeKey: "review:s1", expiresAt: "2026-11-08T02:59:59.999Z" });
    expect(lowEnergyCandidate({ energy: 2, sleep: 4, at: NOW })?.body).toMatch(/^Marcaste poca energía/);
    expect(lowEnergyCandidate({ energy: 4, sleep: 4, at: NOW })).toBeNull();
  });
});

describe("relevance · de punta a punta", () => {
  it("buildCandidates + decide: arma lo que corresponde y el motor elige una prioridad por canal", () => {
    const cands = buildCandidates({
      now: NOW,
      weekly: { sessionsThisWeek: 4, target: 4 },
      prs: [{ exercise: { id: "e1", name: "Press banca" }, markText: "superaste tu mejor marca estimada", sessionId: "s9", at: NOW }],
      inactivity: { daysSinceLast: 1, lastSessionAt: daysAgo(1) }, // no corresponde: entrenó ayer
      program: { versionId: "v2", byCoach: true, changedAt: daysAgo(0) },
      imports: [{ routineId: "r1", name: "Plan", unknown: 0 }],
    });
    expect(cands.map((c) => c.kind)).toEqual(["program_updated", "pr", "weekly_target_met"]);
    const d = decide(cands, opts({ programVersionId: "v2" }));
    expect(d.emit.map((c) => c.kind)).toEqual(["program_updated", "pr"]);
    expect(reasons(d)).toEqual([["weekly_target_met", "daily_cap"]]); // el tope diario (2) se aplica antes que el límite por canal
  });
});
