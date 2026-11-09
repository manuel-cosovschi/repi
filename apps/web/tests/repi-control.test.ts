// REPI Control (D213/D214): política supervisada por gimnasio, pantalla de consulta (kiosco) y gestión del personal (STF-09).
// Todo con datos sintéticos en la base de pruebas.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ACTIONS, decideExecution, SUPERVISED_BLOCKED } from "@repi/domain/brain/actions";
import { db, schema } from "@/db";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as own from "@/server/training/own-routines";
import * as k from "@/server/gym/kiosk";
import * as staff from "@/server/gym/staff-admin";
import * as cm from "@/server/commercial/services";
import { soloRoutine } from "@/server/training/solo-routine";
import { soloPlan } from "@/server/training/adaptive";
import { aiSoloAdvice } from "@/server/training/ai-coach";
import { loadContext } from "@/server/brain/context";
import { AccessError, resetRateLimits } from "@/server/access/util";

const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
let n = 0;
async function person(name: string) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email: `ctl${++n}.${Date.now()}@test.repi.local`, emailVerified: true });
  return id;
}
let EX: string;
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Sentadilla control", muscleGroup: "Piernas" }).onConflictDoNothing().returning();
  EX = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla control")))[0].id;
});
beforeEach(() => resetRateLimits());

const DOC = (name = "Programa sala") => ({ name, weeks: 6, note: "Calentá 10 min", days: [
  { name: "Día A", exercises: [{ exerciseId: EX, name: "Sentadilla control", sets: 3, reps: "8-10", rir: 2, restSec: 120, note: "Bajá controlado" }] },
  { name: "Día B", exercises: [{ exerciseId: EX, name: "Sentadilla control", sets: 4, reps: "6", rir: 1, restSec: 150 }] },
] });

/** Gimnasio (dos sedes), dueño, gerente de A, sala de A y de B, recepción de A y socios activos. */
async function world(policy: "open" | "supervised" = "supervised", kiosk = true) {
  const owner = await person("Dueña Control");
  const [org] = await db.insert(schema.organization).values({ kind: "gym", name: `Gym Control ${n}`, status: "active", commercialStatus: "enabled", routinePolicy: policy, kioskEnabled: kiosk, createdBy: owner }).returning();
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
  await db.insert(schema.staffMembership).values({ userId: owner, orgId: org.id, role: "owner" });
  const staffer = async (name: string, role: "manager" | "floor_trainer" | "reception" | "coordinator", loc: string | null) => {
    const u = await person(name);
    await db.insert(schema.staffMembership).values({ userId: u, orgId: org.id, locationId: loc, role });
    return u;
  };
  const manager = await staffer("Gerente Centro", "manager", A.id);
  const t1 = await staffer("Profe Uno", "floor_trainer", A.id);
  const tB = await staffer("Profe Norte", "floor_trainer", B.id);
  const recep = await staffer("Recepción Centro", "reception", A.id);
  const member = async (name: string, loc = A.id) => {
    const u = await person(name);
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: loc, userId: u, status: "active" }).returning();
    return { userId: u, memberId: m.id };
  };
  const ana = await member("Ana Pérez");
  const beto = await member("Beto Gómez");
  return { org: org.id, A: A.id, B: B.id, owner, manager, t1, tB, recep, ana, beto, member };
}
async function assign(w: Awaited<ReturnType<typeof world>>, memberId: string, doc = DOC()) {
  await gym.startShift(w.t1, w.org, w.A).catch(() => {});
  return gym.saveMemberProgram(w.t1, w.org, memberId, { doc, reason: "Programa inicial" });
}
const ROUTINE = () => ({ name: "Mi día", exercises: [{ exerciseId: EX, sets: 3, reps: "10", weightKg: null, restSec: 90, note: null }] });

describe("política supervisada (D213)", () => {
  it("gimnasio normal: el socio conserva rutinas propias, importación y ejercicios propios", async () => {
    const w = await world("open");
    const r = await own.saveOwnRoutine(w.ana.userId, ROUTINE());
    expect(r.id).toBeTruthy();
    await own.createMyExercise(w.ana.userId, { name: "Mi ejercicio", group: "Piernas", kind: "load_reps" });
    const sid = randomUUID();
    await own.startOwnRoutine(w.ana.userId, r.id, sid);
    expect((await tr.getSession(w.ana.userId, sid)).id).toBe(sid);
  });

  it("gimnasio supervisado: el servidor rechaza crear, duplicar, importar, ejercicios propios y entrenar rutinas que no son la asignada", async () => {
    const w = await world("supervised");
    for (const p of [
      () => own.saveOwnRoutine(w.ana.userId, ROUTINE()),
      () => own.createMyExercise(w.ana.userId, { name: "Mío", group: "Piernas", kind: "load_reps" }),
      () => own.previewRoutineImport(w.ana.userId, { kind: "text", text: "Día 1\nSentadilla 3x10" } as never),
      () => own.saveImportedRoutines(w.ana.userId, { opId: "op-control-1", source: "text", file: "text", routines: [{ name: "Día", exercises: ROUTINE().exercises, origin: [] }] } as never),
      () => tr.startSoloRoutine(w.ana.userId, { id: randomUUID(), dayName: "Hoy", source: "own", exercises: ROUTINE().exercises }),
      () => tr.startSoloRoutine(w.ana.userId, { id: randomUUID(), dayName: "Hoy", source: "repi", exercises: ROUTINE().exercises }),
      () => soloRoutine(w.ana.userId, new Date(), "quiero piernas"),
      () => soloPlan(w.ana.userId, "coach_absent"),
    ]) {
      const e = await err(p());
      expect(e?.code).toBe("supervised");
      expect(e?.status).toBe(403);
    }
    // La sugerencia de IA para «No vino el profe» tampoco corre (sin IA configurada responde antes «no disponible»).
    expect(["supervised", "ai_unavailable", "no_program"]).toContain((await err(aiSoloAdvice(w.ana.userId)))?.code);
    const denied = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.orgId, w.org), eq(schema.auditEvent.action, "routine_policy.blocked")));
    expect(denied.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(denied.map((d) => d.meta))).not.toMatch(/Pérez|Ana/);
  });

  it("el socio registra el programa asignado; la app recibe supervised=true", async () => {
    const w = await world("supervised");
    await assign(w, w.ana.memberId);
    const t = await tr.myTraining(w.ana.userId);
    expect(t.supervised).toBe(true);
    if (t.state !== "ready") throw new Error(`estado ${t.state}`);
    const day = t.program.days[0];
    const sid = randomUUID();
    await tr.startSession(w.ana.userId, { id: sid, dayId: day.id });
    const s = await tr.getSession(w.ana.userId, sid);
    const pe = s.exercises?.[0] ?? (s as unknown as { days: { exercises: { id: string }[] }[] }).days?.[0]?.exercises?.[0];
    expect(pe).toBeTruthy();
    await tr.logSet(w.ana.userId, sid, { id: randomUUID(), programExerciseId: (pe as { id: string }).id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    // Registrar no cambia lo prescrito: la versión del programa sigue siendo la misma.
    const t2 = await tr.myTraining(w.ana.userId);
    if (t2.state !== "ready") throw new Error(`estado ${t2.state}`);
    expect((t2 as { program: { days: { exercises: { sets: number }[] }[] } }).program.days[0].exercises[0].sets).toBe(3);
  });

  it("varias relaciones: con su coach personal conserva sus rutinas propias; en el gimnasio supervisado no; nada se borra", async () => {
    const w = await world("open");
    const r = await own.saveOwnRoutine(w.ana.userId, ROUTINE());
    await db.update(schema.organization).set({ routinePolicy: "supervised" }).where(eq(schema.organization.id, w.org));
    const coachOwner = await person("Coach Personal");
    const [co] = await db.insert(schema.organization).values({ kind: "coach", name: "Coach Personal", status: "active", createdBy: coachOwner }).returning();
    const [cc] = await db.insert(schema.coachClient).values({ coachOrgId: co.id, userId: w.ana.userId }).returning();
    const [gm] = await db.select().from(schema.gymMember).where(eq(schema.gymMember.id, w.ana.memberId));
    await tr.setActiveRelation(w.ana.userId, gm.id);
    expect((await err(own.saveOwnRoutine(w.ana.userId, ROUTINE())))?.code).toBe("supervised");
    expect((await own.listOwnRoutines(w.ana.userId)).map((x) => x.id)).toContain(r.id);
    await tr.setActiveRelation(w.ana.userId, cc.id);
    expect((await own.saveOwnRoutine(w.ana.userId, ROUTINE())).id).toBeTruthy();
    const sid = randomUUID();
    await own.startOwnRoutine(w.ana.userId, r.id, sid);
    expect((await tr.myTraining(w.ana.userId)).supervised).toBe(false);
  });

  it("sólo el personal con program.edit programa; el dueño y la gerencia no", async () => {
    const w = await world("supervised");
    expect((await assign(w, w.ana.memberId)).revision).toBeGreaterThanOrEqual(1);
    for (const who of [w.owner, w.manager, w.recep]) expect((await err(gym.saveMemberProgram(who, w.org, w.ana.memberId, { doc: DOC(), reason: "Cambio" })))?.status).toBeGreaterThanOrEqual(403);
  });

  it("Adaptive Coaching no cambia lo prescrito en un gimnasio supervisado (ni por hoy)", async () => {
    for (const kind of SUPERVISED_BLOCKED) {
      const d = decideExecution(ACTIONS[kind], 2, { age: "adult", sessionOpen: true, programOwner: "gym", allowAuto: [kind], supervised: true });
      expect(d.mode).toBe("blocked");
      expect(d.code).toBe("supervised");
    }
    // Pedirle ayuda al equipo, guardar preferencias o registrar una molestia siguen disponibles.
    for (const kind of ["propose_to_coach", "floor_help", "report_discomfort", "save_preference"] as const)
      expect(decideExecution(ACTIONS[kind], 1, { age: "adult", sessionOpen: true, programOwner: "gym", supervised: true }).mode).not.toBe("blocked");
    const w = await world("supervised");
    await assign(w, w.ana.memberId);
    expect((await loadContext(w.ana.userId)).supervised).toBe(true);
  });

  it("REPI Admin enciende y apaga la política; un no administrador no puede", async () => {
    const w = await world("open", false);
    const admin = await person("Admin REPI");
    await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, admin));
    const [c] = await db.insert(schema.clientContract).values({ orgId: w.org, kind: "gym", currency: "ARS", responsibleName: "Dueña", responsibleEmail: "d@test.repi.local", createdBy: admin }).returning();
    expect((await err(cm.setClientControl(w.owner, c.id, { routinePolicy: "supervised" })))).toBeTruthy();
    expect(await cm.setClientControl(admin, c.id, { routinePolicy: "supervised", kioskEnabled: true })).toMatchObject({ routinePolicy: "supervised", kioskEnabled: true, changed: true });
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.orgId, w.org), eq(schema.auditEvent.actorUserId, admin)));
    expect(ev.map((e) => e.action).sort()).toEqual(["kiosk.enabled", "routine_policy.supervised"]);
    expect(await cm.setClientControl(admin, c.id, { routinePolicy: "open" })).toMatchObject({ routinePolicy: "open", changed: true });
  });
});

describe("pantalla de consulta (kiosco)", () => {
  async function ready() {
    const w = await world("supervised");
    await assign(w, w.ana.memberId);
    const dev = await k.createKiosk(w.owner, w.org, w.A, "Tablet sala");
    const secret = dev.link.split("#k=")[1];
    const ana = await k.issueCredential(w.recep, w.org, w.ana.memberId);
    const beto = await k.issueCredential(w.recep, w.org, w.beto.memberId);
    return { w, dev, secret, ana, beto };
  }

  it("solo el personal autorizado registra pantallas y emite credenciales", async () => {
    const w = await world("supervised");
    expect((await err(k.createKiosk(w.t1, w.org, w.A, "Tablet")))?.status).toBeGreaterThanOrEqual(403);
    expect((await err(k.createKiosk(w.manager, w.org, w.B, "Tablet")))?.status).toBe(404); // sede ajena
    expect((await err(k.issueCredential(w.t1, w.org, w.ana.memberId)))?.status).toBeGreaterThanOrEqual(403);
    const off = await world("supervised", false);
    expect((await err(k.createKiosk(off.owner, off.org, off.A, "Tablet")))?.code).toBe("kiosk_off");
    expect((await err(k.issueCredential(off.recep, off.org, off.ana.memberId)))?.code).toBe("kiosk_off");
  });

  it("identificación correcta muestra el programa vigente sin datos privados; formato del código y PIN", async () => {
    const { w, secret, ana } = await ready();
    expect(ana.code).toMatch(/^\d{6}$/);
    expect(ana.pin).toMatch(/^\d{4}$/);
    const hello = await k.kioskHello(secret);
    expect(hello).toMatchObject({ location: "Centro", idleSec: 60 });
    const s = await k.kioskIdentify(secret, ana);
    const p = await k.kioskProgram(secret, s.token);
    expect(p.person).toEqual({ firstName: "Ana", initial: "P." });
    expect(p.program!.days.map((d) => d.name)).toEqual(["Día A", "Día B"]);
    expect(p.program!.days[0].exercises[0]).toMatchObject({ name: "Sentadilla control", sets: 3, reps: "8-10", restSec: 120, note: "Bajá controlado" });
    const raw = JSON.stringify(p);
    for (const no of ["email", "userId", "memberId", "Pérez", "pain", "injur", "weightKg", "@test.repi.local", w.ana.userId]) expect(raw).not.toContain(no);
    // La credencial guarda el PIN cifrado, nunca en claro.
    const [c] = await db.select().from(schema.kioskCredential).where(eq(schema.kioskCredential.gymMemberId, w.ana.memberId));
    expect(c.pinHash).not.toContain(ana.pin);
    expect(c.pinHash.startsWith("s1$")).toBe(true);
  });

  it("una persona por vez: al identificarse otra, la consulta anterior deja de servir y no ve datos ajenos", async () => {
    const { secret, ana, beto } = await ready();
    const a = await k.kioskIdentify(secret, ana);
    const b = await k.kioskIdentify(secret, beto);
    expect((await err(k.kioskProgram(secret, a.token)))?.code).toBe("session_over");
    const pb = await k.kioskProgram(secret, b.token);
    expect(pb.person.firstName).toBe("Beto");
    expect(pb.program).toBeNull(); // Beto no tiene programa: mensaje claro en la pantalla
  });

  it("terminar o vencer la consulta la corta del lado del servidor", async () => {
    const { secret, ana } = await ready();
    const s = await k.kioskIdentify(secret, ana);
    await k.kioskEnd(secret, s.token);
    expect((await err(k.kioskProgram(secret, s.token)))?.code).toBe("session_over");
    const s2 = await k.kioskIdentify(secret, ana);
    expect((await err(k.kioskProgram(secret, s2.token, new Date(Date.now() + k.KIOSK_SESSION_MS + 1000))))?.code).toBe("session_over");
  });

  it("intentos: 5 fallidos bloquean el código, 10 lo anulan; el error no dice si el código existe", async () => {
    const { w, secret, ana } = await ready();
    const wrong = ana.pin === "1111" ? "2222" : "1111";
    const unknown = await err(k.kioskIdentify(secret, { code: "000000", pin: "1234" }));
    for (let i = 0; i < 4; i++) {
      const e = await err(k.kioskIdentify(secret, { code: ana.code, pin: wrong }));
      expect(e?.code).toBe("bad_credentials");
      expect(e?.message).toBe(unknown?.message);
    }
    expect((await err(k.kioskIdentify(secret, { code: ana.code, pin: wrong })))?.code).toBe("bad_credentials");
    expect((await err(k.kioskIdentify(secret, ana)))?.code).toBe("code_locked"); // ni con el PIN correcto mientras dura la pausa
    const later = new Date(Date.now() + k.CODE_LOCK_MS + 1000);
    for (let i = 0; i < 5; i++) await err(k.kioskIdentify(secret, { code: ana.code, pin: wrong }, later));
    const [c] = await db.select().from(schema.kioskCredential).where(eq(schema.kioskCredential.gymMemberId, w.ana.memberId));
    expect(c.revokedReason).toBe("too_many_attempts");
    expect((await err(k.kioskIdentify(secret, ana, new Date(Date.now() + 2 * k.CODE_LOCK_MS))))?.code).toBe("bad_credentials");
  });

  it("la pantalla se pausa con muchos fallos seguidos", async () => {
    const { secret, beto } = await ready();
    for (let i = 0; i < k.DEVICE_MAX_FAILS; i++) await err(k.kioskIdentify(secret, { code: String(100000 + i), pin: "1234" }));
    expect((await err(k.kioskIdentify(secret, beto)))?.code).toBe("kiosk_paused");
    expect((await k.kioskIdentify(secret, beto, new Date(Date.now() + k.DEVICE_WINDOW_MS + 1000))).token).toBeTruthy();
  });

  it("una pantalla revocada, el kiosco deshabilitado o la credencial revocada dejan de funcionar al instante", async () => {
    const { w, dev, secret, ana, beto } = await ready();
    const s = await k.kioskIdentify(secret, ana);
    await k.revokeCredential(w.recep, w.org, w.ana.memberId);
    expect((await err(k.kioskProgram(secret, s.token)))?.code).toBe("session_over");
    expect((await err(k.kioskIdentify(secret, ana)))?.code).toBe("bad_credentials");
    const sb = await k.kioskIdentify(secret, beto);
    await k.revokeKiosk(w.owner, w.org, dev.id);
    expect((await err(k.kioskHello(secret)))?.code).toBe("invalid_kiosk");
    expect((await err(k.kioskProgram(secret, sb.token)))?.code).toBe("invalid_kiosk");
    const dev2 = await k.createKiosk(w.owner, w.org, w.A, "Tablet nueva");
    const sec2 = dev2.link.split("#k=")[1];
    await db.update(schema.organization).set({ kioskEnabled: false }).where(eq(schema.organization.id, w.org));
    expect((await err(k.kioskHello(sec2)))?.code).toBe("kiosk_off");
  });

  it("dos gimnasios quedan aislados: el código de uno no sirve en la pantalla del otro", async () => {
    const one = await ready();
    const two = await ready();
    expect((await err(k.kioskIdentify(two.secret, one.ana)))?.code).toBe("bad_credentials");
    const s = await k.kioskIdentify(one.secret, one.ana);
    expect((await err(k.kioskProgram(two.secret, s.token)))?.code).toBe("session_over");
  });

  it("socio dado de baja: su consulta termina y no puede volver a entrar", async () => {
    const { w, secret, ana } = await ready();
    const s = await k.kioskIdentify(secret, ana);
    await db.update(schema.gymMember).set({ status: "ended" }).where(eq(schema.gymMember.id, w.ana.memberId));
    expect((await err(k.kioskProgram(secret, s.token)))?.code).toBe("session_over");
    expect((await err(k.kioskIdentify(secret, ana)))?.code).toBe("bad_credentials");
  });

  it("los programas se versionan: la pantalla muestra la versión vigente y el historial queda", async () => {
    const { w, secret, ana } = await ready();
    const s1 = await k.kioskIdentify(secret, ana);
    const v1 = (await k.kioskProgram(secret, s1.token)).program!.version;
    await gym.saveMemberProgram(w.t1, w.org, w.ana.memberId, { doc: DOC("Programa sala v2"), reason: "Progresión" });
    const s2 = await k.kioskIdentify(secret, ana);
    const p2 = (await k.kioskProgram(secret, s2.token)).program!;
    expect(p2.version).toBe(v1 + 1);
    expect(p2.name).toBe("Programa sala v2");
    const versions = await db.select().from(schema.programVersion).innerJoin(schema.program, eq(schema.program.id, schema.programVersion.programId)).where(eq(schema.program.gymMemberId, w.ana.memberId));
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  it("reemitir anula el código anterior; el socio cambia su PIN desde la app con reglas", async () => {
    const { w, secret, ana } = await ready();
    const again = await k.issueCredential(w.recep, w.org, w.ana.memberId);
    expect((await err(k.kioskIdentify(secret, ana)))?.code).toBe("bad_credentials");
    const mine = await k.myKioskAccess(w.ana.userId);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].code).toBe(again.code);
    expect((await err(k.setMyPin(w.ana.userId, mine.items[0].id, "1111")))?.code).toBe("invalid");
    expect((await err(k.setMyPin(w.ana.userId, mine.items[0].id, "1234")))?.code).toBe("invalid");
    expect((await err(k.setMyPin(w.beto.userId, mine.items[0].id, "4071")))?.code).toBe("not_found");
    await k.setMyPin(w.ana.userId, mine.items[0].id, "4071");
    expect((await k.kioskIdentify(secret, { code: again.code, pin: "4071" })).token).toBeTruthy();
  });
});

describe("gestión del personal (STF-09)", () => {
  it("el dueño quita a un profesor: pierde el acceso en el pedido siguiente, sus tareas vuelven a la cola y queda auditado", async () => {
    const w = await world("open");
    await gym.startShift(w.t1, w.org, w.A);
    const t = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.ana.memberId, category: "tecnica", summary: "Revisar sentadilla", assignToMe: true });
    expect((await gym.gymContext(w.t1, w.org)).roles).toContain("floor_trainer");
    const r = await staff.revokeStaff(w.owner, w.org, w.t1, "Dejó el gimnasio");
    expect(r).toMatchObject({ revoked: 1, tasksReturned: 1, shiftsClosed: 1 });
    expect((await err(gym.gymContext(w.t1, w.org)))?.status).toBe(404);
    const [task] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id));
    expect(task).toMatchObject({ assigneeUserId: null, status: "open" });
    const ev = await db.select().from(schema.gymTaskEvent).where(eq(schema.gymTaskEvent.taskId, t.id));
    expect(ev.some((e) => e.kind === "reassigned" && e.toStatus === "open")).toBe(true);
    const [row] = await db.select().from(schema.staffMembership).where(and(eq(schema.staffMembership.userId, w.t1), eq(schema.staffMembership.orgId, w.org)));
    expect(row).toMatchObject({ status: "revoked", revokedBy: w.owner });
    const [a] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.orgId, w.org), eq(schema.auditEvent.action, "staff.revoked")));
    expect(a.resourceId).toBe(w.t1);
  });

  it("la gerencia sólo gestiona sala y recepción de su sede; nadie se cambia a sí mismo ni toca al dueño", async () => {
    const w = await world("open");
    expect((await err(staff.revokeStaff(w.manager, w.org, w.tB)))?.status).toBe(403); // otra sede
    expect((await err(staff.revokeStaff(w.manager, w.org, w.owner)))?.status).toBe(403);
    expect((await err(staff.revokeStaff(w.manager, w.org, w.manager)))?.status).toBe(403);
    expect((await err(staff.revokeStaff(w.t1, w.org, w.recep)))?.status).toBe(403); // sala no gestiona
    expect((await err(staff.revokeStaff(w.recep, w.org, w.t1)))?.status).toBe(403);
    expect((await err(staff.changeStaffRole(w.manager, w.org, w.t1, { role: "manager", locationId: w.A })))?.status).toBe(403);
    expect((await staff.revokeStaff(w.manager, w.org, w.recep)).revoked).toBe(1);
    const other = await world("open");
    expect((await err(staff.revokeStaff(w.owner, w.org, other.t1)))?.status).toBe(404); // otra organización
  });

  it("cambiar de rol o de sede ajusta los permisos y devuelve las tareas de la sede que pierde", async () => {
    const w = await world("open");
    await gym.startShift(w.t1, w.org, w.A);
    const t = await gym.createTask(w.t1, w.org, w.A, { gymMemberId: w.ana.memberId, category: "tecnica", summary: "Técnica", assignToMe: true });
    const r = await staff.changeStaffRole(w.owner, w.org, w.t1, { role: "floor_trainer", locationId: w.B });
    expect(r).toMatchObject({ changed: true, tasksReturned: 1 });
    const ctx = await gym.gymContext(w.t1, w.org);
    expect(ctx.locationIds).toEqual([w.B]);
    expect((await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id)))[0].assigneeUserId).toBeNull();
    await staff.changeStaffRole(w.owner, w.org, w.t1, { role: "reception", locationId: w.B });
    const c2 = await gym.gymContext(w.t1, w.org);
    expect(c2.roles).toEqual(["reception"]);
    expect(c2.caps).not.toContain("program.edit");
    // Volver a la combinación anterior reactiva la fila histórica (sin duplicados).
    await staff.changeStaffRole(w.owner, w.org, w.t1, { role: "floor_trainer", locationId: w.B });
    const rows = await db.select().from(schema.staffMembership).where(and(eq(schema.staffMembership.userId, w.t1), eq(schema.staffMembership.orgId, w.org)));
    expect(rows.filter((x) => x.status === "active")).toHaveLength(1);
    expect(new Set(rows.map((x) => `${x.role}:${x.locationId}`)).size).toBe(rows.length);
  });

  it("staffAccess describe lo editable para el panel", async () => {
    const w = await world("open");
    const a = await staff.staffAccess(w.manager, w.org, w.t1);
    expect(a.memberships[0]).toMatchObject({ role: "floor_trainer", editable: true });
    expect(a.roles.map((r) => r.id)).not.toContain("manager");
    expect(a.locations.map((l) => l.id)).toEqual([w.A]);
  });
});
