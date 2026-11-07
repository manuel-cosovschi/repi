import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import { resetRateLimits } from "@/server/access/util";
import * as tr from "@/server/training/services";
import { cancelAction, confirmAction, proposeFromClient, type ProposedAction } from "@/server/brain/actions";
import { AGE_REPLY } from "@repi/domain/brain";
import { listMemory } from "@/server/brain/memory";
import { appendMessage } from "@/server/brain/conversation";
import { coachInsights, coachPendingSignals } from "@/server/brain/coach";
import { brainHome } from "@/server/brain/home";
import { handleMessage } from "@/server/brain/orchestrator";
import { sessionReviewFor } from "@/server/brain/review";
import { getPrefs, updatePrefs } from "@/server/brain/prefs";
import { coachWorld, err, rawPerson, send, startToday } from "./brain-chat.world";

// D209 · C1 · Acciones de REPI: catálogo, validación con el contexto real, autonomía, idempotencia, auditoría y confirmación con
// el resultado del servidor. Sin IA (las reglas proponen; la persona confirma). Casos 14, 23, 36, 37, 56, 58, 69, 70.
beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const acts = (m: { actions: unknown[] }) => m.actions as ProposedAction[];
const changesOf = (sid: string) => db.select().from(schema.sessionExerciseChange).where(eq(schema.sessionExerciseChange.sessionId, sid));
const programOf = async (relId: string) => (await db.select().from(schema.program).where(eq(schema.program.coachClientId, relId)))[0];

describe("poco tiempo (caso 14)", () => {
  it("propone omitir sólo pendientes sin registro, se aplica sólo hoy al confirmar y nunca toca lo registrado ni el programa", async () => {
    const w = await coachWorld();
    const { sid, pe } = await startToday(w.user);
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: pe["Jalón al pecho"], setIndex: 0, weightKg: 50, reps: 10, rir: 2 });
    const prog = await programOf(w.relId);

    const r = await send(w.user, "Me quedan 20 minutos");
    const plan = r.reply.cards.find((c) => c.type === "plan");
    expect(plan && plan.type === "plan" && plan.keep).toContain("Jalón al pecho");
    const a = acts(r.reply).find((x) => x.kind === "apply_short_session")!;
    expect(a).toMatchObject({ mode: "confirm", input: { minutes: 20 } });
    const skip = a.input.skip as string[];
    expect(skip).not.toContain(pe["Jalón al pecho"]);
    expect(skip.length).toBeGreaterThan(0);
    expect(await changesOf(sid)).toHaveLength(0);

    const out = await confirmAction(w.user, a.key);
    expect(out.ok).toBe(true);
    expect(out.text).toMatch(/^Listo: por hoy dejamos .* para otro día\. Lo registrado no cambia y tu rutina tampoco\.$/);
    const ch = await changesOf(sid);
    expect(ch.map((c) => [c.programExerciseId, c.kind, c.reason]).sort()).toEqual(skip.map((id) => [id, "skip", "no_time"]).sort());
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid))).toHaveLength(1);
    expect((await programOf(w.relId)).currentVersionId).toBe(prog.currentVersionId);
    expect((await listMemory(w.user)).find((m) => m.kind === "temporal" && m.key === "minutes_today")?.value).toBe(20);
  });

  it("minutos fuera de rango: pide un número válido y no propone nada (caso 69)", async () => {
    const w = await coachWorld();
    await startToday(w.user);
    const r = await send(w.user, "Me quedan 5000 minutos");
    expect(r.reply.text).toBe("Decime cuántos minutos te quedan con un número entre 5 y 180.");
    expect(acts(r.reply)).toHaveLength(0);
  });
});

describe("molestia y alarma (casos 56, 58)", () => {
  it("molestia: respuesta de seguridad, se registra sólo con confirmación explícita y con la intensidad que elige la persona", async () => {
    const w = await coachWorld();
    const { sid } = await startToday(w.user);
    const r = await send(w.user, "Me duele la rodilla");
    expect(r.reply.via).toBe("safety");
    expect(r.reply.text).toContain("No puedo decirte qué es ni si es seguro seguir");
    const a = acts(r.reply)[0];
    expect(a).toMatchObject({ kind: "report_discomfort", mode: "confirm", code: "health", input: { area: "rodilla" } });
    const pains = () => db.select().from(schema.painReport).where(eq(schema.painReport.userId, w.user));
    expect(await pains()).toHaveLength(0);
    // «Sí» por chat no alcanza: falta la intensidad (no se inventa) y la acción sigue disponible.
    const yes = await send(w.user, "Sí");
    expect(yes.reply.text).toContain("necesito la intensidad");
    expect(await err(confirmAction(w.user, a.key))).toMatchObject({ code: "details_required", status: 409 });
    expect(await pains()).toHaveLength(0);
    const out = await confirmAction(w.user, a.key, { details: { level: 4, zone: "Rodilla der." } });
    expect(out.text).toMatch(/^Listo: registré la molestia \(Rodilla der\.\)\. Queda en tu perfil\./);
    const [p] = await pains();
    expect(p).toMatchObject({ zone: "Rodilla der.", level: 4, context: "now", sessionId: sid, exerciseName: "Jalón al pecho", sharedWithRelationId: null });
  });

  it("alarma: texto fijo de seguridad, sin acciones ni registros", async () => {
    const w = await coachWorld();
    await startToday(w.user);
    const r = await send(w.user, "Me duele el pecho y me falta el aire");
    expect(r.reply).toMatchObject({ via: "safety" });
    expect(r.reply.text).toContain("107");
    expect(acts(r.reply)).toHaveLength(0);
    expect(await db.select().from(schema.painReport).where(eq(schema.painReport.userId, w.user))).toHaveLength(0);
  });
});

describe("programa del entrenador (casos 36, 37, 69)", () => {
  it("pedir cambiar cargas: REPI no cambia el programa; sólo deja una propuesta revisable para el entrenador", async () => {
    const w = await coachWorld();
    const prog = await programOf(w.relId);
    const versions = async () => (await db.select().from(schema.programVersion).where(eq(schema.programVersion.programId, prog.id))).length;
    const v0 = await versions();
    const r = await send(w.user, "Subí las cargas del press banca", { section: "home" });
    expect(r.reply.text).toContain("no la cambio yo");
    expect(acts(r.reply).map((a) => a.kind).sort()).toEqual(["draft_coach_message", "propose_to_coach"]);
    const p = acts(r.reply).find((a) => a.kind === "propose_to_coach")!;
    expect(p).toMatchObject({ mode: "confirm", input: { exerciseId: w.EX["Press banca"], kind: "load" } });
    const out = await confirmAction(w.user, p.key);
    expect(out.text).toBe("Listo: le dejé la propuesta a tu entrenador. Él decide si la incorpora; tu rutina no cambia.");
    const [tp] = await db.select().from(schema.trainingProposal).where(eq(schema.trainingProposal.coachClientId, w.relId));
    expect(tp).toMatchObject({ exerciseId: w.EX["Press banca"], kind: "load", status: "open", algoVersion: "brain-1" });
    expect(tp.payload.basis).toContain("Pedido del alumno");
    expect((await programOf(w.relId)).currentVersionId).toBe(prog.currentVersionId);
    expect(await versions()).toBe(v0);
    // Reintento (caso 23) y segundo pedido igual: una sola propuesta abierta.
    expect(await confirmAction(w.user, p.key)).toMatchObject({ executed: false });
    const r2 = await send(w.user, "Subí las cargas del press banca", { section: "home" });
    const out2 = await confirmAction(w.user, acts(r2.reply).find((a) => a.kind === "propose_to_coach")!.key);
    expect(out2.text).toContain("Ya hay una propuesta abierta");
    expect(await db.select().from(schema.trainingProposal).where(eq(schema.trainingProposal.coachClientId, w.relId))).toHaveLength(1);
  });

  it("acciones fuera del catálogo o con números fuera de rango se rechazan antes de registrar nada", async () => {
    const w = await coachWorld();
    expect(await err(proposeFromClient(w.user, { kind: "edit_program", input: { programId: "x" } }))).toMatchObject({ code: "invalid", status: 400 });
    const e = await err(proposeFromClient(w.user, { kind: "propose_to_coach", input: { exerciseId: w.EX["Press banca"], kind: "load", weightKg: 900 } }));
    expect(e).toMatchObject({ code: "invalid", message: "La carga propuesta está fuera de rango." });
    expect(await err(proposeFromClient(w.user, { kind: "update_prefs", input: { patch: { autonomy: 3 } } }))).toMatchObject({ code: "invalid" });
    expect(await db.select().from(schema.brainAction).where(eq(schema.brainAction.userId, w.user))).toHaveLength(0);
  });
});

describe("protocolo: revalidación, autonomía, fallas y cancelación (casos 23, 70)", () => {
  async function toAlternatives(w: Awaited<ReturnType<typeof coachWorld>>) {
    await send(w.user, "La máquina está ocupada");
    const r = await send(w.user, "Sí");
    return acts(r.reply).find((a) => a.kind === "apply_substitution")!;
  }

  it("si el servidor falla al ejecutar, la respuesta dice que falló y no cambió nada (caso 70)", async () => {
    const w = await coachWorld({ approved: true });
    const { sid } = await startToday(w.user);
    const a = await toAlternatives(w);
    await db.update(schema.coachClient).set({ status: "paused" }).where(eq(schema.coachClient.id, w.relId));
    const r = await send(w.user, "Sí");
    expect(r.reply.text).toBe("No pude aplicar el reemplazo: no se cambió nada. Tu acceso con este coach no está vigente.");
    expect(r.reply.text).not.toMatch(/^Listo/);
    const [row] = await db.select().from(schema.brainAction).where(and(eq(schema.brainAction.userId, w.user), eq(schema.brainAction.idempotencyKey, a.key)));
    expect(row).toMatchObject({ status: "failed", error: "relation_inactive" });
    expect(await changesOf(sid)).toHaveLength(0);
    const audits = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, w.user), eq(schema.auditEvent.action, "brain.action_failed")));
    expect(audits[0].meta).toEqual({ kind: "apply_substitution", code: "relation_inactive" });
  });

  it("al confirmar se vuelve a validar: si el ejercicio ya tiene series, no se reemplaza", async () => {
    const w = await coachWorld({ approved: true });
    const { sid, pe } = await startToday(w.user);
    const a = await toAlternatives(w);
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: pe["Jalón al pecho"], setIndex: 0, weightKg: 50, reps: 10, rir: 2 });
    const out = await confirmAction(w.user, a.key);
    expect(out).toMatchObject({ ok: false, code: "stale" });
    expect(out.text).toContain("Ese ejercicio ya tiene series registradas");
    expect(await changesOf(sid)).toHaveLength(0);
  });

  it("autonomía informativa (0): se explica pero no se prepara ni ejecuta ningún cambio", async () => {
    const w = await coachWorld({ approved: true });
    const { sid } = await startToday(w.user);
    await updatePrefs(w.user, { autonomy: 0 });
    const a = await toAlternatives(w);
    expect(a).toMatchObject({ mode: "blocked", code: "autonomy_info" });
    expect((await confirmAction(w.user, a.key)).ok).toBe(false);
    expect(await changesOf(sid)).toHaveLength(0);
  });

  it("cancelar es idempotente y deja la decisión; un borrador para el entrenador nunca se envía solo", async () => {
    const w = await coachWorld({ approved: true });
    await startToday(w.user);
    const a = await toAlternatives(w);
    expect((await cancelAction(w.user, a.key)).changed).toBe(true);
    expect((await cancelAction(w.user, a.key)).changed).toBe(false);
    expect(await err(confirmAction(w.user, a.key))).toMatchObject({ code: "invalid_state", status: 409 });
    const d = await proposeFromClient(w.user, { kind: "draft_coach_message", input: { text: "Hola, ¿puedo cambiar la prensa?" } });
    expect(d.mode).toBe("auto");
    expect(d.outcome).toMatchObject({ ok: true, result: { draft: "Hola, ¿puedo cambiar la prensa?", sent: false, to: "coach" } });
    // Preferencias desde un atajo: piden confirmación y se aplican sólo al confirmar.
    const p = await proposeFromClient(w.user, { kind: "update_prefs", input: { patch: { maxPerDay: 1 } } });
    expect(p.mode).toBe("confirm");
    expect((await getPrefs(w.user)).maxPerDay).toBe(2);
    await confirmAction(w.user, p.action.idempotencyKey);
    expect((await getPrefs(w.user)).maxPerDay).toBe(1);
  });

  it("pedir ayuda en sala sin una sede vinculada: lo dice y no inventa un pedido", async () => {
    const w = await coachWorld();
    const { pe } = await startToday(w.user);
    expect((await send(w.user, "Necesito ayuda en sala")).reply.text).toContain("No estás entrenando con una sede vinculada");
    const p = await proposeFromClient(w.user, { kind: "floor_help", input: { exerciseId: pe["Press banca"] } });
    expect(p.mode).toBe("confirm");
    const out = await confirmAction(w.user, p.action.idempotencyKey);
    expect(out).toMatchObject({ ok: false, code: "no_gym" });
    expect(out.text).toMatch(/^No pude avisar a la sala: no se cambió nada\./);
  });
});

describe("revisión AC3 (hallazgos 9, 16, 18, 19, 21, 30 y 31)", () => {
  const short = async (w: Awaited<ReturnType<typeof coachWorld>>) => {
    const s = await startToday(w.user);
    await tr.logSet(w.user, s.sid, { id: randomUUID(), programExerciseId: s.pe["Jalón al pecho"], setIndex: 0, weightKg: 50, reps: 10, rir: 2 });
    const r = await send(w.user, "Me quedan 20 minutos");
    return { ...s, a: acts(r.reply).find((x) => x.kind === "apply_short_session")! };
  };

  it("hallazgo 16 · la tarjeta de otro entrenamiento no se ejecuta en el de hoy aunque los ejercicios tengan los mismos ids", async () => {
    const w = await coachWorld();
    const s1 = await short(w);
    expect(s1.a).toBeTruthy();
    await tr.sessionAction(w.user, s1.sid, "finish");
    const s2 = await startToday(w.user);
    expect(s2.pe).toEqual(s1.pe);
    const out = await confirmAction(w.user, s1.a.key);
    expect(out).toMatchObject({ ok: false, executed: false, code: "stale" });
    expect(out.text).toBe("Eso ya no se puede hacer: era para otro entrenamiento. Pedímelo de nuevo si todavía lo necesitás.");
    expect(await changesOf(s2.sid)).toHaveLength(0);
    expect((await listMemory(w.user)).some((m) => m.key === "minutes_today")).toBe(false);
  });

  it("hallazgo 19 · dos confirmaciones a la vez de la misma propuesta: se aplica una vez y las dos responden el resultado real", async () => {
    const w = await coachWorld({ approved: true });
    const { sid } = await startToday(w.user);
    await send(w.user, "La máquina está ocupada");
    const a = acts((await send(w.user, "Sí")).reply).find((x) => x.kind === "apply_substitution")!;
    const [x, y] = await Promise.all([confirmAction(w.user, a.key), confirmAction(w.user, a.key)]);
    expect([x.ok, y.ok]).toEqual([true, true]);
    expect([x.executed, y.executed].sort()).toEqual([false, true]);
    expect(x.text).toMatch(/^Listo: hoy hacés /);
    expect(y.text).toBe(x.text);
    expect(await changesOf(sid)).toHaveLength(1);
  });

  it("hallazgo 18 · un «no» a la oferta de alternativas queda como una sola oferta rechazada para el entrenador", async () => {
    const w = await coachWorld({ approved: true });
    await startToday(w.user);
    await send(w.user, "La máquina está ocupada");
    const offered = acts((await send(w.user, "Sí")).reply).filter((x) => x.kind === "apply_substitution");
    expect(offered.length).toBeGreaterThan(0);
    await send(w.user, "No");
    const rows = await db.select().from(schema.brainAction).where(and(eq(schema.brainAction.userId, w.user), eq(schema.brainAction.kind, "apply_substitution")));
    expect(rows.map((r) => r.status)).toEqual(offered.map(() => "cancelled"));
    expect(new Set(rows.map((r) => (r.input as { _bind?: { offer?: string } })._bind?.offer)).size).toBe(1);
    expect((await coachInsights(w.coach.id, w.org.id, w.relId)).counts.rejectedSubstitutions).toBe(1);
  });

  it("hallazgo 21 · reintentar un «sí» viejo que quedó sin respuesta no confirma una propuesta posterior", async () => {
    const w = await coachWorld();
    const old = randomUUID();
    await appendMessage(w.user, { id: old, role: "user", text: "Sí", section: "workout" }, new Date(Date.now() - 10 * 60_000));
    for (let i = 0; i < 6; i++) await send(w.user, "¿Qué es un drop set?");
    const { sid, a } = await short(w); // la respuesta más nueva propone acortar la sesión
    expect(a).toBeTruthy();
    const retry = await send(w.user, "Sí", { clientId: old });
    expect(retry.replayed).toBe(false);
    expect(retry.reply.text).not.toMatch(/^Listo/);
    expect(await changesOf(sid)).toHaveLength(0);
    const [row] = await db.select().from(schema.brainAction).where(and(eq(schema.brainAction.userId, w.user), eq(schema.brainAction.idempotencyKey, a.key)));
    expect(row.status).toBe("proposed");
  });

  it("hallazgo 30 · si Training Intelligence ya ocupa el lugar, el pedido del alumno no se adueña de esa propuesta ni la pisa", async () => {
    const w = await coachWorld();
    const [ti] = await db.insert(schema.trainingProposal).values({ coachClientId: w.relId, exerciseId: w.EX["Press banca"], kind: "load",
      payload: { text: "Subir 2,5 kg", weightKg: 62.5, reps: null, basis: "prueba", trend: "progressing", sessions: 4 }, algoVersion: "ti2.1" }).returning();
    const r = await send(w.user, "Subí las cargas del press banca", { section: "home" });
    const out = await confirmAction(w.user, acts(r.reply).find((x) => x.kind === "propose_to_coach")!.key);
    expect(out).toMatchObject({ ok: true, result: { proposalId: null, duplicate: true } });
    expect(out.text).toContain("ya tiene para revisar una propuesta");
    const [row] = await db.select().from(schema.trainingProposal).where(eq(schema.trainingProposal.id, ti.id));
    expect(row).toMatchObject({ algoVersion: "ti2.1", status: "open", payload: { trend: "progressing" } });
    expect((await coachPendingSignals(w.coach.id, w.org.id)).clients.find((c) => c.relId === w.relId)).toMatchObject({ pendingProposals: 1, studentRequests: 0 });
  });

  it("hallazgo 9 · comida y dieta nunca se guardan como preferencia; con menores o edad desconocida, ni se conversa", async () => {
    for (const birth of ["2012-05-01", null]) {
      const u = await rawPerson(birth);
      for (const t of ["Me gusta saltear comidas", "Prefiero comer menos", "Odio comer", "Prefiero hacer ayuno"]) {
        const r = await handleMessage(u, { text: t, section: "home" });
        expect(r.reply.text).toBe(AGE_REPLY[birth ? "minor" : "unknown"]);
        expect(r.reply.actions).toHaveLength(0);
      }
      expect(await db.select().from(schema.brainAction).where(eq(schema.brainAction.userId, u))).toHaveLength(0);
    }
    const adult = await rawPerson("1990-01-01");
    for (const t of ["Me gusta saltear comidas", "Prefiero hacer ayuno"]) {
      const r = await handleMessage(adult, { text: t, section: "home" });
      expect(r.reply.text).toMatch(/^De alimentación no guardo preferencias/);
      expect(r.reply.actions).toHaveLength(0);
    }
    // Tampoco por un atajo de la interfaz o una propuesta de la IA: se valida en el servidor.
    expect(await err(proposeFromClient(adult, { kind: "save_preference", input: { key: "likes_exercise:saltear_comidas", value: "saltear comidas", text: "Preferís saltear comidas." } })))
      .toMatchObject({ code: "invalid", message: "De alimentación no guardo preferencias." });
    // Una preferencia de entrenamiento sigue funcionando.
    const ok = await handleMessage(adult, { text: "Me gustan las sentadillas", section: "home" });
    expect((ok.reply.actions as ProposedAction[]).map((a) => a.kind)).toEqual(["save_preference"]);
    expect((await listMemory(adult)).filter((m) => m.kind === "preference")).toEqual([]);
  });

  it("hallazgo 31 · con el módulo «assistant» apagado el servidor no responde, no ejecuta ni arma Inicio ni cierre (404)", async () => {
    const w = await coachWorld();
    const s = await short(w);
    vi.stubEnv("NEXT_PUBLIC_REPI_FEATURES", "-assistant");
    expect(await err(send(w.user, "¿Qué toca hoy?"))).toMatchObject({ code: "module_off", status: 404 });
    expect(await err(confirmAction(w.user, s.a.key))).toMatchObject({ code: "module_off", status: 404 });
    expect(await err(proposeFromClient(w.user, { kind: "open_workout", input: {} }))).toMatchObject({ code: "module_off", status: 404 });
    expect(await err(brainHome(w.user))).toMatchObject({ code: "module_off", status: 404 });
    expect(await err(sessionReviewFor(w.user, s.sid))).toMatchObject({ code: "module_off", status: 404 });
    expect(await changesOf(s.sid)).toHaveLength(0);
  });
});
