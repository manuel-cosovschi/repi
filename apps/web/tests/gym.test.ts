import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as rv from "@/server/gym/reviews";
import * as mt from "@/server/gym/metrics";
import * as msg from "@/server/messages/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;

let n = 0;
const mail = () => `gy${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Gym") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

let EX: string;
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Sentadilla gym", muscleGroup: "Piernas" }).onConflictDoNothing().returning();
  EX = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla gym")))[0].id;
});
beforeEach(() => resetRateLimits());

/** Gym con dos sedes, dueño, gerente de A, dos entrenadores de A, uno de B, recepción de A y un socio activo en A. */
async function world() {
  const owner = await verified("Dueño Gym");
  const org = await acc.createGymOrganization(owner, { name: `Gym ${n}-${Date.now()}` });
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Palermo" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Belgrano" }).returning();
  const staff = async (name: string, role: "manager" | "floor_trainer" | "reception" | "coordinator", loc: string) => {
    const u = await verified(name);
    await db.insert(schema.staffMembership).values({ userId: u, orgId: org.id, locationId: loc, role });
    return u;
  };
  const manager = await staff("Lucía Gerente", "manager", A.id);
  const t1 = await staff("Agustín Sala", "floor_trainer", A.id);
  const t2 = await staff("Sofía Sala", "floor_trainer", A.id);
  const tB = await staff("Lautaro Belgrano", "floor_trainer", B.id);
  const recep = await staff("Recepción A", "reception", A.id);
  const member = async (loc = A.id, name = "Valentina Socia") => {
    const u = await verified(name);
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: loc, userId: u, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    return { userId: u, memberId: m.id };
  };
  const vale = await member();
  return { org: org.id, A: A.id, B: B.id, owner, manager, t1, t2, tB, recep, vale, member };
}
const DOC = (name = "Inicial") => ({ name, weeks: 6, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: "Sentadilla gym", sets: 3, reps: "8-10", rir: 2, restSec: 120 }] }] });

describe("permisos y sedes", () => {
  it("cada rol ve sólo lo suyo; otra sede responde 404", async () => {
    const w = await world();
    expect((await gym.listMembers(w.t1, w.org, w.A)).members.map((m) => m.id)).toContain(w.vale.memberId);
    expect((await err(gym.listMembers(w.tB, w.org, w.A)))?.code).toBe("not_found");
    expect((await err(gym.memberDetail(w.tB, w.org, w.vale.memberId)))?.code).toBe("not_found");
    expect((await err(gym.listQueue(w.manager, w.org, w.A)))?.code).toBe("forbidden");
    expect((await err(gym.listMembers(w.recep, w.org, w.A)))?.code).toBe("forbidden");
    const outsider = await verified();
    expect((await err(gym.listMembers(outsider, w.org, w.A)))?.code).toBe("not_found");
    // Recepción crea tareas para la cola, sin leer fichas.
    const t = await gym.createTask(w.recep, w.org, w.A, { gymMemberId: w.vale.memberId, category: "onboarding", summary: "Primera visita 10:00" });
    expect((await gym.listQueue(w.t1, w.org, w.A)).shared.map((x) => x.id)).toContain(t.id);
  });

  it("dueño sin 2FA: la API también lo frena (no sólo la página)", async () => {
    const w = await world();
    expect((await err(gym.gymContext(w.owner, w.org)))?.code).toBe("twofa_required");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, w.owner));
    expect((await gym.gymContext(w.owner, w.org)).locationIds).toBeNull(); // todas las sedes
  });

  it("datos privados de un entrenador: siempre denegado y auditado", async () => {
    const w = await world();
    expect((await err(gym.tryPrivate(w.manager, w.org, w.t1, "Conversaciones privadas")))?.code).toBe("denied_private");
    const [a] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.orgId, w.org), eq(schema.auditEvent.action, "private.read_attempt")));
    expect(a.result).toBe("denied");
  });
});

describe("turno, cola y traspaso", () => {
  it("sin turno no se toma; con turno se toma una sola vez; fuera de turno autorizado queda marcado", async () => {
    const w = await world();
    const t = await gym.createTask(w.manager, w.org, w.A, { gymMemberId: w.vale.memberId, category: "consulta", summary: "Duda sobre horarios" });
    expect((await err(gym.takeTask(w.t1, w.org, t.id)))?.code).toBe("no_shift");
    await gym.startShift(w.t1, w.org, w.A);
    await gym.startShift(w.t2, w.org, w.A);
    expect((await err(gym.startShift(w.t1, w.org, w.A)))?.code).toBe("shift_active");
    const [a, b] = await Promise.allSettled([gym.takeTask(w.t1, w.org, t.id), gym.takeTask(w.t2, w.org, t.id)]);
    const oks = [a, b].filter((x) => x.status === "fulfilled");
    expect(oks).toHaveLength(1);
    const rej = [a, b].find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect((rej.reason as AccessError).code).toBe("taken");
    const [row] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id));
    const winner = row.assigneeUserId!;
    expect((await err(gym.completeTask(winner === w.t1 ? w.t2 : w.t1, w.org, t.id)))?.code).toBe("not_assigned");
    await gym.completeTask(winner, w.org, t.id);
    // Fuera de turno con permiso de gerencia.
    const t2 = await gym.createTask(w.manager, w.org, w.A, { category: "seguimiento", summary: "Llamar por inasistencia" });
    expect((await err(gym.takeTask(w.tB, w.org, t2.id)))?.code).toBe("not_found"); // otra sede
    await gym.setAfterHours(w.manager, w.org, w.t2, true);
    await gym.closeShift(w.t2, w.org, w.A, { toUserId: null, items: [] });
    await gym.takeTask(w.t2, w.org, t2.id);
    await gym.completeTask(w.t2, w.org, t2.id);
    const [r2] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t2.id));
    expect(r2.completedOffShift).toBe(true);
    expect(r2.dueAt).not.toBeNull(); // seguimiento con fecha objetivo
  });

  it("traspaso: pendiente hasta aceptar; a la cola queda sin asignar; cerrar turno sin turno falla", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const a = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.vale.memberId, category: "tecnica", summary: "Revisar sentadilla", assignToMe: true });
    const b = await gym.createTask(w.t1, w.org, w.A, { category: "consulta", summary: "Duda general", assignToMe: true });
    const c = await gym.createTask(w.t1, w.org, w.A, { category: "consulta", summary: "Queda conmigo", assignToMe: true });
    expect((await err(gym.closeShift(w.t1, w.org, w.A, { toUserId: w.tB, items: [{ taskId: a.id, summary: "" }] })))?.code).toBe("invalid");
    await gym.closeShift(w.t1, w.org, w.A, { toUserId: w.t2, items: [{ taskId: a.id, summary: "Revisar sentadilla, prefiere temprano" }] });
    const [ra] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, a.id));
    expect(ra.status).toBe("pending_acceptance");
    expect(ra.assigneeUserId).toBe(w.t2);
    expect(ra.summary).toBe("Revisar sentadilla, prefiere temprano");
    const [rc] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, c.id));
    expect(rc.assigneeUserId).toBe(w.t1); // no elegida: sigue con quien cerró
    expect((await gym.listQueue(w.t2, w.org, w.A)).mine.find((x) => x.id === a.id)?.handoffFrom?.name).toBe("Agustín Sala");
    expect((await err(gym.acceptHandoff(w.t1, w.org, a.id)))?.code).toBe("invalid");
    await gym.acceptHandoff(w.t2, w.org, a.id);
    expect((await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, a.id)))[0].status).toBe("open");
    await gym.startShift(w.t1, w.org, w.A);
    await gym.closeShift(w.t1, w.org, w.A, { toUserId: null, items: [{ taskId: b.id, summary: "" }] });
    const [rb] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, b.id));
    expect([rb.status, rb.assigneeUserId]).toEqual(["open", null]);
    expect((await err(gym.closeShift(w.t1, w.org, w.A, { toUserId: null, items: [] })))?.code).toBe("no_shift");
  });

  it("gerencia ve metadatos sin resumen y reasigna dentro de la sede", async () => {
    const w = await world();
    const t = await gym.createTask(w.manager, w.org, w.A, { category: "consulta", summary: "Texto operativo" });
    const list = await gym.managerTasks(w.manager, w.org, w.A, "all");
    const row = list.tasks.find((x) => x.id === t.id)!;
    expect("summary" in row).toBe(false);
    expect((await err(gym.reassignTask(w.manager, w.org, t.id, w.tB)))?.code).toBe("invalid");
    await gym.reassignTask(w.manager, w.org, t.id, w.t2);
    expect((await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id)))[0].assigneeUserId).toBe(w.t2);
  });
});

describe("socio: pedido al equipo de sala (D41), programa institucional y relación activa", () => {
  it("el pedido llega a la cola de su sede; 'programa' no se duplica; el socio ve el estado", async () => {
    const w = await world();
    const r = await gym.createMemberTask(w.vale.userId, { kind: "tecnica", text: "¿Me revisan el peso muerto?" });
    expect(r.duplicate).toBe(false);
    const q = await gym.listQueue(w.t1, w.org, w.A);
    const row = q.shared.find((x) => x.id === r.id)!;
    expect([row.source, row.category, row.member]).toEqual(["app", "tecnica", "Valentina Socia"]);
    const p1 = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa" });
    const p2 = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa" });
    expect(p2).toMatchObject({ id: p1.id, duplicate: true });
    expect((await gym.myGymTasks(w.vale.userId)).find((x) => x.id === r.id)?.status).toBe("open");
    const nobody = await verified();
    expect((await err(gym.createMemberTask(nobody, { kind: "consulta", text: "Hola equipo" })))?.code).toBe("no_gym");
  });

  it("programa institucional: motivo obligatorio, revisiones con autor y sesión ligada al gym (el coach no la ve)", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    expect((await err(gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC(), reason: "" })))?.code).toBe("invalid");
    expect((await err(gym.saveMemberProgram(w.t2, w.org, w.vale.memberId, { doc: DOC(), reason: "Programa inicial" })))?.code).toBe("no_shift");
    const task = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa" });
    const r = await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC(), reason: "Programa inicial", completeTaskId: task.id });
    expect(r.revision).toBe(1);
    expect(r.completed?.invite).toBe("pending");
    const t = await tr.myTraining(w.vale.userId);
    expect(t.state).toBe("ready");
    expect(t.relation?.kind).toBe("gym");
    const day = t.state === "ready" ? t.program.days[0].id : "";
    const sid = randomUUID();
    const s = await tr.startSession(w.vale.userId, { id: sid, dayId: day });
    expect([s.gymMemberId, s.coachClientId]).toEqual([w.vale.memberId, null]);
    const r2 = await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC("Inicial v2"), reason: "Subí volumen" });
    expect(r2.revision).toBe(2);
    expect((await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid)))[0].versionId).toBe(s.versionId);
    const d = await gym.memberDetail(w.t2, w.org, w.vale.memberId);
    expect(d.program?.revisions.map((x) => [x.number, x.author, x.reason])).toEqual([[2, "Agustín Sala", "Subí volumen"], [1, "Agustín Sala", "Programa inicial"]]);
  });

  it("con coach y gym, la persona elige la relación activa", async () => {
    const w = await world();
    const coach = await verified();
    const corg = await acc.createCoachOrganization(coach, {});
    const inv = await acc.inviteCoachClient(coach, corg.id, { email: await emailOf(w.vale.userId) });
    const rel = await acc.acceptInvitation(w.vale.userId, inv.code, []);
    const t = await tr.myTraining(w.vale.userId);
    expect(t.relations.map((r) => r.kind).sort()).toEqual(["coach", "gym"]);
    await tr.setActiveRelation(w.vale.userId, w.vale.memberId);
    expect((await tr.myTraining(w.vale.userId)).relation?.id).toBe(w.vale.memberId);
    await tr.setActiveRelation(w.vale.userId, rel.relationId);
    expect((await tr.myTraining(w.vale.userId)).relation?.kind).toBe("coach");
    expect((await err(tr.setActiveRelation(w.vale.userId, randomUUID())))?.code).toBe("not_found");
  });

  it("notas: las personales sólo las ve su autor", async () => {
    const w = await world();
    await gym.addNote(w.t1, w.org, w.vale.memberId, { kind: "institutional", text: "Prefiere entrenar temprano" });
    await gym.addNote(w.t1, w.org, w.vale.memberId, { kind: "personal", text: "Recordar preguntar por vacaciones" });
    expect((await gym.memberDetail(w.t1, w.org, w.vale.memberId)).notes).toHaveLength(2);
    const other = (await gym.memberDetail(w.t2, w.org, w.vale.memberId)).notes;
    expect(other.map((x) => x.kind)).toEqual(["institutional"]);
    expect((await err(gym.addNote(w.manager, w.org, w.vale.memberId, { kind: "institutional", text: "x y z" })))?.code).toBe("forbidden");
  });
});

describe("reseñas y moderación", () => {
  async function invited() {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const t = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.vale.memberId, category: "tecnica", summary: "Técnica", assignToMe: true });
    const c = await gym.completeTask(w.t1, w.org, t.id);
    return { w, c };
  }
  it("una invitación por interacción elegible, cadencia de 14 días, sin duplicados", async () => {
    const { w, c } = await invited();
    expect(c.invite).toBe("pending");
    const t2 = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.vale.memberId, category: "actualizar_programa", summary: "Cambio", assignToMe: true });
    expect((await gym.completeTask(w.t1, w.org, t2.id)).invite).toBe("suppressed");
    const t3 = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.vale.memberId, category: "consulta", summary: "No elegible", assignToMe: true });
    expect((await gym.completeTask(w.t1, w.org, t3.id)).invite).toBeNull();
    const inv = await rv.myReviewInvites(w.vale.userId);
    expect(inv).toHaveLength(1);
    expect((await err(rv.submitReview(w.vale.userId, inv[0].id, { stars: 0 })))?.code).toBe("invalid");
    await rv.submitReview(w.vale.userId, inv[0].id, { stars: 5, dims: [5, null, 4], text: "Me corrigió la postura" });
    expect((await err(rv.submitReview(w.vale.userId, inv[0].id, { stars: 4 })))?.code).toBe("duplicate");
    const other = await verified();
    expect((await err(rv.submitReview(other, inv[0].id, { stars: 4 })))?.code).toBe("not_found");
  });

  it("entrenador ve sin nombre; reporta y el texto se oculta; retirar no cuenta; apelación una vez", async () => {
    const { w } = await invited();
    const [inv] = await rv.myReviewInvites(w.vale.userId);
    await rv.submitReview(w.vale.userId, inv.id, { stars: 1, text: "Texto ofensivo" });
    const mine = await rv.myTrainerReviews(w.t1, w.org);
    expect(JSON.stringify(mine)).not.toContain("Valentina");
    expect(mine.aggregate).toMatchObject({ n: 1, avg: null, lowSample: true });
    await rv.respondReview(w.t1, w.org, mine.reviews[0].id, "Gracias por el comentario");
    expect((await err(rv.respondReview(w.t1, w.org, mine.reviews[0].id, "Otra")))?.code).toBe("invalid");
    const cs = await rv.openCase(w.t1, w.org, { type: "review_report", refId: mine.reviews[0].id, reason: "Contenido ofensivo" });
    expect((await rv.myTrainerReviews(w.t1, w.org)).reviews[0].text).toBeNull();
    expect((await err(rv.listCases(w.t1, w.org, w.A)))?.code).toBe("forbidden");
    const [c] = await rv.listCases(w.manager, w.org, w.A);
    expect(c.ref).toBe(cs.ref);
    expect((await rv.reviewAnalytics(w.manager, w.org, w.A)).reviews.length).toBe(0); // reportada no se lista como publicada
    expect((await err(rv.resolveCase(w.manager, w.org, c.id, { outcome: "fix" })))?.code).toBe("invalid");
    await rv.resolveCase(w.manager, w.org, c.id, { outcome: "remove", note: "Lenguaje ofensivo" });
    expect((await rv.myTrainerReviews(w.t1, w.org)).aggregate.n).toBe(0);
    expect((await rv.myGivenReviews(w.vale.userId))[0].status).toBe("removed");
    const at = await rv.myAttributions(w.t1, w.org);
    expect(at.cases[0].canAppeal).toBe(true);
    await rv.appealCase(w.t1, w.org, c.id, "Pido revisar");
    await rv.resolveCase(w.manager, w.org, c.id, { outcome: "keep" });
    expect((await rv.myAttributions(w.t1, w.org)).cases[0].canAppeal).toBe(false);
    const d = await rv.caseDetail(w.manager, w.org, c.id);
    expect(d.log.map((x) => x.text).join(" | ")).toContain("decisión final tras apelación");
  });

  it("disputa de atribución: corregir deja la tarea sin atribución", async () => {
    const { w } = await invited();
    const [att] = (await rv.myAttributions(w.t1, w.org)).attributions;
    const cs = await rv.openCase(w.t1, w.org, { type: "attribution", refId: att.taskId, reason: "La realizamos entre dos" });
    expect((await err(rv.openCase(w.t1, w.org, { type: "attribution", refId: att.taskId, reason: "Otra vez" })))?.code).toBe("invalid");
    const [c] = (await rv.listCases(w.manager, w.org, w.A)).filter((x) => x.ref === cs.ref);
    await rv.resolveCase(w.manager, w.org, c.id, { outcome: "fix", fixToUserId: null });
    expect((await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, att.taskId)))[0].completedBy).toBeNull();
  });
});

describe("métricas desde eventos reales", () => {
  it("horas, atendidas y por 10 h; sin datos no es cero", async () => {
    const w = await world();
    const start = new Date(Date.now() - 4 * 3_600_000);
    await db.insert(schema.shiftLog).values({ orgId: w.org, locationId: w.A, userId: w.t1, startedAt: start, endedAt: new Date(start.getTime() + 2 * 3_600_000) });
    await gym.setAfterHours(w.manager, w.org, w.t1, true);
    for (let i = 0; i < 3; i++) {
      const t = await gym.createTask(w.recep, w.org, w.A, { gymMemberId: w.vale.memberId, category: "consulta", summary: `Pedido ${i}` });
      await gym.takeTask(w.t1, w.org, t.id);
      await gym.completeTask(w.t1, w.org, t.id);
    }
    const pc = await mt.performanceCenter(w.manager, w.org, w.A, "7d");
    const a = pc.rows.find((r) => r.id === w.t1)!;
    expect(a.hours).toBe(2);
    expect(a.req).toBe(3);
    expect(a.per10).toBe(15);
    expect(a.respMin).not.toBeNull();
    expect(a.uniq).toBe(1);
    const b = pc.rows.find((r) => r.id === w.t2)!;
    expect([b.hours, b.per10, b.respMin, b.fuOnTime, b.ra]).toEqual([0, null, null, null, null]);
    expect(pc.rows.some((r) => r.id === w.tB)).toBe(false); // otra sede
    expect((await err(mt.performanceCenter(w.t1, w.org, w.A, "7d")))?.code).toBe("forbidden");
    expect((await mt.myPerformance(w.t1, w.org, "30d")).metrics.req).toBe(3);
  });
});

describe("mensajería (D40)", () => {
  it("coach ↔ alumno: idempotente, estados de entrega y sólo participantes", async () => {
    const coach = await verified("Coach Mensajes");
    const corg = await acc.createCoachOrganization(coach, {});
    const alumno = await verified("Alumna Mensajes");
    const inv = await acc.inviteCoachClient(coach, corg.id, { email: await emailOf(alumno) });
    const rel = await acc.acceptInvitation(alumno, inv.code, []);
    const [th] = await msg.myThreads(alumno);
    const id = randomUUID();
    await msg.sendMessage(alumno, th.id, { id, body: "¿Mantengo 2 min de descanso?" });
    expect((await msg.sendMessage(alumno, th.id, { id, body: "¿Mantengo 2 min de descanso?" })).duplicate).toBe(true);
    expect((await msg.getThread(alumno, th.id)).messages.map((m) => m.state)).toEqual(["sent"]);
    const ct = await msg.coachThreads(coach, corg.id);
    expect(ct[0].unread).toBe(1);
    expect((await msg.getThread(alumno, th.id)).messages[0].state).toBe("delivered");
    await msg.getThread(coach, th.id);
    expect((await msg.getThread(alumno, th.id)).messages[0].stateLabel).toBe("Leído");
    const outsider = await verified();
    expect((await err(msg.getThread(outsider, th.id)))?.code).toBe("not_found");
    expect((await err(msg.sendMessage(alumno, th.id, { id: randomUUID(), body: "x".repeat(2001) })))?.code).toBe("invalid");
    await db.update(schema.coachClient).set({ status: "ended" }).where(eq(schema.coachClient.id, rel.relationId));
    expect((await msg.getThread(alumno, th.id)).readOnly).toBe(true);
    expect((await err(msg.sendMessage(alumno, th.id, { id: randomUUID(), body: "Hola" })))?.code).toBe("read_only");
  });

  it("gym: el equipo de sala de la sede participa; gerencia y otra sede no", async () => {
    const w = await world();
    const th = (await msg.myThreads(w.vale.userId)).find((x) => x.kind === "gym_member")!;
    await msg.sendMessage(w.vale.userId, th.id, { id: randomUUID(), body: "¿A qué hora hay menos gente?" });
    const fl = await msg.floorThreads(w.t1, w.org, w.A);
    expect(fl.map((x) => x.id)).toContain(th.id);
    await msg.sendMessage(w.t2, th.id, { id: randomUUID(), body: "Después de las 15." });
    const seen = await msg.getThread(w.vale.userId, th.id);
    expect(seen.messages[1].sender).toBe("Sofía Sala");
    expect((await err(msg.getThread(w.manager, th.id)))?.code).toBe("not_found");
    expect((await err(msg.getThread(w.tB, th.id)))?.code).toBe("not_found");
    expect((await err(msg.floorThreads(w.manager, w.org, w.A)))?.code).toBe("not_found");
  });
});
