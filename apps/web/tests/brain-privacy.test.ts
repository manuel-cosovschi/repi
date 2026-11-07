import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import * as pv from "@/server/privacy/services";
import { BRAIN_RETENTION, purgeBrainRetention } from "@/server/privacy/brain";
import { updatePrefs } from "@/server/brain/prefs";
import { createMemory } from "@/server/brain/memory";
import { appendMessage, closeThread } from "@/server/brain/conversation";
import { proposeAction, upsertIntervention } from "@/server/brain/store";

// D209 · privacidad del cerebro (contrato §4): exportación completa y sin datos ajenos, borrado en cascada y retención diaria.
const DAY = 86_400_000;
const person = async (name = "Persona Privacidad REPI") => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email: `${id}@test.repi.local`, emailVerified: true, birthDate: "1990-01-01" });
  return id;
};
const seed = async (u: string, label: string) => {
  await updatePrefs(u, { tone: "breve" });
  await createMemory(u, { kind: "preference", key: "avoid_exercise", value: { exercise: label }, text: `No te gusta ${label}`, source: "user" });
  await appendMessage(u, { role: "user", text: `Pregunta de ${label}` });
  await appendMessage(u, { role: "repi", text: `Respuesta para ${label}`, via: "rules" });
  await upsertIntervention(u, { kind: "pr", category: "achievement", dedupeKey: `pr:${label}`, title: `Marca de ${label}`, body: "100 kg × 5", evidence: null, channel: "card" });
  await proposeAction(u, { kind: "save_preference", idempotencyKey: `k:${label.replace(/\W/g, "-")}`, autonomy: 1, input: { key: "avoid_exercise" } });
  await db.insert(schema.aiUsage).values({ userId: u, task: "brain.chat", model: "gpt-6-luna", outcome: "ok", inputTokens: 900, outputTokens: 120, costMicros: 150, latencyMs: 800 });
};

describe("exportación de lo del cerebro", () => {
  it("incluye preferencias, memoria, conversación, avisos, acciones y uso de IA propios; nada de otra persona", async () => {
    const yo = await person(), otro = await person("Otra Persona REPI");
    await seed(yo, "el remo"); await seed(otro, "las estocadas");
    const d = await pv.exportMyData(yo);
    expect(d.repi.prefs).toMatchObject({ tone: "breve", push: false });
    expect(d.repi.memory).toMatchObject([{ kind: "preference", key: "avoid_exercise", text: "No te gusta el remo", source: "user", revokedAt: null }]);
    expect(d.repi.conversations).toHaveLength(1);
    expect(d.repi.conversations[0].messages.map((m) => [m.role, m.text, m.via])).toEqual([["user", "Pregunta de el remo", null], ["repi", "Respuesta para el remo", "rules"]]);
    expect(d.repi.interventions).toMatchObject([{ kind: "pr", status: "pending", title: "Marca de el remo", category: "achievement" }]);
    expect(d.repi.actions).toMatchObject([{ kind: "save_preference", status: "proposed", input: { key: "avoid_exercise" } }]);
    expect(d.repi.aiUsage).toMatchObject([{ task: "brain.chat", model: "gpt-6-luna", inputTokens: 900, outputTokens: 120, costMicros: 150, outcome: "ok" }]);
    const json = JSON.stringify(d);
    expect(json).not.toContain("estocadas");
    expect(json).not.toContain(otro);
  });
});

describe("borrado de la cuenta", () => {
  it("borra en cascada todo lo del cerebro de la persona (y sólo eso)", async () => {
    const yo = await person(), otro = await person();
    await seed(yo, "sentadilla"); await seed(otro, "peso muerto");
    await db.delete(schema.user).where(eq(schema.user.id, yo));
    for (const t of [schema.brainPref, schema.brainMemory, schema.brainThread, schema.brainMessage, schema.brainIntervention, schema.brainAction, schema.aiUsage]) {
      expect(await db.select().from(t).where(eq(t.userId, yo))).toHaveLength(0);
      expect((await db.select().from(t).where(eq(t.userId, otro))).length).toBeGreaterThan(0);
    }
  });
});

describe("retención diaria", () => {
  it("borra mensajes > 180 días, avisos resueltos > 90, uso de IA > 400 y memoria vencida; conserva lo vigente y los «no mostrar más»", async () => {
    const u = await person(), now = new Date(), ago = (d: number) => new Date(now.getTime() - d * DAY);
    expect(BRAIN_RETENTION).toEqual({ messagesDays: 180, interventionsDays: 90, aiUsageDays: 400 });
    // Conversación vieja cerrada (queda vacía → se borra) y una vigente con un mensaje viejo y uno nuevo.
    const old = await appendMessage(u, { role: "user", text: "mensaje viejo" });
    await db.update(schema.brainMessage).set({ createdAt: ago(181) }).where(eq(schema.brainMessage.id, old.message.id));
    await closeThread(u);
    await db.update(schema.brainThread).set({ updatedAt: ago(181) }).where(eq(schema.brainThread.id, old.message.threadId));
    const cur1 = await appendMessage(u, { role: "user", text: "también viejo" });
    await db.update(schema.brainMessage).set({ createdAt: ago(200) }).where(eq(schema.brainMessage.id, cur1.message.id));
    const cur2 = await appendMessage(u, { role: "repi", text: "reciente", via: "rules" });
    // Avisos.
    const iv = async (status: "dismissed" | "never" | "pending" | "suppressed" | "accepted", created: Date, resolved: Date | null, expires: Date | null = null) =>
      (await db.insert(schema.brainIntervention).values({ userId: u, kind: "k", dedupeKey: `d:${randomUUID()}`, priority: 3, channel: "card", status, createdAt: created, resolvedAt: resolved, expiresAt: expires }).returning())[0].id;
    const dismissedOld = await iv("dismissed", ago(120), ago(91));
    const dismissedNew = await iv("accepted", ago(100), ago(10));
    const neverOld = await iv("never", ago(300), ago(300));
    const suppressedOld = await iv("suppressed", ago(95), null);
    const pendingStale = await iv("pending", ago(95), null);
    const pendingExpired = await iv("pending", ago(5), null, ago(1));
    const pendingLive = await iv("pending", ago(5), null, new Date(now.getTime() + DAY));
    // Uso de IA.
    const [usageOld, usageKept, inflightStale] = (await db.insert(schema.aiUsage).values([
      { userId: u, task: "brain.chat", model: "gpt-6-luna", outcome: "ok", createdAt: ago(401) },
      { userId: u, task: "brain.chat", model: "gpt-6-luna", outcome: "ok", createdAt: ago(399) },
      { userId: u, task: "brain.chat", model: "gpt-6-luna", outcome: null, createdAt: ago(1) },
    ]).returning()).map((r) => r.id);
    // Memoria: vencida, revocada hace 31 días y vigente.
    const mem = await db.insert(schema.brainMemory).values([
      { userId: u, kind: "temporal", key: "busy_equipment", text: "Máquina ocupada", source: "user", expiresAt: ago(1) },
      { userId: u, kind: "decision", key: "accepted:x", text: "Aceptaste", source: "system", revokedAt: ago(31), expiresAt: new Date(now.getTime() + 100 * DAY) },
      { userId: u, kind: "preference", key: "tone", text: "Breve", source: "user" },
    ]).returning();

    const r = await purgeBrainRetention(now);
    expect(r.messages).toBeGreaterThanOrEqual(2);
    expect(r.interventions).toBeGreaterThanOrEqual(3);
    const msgs = await db.select().from(schema.brainMessage).where(eq(schema.brainMessage.userId, u));
    expect(msgs.map((m) => m.id)).toEqual([cur2.message.id]);
    expect(await db.select().from(schema.brainThread).where(eq(schema.brainThread.id, old.message.threadId))).toHaveLength(0);
    expect(await db.select().from(schema.brainThread).where(eq(schema.brainThread.id, cur2.message.threadId))).toHaveLength(1);
    const left = new Map((await db.select().from(schema.brainIntervention).where(eq(schema.brainIntervention.userId, u))).map((i) => [i.id, i.status]));
    expect([...left.keys()].sort()).toEqual([dismissedNew, neverOld, pendingExpired, pendingLive].sort());
    expect(left.get(pendingExpired)).toBe("expired"); // vencido: se marca, y se borra a los 90 días
    expect(left.has(dismissedOld) || left.has(suppressedOld) || left.has(pendingStale)).toBe(false);
    const usage = new Map((await db.select().from(schema.aiUsage).where(inArray(schema.aiUsage.id, [usageOld, usageKept, inflightStale]))).map((x) => [x.id, x.outcome]));
    expect(usage.has(usageOld)).toBe(false);
    expect(usage.get(usageKept)).toBe("ok");
    expect(usage.get(inflightStale)).toBe("error"); // «en curso» huérfana: se cierra
    expect((await db.select().from(schema.brainMemory).where(eq(schema.brainMemory.userId, u))).map((m) => m.id)).toEqual([mem[2].id]);
  });
});
