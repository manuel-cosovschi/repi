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
    expect(await mySettings(yo)).toEqual({ weightUnit: "kg" });
    expect((await myTraining(yo)).weightUnit).toBe("kg");
    expect(await updateSettings(yo, { weightUnit: "lb" })).toEqual({ weightUnit: "lb" });
    expect((await myTraining(yo)).weightUnit).toBe("lb");
    await expect(updateSettings(yo, { weightUnit: "stone" })).rejects.toMatchObject({ code: "invalid" });
    expect(await mySettings(yo)).toEqual({ weightUnit: "lb" });
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
});
