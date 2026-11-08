// D210 · Señales de REPI para quien programa al alumno. Entrenador privado (requireCoach + requireClientOf con permiso de
// entrenamientos) y equipo de sala (program.edit + sede + attendance_training). Sólo cantidades y tendencias de lo entrenado en
// esa relación: nunca memoria, conversación, textos de avisos ni salud del alumno. Casos del máster §25: 52, 53, 55, 61 y 62.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { createMemory } from "@/server/brain/memory";
import { appendMessage } from "@/server/brain/conversation";
import { upsertIntervention } from "@/server/brain/store";
import { homeCandidates, proactiveFor, resetProactiveThrottle } from "@/server/brain/proactive";
import { coachInsights, coachPendingSignals, memberInsights } from "@/server/brain/coach";
import { relationIntelligence } from "@/server/training/intelligence";
import { brainMetrics } from "@/server/brain/admin";

const { programAssignment, brainAction, brainIntervention, trainingProposal, consentGrant, staffMembership, gymMember, gymLocation } = schema;
const H = 3_600_000, D = 24 * H;
let n = 0, EX = "";
const EX_NAME = "Sentadilla frontal AC3";
const SECRET = "SECRETO-PRIVADO-DEL-ALUMNO";
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const person = async (birthDate: string | null = "1990-01-01") => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: `Persona Coach ${++n}`, email: `${id}@test.repi.local`, emailVerified: true, birthDate });
  return { id, email: `${id}@test.repi.local` };
};
beforeAll(async () => {
  EX = (await db.insert(schema.exercise).values({ name: EX_NAME, muscleGroup: "Piernas" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, EX_NAME)))[0].id;
});
beforeEach(() => { resetRateLimits(); resetProactiveThrottle(); });
afterEach(() => { vi.unstubAllEnvs(); });

async function coachOrg() {
  const c = await person();
  const org = await acc.createCoachOrganization(c.id, { brand: `Coach Señales ${n}` });
  return { coach: c.id, org: org.id };
}
/** Relación coach ↔ alumno con programa asignado (asignación adelantada para registrar sesiones pasadas). */
async function relate(c: { coach: string; org: string }, u: { id: string; email: string }) {
  const inv = await acc.inviteCoachClient(c.coach, c.org, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(c.coach, c.org, { name: "Base", weeks: 4, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: EX_NAME, sets: 1, reps: "6-8", rir: 2, restSec: 150 }] }] });
  await tr.assignProgram(c.coach, c.org, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  await db.update(programAssignment).set({ startsOn: "2020-01-01" }).where(eq(programAssignment.coachClientId, rel.relationId));
  return rel.relationId;
}
/** Sesión de 40 minutos con la relación activa del alumno; devuelve el id y la ventana. */
async function train(user: string, rel: string, at: Date, w: number) {
  await tr.setActiveRelation(user, rel);
  const t = await tr.myTraining(user, at);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program.days[0].id }, at);
  const ses = await tr.getSession(user, sid, at);
  await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: ses.exercises[0].id, setIndex: 0, weightKg: w, reps: 6, rir: 1 }, at);
  await tr.sessionAction(user, sid, "finish", new Date(at.getTime() + 40 * 60_000));
  return { sid, during: new Date(at.getTime() + 20 * 60_000) };
}
const rejectSubstitution = (user: string, at: Date) => db.insert(brainAction).values({ userId: user, kind: "propose_substitution", idempotencyKey: `propose_substitution:${randomUUID().slice(0, 16)}`,
  status: "cancelled", autonomy: 1, input: { exerciseId: EX }, createdAt: at });
const dismissedCard = (user: string, sessionId: string) => upsertIntervention(user, { kind: "plateau", category: "progress", dedupeKey: `trend:${randomUUID()}`, channel: "card",
  title: `Título ${SECRET}`, body: `Cuerpo ${SECRET}`, evidence: { basis: SECRET, via: "rules" }, data: { sessionId } })
  .then((r) => db.update(brainIntervention).set({ status: "dismissed" }).where(eq(brainIntervention.id, r.intervention.id)));
const openProposal = (rel: { coachClientId?: string; gymMemberId?: string }) => db.insert(trainingProposal).values({ ...rel, exerciseId: EX, kind: "load",
  payload: { text: "Subir 2,5 kg", weightKg: 62.5, reps: null, basis: "prueba", trend: "progressing", sessions: 4 }, algoVersion: "test" }).returning().then((r) => r[0]);

describe("señales para el entrenador privado", () => {
  it("dificultad creciente, rechazos, propuestas y pedidos: sólo cantidades de ESTA relación y nada privado (casos 52 y 53)", async () => {
    const A = await coachOrg(), B = await coachOrg();
    const s = await person();
    const relA = await relate(A, s), relB = await relate(B, s);
    const now = new Date();
    // Con A: cuatro sesiones comparables en baja sostenida (más dificultad).
    const sesA = [];
    for (const [d, w] of [[10, 70], [7, 67.5], [4, 65], [1, 62.5]] as const) sesA.push(await train(s.id, relA, new Date(now.getTime() - d * D), w));
    // Con B: una sesión. Lo que pasa con B no cuenta para A (caso 53).
    const sesB = await train(s.id, relB, new Date(now.getTime() - 2 * D), 80);
    await rejectSubstitution(s.id, sesA[1].during);
    await rejectSubstitution(s.id, sesA[2].during);
    await rejectSubstitution(s.id, sesB.during);
    await rejectSubstitution(s.id, new Date(now.getTime() - 5.5 * D)); // fuera de toda sesión
    await dismissedCard(s.id, sesA[3].sid);
    await dismissedCard(s.id, sesA[2].sid);
    await dismissedCard(s.id, sesB.sid);
    const pA = await openProposal({ coachClientId: relA });
    await openProposal({ coachClientId: relB });
    await db.insert(brainAction).values({ userId: s.id, kind: "propose_to_coach", idempotencyKey: `propose_to_coach:${randomUUID().slice(0, 16)}`, status: "executed", autonomy: 1,
      input: { exerciseId: EX, kind: "load", weightKg: 62.5, reps: null, note: SECRET }, result: { proposalId: pA.id }, executedAt: now });
    // Memoria y conversación privadas del alumno.
    await createMemory(s.id, { kind: "preference", key: "avoid_exercise", value: { exercise: SECRET }, text: `No quiere ${SECRET}`, source: "user" });
    await appendMessage(s.id, { role: "user", text: `Le cuento a REPI ${SECRET}` });

    const v = await coachInsights(A.coach, A.org, relA, now);
    expect(v.relation).toEqual({ kind: "coach", id: relA });
    expect(v.counts).toEqual({ rejectedSubstitutions: 2, rejectedRecommendations: 2, pendingProposals: 1, studentRequests: { load: 1 } });
    expect(v.insights.map((i) => i.kind)).toEqual(["difficulty_rising", "rejected_substitutions", "rejected_recommendations", "pending_proposals", "student_requests"]);
    const diff = v.insights[0];
    expect(diff.text).toBe(`Viene registrando más dificultad en las últimas sesiones comparables de ${EX_NAME}.`);
    expect(diff.evidence.sessions).toHaveLength(4);
    expect(v.exercises).toEqual([expect.objectContaining({ exerciseId: EX, trend: "declining", confidence: "consistent", sessions: 4, rising: true })]);
    expect(v.insights[1].text).toBe("Rechazó dos veces una sustitución propuesta por REPI; conviene revisar sus preferencias.");
    expect(v.insights[3].refs?.proposalIds).toEqual([pA.id]);
    // Nada privado: ni memoria, ni conversación, ni textos de avisos, ni la nota del pedido.
    expect(JSON.stringify(v)).not.toContain(SECRET);
    // B ve lo suyo: una sesión (sin tendencia), un rechazo, una tarjeta descartada (bajo el umbral) y su propuesta.
    const vb = await coachInsights(B.coach, B.org, relB, now);
    expect(vb.counts).toEqual({ rejectedSubstitutions: 1, rejectedRecommendations: 1, pendingProposals: 1, studentRequests: {} });
    expect(vb.insights.map((i) => i.kind)).toEqual(["pending_proposals"]);
    // Cruzado: A no lee la relación con B (ni con su organización ni con la de B).
    expect(await err(coachInsights(A.coach, A.org, relB))).toMatchObject({ status: 404 });
    expect(await err(coachInsights(A.coach, B.org, relB))).toMatchObject({ status: 404 });
  });

  it("caso 52 · persona con dos roles (entrenador y alumno): en Inicio ve sólo sus propios avisos, nunca los de sus alumnos", async () => {
    const A = await coachOrg(), B = await coachOrg();
    const s = await person();
    const relS = await relate(A, s);
    const coachAsMember = { id: A.coach, email: (await db.select().from(schema.user).where(eq(schema.user.id, A.coach)))[0].email };
    const relC = await relate(B, coachAsMember); // el coach de A entrena con B
    // Mediodía de Argentina de hace 8 y 9 días: con «ahora menos N días» exacto, entre las 23:20 y las 24 de Argentina la sesión
    // (40 min) terminaba al día siguiente y el aviso decía un día menos.
    const arNoon = (d: number) => { const x = new Date(Date.now() - 3 * 3_600_000 - d * D); x.setUTCHours(15, 0, 0, 0); return x; };
    await train(s.id, relS, arNoon(8), 60);
    await train(A.coach, relC, arNoon(9), 60);
    const mine = (await proactiveFor(A.coach)).emitted.map((i) => i.id);
    const student = (await proactiveFor(s.id)).emitted.map((i) => i.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(student.length).toBeGreaterThan(0);
    resetProactiveThrottle();
    const home = await homeCandidates(A.coach);
    const ids = [home.card, ...home.interventions].filter(Boolean).map((i) => i!.id);
    expect(ids.sort()).toEqual(mine.sort());
    expect(ids.some((id) => student.includes(id))).toBe(false);
    expect(home.card?.body).toBe("Hace 9 días que no registrás entrenamientos. ¿Querés retomar?");
    // Como entrenador de s, sólo cantidades: los textos de los avisos de s no aparecen.
    const v = await coachInsights(A.coach, A.org, relS);
    const texts = (await db.select().from(brainIntervention).where(eq(brainIntervention.userId, s.id))).map((r) => String(r.payload.body));
    for (const t of texts) expect(JSON.stringify(v)).not.toContain(t);
  });

  it("caso 55 · permiso de entrenamientos revocado: 403 y nada nuevo · caso 61 · entrenador sin relación: 404", async () => {
    const A = await coachOrg(), C = await coachOrg();
    const s = await person();
    const rel = await relate(A, s);
    expect((await coachInsights(A.coach, A.org, rel)).relation.id).toBe(rel);
    await db.update(consentGrant).set({ status: "revoked" }).where(and(eq(consentGrant.relationId, rel), eq(consentGrant.item, "training")));
    expect(await err(coachInsights(A.coach, A.org, rel))).toMatchObject({ code: "no_grant", status: 403 });
    // Otro entrenador (con su propio espacio) no ve a un alumno ajeno, ni entrando por su organización ni por la ajena.
    expect(await err(coachInsights(C.coach, C.org, rel))).toMatchObject({ status: 404 });
    expect(await err(coachInsights(C.coach, A.org, rel))).toMatchObject({ status: 404 });
    // El alumno tampoco puede usar la vista del entrenador sobre sí mismo.
    expect(await err(coachInsights(s.id, A.org, rel))).toMatchObject({ status: 404 });
  });
});

describe("equipo de sala y gerencia (caso 62)", () => {
  it("sala y coordinación de la sede, con consentimiento; gerencia y dueño 403; otra sede 404; sin consentimiento 403", async () => {
    const owner = await person();
    const org = await acc.createGymOrganization(owner.id, { name: `Gimnasio Señales ${++n}` });
    const [A] = await db.insert(gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const [Bloc] = await db.insert(gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
    const manager = await person(), floor = await person(), coordinator = await person(), floorB = await person();
    await db.insert(staffMembership).values([
      { userId: manager.id, orgId: org.id, locationId: A.id, role: "manager" },
      { userId: floor.id, orgId: org.id, locationId: A.id, role: "floor_trainer" },
      { userId: coordinator.id, orgId: org.id, locationId: A.id, role: "coordinator" },
      { userId: floorB.id, orgId: org.id, locationId: Bloc.id, role: "floor_trainer" },
    ]);
    const member = await person();
    const [m] = await db.insert(gymMember).values({ orgId: org.id, locationId: A.id, userId: member.id, status: "active" }).returning();
    await db.insert(consentGrant).values({ userId: member.id, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    await openProposal({ gymMemberId: m.id });
    await createMemory(member.id, { kind: "preference", key: "tone", value: "breve", text: `Prefiere ${SECRET}`, source: "user" });

    const v = await memberInsights(floor.id, org.id, m.id);
    expect(v).toMatchObject({ relation: { kind: "gym", id: m.id }, counts: { pendingProposals: 1 } });
    expect(JSON.stringify(v)).not.toContain(SECRET);
    expect((await memberInsights(coordinator.id, org.id, m.id)).counts.pendingProposals).toBe(1);
    // Gerencia: administrar el gimnasio no da acceso a datos del socio. Dueño: tampoco (y además exige 2FA).
    expect(await err(memberInsights(manager.id, org.id, m.id))).toMatchObject({ code: "forbidden", status: 403 });
    expect((await err(memberInsights(owner.id, org.id, m.id)))?.status).toBe(403);
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner.id));
    expect(await err(memberInsights(owner.id, org.id, m.id))).toMatchObject({ code: "forbidden", status: 403 });
    // Gerente probando la vista del entrenador privado o las métricas de REPI Admin: no existen para él.
    expect(await err(coachInsights(manager.id, org.id, m.id))).toMatchObject({ status: 404 });
    expect(await err(brainMetrics(manager.id))).toMatchObject({ status: 404 });
    // Sala de otra sede: 404. Sin consentimiento: 403.
    expect(await err(memberInsights(floorB.id, org.id, m.id))).toMatchObject({ status: 404 });
    await db.update(consentGrant).set({ status: "revoked" }).where(eq(consentGrant.relationId, m.id));
    expect(await err(memberInsights(floor.id, org.id, m.id))).toMatchObject({ code: "consent_required", status: 403 });
  });
});

describe("revisión AC3 (hallazgos 18, 30, 31 y K2)", () => {
  /** Cuatro sesiones comparables en baja sostenida: Training Intelligence propone «review» (revisar con el entrenador). */
  async function declining() {
    const c = await coachOrg(), s = await person();
    const rel = await relate(c, s);
    const now = new Date();
    const ses = [];
    for (const [d, w] of [[10, 70], [7, 67.5], [4, 65], [1, 62.5]] as const) ses.push(await train(s.id, rel, new Date(now.getTime() - d * D), w));
    return { ...c, s, rel, ses, now };
  }
  const studentRequest = (rel: string, status: "open" | "rejected" = "open") => db.insert(trainingProposal).values({ coachClientId: rel, exerciseId: EX, kind: "review",
    payload: { text: `Tu alumno pidió revisar ${EX_NAME}.`, weightKg: null, reps: null, basis: "Pedido del alumno desde REPI.", trend: "student_request", sessions: 0 }, algoVersion: "brain-1",
    status, ...(status === "rejected" ? { decidedAt: new Date() } : {}) }).returning().then((r) => r[0]);

  it("hallazgo 18 · las alternativas de una misma oferta rechazadas con un «no» son UN rechazo; otra oferta, otro", async () => {
    const x = await declining();
    const offer = randomUUID();
    for (const k of [0, 1]) await db.insert(brainAction).values({ userId: x.s.id, kind: "apply_substitution", idempotencyKey: `apply_substitution:${randomUUID().slice(0, 16)}`,
      status: "cancelled", autonomy: 1, input: { exerciseId: EX, substituteId: `alt-${k}`, reason: "busy", _bind: { offer } }, createdAt: x.ses[1].during });
    let v = await coachInsights(x.coach, x.org, x.rel, x.now);
    expect(v.counts.rejectedSubstitutions).toBe(1);
    expect(v.insights.some((i) => i.kind === "rejected_substitutions")).toBe(false);
    await db.insert(brainAction).values({ userId: x.s.id, kind: "apply_substitution", idempotencyKey: `apply_substitution:${randomUUID().slice(0, 16)}`,
      status: "cancelled", autonomy: 1, input: { exerciseId: EX, _bind: { offer: randomUUID() } }, createdAt: x.ses[2].during });
    v = await coachInsights(x.coach, x.org, x.rel, x.now);
    expect(v.counts.rejectedSubstitutions).toBe(2);
  });

  it("hallazgo 30/K2 · Training Intelligence no pisa un pedido abierto del alumno ni lo toma como su propia propuesta", async () => {
    const x = await declining();
    const req = await studentRequest(x.rel);
    const ti = await relationIntelligence({ kind: "coach", id: x.rel, userId: x.s.id }, x.now);
    expect(ti.exercises.find((e) => e.exerciseId === EX)?.proposal).toBeNull();
    const [row] = await db.select().from(trainingProposal).where(eq(trainingProposal.id, req.id));
    expect(row).toMatchObject({ algoVersion: "brain-1", status: "open", payload: { trend: "student_request", text: `Tu alumno pidió revisar ${EX_NAME}.` } });
    expect((await db.select().from(trainingProposal).where(eq(trainingProposal.coachClientId, x.rel)))).toHaveLength(1);
  });

  it("hallazgo 30/K2 · un pedido del alumno rechazado no cuenta como decisión sobre la propuesta de Training Intelligence", async () => {
    const x = await declining();
    await studentRequest(x.rel, "rejected");
    const ti = await relationIntelligence({ kind: "coach", id: x.rel, userId: x.s.id }, x.now);
    const p = ti.exercises.find((e) => e.exerciseId === EX)?.proposal;
    expect(p).toMatchObject({ kind: "review", status: "open" });
    const [row] = await db.select().from(trainingProposal).where(eq(trainingProposal.id, p!.id));
    expect(row.algoVersion).not.toBe("brain-1");
  });

  it("hallazgo 31 · con el módulo «assistant» apagado, las señales de REPI para entrenador y sala no se exponen (404)", async () => {
    const x = await declining();
    vi.stubEnv("NEXT_PUBLIC_REPI_FEATURES", "-assistant");
    expect(await err(coachInsights(x.coach, x.org, x.rel))).toMatchObject({ code: "module_off", status: 404 });
    expect(await err(coachPendingSignals(x.coach, x.org))).toMatchObject({ code: "module_off", status: 404 });
    expect(await err(memberInsights(x.coach, x.org, randomUUID()))).toMatchObject({ code: "module_off", status: 404 });
    vi.unstubAllEnvs();
    expect((await coachInsights(x.coach, x.org, x.rel)).relation).toEqual({ kind: "coach", id: x.rel });
  });
});
