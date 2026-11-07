import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// D210 · migración 0051: tablas del cerebro, restricciones, RLS y cascadas (contrato §4).
const BRAIN_TABLES = ["ai_breaker", "ai_policy", "ai_usage", "brain_action", "brain_intervention", "brain_memory", "brain_message", "brain_pref", "brain_thread"];
const person = async () => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Persona Esquema", email: `${id}@test.repi.local`, emailVerified: true });
  return id;
};
/** Error de Postgres (drizzle lo envuelve en `cause`). */
const pgErr = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e) => (e?.cause ?? e) as { code?: string; constraint_name?: string });

describe("0051: tablas del cerebro", () => {
  it("existen las nueve tablas, con RLS activado y sin permisos públicos", async () => {
    const rows = await db.execute<{ relname: string; rls: boolean }>(sql`select relname, relrowsecurity as rls from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname in (${sql.join(BRAIN_TABLES.map((t) => sql`${t}`), sql`, `)}) order by relname`);
    expect(rows.map((r) => r.relname)).toEqual(BRAIN_TABLES);
    expect(rows.every((r) => r.rls)).toBe(true);
    const [g] = await db.execute<{ n: number }>(sql`select count(*)::int as n from information_schema.role_table_grants
      where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in (${sql.join(BRAIN_TABLES.map((t) => sql`${t}`), sql`, `)})`);
    expect(g.n).toBe(0);
  });

  it("las restricciones rechazan valores fuera del catálogo", async () => {
    const u = await person();
    const checks: [string, PromiseLike<unknown>][] = [
      ["brain_pref_autonomy_valid", db.insert(schema.brainPref).values({ userId: u, autonomy: 3 })],
      ["brain_pref_quiet_valid", db.insert(schema.brainPref).values({ userId: u, quietStart: "25:00" })],
      ["brain_pref_max_per_day_range", db.insert(schema.brainPref).values({ userId: u, maxPerDay: 11 })],
      ["brain_pref_tone_valid", db.insert(schema.brainPref).values({ userId: u, tone: "gritón" as "normal" })],
      ["brain_memory_kind_valid", db.insert(schema.brainMemory).values({ userId: u, kind: "psych" as "preference", key: "k", text: "t", source: "user" })],
      ["brain_memory_source_valid", db.insert(schema.brainMemory).values({ userId: u, kind: "preference", key: "k", text: "t", source: "admin" as "user" })],
      ["brain_intervention_status_valid", db.insert(schema.brainIntervention).values({ userId: u, kind: "k", dedupeKey: "d1", priority: 0, channel: "card", status: "x" as "pending" })],
      ["brain_intervention_channel_valid", db.insert(schema.brainIntervention).values({ userId: u, kind: "k", dedupeKey: "d2", priority: 0, channel: "sms" as "card" })],
      ["brain_action_status_valid", db.insert(schema.brainAction).values({ userId: u, kind: "k", idempotencyKey: "i1", autonomy: 1, status: "done" as "proposed" })],
      ["brain_action_autonomy_valid", db.insert(schema.brainAction).values({ userId: u, kind: "k", idempotencyKey: "i2", autonomy: 5 })],
      ["ai_usage_outcome_valid", db.insert(schema.aiUsage).values({ task: "brain.chat", model: "m", outcome: "maybe" as "ok" })],
      ["ai_usage_counts_valid", db.insert(schema.aiUsage).values({ task: "brain.chat", model: "m", outcome: "ok", costMicros: -1 })],
      ["ai_policy_scope_valid", db.insert(schema.aiPolicy).values({ scope: "team:1" })],
    ];
    for (const [name, q] of checks) expect(await pgErr(q), name).toMatchObject({ code: "23514", constraint_name: name });
    const [t] = await db.insert(schema.brainThread).values({ userId: u }).returning();
    expect(await pgErr(db.insert(schema.brainMessage).values({ threadId: t.id, userId: u, role: "assistant" as "repi", text: "x" }))).toMatchObject({ constraint_name: "brain_message_role_valid" });
    expect(await pgErr(db.insert(schema.brainMessage).values({ threadId: t.id, userId: u, role: "repi", text: "x", feedback: 2 }))).toMatchObject({ constraint_name: "brain_message_feedback_valid" });
    expect(await pgErr(db.insert(schema.brainMessage).values({ threadId: t.id, userId: u, role: "repi", text: "x", via: "magic" as "ai" }))).toMatchObject({ constraint_name: "brain_message_via_valid" });
  });

  it("únicos: dedupe de avisos y clave idempotente por persona; una sola conversación abierta", async () => {
    const a = await person(), b = await person();
    await db.insert(schema.brainIntervention).values({ userId: a, kind: "pr", dedupeKey: "pr:x:2026-11", priority: 4, channel: "card" });
    expect(await pgErr(db.insert(schema.brainIntervention).values({ userId: a, kind: "pr", dedupeKey: "pr:x:2026-11", priority: 4, channel: "card" }))).toMatchObject({ code: "23505", constraint_name: "brain_intervention_dedupe_unique" });
    await db.insert(schema.brainIntervention).values({ userId: b, kind: "pr", dedupeKey: "pr:x:2026-11", priority: 4, channel: "card" }); // otra persona: no choca
    await db.insert(schema.brainAction).values({ userId: a, kind: "save_preference", idempotencyKey: "k-1", autonomy: 1 });
    expect(await pgErr(db.insert(schema.brainAction).values({ userId: a, kind: "save_preference", idempotencyKey: "k-1", autonomy: 1 }))).toMatchObject({ code: "23505", constraint_name: "brain_action_idempotency_unique" });
    await db.insert(schema.brainThread).values({ userId: a });
    expect(await pgErr(db.insert(schema.brainThread).values({ userId: a }))).toMatchObject({ code: "23505", constraint_name: "brain_thread_one_open" });
    await db.insert(schema.brainThread).values({ userId: a, closedAt: new Date() }); // cerradas: las que haga falta
  });

  it("borrar la persona borra todo lo suyo en cascada; borrar la organización, su uso de IA; la versión del programa queda en null", async () => {
    const u = await person(), coach = await person();
    const [org] = await db.insert(schema.organization).values({ kind: "coach", name: "Org Esquema", createdBy: coach }).returning();
    const [p] = await db.insert(schema.program).values({ orgId: org.id, kind: "template", createdBy: coach }).returning();
    const [v] = await db.insert(schema.programVersion).values({ programId: p.id, number: 1, name: "V1", weeks: 4, createdBy: coach }).returning();
    const [t] = await db.insert(schema.brainThread).values({ userId: u }).returning();
    await db.insert(schema.brainMessage).values({ threadId: t.id, userId: u, role: "user", text: "hola" });
    await db.insert(schema.brainPref).values({ userId: u });
    await db.insert(schema.brainMemory).values({ userId: u, kind: "preference", key: "tone", text: "Breve", source: "user" });
    const [iv] = await db.insert(schema.brainIntervention).values({ userId: u, kind: "k", dedupeKey: "d", priority: 1, channel: "card", programVersionId: v.id }).returning();
    await db.insert(schema.brainAction).values({ userId: u, kind: "k", idempotencyKey: "i", autonomy: 1 });
    await db.insert(schema.aiUsage).values([{ userId: u, task: "brain.chat", model: "gpt-6-luna", outcome: "ok" }, { orgId: org.id, task: "brain.chat", model: "gpt-6-luna", outcome: "ok" }]);
    await db.insert(schema.aiPolicy).values({ scope: `user:${u}`, updatedBy: coach });

    await db.delete(schema.program).where(eq(schema.program.id, p.id));
    expect((await db.select().from(schema.brainIntervention).where(eq(schema.brainIntervention.id, iv.id)))[0].programVersionId).toBeNull();
    await db.delete(schema.user).where(eq(schema.user.id, u));
    for (const [name, table] of [["brain_thread", schema.brainThread], ["brain_message", schema.brainMessage], ["brain_pref", schema.brainPref], ["brain_memory", schema.brainMemory],
      ["brain_intervention", schema.brainIntervention], ["brain_action", schema.brainAction], ["ai_usage", schema.aiUsage]] as const) {
      expect(await db.select().from(table).where(eq(table.userId, u)), name).toHaveLength(0);
    }
    expect(await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.orgId, org.id))).toHaveLength(1);
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    expect(await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.orgId, org.id))).toHaveLength(0);
    // updated_by queda en null al borrar a quien editó la política (la política no depende de esa persona).
    await db.delete(schema.user).where(eq(schema.user.id, coach));
    expect((await db.select().from(schema.aiPolicy).where(eq(schema.aiPolicy.scope, `user:${u}`)))[0].updatedBy).toBeNull();
    await db.delete(schema.aiPolicy).where(eq(schema.aiPolicy.scope, `user:${u}`));
  });
});
