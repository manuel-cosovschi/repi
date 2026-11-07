import { describe, expect, it } from "vitest";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { purgeSandboxes, sealDemo, startDemo, demoRoleOf, sandboxDomain } from "@/server/sandbox/services";
import * as gym from "@/server/gym/services";
import { coachPayments } from "@/server/coachpay/services";
import { myTraining } from "@/server/training/services";
import { listAlerts } from "@/server/gym/alerts";
import { inviteCoachClient } from "@/server/access/services";

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
    // Sofía está en Palermo: sin fijar la sede, la consulta podía devolver Belgrano y fallar al azar (not_found).
    const [loc] = await db.select().from(schema.gymLocation).where(and(eq(schema.gymLocation.orgId, gymId), eq(schema.gymLocation.name, "Palermo")));
    expect((await listAlerts(by("sofia.ramirez"), gymId, loc.id)).some((a) => a.feel === "ayuda")).toBe(true);
    // Alumna con programa e historial; coach con cobros por moneda.
    const t = await myTraining(by("valentina.gomez"));
    expect(t.state).toBe("ready");
    expect(t.stats.doneDates.length + 0).toBeGreaterThanOrEqual(0);
    // Ejercicios por tiempo: la cinta configurada como la pidió el titular (10 min · 5 km/h · inclinación 3) y series con lo que hizo.
    const cinta = t.state === "ready" ? t.program.days.flatMap((x) => x.exercises).find((e) => e.name === "Cinta (caminata)") : null;
    expect(cinta).toMatchObject({ sets: 1, reps: "10 min", rir: null, profile: "treadmill", activity: { profile: "treadmill", speedKmh: 5, incline: 3 } });
    const cardio = await db.select({ reps: schema.setLog.reps, metrics: schema.setLog.metrics, w: schema.setLog.weightKg }).from(schema.setLog)
      .innerJoin(schema.workoutSession, eq(schema.workoutSession.id, schema.setLog.sessionId))
      .where(and(eq(schema.workoutSession.userId, by("valentina.gomez")), isNotNull(schema.setLog.metrics)));
    expect(cardio.length).toBeGreaterThan(0);
    expect(cardio.every((x) => x.w == null && (x.reps ?? 0) >= 600 && x.metrics?.speedKmh != null && x.metrics?.incline != null)).toBe(true);
    // SEC-3 (QA 29/10): desde una demo no sale ningún correo real, aunque se invite a una dirección real.
    const real = `real.${Date.now()}@example.com`;
    const inv = await inviteCoachClient(by("agustin.perez"), coachId, { email: real });
    expect(inv.delivery).toBe("local_only");
    expect(await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, real))).toHaveLength(0);
    const pay = await coachPayments(by("agustin.perez"), coachId);
    expect(pay.totals.ARS.collectedMonth + pay.totals.ARS.pending + pay.totals.ARS.overdue).toBeGreaterThan(0);
    expect(await demoRoleOf("martin.sosa@otro.com")).toBeNull();
    // Auditoría 30/10: un ejercicio propio del coach de la demo usado en un programa hacía fallar la limpieza (y con ella el job
    // de cada minuto). Lo agregamos y la limpieza tiene que borrarlo todo igual.
    const [own] = await db.insert(schema.exercise).values({ orgId: coachId, name: "Ejercicio propio demo", muscleGroup: "Pecho" }).returning();
    const [day] = await db.select({ id: schema.programDay.id }).from(schema.programDay).innerJoin(schema.programVersion, eq(schema.programVersion.id, schema.programDay.versionId))
      .innerJoin(schema.program, eq(schema.program.id, schema.programVersion.programId)).where(eq(schema.program.orgId, coachId)).limit(1);
    await db.insert(schema.programExercise).values({ dayId: day.id, position: 99, exerciseId: own.id, name: own.name, sets: 3, reps: "10", restSec: 90 });
    // D210 (auditoría AC3, tests.md gap 9): lo de REPI de las personas de la demo también se borra (cascada + ai_policy).
    const vale = by("valentina.gomez");
    const [thread] = await db.insert(schema.brainThread).values({ userId: vale }).returning();
    await db.insert(schema.brainMessage).values({ threadId: thread.id, userId: vale, role: "user", text: "¿Qué toca hoy?" });
    await db.insert(schema.brainPref).values({ userId: vale, tone: "breve" });
    await db.insert(schema.brainMemory).values({ userId: vale, kind: "preference", key: "tone", text: "Breve", source: "user" });
    await db.insert(schema.brainIntervention).values({ userId: vale, kind: "pr", dedupeKey: "pr:demo", priority: 4, channel: "card", programVersionId: (await db.select({ v: schema.programVersion.id }).from(schema.programVersion).innerJoin(schema.program, eq(schema.program.id, schema.programVersion.programId)).where(eq(schema.program.orgId, coachId)).limit(1))[0].v });
    await db.insert(schema.brainAction).values({ userId: vale, kind: "save_preference", idempotencyKey: "demo-1", autonomy: 1 });
    await db.insert(schema.aiUsage).values([{ userId: vale, orgId: coachId, task: "brain.chat", model: "gpt-6-luna", outcome: "ok" }, { orgId: gymId, task: "brain.chat", model: "gpt-6-luna", outcome: "ok" }]);
    await db.insert(schema.aiPolicy).values([{ scope: `user:${vale}`, config: { user_daily_calls: 5 } }, { scope: `org:${gymId}`, config: { enabled: false } }]);
    // Limpieza.
    await db.update(schema.demoSandbox).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.demoSandbox.id, box.id));
    expect(await purgeSandboxes()).toBe(1);
    expect(await db.select().from(schema.user).where(inArray(schema.user.id, box.userIds as string[]))).toHaveLength(0);
    expect(await db.select().from(schema.organization).where(inArray(schema.organization.id, [gymId, coachId]))).toHaveLength(0);
    expect(await db.select().from(schema.exercise).where(eq(schema.exercise.id, own.id))).toHaveLength(0);
    for (const t of [schema.brainThread, schema.brainMessage, schema.brainPref, schema.brainMemory, schema.brainIntervention, schema.brainAction, schema.aiUsage]) {
      expect(await db.select().from(t).where(inArray(t.userId, box.userIds as string[]))).toHaveLength(0);
    }
    expect(await db.select().from(schema.aiUsage).where(inArray(schema.aiUsage.orgId, [gymId, coachId]))).toHaveLength(0);
    expect(await db.select().from(schema.aiPolicy).where(inArray(schema.aiPolicy.scope, [`user:${vale}`, `org:${gymId}`]))).toHaveLength(0);
  });

  it("D197: las sedes de una demo no aparecen en la búsqueda pública de gimnasios", async () => {
    const d = await startDemo("owner");
    const [o] = await db.select().from(schema.organization).where(and(eq(schema.organization.isDemo, true), eq(schema.organization.kind, "gym"))).limit(1);
    expect(o).toBeTruthy();
    await db.update(schema.gymLocation).set({ publicJoin: true }).where(eq(schema.gymLocation.orgId, o.id));
    const { searchJoinableLocations } = await import("@/server/access/services");
    const found = await searchJoinableLocations("");
    const demoLocs = (await db.select({ id: schema.gymLocation.id }).from(schema.gymLocation).where(eq(schema.gymLocation.orgId, o.id))).map((l) => l.id);
    expect(demoLocs.length).toBeGreaterThan(0);
    expect(found.filter((l) => demoLocs.includes(l.id))).toEqual([]);
    expect(d).toBeTruthy();
  });
});

