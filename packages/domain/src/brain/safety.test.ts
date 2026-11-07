import { describe, expect, it } from "vitest";
import { AGE_REPLY, SAFETY_REPLY, canPushCoaching, canTalkBody, detectSafety, topicAllowed } from "./safety";

describe("safety · señales de alarma (caso 58)", () => {
  it.each([
    "Me duele el pecho", "tengo un dolor fuerte en el pecho", "siento presión en el pecho", "me aprieta el pecho",
    "me mareo", "estoy mareada", "me mareé en la última serie", "se me nubla la vista", "veo borroso",
    "me desmayé", "casi me desmayo", "me voy a desmayar", "perdí el conocimiento un segundo",
    "tengo palpitaciones", "el corazón me late muy rápido", "taquicardia",
    "me falta el aire", "no puedo respirar", "me cuesta respirar", "me ahogo",
    "tengo náuseas", "me descompuse", "me golpeé la cabeza con la barra", "ME DUELE EL PECHO!!!", "me dueleee el pechooo",
  ])("«%s» → alarma con respuesta fija", (text) => {
    const r = detectSafety(text);
    expect(r.level).toBe("alarm");
    expect(r.reply).toBe(SAFETY_REPLY.alarm);
  });
  it("la respuesta de alarma pide detener y buscar atención médica, sin diagnosticar", () => {
    expect(SAFETY_REPLY.alarm).toMatch(/Pará/);
    expect(SAFETY_REPLY.alarm).toMatch(/atención médica/);
    expect(SAFETY_REPLY.alarm).toMatch(/107|911/);
    expect(SAFETY_REPLY.alarm).not.toMatch(/infarto|ataque|lesión de|es normal|no es nada|tranquil/i);
  });
});

describe("safety · molestia y lesión (casos 56–57)", () => {
  it.each([
    ["Me duele el hombro cuando hago este movimiento", "hombro"], ["me duele mucho la rodilla", "rodilla"], ["dolor en la espalda", "espalda"],
    ["me molesta un poco la rodilla", "rodilla"], ["tengo molestias en el codo", "codo"], ["me lesioné la rodilla", "rodilla"],
    ["me pinché el gemelo", "gemelo"], ["tengo una contractura en la espalda", "espalda"], ["se me trabó la espalda", "espalda"],
    ["me tira el isquio", "isquiotibiales"], ["dolor de cabeza de tanto estudiar", "cabeza"], ["me duele la muñeca", "muñeca"],
    ["estoy dolorido", null], ["me duele", null], ["tengo una molestia", null], ["me hice mal haciendo peso muerto", null], ["me desgarré", null],
  ])("«%s» → molestia (zona %s)", (text, area) => {
    const r = detectSafety(text);
    expect(r.level).toBe("pain");
    expect(r.area ?? null).toBe(area);
    expect(r.reply).toMatch(/pará/i);
    expect(r.reply).toMatch(/entrenador|profesional/);
  });
  it("con el ejercicio en curso, la respuesta lo nombra y ofrece registrar con confirmación; nunca diagnostica", () => {
    const r = detectSafety("me duele el hombro", { exercise: "Press militar" });
    expect(r.reply).toMatch(/^Pará con Press militar por hoy/);
    expect(r.reply).toMatch(/el hombro/);
    expect(r.reply).toMatch(/confirmación/);
    expect(r.reply).not.toMatch(/tendinitis|desgarro|es normal|podés seguir|no es nada/i);
    expect(detectSafety("me duele la rodilla", { exercise: "Sentadilla" }).reply).toMatch(/la rodilla/);
  });
});

describe("safety · lo que no es una señal (sin falsos positivos)", () => {
  it.each([
    "me duele no entrenar", "me duele el alma", "me duele el bolsillo con la cuota", "es un dolor de cabeza esta app", "sin dolor no hay ganancia",
    "ya no me duele la rodilla", "no tengo dolor", "no, no me duele nada", "perdón la molestia, una consulta", "no es molestia",
    "no me mareo", "¿Qué me toca hoy?", "me quedan 20 minutos", "la máquina está ocupada", "hice press de pecho", "", "   ",
  ])("«%s» → nada", (text) => {
    expect(detectSafety(text).level).toBe("none");
  });
  it("una negación no cruza la frase: «no sé, me mareo» sigue siendo alarma", () => {
    expect(detectSafety("no sé, me mareo").level).toBe("alarm");
    expect(detectSafety("No sé si es normal pero me duele el hombro").level).toBe("pain");
  });
});

describe("safety · política por edad (casos 59–60)", () => {
  it("cuerpo y push de coaching sólo para adultos; edad desconocida = no", () => {
    expect([canTalkBody("adult"), canTalkBody("minor"), canTalkBody("unknown")]).toEqual([true, false, false]);
    expect([canPushCoaching("adult"), canPushCoaching("minor"), canPushCoaching("unknown")]).toEqual([true, false, false]);
  });
  it("el objetivo de peso no se responde a menores ni a edad desconocida; el resto sí", () => {
    expect(topicAllowed("body_goal", "adult")).toBe(true);
    expect(topicAllowed("body_goal", "minor")).toBe(false);
    expect(topicAllowed("body_goal", "unknown")).toBe(false);
    for (const i of ["today", "last_mark", "pain", "alarm", "explain_method"] as const) expect(topicAllowed(i, "minor")).toBe(true);
    expect(AGE_REPLY.minor).not.toMatch(/peso actual|kg/);
    expect(AGE_REPLY.unknown).toMatch(/fecha de nacimiento/);
  });
});
