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
    expect(await mySettings(yo)).toEqual({ weightUnit: "kg", wishes: null });
    expect((await myTraining(yo)).weightUnit).toBe("kg");
    expect(await updateSettings(yo, { weightUnit: "lb" })).toEqual({ weightUnit: "lb", wishes: null });
    expect((await myTraining(yo)).weightUnit).toBe("lb");
    await expect(updateSettings(yo, { weightUnit: "stone" })).rejects.toMatchObject({ code: "invalid" });
    expect(await mySettings(yo)).toEqual({ weightUnit: "lb", wishes: null });
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
    expect(r).toEqual({ weightUnit: "lb", wishes: { goal: "strength", daysPerWeek: 3, minutes: 50, likes: "peso libre", avoid: null } });
    await expect(updateSettings(yo, { wishes: { minutes: 1000 } })).rejects.toMatchObject({ code: "invalid" });
    const log = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, yo), eq(schema.auditEvent.action, "settings.wishes")));
    expect(JSON.stringify(log[0].meta)).not.toContain("peso libre");
  });
});
