import { describe, expect, it } from "vitest";
import { activeMemory, expiryFor, forbiddenInference, invalidate, isExpired, memoryAllowed, mergeMemory, normalizeKey, parsePreference } from "./memory";
import { NOW, mem } from "./fixtures";

describe("memory · claves y vencimientos", () => {
  it("normaliza claves por segmento", () => {
    expect(normalizeKey("Avoid_Exercise:Remo en Máquina")).toBe("avoid_exercise:remo_en_maquina");
    expect(normalizeKey("  tono ")).toBe("tono");
    expect(normalizeKey("rejected::apply substitution")).toBe("rejected:apply_substitution");
    expect(normalizeKey("x".repeat(100))).toHaveLength(64);
  });
  it("temporal vence al fin del día local o de la sesión (lo que llegue antes); decisiones y resultados a 180 días; preferencias nunca", () => {
    expect(expiryFor("temporal", "busy_equipment", NOW)).toBe("2026-11-08T02:59:59.999Z");
    expect(expiryFor("temporal", "minutes_today", NOW, { endsAt: "2026-11-07T16:30:00.000Z" })).toBe("2026-11-07T16:30:00.000Z");
    expect(expiryFor("temporal", "minutes_today", NOW, { endsAt: "2026-11-09T16:30:00.000Z" })).toBe("2026-11-08T02:59:59.999Z");
    expect(expiryFor("decision", "rejected:apply_substitution", NOW)).toBe("2027-05-06T15:00:00.000Z");
    expect(expiryFor("outcome", "short_session_done", NOW)).toBe("2027-05-06T15:00:00.000Z");
    expect(expiryFor("preference", "tone", NOW)).toBeNull();
  });
  it("vencido / vigente", () => {
    const a = mem({ kind: "temporal", key: "busy_equipment", expiresAt: "2026-11-07T14:00:00.000Z" });
    const b = mem({ kind: "preference", key: "tone" });
    expect(isExpired(a, NOW)).toBe(true);
    expect(isExpired(b, NOW)).toBe(false);
    expect(activeMemory([a, b], NOW).map((m) => m.key)).toEqual(["tone"]);
  });
});

describe("memory · unir, deduplicar e invalidar (casos 29–31, 34–35)", () => {
  it("modificar una preferencia: la más reciente gana y conserva su procedencia (caso 30)", () => {
    const old = mem({ id: "m1", kind: "preference", key: "tone", value: "normal", createdAt: "2026-10-01T10:00:00.000Z", source: "user" });
    const neu = mem({ id: "m2", kind: "preference", key: "Tone", value: "breve", createdAt: NOW, source: "user", ref: { messageId: "msg9" } });
    const out = mergeMemory([old], [neu]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "m2", key: "tone", value: "breve", ref: { messageId: "msg9" } });
  });
  it("un rechazo queda como decisión, distinto por tipo de acción (caso 29)", () => {
    const out = mergeMemory([], [mem({ kind: "decision", key: "rejected:apply_substitution" }), mem({ kind: "decision", key: "rejected:apply_short_session" })]);
    expect(out.map((m) => m.key).sort()).toEqual(["rejected:apply_short_session", "rejected:apply_substitution"]);
  });
  it("lo temporal se separa por sesión; lo sensible o de salud no entra", () => {
    const out = mergeMemory([], [
      mem({ id: "a", kind: "temporal", key: "busy_equipment", ref: { sessionId: "s1" } }), mem({ id: "b", kind: "temporal", key: "busy_equipment", ref: { sessionId: "s2" } }),
      mem({ id: "c", kind: "preference", key: "pain_shoulder", text: "Le duele el hombro" }), mem({ id: "d", kind: "preference", key: "nota", text: "Tiene ansiedad" }),
    ]);
    expect(out.map((m) => m.id).sort()).toEqual(["a", "b"]);
  });
  it("cambio de versión del programa: caen lo temporal y las decisiones atadas a la versión anterior, no las preferencias (casos 32, 50)", () => {
    const items = [
      mem({ id: "t", kind: "temporal", key: "busy_equipment", ref: { programVersionId: "v1" } }), mem({ id: "d", kind: "decision", key: "rejected:apply_substitution", ref: { programVersionId: "v1" } }),
      mem({ id: "d2", kind: "decision", key: "accepted:x", ref: { programVersionId: "v2" } }), mem({ id: "p", kind: "preference", key: "tone", ref: { programVersionId: "v1" } }),
      mem({ id: "o", kind: "outcome", key: "short_session_done", ref: { programVersionId: "v1" } }),
    ];
    const r = invalidate(items, { type: "program_version", versionId: "v2" });
    expect(r.invalidated.map((m) => m.id).sort()).toEqual(["d", "t"]);
    expect(r.keep.map((m) => m.id).sort()).toEqual(["d2", "o", "p"]);
  });
  it("cerrar la sesión invalida su contexto temporal; anular la sesión invalida todo lo que se apoyaba en ella (caso 35)", () => {
    const items = [
      mem({ id: "t1", kind: "temporal", key: "minutes_today", ref: { sessionId: "s1" } }), mem({ id: "t2", kind: "temporal", key: "busy_equipment", ref: { sessionId: "s2" } }),
      mem({ id: "o1", kind: "outcome", key: "load_ok", ref: { sessionId: "s1" } }), mem({ id: "p", kind: "preference", key: "tone", ref: { sessionId: "s1" } }),
    ];
    expect(invalidate(items, { type: "session_closed", sessionId: "s1" }).invalidated.map((m) => m.id)).toEqual(["t1"]);
    expect(invalidate(items, { type: "session_voided", sessionId: "s1" }).invalidated.map((m) => m.id).sort()).toEqual(["o1", "t1"]);
    expect(invalidate(items, { type: "memory_deleted", id: "p" }).invalidated.map((m) => m.id)).toEqual(["p"]); // caso 31
    expect(invalidate([mem({ id: "x", kind: "decision", key: "k", ref: { exerciseId: "e1" } })], { type: "exercise_changed", exerciseId: "e1" }).invalidated).toHaveLength(1);
  });
});

describe("memory · inferencias prohibidas", () => {
  it.each([
    ["tengo depresión", "psych"], ["me da ansiedad entrenar", "psych"], ["estoy en terapia", "psych"], ["tuve anorexia", "psych"],
    ["estoy embarazada", "medical"], ["soy diabético", "medical"], ["tomo medicación para la presión", "medical"], ["me operaron de la rodilla", null],
    ["soy gay", "intimate"], ["mi orientación sexual", "intimate"], ["mi religión", "intimate"],
    ["prefiero entrenar temprano", null], ["no me gusta el remo", null], ["transferencia bancaria", null],
  ])("«%s» → %s", (text, cat) => {
    expect(forbiddenInference(text)).toBe(cat);
  });
  it("memoryAllowed explica el motivo", () => {
    expect(memoryAllowed({ kind: "preference", key: "tone", text: "Respuestas breves" })).toEqual({ ok: true });
    expect(memoryAllowed({ kind: "preference", key: "injury_knee", text: "x x" })).toEqual({ ok: false, reason: "health" });
    expect(memoryAllowed({ kind: "preference", key: "nota", text: "Tiene depresión" })).toEqual({ ok: false, reason: "sensitive" });
    expect(memoryAllowed({ kind: "rumor" as never, key: "nota", text: "x" })).toEqual({ ok: false, reason: "kind" });
    expect(memoryAllowed({ kind: "preference", key: "", text: "x" })).toEqual({ ok: false, reason: "key" });
  });
});

describe("memory · preferencias declaradas (caso 30)", () => {
  it.each([
    ["Prefiero entrenar temprano", "prefers_time", "morning", "Preferís entrenar a la mañana."],
    ["me gusta entrenar a la noche", "prefers_time", "evening", "Preferís entrenar a la noche."],
    ["No me gusta el remo en máquina", "avoid_exercise:remo_en_maquina", { name: "remo en máquina" }, "No te gusta el remo en máquina."],
    ["no me gustan las estocadas porque me aburren", "avoid_exercise:estocadas", { name: "estocadas" }, "No te gustan las estocadas."],
    ["Quiero que me hables de forma breve", "tone", "breve", "Querés respuestas breves."],
    ["hablame más corto", "tone", "breve", "Querés respuestas breves."],
    ["explicame con más detalle", "tone", "normal", "Preferís respuestas más completas."],
    ["No quiero recordatorios de motivación", "category_off:motivation", false, "No querés mensajes de motivación."],
    ["no quiero el resumen semanal", "category_off:weekly", false, "No querés resúmenes semanales."],
    ["Prefiero que me consultes antes de recomendar un cambio", "confirm_before_change", true, "Querés que te consulte antes de cambiar algo."],
    ["no cambies nada sin preguntarme", "confirm_before_change", true, "Querés que te consulte antes de cambiar algo."],
    ["prefiero mancuernas", "likes_exercise:mancuernas", { name: "mancuernas" }, "Preferís mancuernas."],
    ["no quiero hacer piernas hoy", null, null, null], // es de hoy, no una preferencia permanente
    ["no me gusta que me mandes tantos mensajes", null, null, null],
    ["no me gusta entrenar con ansiedad", null, null, null], // sensible: no se guarda
    ["¿qué me toca hoy?", null, null, null],
  ])("«%s» → %s", (text, key, value, shown) => {
    const p = parsePreference(text);
    if (key === null) { expect(p).toBeNull(); return; }
    expect(p).toMatchObject({ kind: "preference", key, value, source: "user", expiresAt: null, text: shown });
  });
});
