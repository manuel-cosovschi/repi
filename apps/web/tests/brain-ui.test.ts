// D209 · Asistente REPI en la app del alumno: el presentador (procedencia, tarjetas, acciones con vista previa, tarjeta de
// Inicio, atajos por sección) y la línea de briefing del entrenamiento (sin conexión, con lo que ya está en el teléfono).
// Puro: no toca la base ni la red.
import { describe, expect, it } from "vitest";
import type { RowTarget } from "@repi/domain";
import { ORIGIN_LABEL, WORKOUT_CHIPS, chipsFor, cleanRef, contextLine, originOfVia, presentAction, presentIntervention, presentMessage } from "@/components/brain/presenter";
import { workoutBrief, type BriefEx } from "@/components/brain/brief";
import type { InterventionView, MessageView, ProposedAction } from "@/components/brain/types";

const msg = (p: Partial<MessageView>): MessageView => ({
  id: "m1", threadId: "t1", role: "repi", text: "", cards: [], actions: [], section: "home", ref: null, via: "rules", feedback: null, createdAt: "2026-11-07T15:00:00.000Z", ...p,
});
const action = (p: Partial<ProposedAction>): ProposedAction => ({
  kind: "apply_substitution", label: "Reemplazar por Jalón unilateral sólo por hoy", preview: "Hoy hacés Jalón unilateral en lugar de Jalón al pecho. Tu rutina no cambia.",
  input: { exerciseId: "pe1", substituteId: "x2", reason: "busy" }, key: "apply_substitution:0123456789abcdef", mode: "confirm", reason: null, code: "ok", actionId: "a1", ...p,
});

describe("presentador · procedencia de cada respuesta", () => {
  it("reglas, IA, seguridad y sin IA (fallback) se dicen distinto; un dato registrado es «Dato registrado»", () => {
    expect(originOfVia("rules").label).toBe("Calculado por REPI");
    expect(originOfVia("fallback").label).toBe("Calculado por REPI");
    expect(originOfVia("ai").label).toBe("Sugerencia con IA");
    expect(originOfVia("safety").kind).toBe("safety");
    const vm = presentMessage(msg({ text: "La última vez en Press banca: 60 kg × 10.", cards: [{ type: "fact", title: "Press banca · 02/11", rows: [{ label: "Mejor serie", value: "60 kg × 10" }], via: "data" }] }));
    expect(vm.origin?.label).toBe(ORIGIN_LABEL.rules);
    expect(vm.cards[0]).toMatchObject({ type: "fact", origin: { kind: "data", label: "Dato registrado" } });
    expect(vm.speak).toContain("Mejor serie 60 kg × 10");
  });
  it("las cargas se muestran en la unidad de la persona (lb) sin tocar el dato", () => {
    const vm = presentMessage(msg({ text: "Repetimos 60 kg." }), "lb");
    expect(vm.text).not.toContain("60 kg");
    expect(vm.text).toMatch(/lb/);
  });
  it("seguridad tiene su tono (para un futuro personaje) y el mensaje propio no lleva procedencia", () => {
    expect(presentMessage(msg({ via: "safety", text: "Pará con el ejercicio." })).mood).toBe("safety");
    expect(presentMessage(msg({ role: "user", via: null, text: "me duele" })).origin).toBeNull();
  });
});

describe("presentador · acciones distintas de las respuestas, siempre con vista previa", () => {
  it("una acción que cambia la sesión pide «Confirmar» y dice que es sólo por hoy", () => {
    const a = presentAction(action({}));
    expect(a).toMatchObject({ confirmLabel: "Confirmar", tone: "session", kicker: "Cambio sólo por hoy", needsDetails: false });
    expect(a.preview).toMatch(/Tu rutina no cambia/);
  });
  it("una molestia es de salud: pide intensidad y zona antes de confirmar", () => {
    const a = presentAction(action({ kind: "report_discomfort", label: "Registrar la molestia", preview: "Queda privado.", input: { exerciseId: null, area: "hombro", note: null } }));
    expect(a).toMatchObject({ tone: "health", needsDetails: true, confirmLabel: "Confirmar" });
  });
  it("un atajo (navegar o preparar un borrador) usa su nombre y nunca dice «Listo»", () => {
    const a = presentAction(action({ kind: "draft_coach_message", label: "Preparar consulta", preview: "Deja un borrador en Mensajes. No se envía solo.", mode: "auto" }));
    expect(a.confirmLabel).toBe("Preparar consulta");
    expect(`${a.label} ${a.preview} ${a.confirmLabel}`).not.toMatch(/listo/i);
  });
});

describe("presentador · tarjeta de Inicio", () => {
  const card = (p: Partial<InterventionView>): InterventionView => ({
    id: "i1", kind: "weekly_target_met", category: "achievement", title: "Completaste 4 sesiones esta semana", body: "Justo la frecuencia que te habías propuesto.",
    evidence: { basis: "Conté tus sesiones terminadas desde el lunes.", via: "data" }, actions: [{ id: "dismiss", label: "Listo" }], data: {}, channel: "card", status: "pending",
    reason: null, priority: 4, programVersionId: null, createdAt: "2026-11-07T12:00:00.000Z", shownAt: null, resolvedAt: null, expiresAt: null, ...p,
  });
  it("siempre ofrece Ver por qué (si hay evidencia), Hablar con REPI, descartar y «No mostrar algo parecido»", () => {
    const vm = presentIntervention(card({}));
    const ids = [...vm.primary, ...vm.secondary].map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["why", "chat", "dismiss", "never"]));
    expect(vm.origin.label).toBe("Dato registrado");
    // «Listo» como descarte se nombra por lo que hace.
    expect([...vm.primary, ...vm.secondary].find((a) => a.id === "dismiss")?.label).toBe("Entendido");
  });
  it("«Empezar» va primero; un aviso de seguridad no ofrece «No mostrar algo parecido»", () => {
    expect(presentIntervention(card({ kind: "inactivity", actions: [{ id: "start", label: "Empezar" }, { id: "dismiss", label: "Ahora no" }] })).primary[0].id).toBe("start");
    const s = presentIntervention(card({ category: "safety", evidence: null }));
    expect([...s.primary, ...s.secondary].some((a) => a.id === "never")).toBe(false);
  });
});

describe("presentador · atajos y contexto", () => {
  it("en el entrenamiento: máquina ocupada, poco tiempo, molestia y poca energía; ninguno empieza con el nombre de una pestaña", () => {
    expect(WORKOUT_CHIPS.map((c) => c.label)).toEqual(["Máquina ocupada", "Tengo poco tiempo", "Me molesta", "Poca energía"]);
    for (const c of WORKOUT_CHIPS) expect(c.label).not.toMatch(/^(Inicio|Entrenar|Progreso|Mensajes|Gym)/);
    expect(chipsFor("workout", null).map((c) => c.text)).toContain("La máquina está ocupada");
  });
  it("las sugerencias del servidor reemplazan a las de la sección; sin repetidos y como mucho cuatro", () => {
    expect(chipsFor("home", ["Sí", "No", "Sí"]).map((c) => c.text)).toEqual(["Sí", "No"]);
    expect(chipsFor("profile", []).length).toBeGreaterThan(0);
  });
  it("la referencia de la pantalla sólo lleva identificadores con formato válido", () => {
    expect(cleanRef({ sessionId: "s-1", programExerciseId: "pe_2", setIndex: 3, exerciseId: "<script>" })).toEqual({ sessionId: "s-1", programExerciseId: "pe_2", setIndex: 3 });
    expect(cleanRef({ setIndex: 99 })).toBeNull();
    expect(contextLine("workout", "Press banca")).toBe("Desde Entrenamiento · Press banca");
  });
});

describe("briefing del entrenamiento (sin conexión, con lo que tiene el teléfono)", () => {
  const T = (i: number, p: Partial<RowTarget> = {}): RowTarget => ({
    setIndex: i, specId: `s${i}`, kind: "work", block: i, stage: 0, status: "ready", action: "increase_reps", source: "rules", quality: "high",
    weightKg: 60, repsMin: 10, repsMax: 12, repsTarget: 11, rirTarget: 2, rpeTarget: null, restSec: 90, restSuggestSec: null, pending: false, guards: [], reasons: [],
    text: "60 kg × 10–12", why: "", review: null, prev: { w: 60, r: 10, rir: 2, at: "2026-11-02T15:00:00.000Z", level: "exact", source: "repi" } as RowTarget["prev"], refs: [], coach: null, algo: "ti-2", ...p,
  } as RowTarget);
  const ex = (p: Partial<BriefEx> = {}): BriefEx => ({ exerciseId: "x1", name: "Press banca", sets: 3, reps: "10-12", rir: 2, restSec: 90, detail: null, targets: [T(0), T(1), T(2)], ...p });
  it("dice la última vez, lo indicado hoy y lo que recomienda Training Intelligence (ejemplo del máster)", () => {
    expect(workoutBrief(ex())?.text).toBe("La última vez hiciste 3 × 10 con 60 kg. Hoy tenés indicado trabajar entre 10 y 12 repeticiones. Mantenemos la carga e intentamos acercarnos a 12.");
  });
  it("con tono breve, una sola frase", () => {
    expect(workoutBrief(ex(), "breve")?.text).toBe("Mantenemos la carga e intentamos acercarnos a 12.");
  });
  it("la carga del profe manda; un reemplazo de hoy no usa el objetivo del original", () => {
    const coach = workoutBrief(ex({ targets: null, detail: { setPlan: [{ weightKg: 70, reps: "8" }] } as unknown as BriefEx["detail"] }));
    expect(coach?.text).toBe("Vamos con la carga que indicó tu profe: 70 kg.");
    expect(workoutBrief(ex({ change: { kind: "substitute" } }))).toBeNull();
  });
  it("sin objetivos (empezó sin conexión) usa la sugerencia del día y no inventa «la última vez»", () => {
    const b = workoutBrief(ex({ targets: null, suggest: { action: "hold", weightKg: 50, reps: 10, why: "" } }));
    expect(b?.text).toBe("Repetimos 50 kg y buscamos 10 en todas las series.");
    expect(b?.text).not.toMatch(/La última vez/);
    expect(workoutBrief(ex({ targets: null }))).toBeNull();
  });
  it("aproximaciones y etapas no cuentan como «la última vez»", () => {
    const b = workoutBrief(ex({ targets: [T(0, { kind: "warmup", prev: { w: 20, r: 15, rir: null, at: "2026-11-02T15:00:00.000Z", level: "exact", source: "repi" } as RowTarget["prev"] }), T(1), T(2, { stage: 1 })] }));
    expect(b?.text).toMatch(/^La última vez hiciste 1 × 10 con 60 kg\./);
  });
  // Revisión AC3 (#4): la carga del profe era la de la primera fila del plan con peso, aunque fuera una aproximación o un back-off.
  const plan = (rows: [string, string, number | null][]) => ({ technique: "custom", setPlan: rows.map(([kind, reps, weightKg], i) => ({ id: `r${i}x0000000`, kind, reps, weightKg, block: i, stage: 0 })) }) as unknown as BriefEx["detail"];
  it("la carga del profe es la de la serie de trabajo, nunca la de una aproximación (con y sin objetivos)", () => {
    const detail = plan([["warmup", "10", 40], ["work", "8", 80], ["work", "8", 80], ["work", "8", 80]]);
    const coach = (i: number) => T(i, { status: "coach", action: "follow_coach", source: "coach", weightKg: 80, repsMin: 8, repsMax: 8, repsTarget: null, coach: { weightKg: 80, reps: "8" }, prev: { w: 80, r: 8, rir: 2, at: "2026-11-02T15:00:00.000Z", level: "exact", source: "repi" } as RowTarget["prev"] });
    const withT = workoutBrief(ex({ sets: 4, reps: "8", detail, targets: [T(0, { kind: "warmup", status: "not_applicable", weightKg: null, prev: null }), coach(1), coach(2), coach(3)] }));
    expect(withT?.text).toBe("La última vez hiciste 3 × 8 con 80 kg. Hoy tenés indicadas 3 series de 8. Vamos con la carga que indicó tu profe: 80 kg.");
    expect(workoutBrief(ex({ sets: 4, reps: "8", detail, targets: null }))?.text).toBe("Vamos con la carga que indicó tu profe: 80 kg.");
  });
  it("un back-off con carga no tapa la recomendación del top set; con molestia, la carga del profe dice «hoy no fuerces»", () => {
    const detail = plan([["top", "5", null], ["backoff", "8", 70], ["backoff", "8", 70]]);
    const top = T(0, { kind: "top", action: "increase_load", weightKg: 105, repsMin: 5, repsMax: 5, repsTarget: 5, prev: { w: 100, r: 5, rir: 2, at: "2026-11-02T15:00:00.000Z", level: "exact", source: "repi" } as RowTarget["prev"] });
    const back = (i: number) => T(i, { kind: "backoff", status: "coach", action: "follow_coach", weightKg: 70, coach: { weightKg: 70, reps: "8" } });
    const b = workoutBrief(ex({ sets: 3, reps: "5", detail, targets: [top, back(1), back(2)] }), "breve");
    expect(b?.text).toBe("Completaste el rango: hoy probamos 105 kg y volvemos a 5.");
    expect(workoutBrief(ex({ sets: 3, reps: "5", detail, targets: null }))).toBeNull();
    const pain = workoutBrief(ex({ targets: [T(0, { status: "coach", action: "reduce_effort", weightKg: 80, coach: { weightKg: 80, reps: "10-12" } })] }), "breve");
    expect(pain?.text).toBe("Tu profe indicó 80 kg. Hoy no fuerces: si molesta, pará y avisale.");
  });
});
