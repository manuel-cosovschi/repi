import { describe, expect, it } from "vitest";
import {
  canAutoMove, classifyReply, compose, copyGuard, DEFAULT_CADENCE, DEFAULT_WEIGHTS, factWins, identityKeys, intentPlan, matchLead, nextSequenceStep,
  normPhoneAR, parseFollowUpDate, scoreLead, segmentOf, validateCadence, validateWeights, waLink, igHandle, domainOf, clientsForMrr, VARIANTS, type CopyContext, type ScoreInput,
} from "./index";

describe("teléfonos argentinos", () => {
  it("normaliza formatos publicados a 10 dígitos y wa.me", () => {
    expect(normPhoneAR("+54 9 223 412-3456")?.wa).toBe("5492234123456");
    expect(normPhoneAR("(0223) 15-412-3456")?.national).toBe("2234123456");
    expect(normPhoneAR("0223 4951234")?.national).toBe("2234951234");
    expect(normPhoneAR("2266 15 432100")?.national).toBe("2266432100");
    expect(normPhoneAR("412-3456", "Mar del Plata")?.national).toBe("2234123456");
    expect(normPhoneAR("15 412-3456", "Mar del Plata")?.national).toBe("2234123456");
    expect(normPhoneAR("43210", "Mar del Plata")).toBeNull();
    expect(normPhoneAR("")).toBeNull();
  });
  it("Instagram y dominio", () => {
    expect(igHandle("https://www.instagram.com/Gym.Fox/")).toBe("gym.fox");
    expect(igHandle("@gym_fox")).toBe("gym_fox");
    expect(igHandle("https://instagram.com/p/abc")).toBe(null);
    expect(domainOf("https://www.gymfox.com.ar/contacto")).toBe("gymfox.com.ar");
    expect(domainOf("https://linktr.ee/gymfox")).toBe(null);
    expect(domainOf("instagram.com/gymfox")).toBe(null);
  });
});

describe("identidad y duplicados", () => {
  const base = { id: "a", name: "Gimnasio Fox", city: "Balcarce", address: "Calle 17 774", phone: "2266 432100", website: "https://gymfox.com.ar", instagram: "gymfox" };
  it("mismo teléfono = mismo negocio", () => {
    expect(matchLead({ name: "Fox Gym", city: "Balcarce", phone: "+54 9 2266 43-2100" }, [base])).toMatchObject({ id: "a", kind: "same" });
  });
  it("misma marca, otra dirección = sede de cadena", () => {
    expect(matchLead({ name: "Fox Gym Centro", city: "Balcarce", address: "Av. Favaloro 500", website: "gymfox.com.ar/centro" }, [base])).toMatchObject({ kind: "branch" });
  });
  it("mismo nombre y ciudad sin contradicciones = mismo; con teléfono distinto = revisión", () => {
    expect(matchLead({ name: "GIMNASIO FOX", city: "balcarce" }, [base])?.kind).toBe("same");
    expect(matchLead({ name: "Gimnasio Fox", city: "Balcarce", phone: "2266 999999" }, [base])?.kind).toBe("review");
  });
  it("nombre parecido sólo marca revisión, nunca fusiona; otra ciudad no coincide", () => {
    expect(matchLead({ name: "Gimnasio Fox Training Center", city: "Balcarce" }, [{ ...base, phone: null, website: null, instagram: null }])?.kind).toBe("review");
    expect(matchLead({ name: "Gimnasio Fox", city: "Tandil" }, [{ ...base, phone: null, website: null, instagram: null }])).toBeNull();
  });
  it("claves estables", () => {
    expect(identityKeys({ name: "Gimnasio Fox", city: "Balcarce", externalRef: "osm:node/1", phone: "2266432100" })).toEqual(["ext:osm:node/1", "tel:2266432100", "name:fox|balcarce"]);
  });
  it("procedencia: lo verificado no se pisa con lo no verificado ni con peor fuente", () => {
    const now = "2026-11-12";
    expect(factWins({ field: "phone", value: "x", sourceType: "directory", observedAt: now }, { sourceType: "official_site", status: "verified", observedAt: "2026-01-01" })).toBe(false);
    expect(factWins({ field: "phone", value: "x", sourceType: "official_site", observedAt: now }, { sourceType: "directory", status: "unverified", observedAt: "2026-01-01" })).toBe(true);
    expect(factWins({ field: "phone", value: "x", sourceType: "directory", observedAt: now, status: "verified" }, { sourceType: "official_site", status: "unverified", observedAt: now })).toBe(true);
    expect(factWins({ field: "phone", value: "x", sourceType: "osm", observedAt: now }, null)).toBe(true);
  });
});

describe("puntuación explicable", () => {
  const i: ScoreInput = {
    category: "fitness_center", geoTier: 1, estMembers: 450, branches: 1, verified: { phone: true, whatsapp: true, email: true, instagram: true, website: true },
    hasContactName: true, emailOnOwnDomain: true, techSignals: [], intent: { inbound: false, replied: false, positive: false, askedPrice: false, meeting: false }, closed: false,
  };
  it("lead completo y cercano = prioridad alta, con una línea por factor", () => {
    const r = scoreLead(i);
    expect(r.lines).toHaveLength(8);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.lines.find((l) => l.factor === "size")?.why).toBe("450 socios informados");
  });
  it("sin datos = baja y lo dice; sin evidencia no se presume necesidad", () => {
    const r = scoreLead({ ...i, category: "unknown", geoTier: null, estMembers: null, branches: null, verified: { phone: false, whatsapp: false, email: false, instagram: false, website: false }, hasContactName: false, emailOnOwnDomain: false });
    expect(r.band).toBe("low");
    expect(r.lines.find((l) => l.factor === "techNeed")?.why).toMatch(/no se presume/);
    expect(r.lines.find((l) => l.factor === "contactability")?.points).toBe(0);
  });
  it("pedir reunión sube; cerrado = 0; los pesos se pueden cambiar", () => {
    expect(scoreLead({ ...i, intent: { ...i.intent, meeting: true } }).score).toBeGreaterThan(scoreLead(i).score);
    expect(scoreLead({ ...i, closed: true }).score).toBe(0);
    const onlyProx = { ...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, 0])), proximity: 10 } as typeof DEFAULT_WEIGHTS;
    expect(scoreLead(i, onlyProx).score).toBe(100);
    expect(validateWeights(onlyProx)).toBeNull();
    expect(validateWeights({ ...onlyProx, fit: -1 })).toMatch(/inválido/);
  });
});

describe("intención de respuestas", () => {
  const today = "2026-11-12"; // jueves
  it.each([
    ["Por favor no me escriban más", "unsubscribe"],
    ["No me interesa, gracias", "not_interested"],
    ["¿Cuánto sale por mes?", "price"],
    ["Dale, coordinemos una llamada", "demo"],
    ["Mandame info así lo veo", "info"],
    ["Hablame la semana que viene", "later"],
    ["No soy el dueño, le paso tu mensaje", "not_decision_maker"],
    ["Ya usamos otro sistema para eso", "objection"],
    ["Me interesa!", "high"],
    ["👍", "human"],
  ])("«%s» → %s", (text, intent) => { expect(classifyReply(text, today).intent).toBe(intent); });
  it("la baja manda aunque haya interés", () => { expect(classifyReply("Me interesa pero no me escriban por acá", today).intent).toBe("unsubscribe"); });
  it("fechas pedidas", () => {
    expect(parseFollowUpDate("la semana que viene", today)).toBe("2026-11-16");
    expect(parseFollowUpDate("mañana", today)).toBe("2026-11-13");
    expect(parseFollowUpDate("el martes", today)).toBe("2026-11-17");
    expect(parseFollowUpDate("en 2 semanas", today)).toBe("2026-11-26");
    expect(parseFollowUpDate("el mes que viene", today)).toBe("2026-12-01");
    expect(parseFollowUpDate("en marzo", today)).toBe("2027-03-01");
    expect(parseFollowUpDate("el 20/11", today)).toBe("2026-11-20");
  });
  it("plan por intención: la baja suprime; «más adelante» crea la tarea en la fecha pedida", () => {
    expect(intentPlan(classifyReply("dame de baja", today), today)).toMatchObject({ stage: "do_not_contact", suppress: true, stopSequence: true });
    expect(intentPlan(classifyReply("hablame la semana que viene", today), today).task).toMatchObject({ kind: "callback", dueOn: "2026-11-16" });
    expect(intentPlan(classifyReply("quiero una demo", today), today)).toMatchObject({ stage: "meeting_pending", priority: true });
  });
});

describe("cadencia de seguimiento", () => {
  const s = { stage: "waiting", suppressed: false, firstSentOn: "2026-11-02", followupsSent: 0, lastSentOn: "2026-11-02", repliedAfterFirst: false, snoozeUntil: null, sequenceStopped: false };
  it("día 3, 7 y cierre el 14 (hábiles)", () => {
    expect(nextSequenceStep(s, DEFAULT_CADENCE, "2026-11-04")).toMatchObject({ action: "wait", dueOn: "2026-11-05", step: 1 });
    expect(nextSequenceStep(s, DEFAULT_CADENCE, "2026-11-05")).toMatchObject({ action: "followup", step: 1 });
    expect(nextSequenceStep({ ...s, followupsSent: 1 }, DEFAULT_CADENCE, "2026-11-09")).toMatchObject({ action: "followup", step: 2 });
    expect(nextSequenceStep({ ...s, followupsSent: 2 }, DEFAULT_CADENCE, "2026-11-16")).toMatchObject({ action: "close", step: 3 });
    expect(nextSequenceStep({ ...s, followupsSent: 3 }, DEFAULT_CADENCE, "2026-11-30").action).toBe("none");
  });
  it("respuesta, baja, etapa cerrada o fecha pedida frenan", () => {
    expect(nextSequenceStep({ ...s, repliedAfterFirst: true }, DEFAULT_CADENCE, "2026-11-30").action).toBe("none");
    expect(nextSequenceStep({ ...s, suppressed: true }, DEFAULT_CADENCE, "2026-11-30").action).toBe("none");
    expect(nextSequenceStep({ ...s, stage: "no_interest" }, DEFAULT_CADENCE, "2026-11-30").action).toBe("none");
    expect(nextSequenceStep({ ...s, snoozeUntil: "2026-11-20" }, DEFAULT_CADENCE, "2026-11-10")).toMatchObject({ action: "wait", dueOn: "2026-11-20" });
    expect(nextSequenceStep({ ...s, firstSentOn: null }, DEFAULT_CADENCE, "2026-11-30").action).toBe("none");
  });
  it("valida la cadencia configurable", () => {
    expect(validateCadence({ steps: [0, 3, 7, 14] })).toBeNull();
    expect(validateCadence({ steps: [1, 3] })).toMatch(/día 0/);
    expect(validateCadence({ steps: [0, 5, 4] })).toMatch(/crecer/);
  });
  it("etapas: lo automático sólo avanza; «no contactar» y «ganado» no se mueven solos", () => {
    expect(canAutoMove("prepared", "contacted")).toBe(true);
    expect(canAutoMove("interested", "contacted")).toBe(false);
    expect(canAutoMove("do_not_contact", "contacted")).toBe(false);
    expect(canAutoMove("won", "do_not_contact")).toBe(false);
    expect(canAutoMove("waiting", "do_not_contact")).toBe(true);
  });
});

describe("mensajes", () => {
  const ctx: CopyContext = {
    leadId: "L1", name: "Gimnasio Fox", city: "Balcarce", category: "neighborhood", estMembers: null, branches: 1, contactName: null, positioning: null,
    sender: { name: "Manuel", company: "Sovare", product: "Repi", site: "repiclub.com" }, socialProof: null, presentationUrl: "https://repiclub.com/conoce", demoUrl: null,
  };
  it("todas las variantes pasan la guarda y no nombran clientes sin autorización", () => {
    for (const v of VARIANTS) {
      const d = compose(v, { ...ctx, objection: v === "objection" ? "expensive" : null });
      expect(d.body.length).toBeGreaterThan(20);
      expect(copyGuard(d.body, { allowedNames: [], maxChars: 900 })).toEqual([]);
      expect(d.body).not.toMatch(/smart/i);
    }
  });
  it("misma entrada = mismo texto; otro lead = otra redacción", () => {
    expect(compose("first_contact", ctx).body).toBe(compose("first_contact", ctx).body);
    const bodies = new Set(["L1", "L2", "L3", "L4", "L5", "L6"].map((id) => compose("first_contact", { ...ctx, leadId: id }).body));
    expect(bodies.size).toBeGreaterThan(2);
  });
  it("segmento y argumentos según el gimnasio; email con asunto", () => {
    expect(segmentOf({ category: "chain", estMembers: null, branches: 3 })).toBe("chain");
    expect(segmentOf({ category: "traditional", estMembers: 450, branches: 1 })).toBe("large");
    const e = compose("email", { ...ctx, contactName: "Laura Pérez" });
    expect(e.subject).toBeTruthy();
    expect(e.body).toMatch(/^Hola Laura|^Laura/);
  });
  it("la guarda detecta afirmaciones prohibidas", () => {
    expect(copyGuard("Con Body Intelligence medís grasa", { allowedNames: [], maxChars: 900 })[0]).toMatch(/Body/);
    expect(copyGuard("Sale $200 por socio", { allowedNames: [], maxChars: 900 })[0]).toMatch(/precio/);
    expect(copyGuard("Trabajamos con Smart", { allowedNames: [], maxChars: 900 })[0]).toMatch(/cliente/);
    expect(copyGuard("Trabajamos con Smart", { allowedNames: ["Smart Center"], maxChars: 900 })).toEqual([]);
  });
  it("wa.me con texto y MRR", () => {
    expect(waLink("549 2234123456", "Hola ¿qué tal?")).toBe("https://wa.me/5492234123456?text=Hola%20%C2%BFqu%C3%A9%20tal%3F");
    expect(clientsForMrr(1_000_000_00, 80_000_00, 400, 200_00)).toMatchObject({ ticketMinor: 80_000_00, clients: 12 });
  });
});
