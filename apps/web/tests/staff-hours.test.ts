// D170: con el horario habitual cargado, el turno del profesor empieza y termina solo; si lo cierra antes, ese día no se
// reabre. Sin horario, la app se lo pide.
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name: string) {
  const email = `sh${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as { code?: string });
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);
beforeEach(() => resetRateLimits());

describe("horario habitual del profesor", () => {
  it("lo pide, abre y cierra el turno solo, y no reabre uno cerrado a mano", async () => {
    const owner = await verified("Dueña Horario");
    const org = await acc.createGymOrganization(owner, { name: `Gym Horario ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const prof = await verified("Licha Horario");
    await db.insert(schema.staffMembership).values({ userId: prof, orgId: org.id, locationId: A.id, role: "floor_trainer" });

    expect(await gym.staffHoursFor(prof, org.id)).toMatchObject({ hours: [], missing: true });
    expect((await err(gym.setStaffHours(prof, org.id, { locationId: A.id, days: [], from: "16:00", to: "20:00" })))?.code).toBe("invalid");
    expect((await err(gym.setStaffHours(prof, org.id, { locationId: A.id, days: [1], from: "20:00", to: "16:00" })))?.code).toBe("invalid");
    const day = localDate(new Date());
    const wd = new Date(`${day}T12:00:00-03:00`).getUTCDay();
    const r = await gym.setStaffHours(prof, org.id, { locationId: A.id, days: [wd], from: "16:00", to: "20:00" });
    expect(r).toMatchObject({ missing: false, hours: [{ from: "16:00", to: "20:00" }] });

    // Antes de la franja, nada; a las 16:05 el cron lo abre (una sola vez).
    expect(await gym.ensureScheduledShift(prof, at(day, "15:59"))).toBeNull();
    expect((await gym.syncScheduledShifts(at(day, "16:05"))).opened).toBeGreaterThanOrEqual(1);
    const [open] = await db.select().from(schema.shiftLog).where(eq(schema.shiftLog.userId, prof));
    expect(open).toMatchObject({ source: "schedule", endedAt: null, locationId: A.id });
    expect(await gym.ensureScheduledShift(prof, at(day, "16:10"))).toBeNull();
    // A las 20 se cierra a la hora de fin de la franja.
    await gym.syncScheduledShifts(at(day, "20:01"));
    const [closed] = await db.select().from(schema.shiftLog).where(eq(schema.shiftLog.id, open.id));
    expect(closed.endedAt?.toISOString()).toBe(at(day, "20:00").toISOString());

    // Cerrado a mano dentro de la franja: no se reabre ese día.
    await db.delete(schema.shiftLog).where(eq(schema.shiftLog.userId, prof));
    await gym.ensureScheduledShift(prof, at(day, "17:00"));
    await db.update(schema.shiftLog).set({ endedAt: at(day, "18:00"), source: "manual" }).where(eq(schema.shiftLog.userId, prof));
    expect(await gym.ensureScheduledShift(prof, at(day, "18:30"))).toBeNull();

    // La gerencia carga el horario de su equipo; un profe no puede cargar el de otro.
    const sofi = await verified("Sofía Horario");
    await db.insert(schema.staffMembership).values({ userId: sofi, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    expect((await err(gym.setStaffHours(prof, org.id, { locationId: A.id, days: [1], from: "06:00", to: "12:00", userId: sofi })))?.code).toBe("forbidden");
    expect((await gym.setStaffHours(owner, org.id, { locationId: A.id, days: [1, 2, 3, 4, 5], from: "06:00", to: "12:00", userId: sofi })).hours[0].text).toBe("Lun a vie · 6 a 12 h");
  });

  it("dentro del horario, la acción que pide turno funciona sin iniciarlo", async () => {
    const owner = await verified("Dueña Gate");
    const org = await acc.createGymOrganization(owner, { name: `Gym Gate ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const prof = await verified("Profe Gate");
    await db.insert(schema.staffMembership).values({ userId: prof, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.setStaffHours(owner, org.id, { locationId: A.id, days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59", userId: prof });
    const ctx = await gym.gymContext(prof, org.id);
    expect(await gym.gate(ctx, A.id, "probar")).toBe(false);
    expect((await gym.activeShift(prof))?.source).toBe("schedule");
  });
});
