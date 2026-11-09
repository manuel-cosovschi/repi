// D205 · Experience Hub: QR permanente sin redirecciones abiertas, eventos anónimos con vocabulario cerrado, contacto comercial
// con email o WhatsApp y origen de la visita, y el resumen de REPI Admin. Base descartable (repi_test).
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "10.55.0.1" }) }));
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { QR_CAMPAIGNS, QR_DESTINATIONS, resolveQr } from "@/lib/qr";
import { cleanPath, cleanTag } from "@/lib/site-events";
import { cleanSiteEvent, purgeSiteEvents, recordSiteEvent, siteSummary } from "@/server/site/events";
import { qrRedirect } from "@/server/site/qr";
import { createLead, listClients } from "@/server/commercial/services";
import { resetRateLimits } from "@/server/access/util";
import { leadToProspect } from "@/server/sales/crm";
import { POST as leadRoute } from "@/app/api/access/lead/route";
import { POST as eventRoute } from "@/app/api/site/event/route";

const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; status: number }; } };
const post = (url: string, body: unknown, raw = false) => new Request(`https://repiclub.com${url}`, { method: "POST", headers: { host: "repiclub.com", origin: "https://repiclub.com", "content-type": raw ? "text/plain" : "application/json" }, body: raw ? String(body) : JSON.stringify(body) });

beforeEach(async () => { await resetRateLimits(); });

describe("QR permanente (/qr)", () => {
  it("lleva a /conoce con las UTM de la remera y a cada campaña conocida", () => {
    expect(resolveQr(undefined).url).toBe("/conoce?utm_source=qr&utm_medium=remera&utm_campaign=aticma-2026");
    expect(resolveQr("folleto").url).toBe("/conoce?utm_source=qr&utm_medium=folleto&utm_campaign=folleto-2026");
    expect(resolveQr("gimnasios").url.startsWith("/conoce/gimnasios?")).toBe(true);
    for (const c of Object.values(QR_CAMPAIGNS)) expect((QR_DESTINATIONS as readonly string[]).includes(c.to)).toBe(true);
  });

  it("no es una redirección abierta: claves raras y destinos externos caen en la campaña de /qr", () => {
    for (const k of ["https://evil.example", "//evil.example", "constructor", "__proto__", "toString", "../admin", "FOLLETO "]) {
      const r = resolveQr(k);
      expect(r.key).toBe("default");
      expect(r.url.startsWith("/conoce?")).toBe(true);
    }
    // La variable de entorno sólo puede elegir un destino de la lista.
    expect(resolveQr(undefined, "/demo").url.startsWith("/demo?utm_source=qr")).toBe(true);
    for (const bad of ["https://evil.example", "//evil.example/x", "/admin", "/conoce/../admin", "javascript:alert(1)"]) {
      expect(resolveQr(undefined, bad).url.startsWith("/conoce?")).toBe(true);
    }
    // y nunca cambia el destino de otra campaña
    expect(resolveQr("folleto", "/demo").url.startsWith("/conoce?")).toBe(true);
  });

  it("responde 307 sin caché ni indexación y cuenta el escaneo sin datos de la persona", async () => {
    const before = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.siteEvent).where(eq(schema.siteEvent.name, "qr_scan")))[0].n;
    const res = await qrRedirect();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/conoce?utm_source=qr&utm_medium=remera&utm_campaign=aticma-2026");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const rows = await db.select().from(schema.siteEvent).where(eq(schema.siteEvent.name, "qr_scan"));
    expect(rows.length).toBe(before + 1);
    const last = rows.at(-1)!;
    expect(last).toMatchObject({ source: "qr", campaign: "aticma-2026", utmMedium: "remera", path: "/qr", visit: null });
  });

  it("más de 30 escaneos por minuto desde la misma IP siguen redirigiendo pero no se cuentan", async () => {
    const count = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(schema.siteEvent).where(eq(schema.siteEvent.name, "qr_scan")))[0].n;
    const a = await count();
    for (let i = 0; i < 33; i++) expect((await qrRedirect("stand")).status).toBe(307);
    expect(await count()).toBe(a + 30);
  });
});

describe("eventos anónimos del sitio", () => {
  it("sólo nombres de la lista; perfiles, orígenes y rutas cerradas; etiquetas recortadas", () => {
    expect(cleanSiteEvent({ name: "borrar_todo" })).toBeNull();
    expect(cleanSiteEvent({ name: "landing_view", profile: "hackers", source: "evil", device: "fridge", path: "/app/123", visit: "x" }))
      .toMatchObject({ name: "landing_view", profile: null, source: null, device: null, path: null, visit: null });
    expect(cleanSiteEvent({ name: "profile_select", profile: "gimnasios", source: "qr", path: "/conoce/gimnasios?x=1", visit: "abcd1234ef" }))
      .toMatchObject({ profile: "gimnasios", source: "qr", path: "/conoce/gimnasios", visit: "abcd1234ef" });
    expect(cleanTag("Remera ATICMA")).toBe("remera-aticma");
    expect(cleanTag("<script>")).toBeNull();
    expect(cleanTag("persona@mail.com")).toBeNull();
    expect(cleanPath("/conoce")).toBe("/conoce");
    expect(cleanPath("/coach/org_123")).toBeNull();
  });

  it("la ruta acepta sendBeacon (text/plain) y tandas, ignora lo desconocido y no deja registrar escaneos falsos", async () => {
    const count = async (n: string) => (await db.select({ n: sql<number>`count(*)::int` }).from(schema.siteEvent).where(eq(schema.siteEvent.name, n)))[0].n;
    const [lv, qr] = [await count("landing_view"), await count("qr_scan")];
    const res = await eventRoute(post("/api/site/event", JSON.stringify([{ name: "landing_view", visit: "visit00001", source: "qr" }, { name: "qr_scan" }, { name: "nada" }]), true), {});
    expect(res.status).toBe(204);
    expect(await count("landing_view")).toBe(lv + 1);
    expect(await count("qr_scan")).toBe(qr);
    expect((await eventRoute(post("/api/site/event", "{no es json", true), {})).status).toBe(400);
    expect((await eventRoute(post("/api/site/event", "x".repeat(5000), true), {})).status).toBe(413);
  });

  it("purga lo que pasó los 400 días", async () => {
    await db.insert(schema.siteEvent).values({ name: "landing_view", at: new Date(Date.now() - 401 * 86_400_000) });
    expect(await purgeSiteEvents()).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(schema.siteEvent).where(sql`${schema.siteEvent.at} < now() - interval '400 days'`)).length).toBe(0);
  });
});

describe("contacto comercial desde /conoce", () => {
  it("acepta WhatsApp sin email, aliados sin empresa y guarda el origen; rechaza datos incompletos", async () => {
    const tagName = `Hub ${randomUUID().slice(0, 6)}`;
    await createLead({ kind: "gym", orgName: "Gimnasio Hub", contactName: tagName, phone: "223 555-0101", source: "qr", campaign: "aticma-2026", interest: "gimnasios" });
    await createLead({ kind: "partner", contactName: `${tagName} aliado`, email: "aliado@test.repi.local", source: "utm", campaign: "LinkedIn Nov", interest: "aliados" });
    const rows = await db.select().from(schema.commercialLead).where(sql`${schema.commercialLead.contactName} like ${tagName + "%"}`);
    expect(rows.find((r) => r.kind === "gym")).toMatchObject({ email: null, phone: "223 555-0101", source: "qr", campaign: "aticma-2026", interest: "gimnasios" });
    expect(rows.find((r) => r.kind === "partner")).toMatchObject({ orgName: "—", email: "aliado@test.repi.local", source: "utm", campaign: "linkedin-nov" });
    expect((await err(createLead({ kind: "gym", orgName: "X Gym", contactName: "Ana", phone: "123" })))?.code).toBe("invalid");
    expect((await err(createLead({ kind: "coach", orgName: "", contactName: "Ana", email: "ana@test.repi.local" })))?.code).toBe("invalid");
    expect((await err(createLead({ kind: "admin", orgName: "X", contactName: "Ana", email: "ana@test.repi.local" })))?.code).toBe("invalid");
    // origen inventado: se guarda sin él
    await createLead({ kind: "coach", orgName: "Coach Hub", contactName: `${tagName} c`, email: "c@test.repi.local", source: "hack", interest: "root" });
    expect((await db.select().from(schema.commercialLead).where(eq(schema.commercialLead.contactName, `${tagName} c`)))[0]).toMatchObject({ source: null, interest: null });
  });

  it("antispam: el campo trampa o un envío en menos de 2 s responden ok pero no guardan nada; el formulario anterior sigue igual", async () => {
    const name = `Bot ${randomUUID().slice(0, 6)}`;
    const base = { kind: "gym", orgName: "Bot Gym", contactName: name, email: "bot@test.repi.local" };
    expect((await leadRoute(post("/api/access/lead", { ...base, website: "http://spam" }), {})).status).toBe(200);
    expect((await leadRoute(post("/api/access/lead", { ...base, elapsedMs: 300 }), {})).status).toBe(200);
    expect((await db.select().from(schema.commercialLead).where(eq(schema.commercialLead.contactName, name))).length).toBe(0);
    // Sitio y Acceso (sin los campos nuevos): se guarda como siempre.
    expect((await leadRoute(post("/api/access/lead", { ...base, phone: null, message: null }), {})).status).toBe(200);
    expect((await db.select().from(schema.commercialLead).where(eq(schema.commercialLead.contactName, name))).length).toBe(1);
  });
});

describe("modalidad que le interesa al gimnasio (D215: REPI Completo / REPI Control)", () => {
  const byName = async (n: string) => (await db.select().from(schema.commercialLead).where(eq(schema.commercialLead.contactName, n)))[0];
  it("se guarda sólo para gimnasios y con un valor conocido; coach y aliados quedan sin modalidad", async () => {
    const t = `Modo ${randomUUID().slice(0, 6)}`;
    for (const m of ["completo", "control", "undecided"]) await createLead({ kind: "gym", orgName: "Gym Modo", contactName: `${t} ${m}`, phone: "223 555-0110", productMode: m });
    for (const m of ["completo", "control", "undecided"]) expect((await byName(`${t} ${m}`)).productMode).toBe(m);
    await createLead({ kind: "coach", orgName: "Coach Modo", contactName: `${t} coach`, email: "coach-modo@test.repi.local", productMode: "control" });
    await createLead({ kind: "partner", contactName: `${t} aliado`, email: "aliado-modo@test.repi.local", productMode: "completo" });
    await createLead({ kind: "gym", orgName: "Gym Modo", contactName: `${t} raro`, phone: "223 555-0111", productMode: "premium" });
    await createLead({ kind: "gym", orgName: "Gym Modo", contactName: `${t} sin`, phone: "223 555-0112" });
    for (const s of ["coach", "aliado", "raro", "sin"]) expect((await byName(`${t} ${s}`)).productMode).toBeNull();
  });

  it("la ruta del formulario lo recibe; un valor desconocido no frena el contacto y se guarda sin modalidad", async () => {
    const t = `Ruta ${randomUUID().slice(0, 6)}`;
    const base = { kind: "gym", orgName: "Gym Ruta", phone: "223 555-0120", source: "qr", campaign: "aticma-2026", interest: "gimnasios", elapsedMs: 5000 };
    expect((await leadRoute(post("/api/access/lead", { ...base, contactName: `${t} a`, productMode: "control" }), {})).status).toBe(200);
    expect((await leadRoute(post("/api/access/lead", { ...base, contactName: `${t} b`, productMode: "hack" }), {})).status).toBe(200);
    expect((await leadRoute(post("/api/access/lead", { ...base, contactName: `${t} c`, productMode: null }), {})).status).toBe(200);
    expect((await leadRoute(post("/api/access/lead", { ...base, kind: "coach", contactName: `${t} d`, productMode: "control" }), {})).status).toBe(200);
    expect(await byName(`${t} a`)).toMatchObject({ productMode: "control", source: "qr", campaign: "aticma-2026", interest: "gimnasios" });
    for (const s of ["b", "c", "d"]) expect((await byName(`${t} ${s}`)).productMode).toBeNull();
    // Antispam igual que siempre, con o sin modalidad.
    expect((await leadRoute(post("/api/access/lead", { ...base, contactName: `${t} bot`, productMode: "control", website: "x" }), {})).status).toBe(200);
    expect(await byName(`${t} bot`)).toBeUndefined();
  });

  it("REPI Admin la ve en Contactos y en Sitio y QR; mode_select es un evento válido", async () => {
    const admin = randomUUID();
    await db.insert(schema.user).values({ id: admin, name: "Admin modo", email: `${admin}@test.repi.local`, emailVerified: true, platformRole: "admin", twoFactorEnabled: true });
    const t = `Admin ${randomUUID().slice(0, 6)}`;
    await createLead({ kind: "gym", orgName: "Gym Admin", contactName: t, email: "admin-modo@test.repi.local", productMode: "control" });
    const { leads } = await listClients(admin);
    const lead = leads.find((l) => l.contactName === t)!;
    expect(lead).toMatchObject({ kind: "gym", productMode: "control" });
    // Al pasar a ventas, la modalidad viaja en las notas del prospecto.
    const { id: prospectId } = await leadToProspect(admin, lead.id, {});
    const [pr] = await db.select().from(schema.salesProspect).where(eq(schema.salesProspect.id, prospectId));
    expect(pr.notes).toContain("Modalidad de interés: REPI Control.");
    const s = await siteSummary(admin);
    expect(s.leads.filter((x) => x.kind === "gym" && x.productMode === "control").reduce((a, x) => a + x.n, 0)).toBeGreaterThanOrEqual(1);
    expect(s.funnel.map((r) => r.name)).toContain("mode_select");
    expect(cleanSiteEvent({ name: "mode_select", profile: "gimnasios", target: "modo-control" })).toMatchObject({ name: "mode_select", target: "modo-control" });
  });
});

describe("REPI Admin › Sitio y QR", () => {
  it("sólo Admin con 2FA; separa QR del resto y cuenta visitas distintas", async () => {
    const id = randomUUID();
    await db.insert(schema.user).values({ id, name: "Persona común", email: `${id}@test.repi.local`, emailVerified: true });
    expect((await err(siteSummary(id)))?.status).toBe(404);
    const admin = randomUUID();
    await db.insert(schema.user).values({ id: admin, name: "Admin hub", email: `${admin}@test.repi.local`, emailVerified: true, platformRole: "admin", twoFactorEnabled: true });
    const before = await siteSummary(admin);
    const v = (x: string) => `hubvisit${x}`;
    for (const e of [
      { name: "landing_view", visit: v("01"), source: "qr" }, { name: "landing_view", visit: v("01"), source: "qr" }, { name: "landing_view", visit: v("02"), source: "direct" },
      { name: "profile_select", visit: v("01"), source: "qr", profile: "gimnasios" }, { name: "demo_start", visit: v("01"), source: "qr", target: "owner" },
    ]) expect(await recordSiteEvent(e)).toBe(true);
    const s = await siteSummary(admin);
    const lv = s.funnel.find((r) => r.name === "landing_view")!, lv0 = before.funnel.find((r) => r.name === "landing_view")!;
    expect(lv.qr - lv0.qr).toBe(2);
    expect(lv.visitsQr - lv0.visitsQr).toBe(1);
    expect(lv.other - lv0.other).toBe(1);
    expect(s.profiles.find((x) => x.profile === "gimnasios")!.n).toBeGreaterThanOrEqual(1);
    expect(s.demos.find((x) => x.name === "demo_start" && x.target === "owner")!.n).toBeGreaterThanOrEqual(1);
  });
});
