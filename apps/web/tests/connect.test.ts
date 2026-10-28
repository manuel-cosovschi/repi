// REPI Connect (D126): circuito socio → profesor → continuidad → gestión, con permisos, concurrencia e idempotencia.
import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as cn from "@/server/gym/connect";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `cn${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Connect") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

let EX: string;
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Press connect", muscleGroup: "Pecho" }).onConflictDoNothing().returning();
  EX = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Press connect")))[0].id;
});
beforeEach(() => resetRateLimits());

/** Gym con Connect activo: dueño, gerente, coordinadora y dos profesores en A, uno en B, y dos socias en A. */
async function world(on = true) {
  const owner = await verified("Dueño Connect");
  const org = await acc.createGymOrganization(owner, { name: `Gym Connect ${n}-${Date.now()}` });
  await db.update(schema.organization).set({ connectEnabled: on }).where(eq(schema.organization.id, org.id));
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
  const staff = async (name: string, role: "manager" | "floor_trainer" | "coordinator", loc: string) => {
    const u = await verified(name);
    await db.insert(schema.staffMembership).values({ userId: u, orgId: org.id, locationId: loc, role });
    return u;
  };
  const manager = await staff("Gerente Connect", "manager", A.id);
  const coord = await staff("Coordinadora Connect", "coordinator", A.id);
  const t1 = await staff("Ana Sala", "floor_trainer", A.id);
  const t2 = await staff("Bruno Sala", "floor_trainer", A.id);
  const tB = await staff("Carla Norte", "floor_trainer", B.id);
  const member = async (name: string) => {
    const u = await verified(name);
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    return { userId: u, memberId: m.id };
  };
  return { org: org.id, A: A.id, B: B.id, owner, manager, coord, t1, t2, tB, vale: await member("Valentina Socia"), juli: await member("Julián Socio") };
}
const DOC = () => ({ name: "Base Connect", weeks: 4, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: "Press connect", sets: 3, reps: "8", rir: 2, restSec: 90 }] }] });

describe("REPI Connect · circuito completo", () => {
  it("pedido desde el ejercicio → tomar → atender → registrar → transferir → otro profesor resuelve → socio ve el resultado → gestión ve números", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    await gym.saveMemberProgram(w.t1, w.org, w.vale.memberId, { doc: DOC(), reason: "Inicial" });
    const tt = await tr.myTraining(w.vale.userId);
    const sid = randomUUID();
    await tr.startSession(w.vale.userId, { id: sid, dayId: tt.state === "ready" ? tt.program.days[0].id : "" });
    const s = await tr.getSession(w.vale.userId, sid);
    await tr.logSet(w.vale.userId, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 40, reps: 8, rir: 2, feel: "bien" });

    // 1–5: el socio pide ayuda con el ejercicio, con un comentario breve.
    const req = await cn.memberCreate(w.vale.userId, { reason: "ejercicio", comment: "No sé si bajo bien la barra", clientKey: randomUUID(), context: { sessionId: sid, programExerciseId: s.exercises[0].id, setIndex: 0 } });
    expect(req.duplicate).toBe(false);
    expect(req.notified).toBe(1); // Ana está en turno en la sede
    const mine = await cn.memberBoard(w.vale.userId);
    expect(mine.enabled && mine.requests[0]).toMatchObject({ state: "pendiente", label: "Ayuda con un ejercicio", exercise: "Press connect", canCancel: true });

    // 6–9: Ana ve el pedido con prioridad alta (entrenando ahora), lo toma, lo atiende y consulta el contexto.
    const board = await cn.staffBoard(w.t1, w.org, w.A);
    expect(board.pending.map((c) => [c.id, c.priority, c.fromSession])).toEqual([[req.id, "alta", true]]);
    await cn.staffAct(w.t1, w.org, req.id, "take");
    await cn.staffAct(w.t1, w.org, req.id, "start");
    const det = await cn.staffTask(w.t1, w.org, req.id);
    expect(det.context).toMatchObject({ exercise: "Press connect", program: "Base Connect", fromSession: true });
    expect(det.context?.sets.map((x) => [x.setIndex, x.weightKg, x.reps])).toEqual([[0, "40", 8]]);
    expect(det.actions).toMatchObject({ note: true, transfer: true, resolve: true, take: false });

    // 10–11: registra lo que hizo y deja la continuidad a Bruno.
    await cn.staffAct(w.t1, w.org, req.id, "note", { note: "Corregí la trayectoria con 30 kg." });
    expect((await err(cn.staffAct(w.t1, w.org, req.id, "transfer", { toUserId: w.tB, done: "x" })))?.code).toBe("invalid"); // otra sede
    await cn.staffAct(w.t1, w.org, req.id, "transfer", { toUserId: w.t2, done: "Técnica corregida", pending: "Volver a 40 kg", next: "Revisar el jueves" });
    const md = await cn.memberDetail(w.vale.userId, req.id);
    expect(md.timeline.map((x) => x.text)).toEqual(["Enviaste el pedido", "Lo tomó Ana", "Ana te está atendiendo", "Pasó a otro profesor para continuar"]);
    expect(JSON.stringify(md)).not.toContain("Corregí la trayectoria"); // el registro interno no llega al socio

    // 12–14: Bruno (otro turno) ve el traspaso, lo acepta, sigue y resuelve con un mensaje para el socio.
    await gym.startShift(w.t2, w.org, w.A);
    const b2 = await cn.staffBoard(w.t2, w.org, w.A);
    expect(b2.incoming.map((c) => c.id)).toEqual([req.id]);
    const d2 = await cn.staffTask(w.t2, w.org, req.id);
    expect(d2.events.find((e) => e.kind === "transferred")?.note).toBe("Hecho: Técnica corregida · Pendiente: Volver a 40 kg · Próximo paso: Revisar el jueves");
    await cn.staffAct(w.t2, w.org, req.id, "accept");
    expect((await err(cn.staffAct(w.t2, w.org, req.id, "resolve", { note: "" })))?.code).toBe("invalid"); // registrar es obligatorio
    const r = await cn.staffAct(w.t2, w.org, req.id, "resolve", { note: "Hizo 3x8 con 40 kg, bien.", memberNote: "¡Muy bien! Seguí con 40 kg." });
    expect(r.status).toBe("done");

    // El socio ve el resultado y puede opinar una sola vez.
    const md2 = await cn.memberDetail(w.vale.userId, req.id);
    expect(md2.state).toBe("resuelta");
    expect(md2.timeline.at(-1)).toMatchObject({ text: "Resuelto por Bruno", note: "¡Muy bien! Seguí con 40 kg." });
    await cn.memberFeedback(w.vale.userId, req.id, true);
    expect((await cn.memberFeedback(w.vale.userId, req.id, false)).already).toBe(true);

    // 15–18: el dueño ve indicadores agregados, sin texto de pedidos ni notas.
    const rep = await cn.connectReport(w.owner, w.org, null, 30);
    expect(rep.metrics).toMatchObject({ received: 1, resolved: 1, transfers: 1, membersHelped: 1, resolvedPct: 100 });
    expect(rep.metrics.firstResponseMedianMin).not.toBeNull();
    expect(rep.metrics.feedback).toEqual({ answered: 1, helpful: 1, helpfulPct: 100 });
    expect(rep.team.map((t) => t.name)).toEqual(["Ana Sala", "Bruno Sala"]); // alfabético, no ranking
    const json = JSON.stringify(rep);
    for (const secret of ["No sé si bajo bien", "Corregí", "Muy bien", "Valentina"]) expect(json).not.toContain(secret);
    expect((await err(cn.staffTask(w.owner, w.org, req.id)))?.code).toBe("forbidden"); // el dueño no abre el detalle
    expect((await err(cn.connectReport(w.t1, w.org, null)))?.code).toBe("forbidden"); // el profesor no ve el tablero de gestión
  });

  it("seguimiento para el próximo turno: queda libre, otro profesor lo toma y lo resuelve", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const req = await cn.memberCreate(w.juli.userId, { reason: "revisar_rutina" });
    await cn.staffAct(w.t1, w.org, req.id, "take");
    await cn.staffAct(w.t1, w.org, req.id, "follow_up", { done: "Revisamos días", pending: "Armar día C", forShift: true });
    const md = await cn.memberBoard(w.juli.userId);
    expect(md.enabled && md.requests[0]).toMatchObject({ state: "seguimiento", canCancel: false });
    await gym.startShift(w.t2, w.org, w.A);
    const b = await cn.staffBoard(w.t2, w.org, w.A);
    expect(b.followUps.map((c) => [c.id, c.assignee])).toEqual([[req.id, null]]);
    await cn.staffAct(w.t2, w.org, req.id, "take");
    await cn.staffAct(w.t2, w.org, req.id, "resolve", { note: "Día C armado." });
    // Compatibilidad: la cola anterior también lista los seguimientos libres.
    const r2 = await cn.memberCreate(w.vale.userId, { reason: "duda" });
    await cn.staffAct(w.t1, w.org, r2.id, "take");
    await cn.staffAct(w.t1, w.org, r2.id, "follow_up", { note: "Ver el lunes", forShift: true });
    expect((await gym.listQueue(w.t2, w.org, w.A)).shared.map((t) => t.id)).toContain(r2.id);
  });
});

describe("REPI Connect · concurrencia, idempotencia y estados", () => {
  it("dos profesores toman la misma solicitud a la vez: uno la obtiene y el otro sabe quién", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    await gym.startShift(w.t2, w.org, w.A);
    const req = await cn.memberCreate(w.vale.userId, { reason: "hablar" });
    const res = await Promise.allSettled([cn.staffAct(w.t1, w.org, req.id, "take"), cn.staffAct(w.t2, w.org, req.id, "take")]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const lost = res.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as AccessError).code).toBe("taken");
    const ev = await db.select().from(schema.gymTaskEvent).where(eq(schema.gymTaskEvent.taskId, req.id));
    expect(ev.filter((e) => e.kind === "taken")).toHaveLength(1);
  });

  it("un reintento de red con la misma clave no duplica; un pedido igual abierto tampoco", async () => {
    const w = await world();
    const key = randomUUID();
    const [a, b] = await Promise.all([cn.memberCreate(w.vale.userId, { reason: "duda", clientKey: key }), cn.memberCreate(w.vale.userId, { reason: "duda", clientKey: key })]);
    expect(a.id).toBe(b.id);
    const again = await cn.memberCreate(w.vale.userId, { reason: "duda", clientKey: randomUUID() });
    expect([again.id, again.duplicate]).toEqual([a.id, true]);
    const rows = await db.select().from(schema.gymTask).where(eq(schema.gymTask.gymMemberId, w.vale.memberId));
    expect(rows).toHaveLength(1);
  });

  it("el socio cancela sólo antes de la atención; cancelar durante una toma no deja estados contradictorios", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const a = await cn.memberCreate(w.vale.userId, { reason: "actualizar_pesos" });
    await cn.staffAct(w.t1, w.org, a.id, "take");
    await cn.staffAct(w.t1, w.org, a.id, "start");
    expect((await err(cn.memberCancel(w.vale.userId, a.id)))?.code).toBe("invalid");
    const b = await cn.memberCreate(w.vale.userId, { reason: "cambiar_ejercicio" });
    const race = await Promise.allSettled([cn.memberCancel(w.vale.userId, b.id), cn.staffAct(w.t1, w.org, b.id, "take")]);
    // Las dos operaciones se serializan con el bloqueo de fila: el estado final coincide con el último evento registrado.
    expect(race.some((x) => x.status === "fulfilled")).toBe(true);
    const [t] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, b.id));
    const ev = await db.select().from(schema.gymTaskEvent).where(eq(schema.gymTaskEvent.taskId, b.id)).orderBy(schema.gymTaskEvent.createdAt);
    expect(ev.at(-1)?.toStatus).toBe(t.status);
    if (t.status === "open") expect(t.assigneeUserId).toBe(w.t1);
    else expect([t.status, t.cancelledBy]).toEqual(["cancelled", w.vale.userId]);
    expect((await err(cn.staffAct(w.t1, w.org, a.id, "transfer", { toUserId: w.t2 })))?.code).toBe("invalid"); // sin nota no hay traspaso
  });

  it("sin turno no se atiende; un profesor no resuelve lo que no es suyo; lo cerrado no cambia", async () => {
    const w = await world();
    const req = await cn.memberCreate(w.vale.userId, { reason: "duda" });
    expect((await err(cn.staffAct(w.t1, w.org, req.id, "take")))?.code).toBe("no_shift");
    await gym.startShift(w.t1, w.org, w.A);
    await gym.startShift(w.t2, w.org, w.A);
    await cn.staffAct(w.t1, w.org, req.id, "take");
    expect((await err(cn.staffAct(w.t2, w.org, req.id, "resolve", { note: "Listo" })))?.code).toBe("not_mine");
    await cn.staffAct(w.t1, w.org, req.id, "resolve", { note: "Listo" });
    expect((await err(cn.staffAct(w.coord, w.org, req.id, "cancel", { note: "No va" })))?.code).toBe("closed");
  });

  it("el historial no se puede editar", async () => {
    const w = await world();
    const req = await cn.memberCreate(w.vale.userId, { reason: "duda", comment: "Original" });
    await expect(db.execute(sql`update gym_task_event set note = 'cambiado' where task_id = ${req.id}`)).rejects.toThrow();
    const [e] = await db.select().from(schema.gymTaskEvent).where(eq(schema.gymTaskEvent.taskId, req.id));
    expect(e.note).toBe("Original");
  });
});

describe("REPI Connect · permisos y privacidad", () => {
  it("un socio no ve pedidos de otro; otra sede u otro gimnasio responden 404; el coach privado no entra", async () => {
    const w = await world();
    const req = await cn.memberCreate(w.vale.userId, { reason: "duda", comment: "Privado de Valentina" });
    expect((await err(cn.memberDetail(w.juli.userId, req.id)))?.code).toBe("not_found");
    expect((await err(cn.memberCancel(w.juli.userId, req.id)))?.code).toBe("not_found");
    expect((await err(cn.staffAct(w.vale.userId, w.org, req.id, "resolve", { note: "yo" })))?.code).toBe("not_found"); // el socio no es personal
    expect((await err(cn.staffTask(w.tB, w.org, req.id)))?.code).toBe("not_found"); // profesor de otra sede
    const other = await world();
    await gym.startShift(other.t1, other.org, other.A);
    expect((await err(cn.staffTask(other.t1, other.org, req.id)))?.code).toBe("not_found"); // organization_id propio, tarea ajena
    expect((await err(cn.staffTask(other.t1, w.org, req.id)))?.code).toBe("not_found"); // organization_id ajeno
    expect((await err(cn.staffAct(other.t1, other.org, req.id, "take")))?.code).toBe("not_found");
    const coach = await verified("Coach Privado");
    const corg = await acc.createCoachOrganization(coach, {});
    expect((await err(cn.staffBoard(coach, corg.id, null)))?.code).toBe("not_found");
    expect((await err(cn.staffTask(coach, w.org, req.id)))?.code).toBe("not_found");
  });

  it("la gerencia ve números y cancela con motivo, pero no lee pedidos; la bandera apagada no toca datos", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const req = await cn.memberCreate(w.vale.userId, { reason: "rutina_nueva" });
    expect((await err(cn.staffBoard(w.manager, w.org, w.A)))?.code).toBe("forbidden");
    expect((await err(cn.staffAct(w.t1, w.org, req.id, "cancel", { note: "x" })))?.code).toBe("forbidden"); // el piso no cancela
    await db.update(schema.organization).set({ connectEnabled: false }).where(eq(schema.organization.id, w.org));
    expect((await err(cn.memberCreate(w.juli.userId, { reason: "duda" })))?.code).toBe("connect_off");
    expect((await err(cn.staffBoard(w.t1, w.org, w.A)))?.code).toBe("connect_off");
    expect((await cn.memberBoard(w.vale.userId)).enabled).toBe(false);
    expect((await gym.listQueue(w.t1, w.org, w.A)).shared.map((t) => t.id)).toContain(req.id); // la cola de siempre sigue
    await db.update(schema.organization).set({ connectEnabled: true }).where(eq(schema.organization.id, w.org));
    await cn.staffAct(w.manager, w.org, req.id, "cancel", { note: "Duplicado en recepción", memberNote: "Lo resolvemos en recepción." });
    const md = await cn.memberDetail(w.vale.userId, req.id);
    expect(md.timeline.at(-1)).toMatchObject({ text: "El equipo lo cerró sin resolver", note: "Lo resolvemos en recepción." });
    expect((await cn.connectReport(w.manager, w.org, w.A)).metrics.cancelled).toBe(1);
  });
});

describe("REPI Connect · reglas proactivas", () => {
  it("avisa una sola vez por pedido esperando y por seguimiento por vencer", async () => {
    const w = await world();
    await gym.startShift(w.t1, w.org, w.A);
    const old = new Date(Date.now() - 20 * 60_000);
    const req = await cn.memberCreate(w.vale.userId, { reason: "duda" }, old);
    const r1 = await cn.connectSweep();
    expect(r1.waiting).toBeGreaterThanOrEqual(1);
    const kinds = async () => (await db.select({ k: schema.notificationOutbox.kind, d: schema.notificationOutbox.dedupeKey }).from(schema.notificationOutbox).where(eq(schema.notificationOutbox.userId, w.t1)))
      .filter((x) => x.d.includes(req.id)).map((x) => x.k).sort();
    expect(await kinds()).toEqual(["assist_new", "assist_wait"]);
    await cn.connectSweep();
    expect(await kinds()).toEqual(["assist_new", "assist_wait"]);
    await cn.staffAct(w.t1, w.org, req.id, "take");
    await cn.staffAct(w.t1, w.org, req.id, "follow_up", { note: "Revisar mañana", dueAt: new Date(Date.now() + 3_600_000).toISOString() });
    await cn.connectSweep();
    await cn.connectSweep();
    expect(await kinds()).toEqual(["assist_due", "assist_new", "assist_wait"]);
    const notes = await (await import("@/server/gym/notices")).myStaffNotices(w.t1, w.org);
    expect(notes.items.filter((i) => i.go.sel === req.id).map((i) => i.kind).sort()).toEqual(["assist_due", "assist_new", "assist_wait"]);
  });
});

describe("REPI Connect · demo comercial", () => {
  it("la demo trae Connect activo, un pedido en vivo, un traspaso para aceptar e historial sintético para el dueño", async () => {
    const { startDemo, sealDemo } = await import("@/server/sandbox/services");
    const d = await startDemo("floor");
    await sealDemo(d.tag);
    const [box] = await db.select().from(schema.demoSandbox).where(eq(schema.demoSandbox.tag, d.tag));
    const gymId = (box.orgIds as string[])[0];
    const users = await db.select().from(schema.user).where(sql`${schema.user.id} in ${box.userIds as string[]}`);
    const by = (slug: string) => users.find((u) => u.email.startsWith(`${slug}@`))!.id;
    const board = await cn.staffBoard(by("sofia.ramirez"), gymId, null);
    expect(board.pending.some((c) => c.fromSession && c.exercise)).toBe(true);
    expect(board.incoming.map((c) => c.member)).toEqual(["Martina López"]);
    expect(board.team.find((m) => m.name === "Lucas Medina")).toMatchObject({ onShift: true, availability: "busy" });
    const rep = await cn.connectReport(by("martin.sosa"), gymId, null, 30);
    expect(rep.metrics.received).toBeGreaterThanOrEqual(12);
    expect(rep.metrics.transfers).toBeGreaterThanOrEqual(3);
    expect(rep.metrics.firstResponseMedianMin).not.toBeNull();
  });
});
