import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import * as svc from "@/server/access/services";
import * as sp from "@/server/support/services";
import * as cm from "@/server/commercial/services";

// N-O11 / D93: canal de soporte visible con y sin sesión, bandeja de Admin con incidentes y cierre registrado.
let n = 0;
const person = async (name = "Persona Soporte") => {
  const email = `sop${++n}.${Date.now()}@test.repi.local`;
  return { id: (await svc.signUpPerson({ name, email, password: "prueba1234", terms: true })).userId!, email };
};
const admin = async () => {
  const a = await person("Admin Soporte");
  await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, a.id));
  return a.id;
};

describe("abrir una consulta", () => {
  it("con sesión queda ligada a la cuenta, con código legible y auditoría sin el texto", async () => {
    const yo = await person();
    const r = await sp.openTicket({ userId: yo.id, category: "sync", message: "No se guardó la última serie del martes" });
    expect(r.code).toMatch(/^S-[2-9A-HJKMNP-Z]{6}$/);
    const mine = await sp.myTickets(yo.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ code: r.code, status: "open", category: "sync" });
    const [t] = await db.select().from(schema.supportTicket).where(eq(schema.supportTicket.code, r.code));
    expect(t).toMatchObject({ identity: "session", contactEmail: yo.email.toLowerCase() });
    const logs = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "support.opened"), eq(schema.auditEvent.resourceId, t.id)));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].meta)).not.toContain("serie");
  });

  it("un doble envío del mismo texto devuelve la misma consulta", async () => {
    const yo = await person();
    const a = await sp.openTicket({ userId: yo.id, category: "training", message: "El descanso no suena en el teléfono" });
    const b = await sp.openTicket({ userId: yo.id, category: "training", message: "  El descanso no suena en el teléfono " });
    expect(b).toMatchObject({ code: a.code, already: true });
    expect(await sp.myTickets(yo.id)).toHaveLength(1);
  });

  it("sin sesión exige email, no se liga a la cuenta con ese correo y limita por correo", async () => {
    const yo = await person();
    await expect(sp.openTicket({ userId: null, category: "access", message: "No puedo entrar a mi cuenta" })).rejects.toMatchObject({ code: "invalid" });
    const r = await sp.openTicket({ userId: null, email: yo.email.toUpperCase(), category: "access", message: "No puedo entrar a mi cuenta desde ayer" });
    const [t] = await db.select().from(schema.supportTicket).where(eq(schema.supportTicket.code, r.code));
    expect(t).toMatchObject({ userId: null, identity: "unverified", contactEmail: yo.email.toLowerCase() });
    expect(await sp.myTickets(yo.id)).toHaveLength(0); // identidad ≠ coincidencia de email
    await sp.openTicket({ userId: null, email: yo.email, category: "access", message: "Sigo sin poder entrar, segundo aviso" });
    await sp.openTicket({ userId: null, email: yo.email, category: "access", message: "Tercer aviso: sigo sin poder entrar" });
    await expect(sp.openTicket({ userId: null, email: yo.email, category: "access", message: "Cuarto aviso del mismo correo" })).rejects.toMatchObject({ status: 429 });
  });

  it("valida tema y texto; el diagnóstico sólo guarda la lista cerrada, sin query de la ruta", async () => {
    const yo = await person();
    await expect(sp.openTicket({ userId: yo.id, category: "other", message: "corto" })).rejects.toMatchObject({ code: "invalid" });
    await expect(sp.openTicket({ userId: yo.id, category: "nada" as "other", message: "Un texto suficientemente largo" })).rejects.toMatchObject({ code: "invalid" });
    const r = await sp.openTicket({ userId: yo.id, category: "other", message: "La pantalla de inicio queda en blanco", diagnostics: {
      appVersion: "883f2884ea10", platform: "Mozilla/5.0 (iPhone)", standalone: true, online: false, pendingSync: 3, path: "/unirse/abc?code=SECRETO#x", password: "no", notes: "texto",
    } });
    const [t] = await db.select().from(schema.supportTicket).where(eq(schema.supportTicket.code, r.code));
    expect(t.diagnostics).toEqual({ appVersion: "883f2884ea10", platform: "Mozilla/5.0 (iPhone)", standalone: true, online: false, pendingSync: 3, path: "/unirse/abc" });
    expect(sp.cleanDiagnostics({ pendingSync: -1, path: "https://otro.sitio/x" })).toBeNull();
  });
});

describe("bandeja de REPI Admin", () => {
  it("sólo Admin con 2FA la ve; incidentes primero; cerrar exige respuesta; reabrir queda auditado", async () => {
    const yo = await person(), cualquiera = await person(), a = await admin();
    const normal = await sp.openTicket({ userId: yo.id, category: "billing", message: "No veo el pago de octubre" });
    const grave = await sp.openTicket({ userId: null, email: `anon${Date.now()}@test.repi.local`, category: "access", message: "Nadie del gym puede entrar hoy" });
    await expect(sp.listTickets(cualquiera.id)).rejects.toMatchObject({ status: 404 });
    const list0 = await sp.listTickets(a);
    const tGrave = list0.find((t) => t.code === grave.code)!, tNormal = list0.find((t) => t.code === normal.code)!;
    expect(tGrave.account).toBeNull();
    expect(tNormal.account).toMatchObject({ name: "Persona Soporte", email: yo.email.toLowerCase() });

    const before = await cm.adminSummary(a);
    await sp.updateTicket(a, tGrave.id, { severity: "incident", internalNote: "Afecta a toda la sede" });
    const after = await cm.adminSummary(a);
    expect(after.incidentsOpen).toBe(before.incidentsOpen + 1);
    expect((await sp.listTickets(a))[0].code).toBe(grave.code);

    await expect(sp.updateTicket(a, tNormal.id, { status: "resolved", resolution: " " })).rejects.toMatchObject({ code: "invalid" });
    const done = await sp.updateTicket(a, tNormal.id, { status: "resolved", resolution: "El pago lo registra tu coach; ya le avisamos." });
    expect(done).toMatchObject({ status: "resolved", resolvedBy: a });
    expect((await sp.myTickets(yo.id))[0]).toMatchObject({ status: "resolved", resolution: "El pago lo registra tu coach; ya le avisamos." });
    expect(JSON.stringify(await sp.myTickets(yo.id))).not.toContain("internalNote");
    expect((await sp.listTickets(a)).some((t) => t.code === normal.code)).toBe(false);
    expect((await sp.listTickets(a, "resolved")).some((t) => t.code === normal.code)).toBe(true);

    const reopened = await sp.updateTicket(a, tNormal.id, { status: "open" });
    expect(reopened).toMatchObject({ status: "open", resolvedAt: null, resolvedBy: null });
    const actions = (await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.resourceId, tNormal.id))).map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["support.opened", "support.resolved", "support.reopened"]));
    await expect(sp.updateTicket(a, "no-existe", { status: "in_progress" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("D156 · sugerencias de mejora", () => {
  it("el alumno sugiere una mejora: llega a la bandeja de sugerencias del admin (no al soporte) y ve la respuesta", async () => {
    const yo = await person();
    const ad = await admin();
    await expect(sp.openTicket({ userId: null, email: "x@test.repi.local", category: "idea", message: "Que el descanso suene más fuerte" })).rejects.toMatchObject({ code: "unauthorized" });
    const before = (await sp.supportCounts()).ideasNew;
    const r = await sp.openTicket({ userId: yo.id, category: "idea", message: "Que el descanso suene más fuerte", diagnostics: { area: "train", otra: "nada" } });
    const ideas = await sp.listTickets(ad, "ideas");
    const t = ideas.find((x) => x.code === r.code)!;
    expect(t).toMatchObject({ category: "idea", diagnostics: { area: "Entrenar" } }); // sólo el área de una lista cerrada
    expect((await sp.listTickets(ad, "active")).some((x) => x.code === r.code)).toBe(false);
    const c = await sp.supportCounts();
    expect(c.ideasNew).toBe(before + 1);
    await sp.updateTicket(ad, t.id, { status: "resolved", resolution: "¡Gracias! Lo sumamos en la próxima versión." });
    expect((await sp.myTickets(yo.id))[0]).toMatchObject({ category: "idea", status: "resolved", resolution: "¡Gracias! Lo sumamos en la próxima versión." });
  });
});
