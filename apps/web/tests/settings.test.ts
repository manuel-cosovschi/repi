import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import * as svc from "@/server/access/services";
import { mySettings, updateSettings } from "@/server/settings/services";
import { myTraining } from "@/server/training/services";

// F-HX-23 / D95: unidad de peso persistente; sólo presentación, nada se reescribe.
let n = 0;
const person = async () => (await svc.signUpPerson({ name: "Persona Unidades", email: `un${++n}.${Date.now()}@test.repi.local`, password: "prueba1234", terms: true })).userId!;

describe("configuración del alumno", () => {
  it("kg por defecto; lb queda guardado, llega con el programa y se audita; otro valor se rechaza", async () => {
    const yo = await person();
    expect(await mySettings(yo)).toEqual({ uid: yo, weightUnit: "kg", wishes: null, theme: "system", themeChangedAt: null });
    expect((await myTraining(yo)).weightUnit).toBe("kg");
    expect(await updateSettings(yo, { weightUnit: "lb" })).toEqual({ uid: yo, weightUnit: "lb", wishes: null, theme: "system", themeChangedAt: null });
    expect((await myTraining(yo)).weightUnit).toBe("lb");
    await expect(updateSettings(yo, { weightUnit: "stone" })).rejects.toMatchObject({ code: "invalid" });
    expect(await mySettings(yo)).toEqual({ uid: yo, weightUnit: "lb", wishes: null, theme: "system", themeChangedAt: null });
    const logs = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, yo), eq(schema.auditEvent.action, "settings.updated")));
    expect(logs).toHaveLength(1);
  });
  it("no pisa la marca del centro de notificaciones ni la relación activa", async () => {
    const yo = await person();
    const seen = new Date("2026-10-01T12:00:00Z");
    await db.insert(schema.userPref).values({ userId: yo, activeRelationId: "rel-x", notificationsSeenAt: seen });
    await updateSettings(yo, { weightUnit: "lb" });
    const [p] = await db.select().from(schema.userPref).where(eq(schema.userPref.userId, yo));
    expect(p).toMatchObject({ activeRelationId: "rel-x", notificationsSeenAt: seen, weightUnit: "lb" });
  });

  it("D139: lo que busca entrenando se guarda normalizado, no pisa la unidad y se rechaza lo inválido", async () => {
    const yo = await person();
    await updateSettings(yo, { weightUnit: "lb" });
    const r = await updateSettings(yo, { wishes: { goal: "strength", daysPerWeek: 3, minutes: "50", likes: "  peso libre ", avoid: "" } });
    // D217: se guarda sobre el perfil canónico (campos nuevos vacíos, versión y procedencia «profile»).
    expect(r).toMatchObject({ uid: yo, theme: "system", themeChangedAt: null, weightUnit: "lb", wishes: { goal: "strength", daysPerWeek: 3, minutes: 50, likes: "peso libre", avoid: null, shareWithTrainers: false, experience: null } });
    expect(r.wishes!.meta).toMatchObject({ version: 1, fields: { goal: { via: "profile" } } });
    await expect(updateSettings(yo, { wishes: { minutes: 1000 } })).rejects.toMatchObject({ code: "invalid" });
    const log = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, yo), eq(schema.auditEvent.action, "profile.updated")));
    expect(JSON.stringify(log[0].meta)).not.toContain("peso libre");
  });

  // D188: apariencia de la cuenta (Claro, Oscuro, Automático), la misma en todos los roles y dispositivos.
  it("D188: Automático por defecto; Claro/Oscuro/Automático se guardan; otro valor se rechaza; no pisa la unidad", async () => {
    const yo = await person();
    await updateSettings(yo, { weightUnit: "lb" });
    expect((await mySettings(yo)).theme).toBe("system");
    for (const t of ["light", "dark", "system"] as const) {
      const r = await updateSettings(yo, { theme: t, themeChangedAt: Date.now() + (t === "light" ? 0 : t === "dark" ? 1 : 2) });
      expect(r).toMatchObject({ theme: t, weightUnit: "lb" });
    }
    for (const bad of ["Light", "auto", "", 1, null]) await expect(updateSettings(yo, { theme: bad })).rejects.toMatchObject({ code: "invalid" });
    await expect(updateSettings(yo, { theme: "dark", themeChangedAt: "ayer" })).rejects.toMatchObject({ code: "invalid" });
    expect((await mySettings(yo)).theme).toBe("system");
  });

  it("D188: gana el último cambio entre dispositivos; uno viejo (offline) no pisa y un reloj adelantado se limita", async () => {
    const yo = await person();
    const t0 = Date.now();
    expect(await updateSettings(yo, { theme: "dark", themeChangedAt: t0 })).toMatchObject({ theme: "dark", themeChangedAt: t0 });
    // Otro dispositivo, sin conexión, había elegido Claro antes: al llegar tarde no pisa.
    expect(await updateSettings(yo, { theme: "light", themeChangedAt: t0 - 60_000 })).toMatchObject({ theme: "dark", themeChangedAt: t0 });
    expect(await updateSettings(yo, { theme: "light", themeChangedAt: t0 + 1 })).toMatchObject({ theme: "light" });
    const far = await updateSettings(yo, { theme: "system", themeChangedAt: t0 + 10 * 365 * 86_400_000 });
    expect(far.theme).toBe("system");
    expect(far.themeChangedAt!).toBeLessThanOrEqual(Date.now() + 61_000);
    // El reloj adelantado sólo «gana» hasta un minuto: un cambio inmediato sin marca (ahora) todavía no lo pisa.
    expect(await updateSettings(yo, { theme: "dark" })).toMatchObject({ theme: "system" });
  });

  it("D188: cada cuenta tiene la suya; cambiarla no toca a otra persona ni datos de entrenamiento", async () => {
    const a = await person(); const b = await person();
    await updateSettings(a, { theme: "dark" });
    await updateSettings(b, { theme: "light" });
    expect((await mySettings(a)).theme).toBe("dark");
    expect((await mySettings(b)).theme).toBe("light");
    expect((await mySettings(a)).uid).toBe(a);
    const [row] = await db.select().from(schema.userPref).where(eq(schema.userPref.userId, a));
    expect(row).toMatchObject({ weightUnit: "kg", wishes: null, theme: "dark" });
    // Sin auditoría por apariencia (dato no sensible y frecuente).
    const logs = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.actorUserId, a));
    expect(logs.filter((l) => l.action.startsWith("settings."))).toHaveLength(0);
  });
});
