import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { DEFAULT_PREFS } from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { AccessError } from "@/server/access/util";
import { getPrefs, updatePrefs } from "@/server/brain/prefs";
import { createMemory, correctMemory, defaultExpiry, deleteMemory, listMemory, purgeExpiredMemory, revokeMemory, revokeMemoryByRef } from "@/server/brain/memory";
import { appendMessage, closeThread, currentThread, lastTurns, listMessages, setFeedback, threadWithMessages } from "@/server/brain/conversation";
import {
  activeInterventions, arDayStart, cancelObsoleteInterventions, executeActionOnce, getAction, markIntervention, proposeAction, recentInterventions,
  transitionAction, upsertIntervention, type InterventionInput,
} from "@/server/brain/store";

// D209 · persistencia del cerebro: preferencias, memoria, conversación, avisos y acciones. Todo es de la persona: otra cuenta
// no lee ni modifica nada (casos 40, 62, 63) y los reintentos no duplican (casos 23 y 49).
const person = async (birthDate: string | null = "1990-01-01") => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Persona Cerebro", email: `${id}@test.repi.local`, emailVerified: true, birthDate });
  return id;
};
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const card = (over: Partial<InterventionInput> = {}): InterventionInput => ({
  kind: "pr", category: "achievement", dedupeKey: `pr:${randomUUID()}`, title: "Nueva marca", body: "Sentadilla 100 kg × 5.", channel: "card",
  evidence: { basis: "Comparé tus sesiones del 12/10 y 19/10.", via: "data" }, ...over,
});

describe("preferencias", () => {
  it("sin fila devuelve los valores por defecto; cambiar una no toca las demás", async () => {
    const u = await person();
    expect(await getPrefs(u)).toEqual(DEFAULT_PREFS);
    const p = await updatePrefs(u, { tone: "breve", categories: { motivation: true } });
    expect(p).toEqual({ ...DEFAULT_PREFS, tone: "breve", categories: { ...DEFAULT_PREFS.categories, motivation: true } });
    expect(await getPrefs(u)).toEqual(p);
    expect(await updatePrefs(u, { maxPerDay: 0, quietStart: "23:30" })).toMatchObject({ tone: "breve", maxPerDay: 0, quietStart: "23:30" });
  });
  it("valida estricto: fuera de rango o campo desconocido → 400 y no guarda nada", async () => {
    const u = await person();
    for (const bad of [{ autonomy: 3 }, { quietStart: "25:00" }, { maxPerDay: 11 }, { tone: "gritón" }, { admin: true }, { categories: { otra: true } }, "x", null]) {
      expect(await err(updatePrefs(u, bad)), JSON.stringify(bad)).toMatchObject({ code: "invalid", status: 400 });
    }
    expect(await db.select().from(schema.brainPref).where(eq(schema.brainPref.userId, u))).toHaveLength(0);
  });
  it("push sólo para mayores de 18 (menor o edad desconocida: 403)", async () => {
    const adult = await person("1990-01-01"), minor = await person("2013-05-01"), unknown = await person(null);
    expect((await updatePrefs(adult, { push: true })).push).toBe(true);
    expect(await err(updatePrefs(minor, { push: true }))).toMatchObject({ code: "minor_restricted", status: 403 });
    expect(await err(updatePrefs(unknown, { push: true }))).toMatchObject({ code: "age_required", status: 403 });
    expect((await updatePrefs(minor, { tone: "breve" })).push).toBe(false); // el resto sí puede cambiarlo
  });
});

describe("memoria", () => {
  it("vence según el tipo y no duplica lo mismo", async () => {
    const u = await person(), now = new Date();
    const pref = await createMemory(u, { kind: "preference", key: "avoid_exercise", value: { exercise: "remo en máquina" }, text: "No te gusta el remo en máquina", source: "user" });
    expect(pref).toMatchObject({ created: true, item: { expiresAt: null, source: "user" } });
    const again = await createMemory(u, { kind: "preference", key: "avoid_exercise", value: { exercise: "remo en máquina" }, text: "No te gusta el remo en máquina", source: "user" });
    expect(again).toMatchObject({ created: false, item: { id: pref.item.id } });
    const other = await createMemory(u, { kind: "preference", key: "avoid_exercise", value: { exercise: "estocadas" }, text: "No te gustan las estocadas", source: "user" });
    expect(other.created).toBe(true);
    const temp = await createMemory(u, { kind: "temporal", key: "busy_equipment", value: { exercise: "e1" }, text: "Máquina ocupada", source: "user" }, now);
    expect(new Date(temp.item.expiresAt!).getTime()).toBe(arDayStart(now).getTime() + 86_400_000); // fin del día en Buenos Aires
    const dec = await createMemory(u, { kind: "decision", key: "rejected:propose_substitution", text: "Rechazaste cambiar el jalón", source: "system" }, now);
    expect(new Date(dec.item.expiresAt!).getTime()).toBe(defaultExpiry("decision", now)!.getTime());
    // Un vencimiento explícito no puede pasar el tope del tipo (temporal: 2 días).
    const long = await createMemory(u, { kind: "temporal", key: "minutes_today", value: 30, text: "Hoy tenés 30 minutos", source: "user", expiresAt: new Date(now.getTime() + 30 * 86_400_000) }, now);
    expect(new Date(long.item.expiresAt!).getTime() - now.getTime()).toBeLessThanOrEqual(2 * 86_400_000);
    expect((await listMemory(u)).map((m) => m.key).sort()).toEqual(["avoid_exercise", "avoid_exercise", "busy_equipment", "minutes_today", "rejected:propose_substitution"]);
    // Al día siguiente lo temporal ya no aparece, y la purga lo borra.
    const tomorrow = new Date(now.getTime() + 3 * 86_400_000);
    expect((await listMemory(u, tomorrow)).some((m) => m.kind === "temporal")).toBe(false);
    expect(await purgeExpiredMemory(tomorrow)).toBeGreaterThanOrEqual(2);
    expect((await db.select().from(schema.brainMemory).where(and(eq(schema.brainMemory.userId, u), eq(schema.brainMemory.kind, "temporal"))))).toHaveLength(0);
  });
  it("valida el formato (clave, texto, tipo, origen)", async () => {
    const u = await person();
    for (const bad of [{ key: "Con Espacios" }, { text: "" }, { text: "x".repeat(281) }, { kind: "psych" }, { source: "admin" }, { value: "x".repeat(2_100) }]) {
      const item = { kind: "preference", key: "tone", text: "Breve", source: "user", ...bad } as Parameters<typeof createMemory>[1];
      expect(await err(createMemory(u, item)), JSON.stringify(bad).slice(0, 40)).toMatchObject({ code: "invalid" });
    }
  });
  it("casos 40/62/63: otra persona (también un gerente o alguien de otra organización) no lee, corrige, revoca ni borra memoria ajena", async () => {
    const a = await person(), b = await person();
    const { item } = await createMemory(a, { kind: "preference", key: "tone", value: "breve", text: "Preferís respuestas breves", source: "user" });
    expect((await listMemory(b)).some((m) => m.id === item.id)).toBe(false);
    expect(await err(correctMemory(b, item.id, { text: "otra cosa" }))).toMatchObject({ status: 404 });
    expect(await err(revokeMemory(b, item.id))).toMatchObject({ status: 404 });
    expect(await err(deleteMemory(b, item.id))).toMatchObject({ status: 404 });
    expect(await revokeMemoryByRef(b, { tone: "breve" })).toBe(0);
    expect((await listMemory(a)).map((m) => m.text)).toEqual(["Preferís respuestas breves"]);
  });
  it("la persona corrige y borra lo suyo (definitivo, auditoría sin contenido); revocar por dato de origen lo saca de la vigente", async () => {
    const a = await person();
    const m1 = (await createMemory(a, { kind: "preference", key: "prefers_time", value: "early", text: "Preferís temprano", source: "user" })).item;
    expect((await correctMemory(a, m1.id, { text: "Preferís a la tarde", value: "late" })).text).toBe("Preferís a la tarde");
    await deleteMemory(a, m1.id);
    expect(await db.select().from(schema.brainMemory).where(eq(schema.brainMemory.id, m1.id))).toHaveLength(0);
    const [log] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, a), eq(schema.auditEvent.action, "brain.memory_deleted")));
    expect(JSON.stringify(log.meta)).not.toContain("tarde");
    const m2 = (await createMemory(a, { kind: "decision", key: "accepted:apply_substitution", text: "Aceptaste el jalón unilateral", source: "system", ref: { programVersionId: "v1", exerciseId: "e1" } })).item;
    expect(await revokeMemoryByRef(a, { programVersionId: "v1" })).toBe(1);
    expect((await listMemory(a)).some((m) => m.id === m2.id)).toBe(false);
    expect(await revokeMemory(a, m2.id)).toEqual({ revoked: false }); // idempotente
  });
});

describe("conversación", () => {
  it("una sola conversación abierta aunque se pida varias veces a la vez; cerrar deja empezar otra", async () => {
    const u = await person();
    const ts = await Promise.all(Array.from({ length: 5 }, () => currentThread(u)));
    expect(new Set(ts.map((t) => t.id)).size).toBe(1);
    expect(await closeThread(u)).toEqual({ closed: true });
    expect(await closeThread(u)).toEqual({ closed: false });
    const t2 = await currentThread(u);
    expect(t2.id).not.toBe(ts[0].id);
    expect(await err(appendMessage(u, { threadId: ts[0].id, role: "user", text: "¿sigo acá?" }))).toMatchObject({ code: "thread_closed", status: 409 });
  });
  it("mensajes en orden, con procedencia; el reintento con el mismo id no duplica; lastTurns da los últimos 6", async () => {
    const u = await person();
    const id = randomUUID();
    const m1 = await appendMessage(u, { id, role: "user", text: "¿Qué toca hoy?", section: "home" });
    expect((await appendMessage(u, { id, role: "user", text: "¿Qué toca hoy?" })).created).toBe(false);
    expect(m1.created).toBe(true);
    await appendMessage(u, { role: "repi", text: "Hoy toca Pierna A.", via: "rules", cards: [{ type: "fact", title: "Hoy", rows: [{ label: "Día", value: "Pierna A" }], via: "data" }] });
    for (let i = 0; i < 6; i++) await appendMessage(u, { role: i % 2 ? "repi" : "user", text: `turno ${i}` });
    const all = await listMessages(u);
    expect(all).toHaveLength(8);
    expect(all[0]).toMatchObject({ role: "user", text: "¿Qué toca hoy?", section: "home", via: null });
    expect(all[1]).toMatchObject({ role: "repi", via: "rules", cards: [{ type: "fact" }] });
    expect((await lastTurns(u)).map((t) => t.text)).toEqual(["turno 0", "turno 1", "turno 2", "turno 3", "turno 4", "turno 5"]);
    expect((await threadWithMessages(u)).messages).toHaveLength(8);
    expect(await err(appendMessage(u, { role: "user", text: "x".repeat(1_001) }))).toMatchObject({ code: "invalid" });
  });
  it("casos 40/62/63: otra persona no lee, escribe ni opina en una conversación ajena", async () => {
    const a = await person(), b = await person();
    const t = await currentThread(a);
    const { message } = await appendMessage(a, { role: "repi", text: "Tu última marca fue 80 kg × 6.", via: "rules" });
    expect(await err(listMessages(b, { threadId: t.id }))).toMatchObject({ status: 404 });
    expect(await err(appendMessage(b, { threadId: t.id, role: "user", text: "hola" }))).toMatchObject({ status: 404 });
    expect(await err(closeThread(b, t.id))).toMatchObject({ status: 404 });
    expect(await err(setFeedback(b, message.id, 1))).toMatchObject({ status: 404 });
    expect(await err(appendMessage(b, { id: message.id, role: "user", text: "pisar el id ajeno" }))).toMatchObject({ status: 409 });
    expect(await listMessages(b)).toEqual([]);
    expect((await setFeedback(a, message.id, -1)).feedback).toBe(-1);
    const mine = await appendMessage(a, { role: "user", text: "gracias" });
    expect(await err(setFeedback(a, mine.message.id, 1))).toMatchObject({ status: 404 }); // sólo respuestas de REPI
  });
});

describe("avisos", () => {
  it("caso 49: el cron repetido (también en paralelo) no duplica el aviso", async () => {
    const u = await person(), c = card();
    const rs = await Promise.all(Array.from({ length: 4 }, () => upsertIntervention(u, c)));
    expect(rs.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(rs.map((r) => r.intervention.id)).size).toBe(1);
    expect((await upsertIntervention(u, c)).created).toBe(false);
    expect(await db.select().from(schema.brainIntervention).where(and(eq(schema.brainIntervention.userId, u), eq(schema.brainIntervention.dedupeKey, c.dedupeKey)))).toHaveLength(1);
  });
  it("lo suprimido (horario de silencio) se emite después con la misma clave; lo mostrado o descartado no reaparece", async () => {
    const u = await person(), c = card({ category: "progress", kind: "progressing" });
    const s = await upsertIntervention(u, { ...c, status: "suppressed", reason: "quiet_hours" });
    expect(s.intervention).toMatchObject({ status: "suppressed", reason: "quiet_hours", category: "progress", priority: 3 });
    expect(await activeInterventions(u)).toHaveLength(0);
    await db.update(schema.brainIntervention).set({ createdAt: new Date(Date.now() - 86_400_000) }).where(eq(schema.brainIntervention.id, s.intervention.id));
    const p = await upsertIntervention(u, c);
    expect(p).toMatchObject({ created: false, upgraded: true, intervention: { id: s.intervention.id, status: "pending", reason: null } });
    expect(Date.now() - new Date(p.intervention.createdAt).getTime()).toBeLessThan(60_000); // cuenta como emitido hoy (tope diario)
    await markIntervention(u, p.intervention.id, "dismissed");
    expect((await upsertIntervention(u, c)).intervention.status).toBe("dismissed");
    expect((await upsertIntervention(u, { ...c, status: "suppressed" })).intervention.status).toBe("dismissed");
  });
  it("vigentes por prioridad, sin vencidos; el historial para relevancia trae la categoría y los «no mostrar más» viejos", async () => {
    const u = await person(), now = new Date();
    await upsertIntervention(u, card({ category: "reminder", kind: "weekly", dedupeKey: `w:${randomUUID()}` }));
    await upsertIntervention(u, card({ category: "safety", kind: "pain", dedupeKey: `p:${randomUUID()}` }));
    await upsertIntervention(u, card({ dedupeKey: `old:${randomUUID()}`, expiresAt: new Date(now.getTime() - 1000) }));
    const act = await activeInterventions(u, now);
    expect(act.map((i) => i.category)).toEqual(["safety", "reminder"]);
    expect(act[0]).toMatchObject({ title: "Nueva marca", body: "Sentadilla 100 kg × 5.", evidence: { via: "data" } });
    const never = await upsertIntervention(u, card({ kind: "motivation", category: "motivation", dedupeKey: `m:${randomUUID()}` }));
    await markIntervention(u, never.intervention.id, "never");
    await db.update(schema.brainIntervention).set({ createdAt: new Date(now.getTime() - 200 * 86_400_000) }).where(eq(schema.brainIntervention.id, never.intervention.id));
    const recent = await recentInterventions(u, {}, now);
    expect(recent.find((r) => r.kind === "motivation")).toMatchObject({ status: "never", category: "motivation" });
    expect(recent).toHaveLength(4);
  });
  it("transiciones atómicas e idempotentes; otra persona no puede tocar avisos ajenos", async () => {
    const a = await person(), b = await person();
    const { intervention } = await upsertIntervention(a, card());
    expect(await err(markIntervention(b, intervention.id, "dismissed"))).toMatchObject({ status: 404 });
    expect(await activeInterventions(b)).toEqual([]);
    expect((await markIntervention(a, intervention.id, "shown")).intervention.shownAt).not.toBeNull();
    const acc = await markIntervention(a, intervention.id, "accepted");
    expect(acc).toMatchObject({ changed: true, intervention: { status: "accepted" } });
    expect(acc.intervention.resolvedAt).not.toBeNull();
    expect((await markIntervention(a, intervention.id, "accepted")).changed).toBe(false);
    expect(await err(markIntervention(a, intervention.id, "dismissed"))).toMatchObject({ code: "invalid_state", status: 409 });
  });
  it("caso 50: cambiar la versión del programa cancela los avisos atados a la anterior", async () => {
    const u = await person(), coach = await person();
    const [o] = await db.insert(schema.organization).values({ kind: "coach", name: "Org avisos", createdBy: coach }).returning();
    const [p] = await db.insert(schema.program).values({ orgId: o.id, kind: "template", createdBy: coach }).returning();
    const [v1, v2] = await db.insert(schema.programVersion).values([{ programId: p.id, number: 1, name: "V1", weeks: 4, createdBy: coach }, { programId: p.id, number: 2, name: "V2", weeks: 4, createdBy: coach }]).returning();
    const old = await upsertIntervention(u, card({ programVersionId: v1.id }));
    const cur = await upsertIntervention(u, card({ programVersionId: v2.id }));
    const free = await upsertIntervention(u, card());
    expect(await cancelObsoleteInterventions(u, v2.id)).toBe(1);
    const ids = (await activeInterventions(u)).map((i) => i.id);
    expect(ids).toContain(cur.intervention.id);
    expect(ids).toContain(free.intervention.id);
    expect(ids).not.toContain(old.intervention.id);
  });
});

describe("acciones", () => {
  it("caso 23: el reintento duplicado (también simultáneo) devuelve la misma acción", async () => {
    const u = await person(), key = `sub:${randomUUID()}`;
    const rs = await Promise.all(Array.from({ length: 5 }, () => proposeAction(u, { kind: "apply_substitution", idempotencyKey: key, autonomy: 1, input: { from: "e1", to: "e2" } })));
    expect(rs.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(rs.map((r) => r.action.id)).size).toBe(1);
    expect(await err(proposeAction(u, { kind: "save_preference", idempotencyKey: key, autonomy: 1 }))).toMatchObject({ status: 409 });
    expect(await err(proposeAction(u, { kind: "save_preference", idempotencyKey: "con espacios", autonomy: 1 }))).toMatchObject({ code: "invalid" });
    // La clave es por persona: otra cuenta con la misma clave tiene su propia acción.
    const other = await person();
    const mine = await proposeAction(other, { kind: "apply_substitution", idempotencyKey: key, autonomy: 1 });
    expect(mine.created).toBe(true);
    expect(mine.action.id).not.toBe(rs[0].action.id);
  });
  it("confirmaciones simultáneas cambian una sola vez; un salto inválido es 409", async () => {
    const u = await person();
    const { action } = await proposeAction(u, { kind: "update_prefs", idempotencyKey: `p:${randomUUID()}`, autonomy: 1 });
    const rs = await Promise.all(Array.from({ length: 4 }, () => transitionAction(u, action.id, "confirmed")));
    expect(rs.filter((r) => r.changed)).toHaveLength(1);
    expect((await transitionAction(u, action.id, "cancelled")).action.status).toBe("cancelled");
    expect(await err(transitionAction(u, action.id, "executed"))).toMatchObject({ code: "invalid_state", status: 409 });
  });
  it("executeActionOnce corre el ejecutor una sola vez aunque lleguen varias confirmaciones juntas", async () => {
    const u = await person();
    const { action } = await proposeAction(u, { kind: "apply_short_session", idempotencyKey: `s:${randomUUID()}`, autonomy: 1 });
    await transitionAction(u, action.id, "confirmed");
    const run = vi.fn(async () => { await new Promise((r) => setTimeout(r, 50)); return { skipped: 2 }; });
    const rs = await Promise.all(Array.from({ length: 3 }, () => executeActionOnce(u, action.id, run)));
    expect(run).toHaveBeenCalledTimes(1);
    expect(rs.filter((r) => r.executed)).toHaveLength(1);
    expect(rs.every((r) => r.action.status === "executed" && r.action.result?.skipped === 2)).toBe(true);
    expect((await getAction(u, action.id)).executedAt).not.toBeNull();
  });
  it("caso 70: si el servidor falla al ejecutar, la acción queda «failed» con el código (sin contenido) y no se reintenta sola", async () => {
    const u = await person();
    const { action } = await proposeAction(u, { kind: "apply_substitution", idempotencyKey: `f:${randomUUID()}`, autonomy: 1 });
    const r = await executeActionOnce(u, action.id, async () => { throw new AccessError("version_changed", "El programa cambió.", 409); });
    expect(r).toMatchObject({ executed: false, action: { status: "failed", error: "version_changed" } });
    expect(r.error).toBeInstanceOf(AccessError);
    expect(await err(executeActionOnce(u, action.id, async () => ({})))).toMatchObject({ code: "invalid_state" });
  });
  it("casos 40/62/63: otra persona no ve, confirma ni ejecuta acciones ajenas", async () => {
    const a = await person(), b = await person();
    const { action } = await proposeAction(a, { kind: "floor_help", idempotencyKey: `h:${randomUUID()}`, autonomy: 1 });
    const run = vi.fn(async () => ({}));
    expect(await err(getAction(b, action.id))).toMatchObject({ status: 404 });
    expect(await err(transitionAction(b, action.id, "confirmed"))).toMatchObject({ status: 404 });
    expect(await err(executeActionOnce(b, action.id, run))).toMatchObject({ status: 404 });
    expect(run).not.toHaveBeenCalled();
    expect((await getAction(a, action.id)).status).toBe("proposed");
  });
});

describe("ejecución de acciones sin transacción abierta (revisión AC3: hallazgos 15, 17 y 19)", () => {
  it("hallazgo 15 · mientras corre el ejecutor no hay una transacción reteniendo la fila (ni su conexión)", async () => {
    const u = await person();
    const { action } = await proposeAction(u, { kind: "save_preference", idempotencyKey: `t:${randomUUID()}`, autonomy: 1 });
    const r = await executeActionOnce(u, action.id, async () => {
      // Con la fila bloqueada por otra transacción esto fallaría al instante (NOWAIT): los servicios del ejecutor abren las suyas.
      const [row] = await db.transaction((tx) => tx.select().from(schema.brainAction).where(eq(schema.brainAction.id, action.id)).for("update", { noWait: true }));
      return { seen: row.status };
    });
    expect(r).toMatchObject({ executed: true, action: { status: "executed", result: { seen: "confirmed" } } });
  });
  it("hallazgo 17 · una falla pasajera no consume la propuesta: vuelve a «proposed» y el reintento la ejecuta", async () => {
    const u = await person();
    const { action } = await proposeAction(u, { kind: "apply_substitution", idempotencyKey: `x:${randomUUID()}`, autonomy: 1 });
    const r = await executeActionOnce(u, action.id, async () => { throw new Error("conexión cortada"); });
    expect(r).toMatchObject({ executed: false, action: { status: "proposed", error: "error" } });
    const again = await executeActionOnce(u, action.id, async () => ({ ok: 1 }));
    expect(again).toMatchObject({ executed: true, action: { status: "executed", error: null, result: { ok: 1 } } });
  });
  it("mientras corre: otro pedido espera el resultado o responde «en curso»; no se cancela a mitad de camino", async () => {
    const u = await person();
    const { action } = await proposeAction(u, { kind: "apply_short_session", idempotencyKey: `c:${randomUUID()}`, autonomy: 1 });
    let release!: () => void;
    const gate = new Promise<void>((ok) => { release = ok; });
    const first = executeActionOnce(u, action.id, async () => { await gate; return { done: 1 }; });
    for (let i = 0; i < 40 && (await getAction(u, action.id)).status !== "confirmed"; i++) await new Promise((ok) => setTimeout(ok, 25));
    expect((await getAction(u, action.id))).toMatchObject({ status: "confirmed", result: null }); // la marca del reclamo no se muestra
    expect(await err(executeActionOnce(u, action.id, async () => ({}), new Date(), { waitMs: 100 }))).toMatchObject({ code: "in_progress", status: 409 });
    expect(await err(transitionAction(u, action.id, "cancelled"))).toMatchObject({ code: "in_progress", status: 409 });
    const waiting = executeActionOnce(u, action.id, async () => ({ twice: true }));
    release();
    expect(await first).toMatchObject({ executed: true, action: { status: "executed", result: { done: 1 } } });
    expect(await waiting).toMatchObject({ executed: false, action: { status: "executed", result: { done: 1 } } });
  });
});
