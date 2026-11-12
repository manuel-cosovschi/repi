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
import { BRIEF } from "./fixtures/brief";

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

  it("dueño sin 2FA entra igual: la verificación en dos pasos es optativa (D119)", async () => {
    const w = await world();
    await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, w.owner));
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
  it("D158: fuera de 6 a 22 no se inicia turno y el que quedó abierto termina solo a las 22", async () => {
    const w = await world();
    const prev = process.env.REPI_GYM_HOURS;
    process.env.REPI_GYM_HOURS = "on";
    try {
      const night = new Date("2026-10-29T23:10:00-03:00");
      const e = await gym.startShift(w.t1, w.org, w.A, night).catch((x) => x as AccessError);
      expect((e as AccessError).code).toBe("gym_closed");
      await gym.startShift(w.t1, w.org, w.A, new Date("2026-10-29T17:30:00-03:00"));
      expect(await gym.closeShiftsAfterHours(new Date("2026-10-29T21:00:00-03:00"))).toBe(0); // abierto: sigue
      await gym.closeShiftsAfterHours(new Date("2026-10-29T22:01:00-03:00"));
      const [s] = await db.select().from(schema.shiftLog).where(eq(schema.shiftLog.userId, w.t1));
      expect(s.endedAt).toEqual(new Date("2026-10-29T22:00:00-03:00"));
      expect(await gym.activeShift(w.t1)).toBeNull();
    } finally { process.env.REPI_GYM_HOURS = prev; }
  });
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
    const p1 = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa", brief: BRIEF });
    const p2 = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa", brief: BRIEF });
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
    const task = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa", brief: BRIEF });
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
    await tr.logSet(w.vale.userId, sid, { id: randomUUID(), programExerciseId: (await tr.getSession(w.vale.userId, sid)).exercises[0].id, setIndex: 0, weightKg: 42.5, reps: 8, rir: 2, feel: "bien" });
    const r2 = await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC("Inicial v2"), reason: "Subí volumen" });
    expect(r2.revision).toBe(2);
    expect((await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid)))[0].versionId).toBe(s.versionId);
    const d = await gym.memberDetail(w.t2, w.org, w.vale.memberId);
    // D178: el equipo de sala ve las series que anotó el socio que comparte su entrenamiento.
    expect(d.log[0].exercises[0].sets[0]).toMatchObject({ n: 1, weightKg: 42.5, reps: 8, rir: 2, feel: "bien" });
    expect(d.program?.revisions.map((x) => [x.number, x.author, x.reason])).toEqual([[2, "Agustín Sala", "Subí volumen"], [1, "Agustín Sala", "Programa inicial"]]);
    // Una tarea de programa tomada y «en atención» también se cierra al guardar, sólo por quien la tomó.
    const t2 = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Cambiemos el programa", brief: BRIEF });
    await db.update(schema.gymTask).set({ status: "in_progress", assigneeUserId: w.t1 }).where(eq(schema.gymTask.id, t2.id));
    expect((await gym.memberDetail(w.t1, w.org, w.vale.memberId)).programTaskId).toBe(t2.id);
    expect((await gym.memberDetail(w.t2, w.org, w.vale.memberId)).programTaskId).toBeNull();
    // Abierta desde una solicitud de Sala: si esa solicitud se cierra con el programa, es la que se completa; si no, la de siempre.
    const t3 = await gym.createMemberTask(w.vale.userId, { kind: "rutina", text: "Quiero cambiar el día de piernas" });
    await db.update(schema.gymTask).set({ status: "in_progress", assigneeUserId: w.t1 }).where(eq(schema.gymTask.id, t3.id));
    expect((await gym.memberDetail(w.t1, w.org, w.vale.memberId, new Date(), { task: t3.id })).programTaskId).toBe(t3.id);
    expect((await gym.memberDetail(w.t1, w.org, w.vale.memberId, new Date(), { task: randomUUID() })).programTaskId).toBe(t2.id);
    expect((await gym.memberDetail(w.t2, w.org, w.vale.memberId, new Date(), { task: t3.id })).programTaskId).toBeNull();
    const r3 = await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC("Inicial v3"), reason: "Cambio pedido", completeTaskId: t2.id });
    expect(r3.completed?.ref).toMatch(/^T-\d+$/);
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
    // «Ahora» un segundo después: la ventana es [desde, ahora) y el último pedido puede completarse en el mismo milisegundo
    // en que se mide (quedaba afuera y la prueba fallaba de vez en cuando en CI).
    const pc = await mt.performanceCenter(w.manager, w.org, w.A, "7d", new Date(Date.now() + 1000));
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


describe("roles distintos por sede no se combinan", () => {
  it("gerente A + recepción B no puede gestionar ni leer fichas de B", async () => {
    const w = await world();
    await db.insert(schema.staffMembership).values({ userId: w.manager, orgId: w.org, locationId: w.B, role: "reception" });
    const b = await w.member(w.B);
    expect((await err(gym.listMembers(w.manager, w.org, w.B)))?.code).toBe("not_found");
    expect((await err(gym.memberDetail(w.manager, w.org, b.memberId)))?.code).toBe("not_found");
    expect((await err(gym.weekPlan(w.manager, w.org, w.B)))?.code).toBe("not_found");
    expect((await gym.teamList(w.manager, w.org, null)).staff.some(x => x.id === w.tB)).toBe(false);
    expect((await gym.createTask(w.manager, w.org, w.B, { summary: "Consulta recepción", category: "consulta" })).id).toBeTruthy();
  });
  it("autorización fuera de turno sólo modifica y habilita la sede administrada", async () => {
    const w = await world();
    await db.insert(schema.staffMembership).values({ userId: w.t1, orgId: w.org, locationId: w.B, role: "floor_trainer" });
    await gym.setAfterHours(w.manager, w.org, w.t1, true);
    const memberships = await db.select().from(schema.staffMembership).where(eq(schema.staffMembership.userId, w.t1));
    expect(memberships.find(x => x.locationId === w.A)?.afterHoursAccess).toBe(true);
    expect(memberships.find(x => x.locationId === w.B)?.afterHoursAccess).toBe(false);
    const b = await gym.createTask(w.tB, w.org, w.B, { summary: "Consulta sede B", category: "consulta" });
    expect((await err(gym.takeTask(w.t1, w.org, b.id)))?.code).toBe("no_shift");
  });
});

describe("D206 · pedido de programa con preferencias (gimnasio)", () => {
  const full = { ...BRIEF, daysPerWeek: 4, level: "intermediate", hasLimitations: true, limitationsDetail: "Hombro derecho operado (2024)", focus: ["gluteos"], likes: "Hip thrust" };

  it("sin objetivo, días, experiencia o lesiones no se pide; con ellas el equipo las ve y precargan «Armar con REPI»", async () => {
    const w = await world();
    const e = await err(gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa" }));
    expect(e?.code).toBe("brief_required");
    expect((await err(gym.createMemberTask(w.vale.userId, { kind: "programa", text: "x", brief: { ...full, hasLimitations: true, limitationsDetail: "" } })))?.code).toBe("brief_required");
    const r = await gym.createMemberTask(w.vale.userId, { kind: "programa", text: "Quiero un programa", brief: full });
    const [t] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, r.id));
    expect(t.summary).toContain("Lesiones o limitaciones: Hombro derecho operado (2024)");
    expect(t.context?.brief?.daysPerWeek).toBe(4);
    const q = await gym.listQueue(w.t1, w.org, w.A);
    const row = q.shared.find((x) => x.id === r.id)!;
    expect(row.brief?.missing).toBe(false);
    expect(row.brief?.rows.find((x) => x.label === "Lesiones o limitaciones")).toMatchObject({ alert: true });
    await gym.startShift(w.t1, w.org, w.A);
    const d = await gym.memberDetail(w.t1, w.org, w.vale.memberId); // quien arma programas (sala o coordinación)
    expect(d.programBrief).toMatchObject({ goal: "muscle", daysPerWeek: 4, level: "intermediate", limitations: "Hombro derecho operado (2024)" });
    // Lo que busca entrenando se actualiza (sin las lesiones) y no se comparte solo.
    const [pref] = await db.select().from(schema.userPref).where(eq(schema.userPref.userId, w.vale.userId));
    expect(pref.wishes).toMatchObject({ goal: "muscle", daysPerWeek: 4, minutes: 60, likes: "Hip thrust", shareWithTrainers: false });
    expect(JSON.stringify(pref.wishes)).not.toContain("Hombro");
  });

  it("un pedido anterior (o creado por el gimnasio) sin datos: aviso al socio, push una vez de día, completar y avisar a quien lo tomó", async () => {
    const { pendingBriefs, completeProgramBrief, remindProgramBriefs } = await import("@/server/training/program-request");
    const { myNotifications, markNotificationsSeen } = await import("@/server/notifications/feed");
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const t = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.vale.memberId, category: "programa_nuevo", summary: "Socio sin programa vigente." });
    await gym.takeTask(w.t1, w.org, t.id);
    const pend = await pendingBriefs(w.vale.userId);
    expect(pend).toEqual([expect.objectContaining({ id: t.id, source: "gym" })]);
    await markNotificationsSeen(w.vale.userId);
    const feed = await myNotifications(w.vale.userId);
    expect(feed.items[0]).toMatchObject({ id: `brief:${t.id}`, unread: true, title: "Completá tu pedido de programa" });
    const row = (await gym.listQueue(w.t1, w.org, w.A)).mine.find((x) => x.id === t.id);
    expect(row?.brief?.missing).toBe(true);
    // Push: una sola vez y sólo de día (14:00 de Buenos Aires = 17:00 UTC; 23:00 = 02:00 UTC).
    expect(await remindProgramBriefs(new Date("2026-11-07T02:00:00Z"))).toBe(0);
    expect(await remindProgramBriefs(new Date("2026-11-07T17:00:00Z"))).toBeGreaterThanOrEqual(1);
    await remindProgramBriefs(new Date("2026-11-07T17:15:00Z"));
    const pushes = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.dedupeKey, `brief:${t.id}:${w.vale.userId}`));
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ kind: "program_brief", url: "/app?completar=programa" });
    // Completar: se adjunta al pedido existente (sin crear otro) y le llega aviso a quien lo tomó.
    expect((await err(completeProgramBrief(w.vale.userId, { goal: "muscle" })))?.code).toBe("brief_required");
    expect(await completeProgramBrief(w.vale.userId, full)).toEqual({ completed: 1 });
    const [after] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id));
    expect(after.context?.brief?.limitationsDetail).toBe("Hombro derecho operado (2024)");
    expect(after.summary).toContain("Objetivo: Ganar músculo");
    expect(await db.select().from(schema.gymTask).where(and(eq(schema.gymTask.gymMemberId, w.vale.memberId), eq(schema.gymTask.category, "programa_nuevo")))).toHaveLength(1);
    expect((await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.dedupeKey, `brief-done:${t.id}:${w.t1}`)))).toHaveLength(1);
    expect(await pendingBriefs(w.vale.userId)).toEqual([]);
    expect((await myNotifications(w.vale.userId)).items.some((x) => x.id === `brief:${t.id}`)).toBe(false);
    expect((await err(completeProgramBrief(w.vale.userId, full)))?.code).toBe("no_pending");
  });
});

// ── FSA1 · auditoría staff (09/11/2026) ─────────────────────────────────────
/** Programa institucional mínimo (sin servicios) para sembrar sesiones con números conocidos. */
async function seedProgram(orgId: string, gymMemberId: string, by: string) {
  const [p] = await db.insert(schema.program).values({ orgId, kind: "member_copy", gymMemberId, createdBy: by }).returning();
  const [v] = await db.insert(schema.programVersion).values({ programId: p.id, number: 1, name: "Base", weeks: 4, createdBy: by, locked: true }).returning();
  await db.update(schema.program).set({ currentVersionId: v.id }).where(eq(schema.program.id, p.id));
  const [d] = await db.insert(schema.programDay).values({ versionId: v.id, position: 0, name: "Día A" }).returning();
  const [a] = await db.insert(schema.programAssignment).values({ gymMemberId, programId: p.id, startsOn: "2026-01-01", assignedBy: by }).returning();
  return { assignmentId: a.id, versionId: v.id, dayId: d.id };
}
async function seedSessions(userId: string, gymMemberId: string, prog: { assignmentId: string; versionId: string; dayId: string }, daysAgo: number[], status: "completed" | "abandoned" = "completed", now = Date.now()) {
  for (const ago of daysAgo) {
    const end = new Date(now - ago * 86_400_000);
    await db.insert(schema.workoutSession).values({ id: randomUUID(), userId, gymMemberId, ...prog, dayName: "Día A", status, startedAt: new Date(end.getTime() - 3_600_000), endedAt: end });
  }
}
/** Socios sin cuenta verificada (alta masiva para números grandes): sólo usuario y socio activo. */
async function bulkMembers(orgId: string, locationId: string, count: number) {
  const users = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), name: `Socio masivo ${i}`, email: `bulk${i}.${randomUUID()}@test.repi.local`, emailVerified: true }));
  await db.insert(schema.user).values(users);
  const ms = await db.insert(schema.gymMember).values(users.map((u) => ({ orgId, locationId, userId: u.id, status: "active" as const }))).returning();
  return ms.map((m) => ({ memberId: m.id, userId: m.userId }));
}

describe("FSA1 · gestión no lee datos privados del socio", () => {
  it("dueño y gerencia: sin series, notas de sesión ni notas del equipo; sala sí, y la asistencia agregada sigue", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC(), reason: "Programa inicial" });
    const t = await tr.myTraining(w.vale.userId);
    const sid = randomUUID();
    await tr.startSession(w.vale.userId, { id: sid, dayId: t.state === "ready" ? t.program.days[0].id : "" });
    const pe = (await tr.getSession(w.vale.userId, sid)).exercises[0].id;
    await tr.logSet(w.vale.userId, sid, { id: randomUUID(), programExerciseId: pe, setIndex: 0, weightKg: 40, reps: 8, rir: 2, feel: "molestia", note: "me tira la rodilla" });
    await tr.sessionAction(w.vale.userId, sid, "finish");
    await gym.addNote(w.t1, w.org, w.vale.memberId, { kind: "institutional", text: "Prefiere entrenar temprano" });
    const floor = await gym.memberDetail(w.t2, w.org, w.vale.memberId);
    expect(floor.log[0].exercises[0].sets[0]).toMatchObject({ feel: "molestia", note: "me tira la rodilla" });
    expect(floor.notes.map((x) => x.text)).toEqual(["Prefiere entrenar temprano"]);
    expect(floor.seesTraining).toBe(true);
    for (const who of [w.owner, w.manager]) {
      const d = await gym.memberDetail(who, w.org, w.vale.memberId);
      expect(d.log).toEqual([]);
      expect(d.notes).toEqual([]);
      expect(JSON.stringify(d)).not.toContain("rodilla");
      expect(d.visits30).toBe(1); // asistencia agregada: sí
      expect(d.seesTraining).toBe(false);
    }
  });
});

describe("FSA1 · casos críticos de sala", () => {
  it("quien pierde el permiso con la pantalla abierta: las acciones siguientes se rechazan en el servidor", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const t = await gym.createTask(w.manager, w.org, w.A, { gymMemberId: w.vale.memberId, category: "consulta", summary: "Duda de horarios" });
    const t2 = await gym.createTask(w.manager, w.org, w.A, { gymMemberId: w.vale.memberId, category: "consulta", summary: "Otra duda" });
    await gym.takeTask(w.t1, w.org, t2.id);
    const open = await gym.memberDetail(w.t1, w.org, w.vale.memberId); // la pantalla quedó abierta
    expect(open.canEdit).toBe(true);
    // Cambio de rol: de sala a recepción (sin «program.edit» ni «floor.work»).
    await db.update(schema.staffMembership).set({ role: "reception" }).where(and(eq(schema.staffMembership.userId, w.t1), eq(schema.staffMembership.orgId, w.org)));
    expect((await err(gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC(), reason: "Programa inicial" })))?.code).toBe("forbidden");
    expect((await err(gym.takeTask(w.t1, w.org, t.id)))?.code).toBe("forbidden");
    expect((await err(gym.completeTask(w.t1, w.org, t2.id)))?.code).toBe("forbidden");
    expect((await err(gym.memberDetail(w.t1, w.org, w.vale.memberId)))?.code).toBe("forbidden");
    // Baja del equipo: ya no existe para él (404, sin revelar el gym).
    await db.update(schema.staffMembership).set({ status: "revoked" }).where(and(eq(schema.staffMembership.userId, w.t1), eq(schema.staffMembership.orgId, w.org)));
    const denied = await Promise.all([err(gym.listQueue(w.t1, w.org, w.A)), err(gym.addNote(w.t1, w.org, w.vale.memberId, { kind: "personal", text: "nota" })), err(gym.gymContext(w.t1, w.org))]);
    expect(denied.map((e) => e?.code)).toEqual(["not_found", "not_found", "not_found"]);
    expect((await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id)))[0].assigneeUserId).toBeNull();
    expect(await db.select().from(schema.programAssignment).where(eq(schema.programAssignment.gymMemberId, w.vale.memberId))).toHaveLength(0);
  });

  it("cambio de sede: pierde la sede anterior y trabaja en la nueva", async () => {
    const w = await world();
    const bMember = await w.member(w.B, "Socio Belgrano");
    const ta = await gym.createTask(w.manager, w.org, w.A, { gymMemberId: w.vale.memberId, category: "consulta", summary: "Pedido en A" });
    const tb = await gym.createTask(w.tB, w.org, w.B, { gymMemberId: bMember.memberId, category: "consulta", summary: "Pedido en B" });
    await db.update(schema.staffMembership).set({ locationId: w.B }).where(and(eq(schema.staffMembership.userId, w.t1), eq(schema.staffMembership.orgId, w.org)));
    expect((await err(gym.startShift(w.t1, w.org, w.A)))?.code).toBe("not_found");
    expect((await err(gym.memberDetail(w.t1, w.org, w.vale.memberId)))?.code).toBe("not_found");
    await gym.startShift(w.t1, w.org, w.B);
    expect((await err(gym.takeTask(w.t1, w.org, ta.id)))?.code).toBe("not_found");
    await gym.takeTask(w.t1, w.org, tb.id);
    expect((await gym.memberDetail(w.t1, w.org, bMember.memberId)).name).toBe("Socio Belgrano");
    expect((await gym.listQueue(w.t2, w.org, w.A)).shared.map((x) => x.id)).toContain(ta.id);
  });

  it("fin de turno con pendientes: lo traspasado espera aceptación, lo demás sigue asignado y visible para gerencia", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const a = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.vale.memberId, category: "tecnica", summary: "Revisar peso muerto", assignToMe: true });
    const b = await gym.createTask(w.t1, w.org, w.A, { category: "consulta", summary: "Queda conmigo", assignToMe: true });
    await gym.closeShift(w.t1, w.org, w.A, { toUserId: w.t2, items: [{ taskId: a.id, summary: "Revisar peso muerto, viene a las 18" }] });
    expect(await gym.activeShift(w.t1)).toBeNull();
    // Sin turno ni permiso fuera de turno no la completa; gerencia la ve asignada y la devuelve a la cola.
    expect((await err(gym.completeTask(w.t1, w.org, b.id)))?.code).toBe("no_shift");
    expect((await gym.managerTasks(w.manager, w.org, w.A, "open")).tasks.find((x) => x.id === b.id)?.assignee?.id).toBe(w.t1);
    expect((await gym.managerTasks(w.manager, w.org, w.A, "pending")).tasks.map((x) => x.id)).toEqual([a.id]);
    await gym.reassignTask(w.manager, w.org, b.id, null);
    expect((await gym.listQueue(w.t2, w.org, w.A)).shared.map((x) => x.id)).toContain(b.id);
    // Quien recibe el traspaso lo acepta en su turno: la continuidad queda en el historial de la tarea.
    await gym.startShift(w.t2, w.org, w.A);
    await gym.acceptHandoff(w.t2, w.org, a.id);
    await gym.completeTask(w.t2, w.org, a.id);
    const ev = await db.select().from(schema.gymTaskEvent).where(eq(schema.gymTaskEvent.taskId, a.id));
    expect(ev.map((e) => e.kind)).toEqual(expect.arrayContaining(["created", "taken", "transferred", "accepted", "resolved"]));
  });

  it("el socio deja de compartir su entrenamiento: series, últimas marcas e inteligencia dejan de verse al instante", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC(), reason: "Programa inicial" });
    const t = await tr.myTraining(w.vale.userId);
    const sid = randomUUID();
    await tr.startSession(w.vale.userId, { id: sid, dayId: t.state === "ready" ? t.program.days[0].id : "" });
    await tr.logSet(w.vale.userId, sid, { id: randomUUID(), programExerciseId: (await tr.getSession(w.vale.userId, sid)).exercises[0].id, setIndex: 0, weightKg: 50, reps: 8, rir: 2, feel: null });
    await tr.sessionAction(w.vale.userId, sid, "finish");
    expect((await gym.memberDetail(w.t1, w.org, w.vale.memberId)).log).toHaveLength(1);
    expect(Object.keys(await gym.memberLastTimes(w.t1, w.org, w.vale.memberId, [EX]))).toEqual([EX]);
    await db.update(schema.consentGrant).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.consentGrant.relationId, w.vale.memberId));
    const d = await gym.memberDetail(w.t1, w.org, w.vale.memberId);
    expect([d.trainingShared, d.log, d.visits30, d.wishes]).toEqual([false, [], 0, null]);
    expect(await gym.memberLastTimes(w.t1, w.org, w.vale.memberId, [EX])).toEqual({});
    expect((await err(gym.memberIntelligence(w.t1, w.org, w.vale.memberId)))?.code).toBe("consent_required");
    // El programa institucional y el historial no se borran.
    expect(d.program?.revision).toBe(1);
    expect(await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid))).toHaveLength(1);
  });
});

describe("FSA1 · los números de gestión coinciden con la base", () => {
  it("panel, participación, ejecutivo y desempeño: conteos exactos con filtro de sede", async () => {
    const w = await world();
    const now = Date.now();
    // Sede A: vale (programa, 3 sesiones en 30 días + 1 vieja + 1 abandonada), m2 sin programa, m3 de baja (con sesión), m4 sin consentir.
    const pv = await seedProgram(w.org, w.vale.memberId, w.t1);
    await seedSessions(w.vale.userId, w.vale.memberId, pv, [1, 5, 20, 40]);
    await seedSessions(w.vale.userId, w.vale.memberId, pv, [2], "abandoned");
    const m2 = await w.member(w.A, "Socio Sin Programa");
    const m3 = await w.member(w.A, "Socio De Baja");
    await db.update(schema.gymMember).set({ status: "ended" }).where(eq(schema.gymMember.id, m3.memberId));
    await seedSessions(m3.userId, m3.memberId, await seedProgram(w.org, m3.memberId, w.t1), [3]);
    const m4 = await w.member(w.A, "Socio Pendiente");
    await db.update(schema.gymMember).set({ status: "pending_consent" }).where(eq(schema.gymMember.id, m4.memberId));
    // Sede B: un socio con programa que entrena 2+ por semana (9 sesiones en 28 días).
    const b1 = await w.member(w.B, "Socio Constante");
    await seedSessions(b1.userId, b1.memberId, await seedProgram(w.org, b1.memberId, w.tB), [1, 3, 6, 9, 12, 15, 18, 21, 24]);
    // Padrón: 4 en A (uno vinculado), 1 en B.
    for (const [loc, k] of [[w.A, 4], [w.B, 1]] as const) for (let i = 0; i < k; i++)
      await db.insert(schema.rosterEntry).values({ orgId: w.org, locationId: loc, dniHmac: randomUUID(), dniLast3: "123", fullName: `Padrón ${i}`, source: "csv" });
    const [re] = await db.select().from(schema.rosterEntry).where(and(eq(schema.rosterEntry.orgId, w.org), eq(schema.rosterEntry.locationId, w.A))).limit(1);
    await db.update(schema.gymMember).set({ rosterEntryId: re.id }).where(eq(schema.gymMember.id, w.vale.memberId));
    // Equipo: tAB trabaja en A y en B; en turno en A, con una tarea en A y otra en B.
    const tAB = await verified("Tomás Dos Sedes");
    await db.insert(schema.staffMembership).values([{ userId: tAB, orgId: w.org, locationId: w.A, role: "floor_trainer" }, { userId: tAB, orgId: w.org, locationId: w.B, role: "floor_trainer" }]);
    await gym.startShift(tAB, w.org, w.A);
    await gym.createTask(tAB, w.org, w.A, { category: "consulta", summary: "Tarea en A", assignToMe: true });
    await db.insert(schema.gymTask).values({ number: 99999, orgId: w.org, locationId: w.B, category: "consulta", priority: "media", source: "gerencia", summary: "Tarea en B", createdBy: w.manager, assigneeUserId: tAB });
    await gym.createTask(w.manager, w.org, w.A, { gymMemberId: m2.memberId, category: "seguimiento", summary: "Seguimiento A", dueAt: new Date(now - 86_400_000).toISOString() });

    const at = new Date(now + 1000);
    expect(await mt.locationOutcomes([w.A], at)).toEqual({ members: 2, sessions30: 3, withProgram: 50, trained30: 50, twoPerWeek: 0, trainedN: 1 });
    expect(await mt.locationOutcomes([w.B], at)).toEqual({ members: 1, sessions30: 9, withProgram: 100, trained30: 100, twoPerWeek: 100, trainedN: 1 });

    const panel = await mt.managerPanel(w.manager, w.org, w.A, at);
    expect(panel.kpis).toMatchObject({ roster: 4, members: 2, adoption: 25, onShift: 1, shared: 1, followOverdue: 1, followOpen: 1 });
    expect(panel.weeks.reduce((s, x) => s + x.n, 0)).toBe(4); // completadas en 56 días: sin la abandonada ni la del socio de baja
    expect(panel.onShift.find((o) => o.id === tAB)?.openTasks).toBe(1); // sólo las de esta sede
    expect(panel.taskBars.find((x) => x.label === "Asignadas")?.n).toBe(1);

    const eng = await mt.engagement(w.manager, w.org, w.A, at);
    expect(eng.funnel.map((f) => f.n)).toEqual([4, 2, 1, 1, null]);
    expect([eng.withoutProgram, eng.newThisMonth]).toEqual([1, 2]);

    const ex = await mt.executive(w.owner, w.org, at);
    expect(ex.kpis).toMatchObject({ roster: 5, members: 3, adoption: 20, sessions30: 12, locations: 2 });
    const exA = ex.locations.find((l) => l.id === w.A)!, exB = ex.locations.find((l) => l.id === w.B)!;
    expect([exA.members, exA.sessions30, exA.perMember30, exA.trainers, exA.followOnTime]).toEqual([2, 3, 1.5, 3, 0]); // t1, t2, tAB
    expect([exB.members, exB.sessions30, exB.perMember30, exB.trainers]).toEqual([1, 9, 9, 2]); // tB, tAB
    // Filtro de sede del dueño: cada sede por separado suma lo mismo que «Todas».
    const all = await mt.managerPanel(w.owner, w.org, null, at);
    const pa = await mt.managerPanel(w.owner, w.org, w.A, at), pbp = await mt.managerPanel(w.owner, w.org, w.B, at);
    expect(all.kpis.members).toBe(pa.kpis.members + pbp.kpis.members);
    expect(all.kpis.roster).toBe(pa.kpis.roster + pbp.kpis.roster);
    expect(all.weeks.reduce((s, x) => s + x.n, 0)).toBe(13);
    expect((await mt.performanceCenter(w.owner, w.org, w.B, "30d", at)).outcomes).toMatchObject({ members: 1, sessions30: 9 });
  });

  it("con más de 100 socios, «Entrenaron en 30 días» es la cantidad real (no un porcentaje redondeado)", async () => {
    const w = await world();
    const ms = await bulkMembers(w.org, w.B, 150);
    await seedSessions(ms[0].userId, ms[0].memberId, await seedProgram(w.org, ms[0].memberId, w.tB), [2]);
    const eng = await mt.engagement(w.owner, w.org, w.B, new Date(Date.now() + 1000));
    expect(eng.funnel.find((f) => f.label === "Entrenaron en 30 días")?.n).toBe(1);
    expect(eng.funnel.find((f) => f.label === "Con programa asignado")?.n).toBe(1);
  });
});
