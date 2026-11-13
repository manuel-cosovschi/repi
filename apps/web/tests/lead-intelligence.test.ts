// D218 · REPI Sales Intelligence 1.0: circuito completo con persistencia real sobre repi_test. Sin red: OpenStreetMap y el
// sitio oficial se simulan con un fetch de prueba; ningún mensaje sale a un proveedor.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { ingest } from "@/server/leads/store";
import { discoverOsm, readOfficialSite, robotsAllows } from "@/server/leads/sources";
import * as crm from "@/server/leads/crm";
import * as msg from "@/server/leads/messaging";
import * as camp from "@/server/leads/campaigns";
import * as ins from "@/server/leads/insights";
import * as pipe from "@/server/leads/pipeline";
import { readUnsubscribeToken, saveSettings, unsubscribeToken } from "@/server/leads/core";

const uid = () => randomUUID();
let admin = "";
const tag = uid().slice(0, 6);
const gym = (s: string) => `${s} ${tag}`;
beforeAll(async () => {
  admin = uid();
  await db.insert(schema.user).values({ id: admin, name: "Admin captación", email: `${admin}@test.repi.local`, emailVerified: true, platformRole: "admin", twoFactorEnabled: true });
});
const lead = async (id: string) => (await db.select().from(schema.leadBusiness).where(eq(schema.leadBusiness.id, id)))[0];
const fakeFetch = (routes: Record<string, { status?: number; type?: string; body: string }>): typeof fetch => (async (input: RequestInfo | URL) => {
  const u = String(input);
  const r = routes[u];
  if (!r) return new Response("no", { status: 404 });
  return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/html; charset=utf-8" } });
}) as typeof fetch;

describe("A · descubrimiento, deduplicación y procedencia", () => {
  it("OSM → candidatos con fuente; volver a encontrarlo actualiza el mismo expediente", async () => {
    const osm = { elements: [
      { type: "node", id: 9001, lat: -38, lon: -57.55, tags: { name: gym("Gimnasio Atlas"), "addr:street": "Av. Colón", "addr:housenumber": "1234", phone: "+54 223 412-3456", website: `https://atlas-${tag}.com.ar`, leisure: "fitness_centre" } },
      { type: "way", id: 77, center: { lat: -38, lon: -57.56 }, tags: { name: gym("Box Norte"), sport: "crossfit", "contact:instagram": `https://instagram.com/boxnorte${tag}` } },
      { type: "node", id: 9002, tags: { leisure: "fitness_centre" } },
    ] };
    const f = fakeFetch({ "https://overpass-api.de/api/interpreter": { body: JSON.stringify(osm), type: "application/json" } });
    const cands = await discoverOsm({ name: "Mar del Plata", province: "Buenos Aires", lat: -38, lng: -57.5, radiusKm: 10 }, f);
    expect(cands).toHaveLength(2);
    expect(cands[1].category).toBe("crossfit");
    const r1 = await ingest(cands[0], { userId: null, role: "system" });
    expect(r1.outcome).toBe("created");
    const again = await ingest(cands[0], { userId: null, role: "system" });
    expect(again).toMatchObject({ id: r1.id, outcome: "unchanged" });
    // Otra fuente con el mismo teléfono en otro formato → mismo negocio, sin duplicar.
    const dir = await ingest({ name: gym("Atlas Gym"), city: "Mar del Plata", phone: "(0223) 412-3456", email: `info@atlas-${tag}.com.ar`, source: { type: "directory", url: "https://directorio.example/atlas" } }, { userId: null, role: "system" });
    expect(dir.id).toBe(r1.id);
    const b = await lead(r1.id);
    expect(b.phoneNational).toBe("2234123456");
    expect(b.geoTier).toBe(1);
    expect(b.email).toBe(`info@atlas-${tag}.com.ar`);
    const facts = await db.select().from(schema.leadFact).where(eq(schema.leadFact.businessId, r1.id));
    expect(facts.find((x) => x.field === "website")?.sourceUrl).toBe("https://www.openstreetmap.org/node/9001");
    expect(facts.find((x) => x.field === "email")?.sourceType).toBe("directory");
    expect(facts.every((x) => x.status === "unverified")).toBe(true);
    expect(["validated", "qualified"]).toContain(b.stage);
  });
  it("misma marca en otra dirección = sede; nombre igual con otro teléfono = revisión, no fusión", async () => {
    const a = await ingest({ name: gym("Fuerza Club"), city: "Balcarce", address: "Calle 17 774", website: `https://fuerza-${tag}.com`, phone: "2266 432100", source: { type: "manual", status: "verified" } }, { userId: admin, role: "admin" });
    const br = await ingest({ name: gym("Fuerza Club Centro"), city: "Balcarce", address: "Av. Favaloro 500", website: `https://fuerza-${tag}.com/centro`, source: { type: "osm" } }, { userId: null, role: "system" });
    expect(br.outcome).toBe("branch");
    expect((await lead(br.id)).chainKey).toBe((await lead(a.id)).chainKey);
    const rv = await ingest({ name: gym("Fuerza Club"), city: "Balcarce", phone: "2266 999999", source: { type: "directory" } }, { userId: null, role: "system" });
    expect(rv.outcome).toBe("review");
    expect((await lead(rv.id)).reviewOfId).toBe(a.id);
    const merged = await crm.resolveReview(admin, rv.id, "merge");
    expect(merged.id).toBe(a.id);
    expect(await lead(rv.id)).toBeUndefined();
  });
  it("lo cargado a mano es verificado; un dato de directorio no lo pisa", async () => {
    const r = await crm.saveManual(admin, { name: gym("Vital Sport"), city: "Miramar", phone: "2291 440011", sourceUrl: "https://vital.example/contacto" });
    await ingest({ name: gym("Vital Sport"), city: "Miramar", phone: "2291 550022", source: { type: "directory" } }, { userId: null, role: "system" });
    const b = await lead(r.id);
    expect(b.phoneNational).toBe("2291440011");
    const cur = await db.select().from(schema.leadFact).where(and(eq(schema.leadFact.businessId, r.id), eq(schema.leadFact.field, "phone"), eq(schema.leadFact.current, true)));
    expect(cur[0].status).toBe("verified");
  });
  it("sitio oficial: respeta robots.txt y extrae sólo datos comerciales", async () => {
    expect(robotsAllows("User-agent: *\nDisallow: /privado", "/")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /", "/")).toBe(false);
    const site = `https://sitio-${tag}.com.ar/`;
    const html = `<html><title>Gym</title><a href="mailto:info@sitio-${tag}.com.ar">mail</a><a href="https://wa.me/5492235551234">wa</a><a href="https://www.instagram.com/gym${tag}/">ig</a><p>juan.perez@gmail.com</p><a href="/contacto">Contacto</a></html>`;
    const ok = await readOfficialSite(site, fakeFetch({ [`https://sitio-${tag}.com.ar/robots.txt`]: { body: "User-agent: *\nDisallow: /admin", type: "text/plain" }, [site]: { body: html }, [`https://sitio-${tag}.com.ar/contacto`]: { body: `<a href="tel:+542234567890">tel</a>` } }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.facts.emails).toEqual([`info@sitio-${tag}.com.ar`]); // el gmail de una persona no se toma
      expect(ok.facts.whatsapps).toEqual(["5492235551234"]);
      expect(ok.facts.phones).toEqual(["+542234567890"]);
      expect(ok.pages).toHaveLength(2);
    }
    const no = await readOfficialSite(site, fakeFetch({ [`https://sitio-${tag}.com.ar/robots.txt`]: { body: "User-agent: *\nDisallow: /", type: "text/plain" }, [site]: { body: html } }));
    expect(no).toEqual({ ok: false, reason: "robots.txt no lo permite" });
  });
});

describe("B · exclusiones y no contactar", () => {
  it("un cliente de REPI queda excluido; la baja sobrevive a un re-descubrimiento", async () => {
    const org = uid();
    await db.insert(schema.organization).values({ id: org, kind: "gym", name: gym("Smart Test Center"), status: "active" });
    const c = await ingest({ name: gym("Smart Test Center"), city: "Mar del Plata", phone: "223 600 1111", source: { type: "directory" } }, { userId: null, role: "system" });
    expect(c.excluded).toBe("customer");
    const r = await ingest({ name: gym("Pulso Gym"), city: "Mar del Plata", whatsapp: "+54 9 223 600-2222", source: { type: "directory" } }, { userId: null, role: "system" });
    await msg.suppress(admin, r.id, "Pidió no recibir mensajes por teléfono");
    await db.delete(schema.leadBusiness).where(eq(schema.leadBusiness.id, r.id));
    const back = await ingest({ name: gym("Pulso"), city: "Mar del Plata", phone: "2236002222", source: { type: "osm" } }, { userId: null, role: "system" });
    expect(back.excluded).toBe("do_not_contact");
    expect((await lead(back.id)).doNotContact).toBe(true);
    await expect(msg.createDraft(admin, back.id, { variant: "first_contact" })).rejects.toThrow(/no recibir/);
  });
});

describe("C · campaña con aprobación, envío confirmado, respuesta y seguimiento", () => {
  it("recorrido completo", async () => {
    const ids: string[] = [];
    for (const [i, n] of ["Titan", "Olimpo", "Hércules"].entries()) {
      const r = await crm.saveManual(admin, { name: gym(n), city: "Mar del Plata", whatsapp: `+54 9 223 70${i}-000${i}`, category: "fitness_center", estMembers: 300 + i * 100 });
      ids.push(r.id);
    }
    const c = await camp.createCampaign(admin, { name: `Piloto ${tag}`, channel: "whatsapp", maxRecipients: 50, minScore: 0 });
    const built = await camp.buildCampaign(admin, c.id);
    expect(built.added).toBeGreaterThanOrEqual(3);
    let d = await camp.campaignDetail(admin, c.id);
    const mine = d.recipients.filter((r) => ids.includes(r.businessId));
    expect(mine).toHaveLength(3);
    // Prueba social autorizada por el titular (12/11): nombra a Smart Center Gym y las implementaciones en curso; pasa la guarda.
    expect(mine.every((r) => r.status === "draft" && r.guardIssues.length === 0 && /Smart Center Gym/.test(r.body) && /Balcarce y Tandil/.test(r.body) && !/Estamos implementando/.test(r.body))).toBe(true);
    expect(d.preview.sendMode).toBe("manual");
    // Antes de aprobar no se puede registrar un envío de la campaña.
    await expect(msg.confirmSent(admin, mine[0].messageId)).rejects.toThrow(/aprobada/);
    await expect(camp.approveCampaign(admin, c.id, { confirm: true })).rejects.toThrow(/aprobación/);
    await camp.submitCampaign(admin, c.id);
    await expect(camp.approveCampaign(admin, c.id, { confirm: false })).rejects.toThrow(/Confirmá/);
    const ap = await camp.approveCampaign(admin, c.id, { confirm: true });
    expect(ap.count).toBe(d.recipients.length);
    d = await camp.campaignDetail(admin, c.id);
    const first = d.recipients.find((r) => r.businessId === ids[0])!;
    expect(first.links[0].url).toMatch(/^https:\/\/wa\.me\/549223700000\d\?text=/);
    // Abrir el enlace no cambia nada: sigue sin enviarse hasta confirmar.
    expect((await lead(ids[0])).firstSentOn).toBeNull();
    await msg.confirmSent(admin, first.messageId, { sentOn: "2026-11-02" });
    let b = await lead(ids[0]);
    expect(b).toMatchObject({ stage: "waiting", firstSentOn: "2026-11-02" });
    // Seguimiento por cadencia: el día 3 hábil aparece el borrador del seguimiento 1 (una sola vez).
    const f1 = await pipe.stepFollowup();
    expect(f1.followups).toBeGreaterThanOrEqual(1);
    const again = await pipe.stepFollowup();
    const tasks = await db.select().from(schema.leadTask).where(and(eq(schema.leadTask.businessId, ids[0]), eq(schema.leadTask.kind, "followup")));
    expect(tasks).toHaveLength(1);
    expect(again.errors).toEqual([]);
    // Respuesta: «hablame la semana que viene» → tarea en esa fecha, secuencia frenada, borrador de seguimiento cancelado.
    const rep = await msg.recordReply(admin, ids[0], { channel: "whatsapp", text: "Hola! Ahora estamos a full, hablame la semana que viene", receivedOn: "2026-11-12" });
    expect(rep).toMatchObject({ intent: "later", followUpOn: "2026-11-16" });
    b = await lead(ids[0]);
    expect(b).toMatchObject({ sequenceStopped: true, snoozeUntil: "2026-11-16", stage: "replied" });
    const open = await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, ids[0]), eq(schema.leadMessage.status, "draft")));
    expect(open).toHaveLength(0);
    // Pide precios y una demo → interesado y reunión pendiente; agenda la reunión.
    await msg.recordReply(admin, ids[1], { channel: "whatsapp", text: "¿Cuánto sale por mes?" });
    // Respuesta de precios: modelo por socio con los ejemplos del dossier; la guarda permite precios sólo en esta variante.
    const pr = await msg.createDraft(admin, ids[1], { variant: "pricing" });
    expect(pr.body).toMatch(/400 socios a \$200 por socio son \$80\.000 por mes/);
    expect(pr.body).toMatch(/400 socios te armo la propuesta exacta/);
    expect(pr.guardIssues).toEqual([]);
    await msg.recordReply(admin, ids[1], { channel: "whatsapp", text: "Dale, coordinemos una demo" });
    expect((await lead(ids[1])).stage).toBe("meeting_pending");
    const t = await msg.addTask(admin, ids[1], { kind: "meeting", dueOn: "2026-11-18", dueAt: "2026-11-18T10:30", note: "Demo con el dueño" });
    expect(t.calendarUrl).toMatch(/calendar\.google\.com/);
    expect((await lead(ids[1])).stage).toBe("meeting_set");
    // «No me escriban más» → no contactar y todo lo pendiente cancelado.
    await msg.recordReply(admin, ids[2], { channel: "whatsapp", text: "No me escriban más por favor" });
    expect((await lead(ids[2]))).toMatchObject({ stage: "do_not_contact", doNotContact: true });
    // Agente y panel con datos reales.
    const a1 = await ins.askAgent(admin, "¿Qué gimnasios pidieron precios?");
    expect(a1.rows?.some((r) => r.id === ids[1])).toBe(true);
    const a2 = await ins.askAgent(admin, "¿Cuáles tienen reuniones pendientes?");
    expect(a2.rows?.some((r) => r.id === ids[1])).toBe(true);
    const a3 = await ins.askAgent(admin, "¿Cuáles son los diez gimnasios más interesantes de Mar del Plata?");
    expect(a3.rows!.length).toBeGreaterThan(0);
    const a4 = await ins.askAgent(admin, "¿Cuántos clientes necesitamos para 2 millones de MRR?");
    expect(a4.answer).toMatch(/hacen falta \d+ clientes/);
    const dash = await ins.dashboard(admin, { days: 30 });
    expect(dash.comunicacion.replies).toBeGreaterThanOrEqual(4);
    expect(dash.ventas.pipelineEstimateMinor).not.toBeNull();
    const acts = await ins.topActions(5);
    expect(acts[0].kind).toBe("meeting");
  });
});

describe("D · vendedores, exportación, baja por enlace y programador", () => {
  it("asignar a un vendedor crea el prospecto en Ventas y lo saca de la cola", async () => {
    const r = await crm.saveManual(admin, { name: gym("Kinetic"), city: "Mar del Plata", email: `hola@kinetic-${tag}.com` });
    const repId = uid();
    await db.insert(schema.salesRep).values({ id: repId, code: `V-${tag.toUpperCase()}`, email: `${repId}@v.local`, name: "Vendedora", status: "active" });
    const out = await crm.assignToRep(admin, r.id, { repId, reason: "Zona de la vendedora" });
    const [p] = await db.select().from(schema.salesProspect).where(eq(schema.salesProspect.id, out.prospectId));
    expect(p).toMatchObject({ ownerRepId: repId, source: "sales_intelligence" });
    const q = await crm.listLeads(admin, { view: "queue", q: tag });
    expect(q.rows.some((x) => x.id === r.id)).toBe(false);
  });
  it("CSV sin fórmulas ejecutables y con fuentes; Excel abre", async () => {
    await crm.saveManual(admin, { name: `=HYPERLINK("x") ${tag}`, city: "Batán", phone: "223 480 0000" });
    const csv = await crm.exportCsv(admin);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split("\r\n")[0]).toContain("Fuentes");
    expect(await crm.exportXls(admin)).toContain("<Worksheet");
  });
  it("baja por enlace firmado", async () => {
    const r = await crm.saveManual(admin, { name: gym("Delta"), city: "Miramar", email: `info@delta-${tag}.com` });
    const tok = unsubscribeToken(r.id);
    expect(readUnsubscribeToken(tok)).toBe(r.id);
    expect(readUnsubscribeToken(`${r.id}.xxxxxxxxxxxxxxxxxxxxxx`)).toBeNull();
    await msg.unsubscribeByLink(r.id);
    expect((await lead(r.id)).doNotContact).toBe(true);
  });
  it("el programador corre un paso por minuto, una vez por día, sólo si está encendido", async () => {
    expect(await pipe.leadsTick(new Date("2026-11-12T12:30:00Z"))).toMatchObject({ ran: null }); // apagado
    await saveSettings(admin, { schedule: { enabled: true, days: [1, 2, 3, 4, 5], discovery: "23:58", enrich: "23:59", score: "09:00", compose: "23:57", outreach: "23:55", followup: "23:56", report: "09:05" } });
    const t1 = await pipe.leadsTick(new Date("2026-11-12T12:30:00Z")); // 09:30 AR, jueves
    expect(t1.ran).toBe("score");
    const t2 = await pipe.leadsTick(new Date("2026-11-12T12:31:00Z"));
    expect(t2.ran).toBe("report");
    expect((await pipe.leadsTick(new Date("2026-11-12T12:32:00Z"))).ran).toBeNull();
    expect((await pipe.leadsTick(new Date("2026-11-14T12:30:00Z"))).ran).toBeNull(); // sábado
    await saveSettings(admin, { schedule: { enabled: false, days: [1, 2, 3, 4, 5], discovery: "08:00", enrich: "08:30", score: "09:00", compose: "09:30", outreach: "10:00", followup: "17:30", report: "18:00" } });
  });
});

describe("E · entrada interna con CRON_SECRET", () => {
  it("sin la clave no existe; con la clave importa como sistema y excluye", async () => {
    const { POST } = await import("@/app/api/cron/leads/route");
    process.env.CRON_SECRET = "x".repeat(40);
    const call = (body: unknown, auth = true) => POST(new Request("http://localhost/api/cron/leads", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${"x".repeat(40)}` } : {}) }, body: JSON.stringify(body) }));
    expect((await call({ action: "run", step: "score" }, false)).status).toBe(404);
    const rows = [{ name: gym("Cron Gym"), city: "Tandil", instagram: `crongym${tag}`, sources: { instagram: { url: "https://ejemplo.invalid/ig", type: "search_result", seenAt: "2026-11-12" } } }, { name: gym("Atlético Sur"), city: "Tandil", phone: "249 444 1234" }];
    const r = await call({ action: "import", label: "Prueba", rows, exclusions: [{ name: gym("Atlético Sur"), city: "Tandil", reason: "Cliente actual" }] });
    expect(r.status).toBe(200);
    const j = await r.json() as { imported: { created: number }; excluded: { marked: number } };
    expect(j.imported.created).toBe(2); // nombres distintos: sin revisión de duplicado
    expect(j.excluded.marked).toBe(1);
    const run = await call({ action: "run", step: "score" });
    expect(((await run.json()) as { status: string }).status).toBe("ok");
    delete process.env.CRON_SECRET;
  });
});

describe("F · piloto automático por email, agenda pública y recordatorios", () => {
  it("manda solo, ofrece agenda, agenda con invitación, recuerda y frena con un toque", async () => {
    const { stepOutreach, bookingView, bookMeeting, meetingReminders, stopByLink, dailyDigest } = await import("@/server/leads/autopilot");
    const { bookingSigner, stopSigner } = await import("@/server/leads/core");
    const r = await crm.saveManual(admin, { name: gym("Auto Gym"), city: "Mar del Plata", email: `info@autogym-${tag}.com`, category: "fitness_center", estMembers: 450 });
    const r2 = await crm.saveManual(admin, { name: gym("Otro Auto"), city: "Mar del Plata", email: `hola@otroauto-${tag}.com`, category: "traditional", estMembers: 320 });
    const thursday10 = new Date("2026-11-12T13:00:00Z"); // 10:00 AR
    // Apagado por defecto: no manda nada.
    expect((await stepOutreach({ now: thursday10 })).reason).toMatch(/apagado/);
    await saveSettings(admin, { autopilot: { enabled: true, dailyLimit: 30, window: { from: "10:00", to: "17:30" }, followups: true, minScore: 0, social: false, socialDailyLimit: 10 }, channels: { emailSend: true, whatsappApi: false } });
    expect((await stepOutreach({ now: new Date("2026-11-14T13:00:00Z") })).reason).toMatch(/franja/); // sábado
    const o = await stepOutreach({ now: thursday10 });
    expect(o.firstContacts).toBeGreaterThanOrEqual(2);
    const [sent] = await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, r.id), eq(schema.leadMessage.status, "sent")));
    expect(sent).toMatchObject({ channel: "email", provider: "mailer" });
    expect(sent.body).toContain("/agenda/");
    expect(sent.body).toContain("WhatsApp al 223 538-3082");
    expect(sent.body).toContain("Smart Center Gym");
    const [box] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, `info@autogym-${tag}.com`));
    expect(box.body).toMatch(/\/baja\//);
    expect((await lead(r.id))).toMatchObject({ stage: "waiting" });
    // Repetir no duplica envíos.
    await stepOutreach({ now: thursday10 });
    expect((await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, r.id), eq(schema.leadMessage.status, "sent")))).length).toBe(1);
    // Agenda pública: elige horario → reunión, seguimientos cancelados, invitación al titular.
    const tok = bookingSigner.token(r.id);
    const v = await bookingView(tok);
    expect(v?.slots.length).toBeGreaterThan(0);
    const slot = v!.slots[0];
    const b1 = await bookMeeting(tok, { slot, name: "Laura", phone: "223 555 1234", email: `laura@autogym-${tag}.com` });
    expect(b1.ok).toBe(true);
    expect((await bookMeeting(bookingSigner.token(r2.id), { slot, name: "Otro", phone: "223 555 0000" })).ok).toBe(false); // ya tomado
    expect((await lead(r.id))).toMatchObject({ stage: "meeting_set", sequenceStopped: true });
    const invites = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, `${admin}@test.repi.local`));
    expect(invites.some((m) => /Reunión agendada/.test(m.subject))).toBe(true);
    const confirm = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, `laura@autogym-${tag}.com`));
    expect(confirm[0].subject).toMatch(/Reunión con Repi/);
    expect(await bookingView("x.y")).toBeNull();
    // Recordatorio: una sola vez, dentro de la ventana previa.
    const before = new Date(new Date(`${slot}:00-03:00`).getTime() - 30 * 60_000);
    expect(await meetingReminders(before)).toBe(1);
    expect(await meetingReminders(before)).toBe(0);
    // «Ya me respondió»: frena el seguimiento del otro.
    expect((await stopByLink(stopSigner.token(r2.id)))?.name).toBe(gym("Otro Auto"));
    expect((await lead(r2.id))).toMatchObject({ sequenceStopped: true });
    expect(await stopByLink("nope.nope")).toBeNull();
    const dg = await dailyDigest({ day: "2026-11-12", sent: 2, replies: 0, due: 0, errors: [] });
    expect(dg.emailed).toBeGreaterThanOrEqual(1);
    await saveSettings(admin, { autopilot: { enabled: false, dailyLimit: 8, window: { from: "10:00", to: "17:30" }, followups: true, minScore: 40, social: false, socialDailyLimit: 10 }, channels: { emailSend: false, whatsappApi: false } });
  });
});

describe("G · cola de WhatsApp e Instagram y respuestas registradas por las automatizaciones", () => {
  it("prepara la cola aprobada y registra respuestas por contacto", async () => {
    const { stepSocialQueue } = await import("@/server/leads/autopilot");
    const { POST } = await import("@/app/api/cron/leads/route");
    const w = await crm.saveManual(admin, { name: gym("Wapp Gym"), city: "Balcarce", whatsapp: "+54 9 2266 77-1111", category: "traditional", estMembers: 300 });
    const ig = await crm.saveManual(admin, { name: gym("Insta Box"), city: "Miramar", instagram: `instabox${tag}`, category: "crossfit" });
    expect((await stepSocialQueue()).reason).toMatch(/apagada/);
    await saveSettings(admin, { autopilot: { enabled: true, dailyLimit: 8, window: { from: "10:00", to: "17:30" }, followups: true, minScore: 0, social: true, socialDailyLimit: 50 } });
    const q = await stepSocialQueue();
    expect(q.queued).toBeGreaterThanOrEqual(2);
    const [mw] = await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, w.id), eq(schema.leadMessage.status, "approved")));
    expect(mw).toMatchObject({ channel: "whatsapp" });
    const [mi] = await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, ig.id), eq(schema.leadMessage.status, "approved")));
    expect(mi).toMatchObject({ channel: "instagram" });
    // Repetir no duplica la cola.
    await stepSocialQueue();
    expect((await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, w.id), eq(schema.leadMessage.direction, "out")))).length).toBe(1);
    // La sesión del Mac confirma el envío (como «Lo envié»).
    await msg.confirmSent(admin, mw.id);
    // Respuesta por WhatsApp registrada por la entrada interna: encuentra el lead por número y aplica el plan.
    process.env.CRON_SECRET = "y".repeat(40);
    const call = (body: unknown) => POST(new Request("http://localhost/api/cron/leads", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${"y".repeat(40)}` }, body: JSON.stringify(body) }));
    const r = await (await call({ action: "reply", channel: "whatsapp", from: "5492266771111", text: "Hola! Me interesa, ¿cuánto sale?" })).json() as { matched: boolean; intent: string };
    expect(r).toMatchObject({ matched: true, intent: "price" });
    expect((await lead(w.id))).toMatchObject({ stage: "interested" });
    const none = await (await call({ action: "reply", channel: "email", from: "Alguien <nadie@nada.invalid>", text: "hola" })).json() as { matched: boolean };
    expect(none.matched).toBe(false);
    delete process.env.CRON_SECRET;
    await saveSettings(admin, { autopilot: { enabled: false, dailyLimit: 8, window: { from: "10:00", to: "17:30" }, followups: true, minScore: 40, social: false, socialDailyLimit: 10 } });
  });
});

describe("H · casilla de respuestas en Resend", () => {
  it("separa la respuesta de la cita", async () => {
    const { replyOnly } = await import("@/server/leads/inbound");
    expect(replyOnly("Sí, me interesa. Llamame mañana.\n\nEl jue, 12 nov 2026 a las 10:00, Manuel (<hola@repiclub.com>)\nescribió:\n> Hola, soy Manuel")).toBe("Sí, me interesa. Llamame mañana.");
    expect(replyOnly("Dale\r\n\r\nOn Thu, Nov 12, 2026 at 10:00 AM Manuel <x@y.com> wrote:\r\n> hi")).toBe("Dale");
    expect(replyOnly("Ahora no, gracias\n\nEnviado desde mi iPhone")).toBe("Ahora no, gracias");
    expect(replyOnly("Pasame precios\n-----Mensaje original-----\nDe: Manuel")).toBe("Pasame precios");
  });
  it("se configura sola, registra la respuesta una vez, la reenvía al titular e ignora avisos ajenos", async () => {
    const { ensureInbound, handleInbound } = await import("@/server/leads/inbound");
    const { getSettings, replyAddress } = await import("@/server/leads/core");
    const sent: { to: string[]; subject: string; reply_to?: string; text: string }[] = [];
    let fail = false;
    const routes: Record<string, unknown> = {
      "GET /inboxes": { data: [] },
      "POST /inboxes": { id: "inb_test1", name: "REPI Captación", email_address: "respuestas@repiclub.com" },
      "GET /inboxes/inb_test1": { id: "inb_test1", email_address: "respuestas@repiclub.com", receiving_address: "repi-captacion@abc123.resend.app" },
      "GET /webhooks": { data: [] },
      "POST /webhooks": { id: "wh_test1", signing_secret: "whsec_x" },
      "GET /inboxes/inb_test1/threads/thr_123456/emails/em_abcdef": { id: "em_abcdef", direction: "inbound", from: `Juan Pérez <duenio@resp-${tag}.com>`, to: ["repi-captacion@abc123.resend.app"], subject: "Re: Repi para tu gimnasio", text: "Sí, me interesa. ¿Cuánto sale?\n\nEl jue, 12 nov 2026 a las 10:00, Manuel escribió:\n> Hola", html: null, received_at: "2026-11-13T13:00:00Z" },
      "GET /emails/receiving/em_abcdef": { id: "em_abcdef", from: `duenio@resp-${tag}.com`, to: ["repi-captacion@abc123.resend.app"], subject: "Re: Repi", text: "Sí", html: null, created_at: "2026-11-13T13:00:00Z" },
      "GET /emails/receiving/em_other1": { id: "em_other1", from: "x@y.com", to: ["otra@abc123.resend.app"], subject: "x", text: "x", html: null, created_at: "2026-11-13T13:00:00Z" },
    };
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      const key = `${init?.method ?? "GET"} ${u.pathname}`;
      if (fail && key.startsWith("GET /inboxes/inb_test1/threads")) return new Response("{}", { status: 503 });
      if (key === "POST /emails") { sent.push(JSON.parse(String(init?.body))); return Response.json({ id: "out_1" }); }
      return key in routes ? Response.json(routes[key]) : new Response("{}", { status: 404 });
    }) as typeof fetch);
    vi.stubEnv("MAIL_DRIVER", "resend"); vi.stubEnv("RESEND_API_KEY", "re_test_key"); vi.stubEnv("MAIL_FROM", "Repi <hola@repiclub.com>");
    try {
      const st = await ensureInbound(new Date(), { force: true });
      expect(st).toMatchObject({ status: "ok", address: "repi-captacion@abc123.resend.app", inboxId: "inb_test1", webhookId: "wh_test1" });
      expect(await replyAddress(await getSettings())).toBe("repi-captacion@abc123.resend.app");
      const r = await crm.saveManual(admin, { name: gym("Resp Gym"), city: "Tandil", email: `duenio@resp-${tag}.com`, category: "traditional" });
      const ev = { type: "inbox.email.received", data: { inbox_id: "inb_test1", thread_id: "thr_123456", email_id: "em_abcdef" } };
      fail = true;
      expect((await handleInbound(ev)).status).toBe(500); // Resend reintenta
      fail = false;
      const ok = await handleInbound(ev);
      expect(ok).toMatchObject({ status: 200, result: "recorded:price" });
      const [inMsg] = await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, r.id), eq(schema.leadMessage.direction, "in")));
      expect(inMsg).toMatchObject({ body: "Sí, me interesa. ¿Cuánto sale?", provider: "resend_inbound", providerId: "em_abcdef", intent: "price" });
      expect((await lead(r.id))).toMatchObject({ stage: "interested" });
      const fwd = sent.find((m) => m.to.includes(`${admin}@test.repi.local`));
      expect(fwd).toMatchObject({ reply_to: `duenio@resp-${tag}.com` });
      expect(fwd!.subject).toMatch(/^Respuesta de .*Resp Gym/);
      expect(fwd!.text).toMatch(/registró en la ficha/);
      // El mismo email avisado otra vez (u otro tipo de aviso): una sola respuesta.
      expect((await handleInbound({ type: "email.received", data: { email_id: "em_abcdef" } })).result).toBe("duplicate");
      // Avisos ajenos: otra casilla, otra dirección, ids raros o tipos que no son de recepción.
      expect((await handleInbound({ type: "inbox.email.received", data: { inbox_id: "inb_otra", thread_id: "thr_123456", email_id: "em_abcdef" } })).result).toBe("ignored");
      expect((await handleInbound({ type: "email.received", data: { email_id: "em_other1" } })).result).toBe("ignored");
      expect((await handleInbound({ type: "email.received", data: { email_id: "../../domains" } })).result).toBe("ignored");
      expect((await handleInbound({ type: "email.sent", data: { email_id: "em_abcdef" } })).result).toBe("ignored");
      expect((await db.select().from(schema.leadMessage).where(and(eq(schema.leadMessage.businessId, r.id), eq(schema.leadMessage.direction, "in")))).length).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await db.delete(schema.leadSetting).where(eq(schema.leadSetting.key, "inbound"));
    }
  });
});
