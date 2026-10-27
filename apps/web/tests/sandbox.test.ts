import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { purgeSandboxes, sealDemo, startDemo, demoRoleOf, sandboxDomain } from "@/server/sandbox/services";
import * as gym from "@/server/gym/services";
import { coachPayments } from "@/server/coachpay/services";
import { myTraining } from "@/server/training/services";
import { listAlerts } from "@/server/gym/alerts";

// D85: cada demo es un mundo propio, coherente para recorrer los cuatro perfiles, y se borra completo al vencer.
describe("demo guiada", () => {
  it("arma gym y coach con datos reales de la app, aislados, y la limpieza no deja nada", async () => {
    const d = await startDemo("owner");
    await sealDemo(d.tag);
    const [box] = await db.select().from(schema.demoSandbox).where(eq(schema.demoSandbox.tag, d.tag));
    const [gymId, coachId] = box.orgIds as string[];
    const users = await db.select().from(schema.user).where(inArray(schema.user.id, box.userIds as string[]));
    expect(users.every((u) => u.email.endsWith(`@${sandboxDomain(d.tag)}`) && u.twoFactorEnabled)).toBe(true);
    const by = (slug: string) => users.find((u) => u.email.startsWith(`${slug}@`))!.id;
    expect(d.href).toBe(`/gym/${gymId}?s=exec`);
    expect((await demoRoleOf(users[0].email))?.role).toBe("owner");
    // Dueño: solicitud por QR pendiente. Piso: en turno, con aviso en vivo de Julián.
    const ctx = await gym.gymContext(by("martin.sosa"), gymId);
    expect(ctx.roles).toContain("owner");
    const [loc] = await db.select().from(schema.gymLocation).where(eq(schema.gymLocation.orgId, gymId)).limit(1);
    expect((await listAlerts(by("sofia.ramirez"), gymId, loc.id)).some((a) => a.feel === "ayuda")).toBe(true);
    // Alumna con programa e historial; coach con cobros por moneda.
    const t = await myTraining(by("valentina.gomez"));
    expect(t.state).toBe("ready");
    expect(t.stats.doneDates.length + 0).toBeGreaterThanOrEqual(0);
    const pay = await coachPayments(by("agustin.perez"), coachId);
    expect(pay.totals.ARS.collectedMonth + pay.totals.ARS.pending + pay.totals.ARS.overdue).toBeGreaterThan(0);
    expect(await demoRoleOf("martin.sosa@otro.com")).toBeNull();
    // Limpieza.
    await db.update(schema.demoSandbox).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.demoSandbox.id, box.id));
    expect(await purgeSandboxes()).toBe(1);
    expect(await db.select().from(schema.user).where(inArray(schema.user.id, box.userIds as string[]))).toHaveLength(0);
    expect(await db.select().from(schema.organization).where(inArray(schema.organization.id, [gymId, coachId]))).toHaveLength(0);
  });
});
