// 13/11/2026 · «A algunos alumnos que pidieron rutina cuando no se podían cargar los objetivos no les aparece el aviso».
// El aviso de D206 sólo miraba pedidos de programa ABIERTOS: cuando el profe respondía el pedido (le asignaba el programa) el
// aviso desaparecía y los datos no llegaban nunca al perfil de entrenamiento (Training Profile, D217) ni a quien arma la rutina.
// Estas pruebas cubren las formas que quedaban afuera: pedido ya respondido sin datos (gimnasio y coach), pedido anterior a
// D217 con experiencia que no se copió al perfil y objetivo corporal sin edad adulta confirmada (se perdía todo el guardado).
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as fu from "@/server/followup/services";
import { myNotifications } from "@/server/notifications/feed";
import { myProfile, personalOf } from "@/server/settings/profile";
import { completeProgramBrief, healProfileFromBrief, lateBrief, pendingBriefs, programRequestState, snoozeLateBrief } from "@/server/training/program-request";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { BRIEF } from "./fixtures/brief";

let n = 0;
const mail = () => `late${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Tardía") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const FULL = { ...BRIEF, daysPerWeek: 4, level: "intermediate", hasLimitations: true, limitationsDetail: "Hombro derecho operado (2024)" };

/** Gimnasio con un entrenador en turno y un socio activo. */
async function gymWorld() {
  const owner = await verified("Dueña Gym");
  const org = await acc.createGymOrganization(owner, { name: `Gym tardío ${n}-${Date.now()}` });
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  const trainer = await verified("Agustín Sala");
  await db.insert(schema.staffMembership).values({ userId: trainer, orgId: org.id, locationId: A.id, role: "floor_trainer" });
  const user = await verified("Valentina Socia");
  const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: user, status: "active" }).returning();
  await db.insert(schema.consentGrant).values({ userId: user, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
  await gym.startShift(trainer, org.id, A.id);
  return { org: org.id, loc: A.id, trainer, user, memberId: m.id };
}
/** El pedido de antes de D206: sin preferencias y ya respondido por el entrenador (el socio ya tiene su programa). */
async function answeredTask(w: Awaited<ReturnType<typeof gymWorld>>, at = new Date("2026-11-01T15:00:00Z")) {
  const [t] = await db.insert(schema.gymTask).values({
    number: 9000 + ++n, orgId: w.org, locationId: w.loc, gymMemberId: w.memberId, category: "programa_nuevo", priority: "alta", source: "app",
    summary: "Quiero que me armen un programa.", createdBy: w.user, createdAt: at, status: "done", assigneeUserId: w.trainer, completedBy: w.trainer, completedAt: new Date(at.getTime() + 3_600_000),
  }).returning();
  return t;
}

beforeEach(() => resetRateLimits());

describe("pedido de programa YA RESPONDIDO sin datos (gimnasio)", () => {
  it("antes quedaba afuera: ahora ve el aviso en Inicio y en la campanita, lo puede dejar para después y vuelve a los 14 días", async () => {
    const w = await gymWorld();
    const t = await answeredTask(w);
    // La forma excluida: no hay pedido abierto, así que el aviso de D206 no la alcanzaba.
    expect(await pendingBriefs(w.user)).toEqual([]);
    const now = new Date("2026-11-13T15:00:00Z");
    const st = await programRequestState(w.user, now);
    expect(st.pending).toEqual([]);
    expect(st.late).toMatchObject({ id: t.id, source: "gym", snoozed: false });
    expect(st.late?.to).toContain("el equipo de Gym tardío");
    const feed = await myNotifications(w.user, now);
    expect(feed.items[0]).toMatchObject({ id: `brief-late:${t.id}`, unread: true, title: "Contale a REPI qué buscás", cta: "Completar" });
    // «Ahora no»: se esconde (Inicio y campanita) sin perder nada más de las ayudas guardadas.
    const seenHint = { train_intro: "2026-11-01T00:00:00.000Z" };
    await db.insert(schema.userPref).values({ userId: w.user, hints: seenHint }).onConflictDoUpdate({ target: schema.userPref.userId, set: { hints: seenHint } });
    await snoozeLateBrief(w.user, now);
    expect((await lateBrief(w.user, now))?.snoozed).toBe(true);
    expect((await myNotifications(w.user, now)).items.some((x) => x.id.startsWith("brief-late:"))).toBe(false);
    const [pref] = await db.select().from(schema.userPref).where(eq(schema.userPref.userId, w.user));
    expect(pref.hints).toMatchObject({ train_intro: "2026-11-01T00:00:00.000Z", brief_later: now.toISOString() });
    // No es «una vez y nunca más»: pasados 14 días vuelve mientras falten los datos.
    expect((await lateBrief(w.user, new Date("2026-11-26T15:00:00Z")))?.snoozed).toBe(true);
    expect((await lateBrief(w.user, new Date("2026-11-27T15:00:01Z")))?.snoozed).toBe(false);
    expect((await myNotifications(w.user, new Date("2026-11-28T12:00:00Z"))).items.some((x) => x.id === `brief-late:${t.id}`)).toBe(true);
  });

  it("al completar: llega al perfil (REPI), queda en el pedido sin reabrirlo y se avisa a quien lo respondió", async () => {
    const w = await gymWorld();
    const t = await answeredTask(w);
    expect((await personalOf(w.user)).status).toBe("none");
    expect((await err(completeProgramBrief(w.user, { goal: "muscle" })))?.code).toBe("brief_required");
    expect(await completeProgramBrief(w.user, FULL)).toEqual({ completed: 1, late: true });
    // El motor adaptativo lee este perfil: completo, con la experiencia y la procedencia «pedido de programa».
    const p = await personalOf(w.user);
    expect(p).toMatchObject({ status: "complete", goal: "muscle", experience: "intermediate", daysPerWeek: 4, minutes: 60 });
    const [pref] = await db.select().from(schema.userPref).where(eq(schema.userPref.userId, w.user));
    expect((pref.wishes as { meta: { fields: Record<string, { via: string }> } }).meta.fields.experience.via).toBe("program_request");
    expect(JSON.stringify(pref.wishes)).not.toContain("Hombro"); // las lesiones no van al perfil
    // El pedido: mismo estado y mismo texto, con las preferencias adjuntas y el comentario en su historia.
    const [after] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.id, t.id));
    expect(after).toMatchObject({ status: "done", summary: "Quiero que me armen un programa.", completedBy: w.trainer });
    expect(after.context?.brief).toMatchObject({ goal: "muscle", level: "intermediate", limitationsDetail: "Hombro derecho operado (2024)" });
    expect(await db.select().from(schema.gymTask).where(eq(schema.gymTask.gymMemberId, w.memberId))).toHaveLength(1);
    const ev = await db.select().from(schema.gymTaskEvent).where(and(eq(schema.gymTaskEvent.taskId, t.id), eq(schema.gymTaskEvent.kind, "member_comment")));
    expect(ev[0]?.note).toContain("después de recibir el programa");
    // Aviso a quien lo respondió, con la ficha del socio y sin datos de salud en el texto.
    const [push] = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.dedupeKey, `brief-late:${t.id}:${w.trainer}`));
    expect(push).toMatchObject({ kind: "assist_update", url: `/gym/${w.org}?s=member&sel=${w.memberId}` });
    expect(`${push.title} ${push.body}`).not.toContain("Hombro");
    // Quien arma la rutina lo tiene a mano para «Armar con REPI».
    const d = await gym.memberDetail(w.trainer, w.org, w.memberId);
    expect(d.programBrief).toMatchObject({ goal: "muscle", daysPerWeek: 4, level: "intermediate", limitations: "Hombro derecho operado (2024)" });
    // Y el aviso se apaga: ni Inicio, ni campanita, ni se puede completar dos veces.
    expect((await programRequestState(w.user)).late).toBeNull();
    expect((await myNotifications(w.user)).items.some((x) => x.id.startsWith("brief"))).toBe(false);
    expect((await err(completeProgramBrief(w.user, FULL)))?.code).toBe("no_pending");
  });

  it("no molesta a quien no le falta nada: perfil ya completo, o un pedido posterior que ya trae los datos, o uno abierto", async () => {
    const w = await gymWorld();
    await answeredTask(w);
    // Perfil completo (lo cargó en Perfil): REPI ya lo tiene; no hay aviso.
    const { updateProfile } = await import("@/server/settings/profile");
    await updateProfile(w.user, { goal: "strength", experience: "advanced", daysPerWeek: 5, minutes: 75 }, "profile");
    expect(await lateBrief(w.user)).toBeNull();
    // Pidió de nuevo, ya con datos: quien arma la rutina los recibió; el pedido viejo no vuelve a aparecer.
    const w2 = await gymWorld();
    await answeredTask(w2);
    await gym.createMemberTask(w2.user, { kind: "programa", text: "Quiero un programa", brief: BRIEF });
    await db.update(schema.userPref).set({ wishes: null }).where(eq(schema.userPref.userId, w2.user)); // aunque el perfil esté vacío
    expect(await lateBrief(w2.user)).toBeNull();
    // Con un pedido abierto sin datos manda el aviso de D206 (uno solo, no dos).
    const w3 = await gymWorld();
    await answeredTask(w3);
    const open = await gym.createTask(w3.trainer, w3.org, w3.loc, { gymMemberId: w3.memberId, category: "programa_nuevo", summary: "Socio sin programa vigente." });
    const st = await programRequestState(w3.user);
    expect(st.pending).toEqual([expect.objectContaining({ id: open.id })]);
    expect(st.late).toBeNull();
    const ids = (await myNotifications(w3.user)).items.filter((x) => x.id.startsWith("brief")).map((x) => x.id);
    expect(ids).toEqual([`brief:${open.id}`]);
    // Un pedido cancelado no cuenta como respondido.
    const w4 = await gymWorld();
    const c = await answeredTask(w4);
    await db.update(schema.gymTask).set({ status: "cancelled" }).where(eq(schema.gymTask.id, c.id));
    expect(await lateBrief(w4.user)).toBeNull();
  });
});

describe("el pedido llega al perfil de entrenamiento (Training Profile)", () => {
  it("pedido anterior a D217: la experiencia que ya había contado se completa sola en el perfil, sin pisar nada", async () => {
    const w = await gymWorld();
    const r = await gym.createMemberTask(w.user, { kind: "programa", text: "Quiero un programa", brief: { ...BRIEF, level: "advanced" } });
    // Como quedaron en producción: objetivo, días y minutos en el perfil, sin experiencia ni procedencia.
    await db.update(schema.userPref).set({ wishes: { goal: "strength", daysPerWeek: 5, minutes: 45, likes: null, avoid: null, shareWithTrainers: false } }).where(eq(schema.userPref.userId, w.user));
    expect((await myProfile(w.user)).missing).toEqual(["experience"]);
    expect(await healProfileFromBrief(w.user)).toEqual(["experience"]);
    const v = await myProfile(w.user);
    expect(v).toMatchObject({ status: "complete", missing: [] });
    expect(v.profile).toMatchObject({ goal: "strength", daysPerWeek: 5, minutes: 45, experience: "advanced" }); // lo declarado después no se pisa
    expect(await healProfileFromBrief(w.user)).toEqual([]); // idempotente
    expect(r.id).toBeTruthy();
  });

  it("objetivo corporal sin edad adulta confirmada: antes se perdía todo; ahora se guarda el resto y el objetivo queda pendiente", async () => {
    const w = await gymWorld();
    await db.update(schema.user).set({ birthDate: null }).where(eq(schema.user.id, w.user));
    await gym.createMemberTask(w.user, { kind: "programa", text: "Quiero un programa", brief: { ...BRIEF, goal: "fat_loss" } });
    const v = await myProfile(w.user);
    expect(v.profile).toMatchObject({ goal: null, daysPerWeek: 3, minutes: 60, experience: "beginner" });
    expect(v).toMatchObject({ status: "partial", missing: ["goal"] });
    // El pedido conserva lo que eligió para quien lo atiende.
    const [t] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.gymMemberId, w.memberId));
    expect(t.context?.brief?.goal).toBe("fat_loss");
  });
});

describe("pedido de programa YA RESPONDIDO sin datos (coach)", () => {
  it("el alumno ve el aviso; al completar, el coach lo encuentra en el pedido resuelto y recibe el aviso", async () => {
    const coach = await verified("Coach Tardío");
    const org = await acc.createCoachOrganization(coach, {});
    const user = await verified("Alumno Tardío");
    const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(user) });
    const rel = await acc.acceptInvitation(user, inv.code, []);
    const [old] = await db.insert(schema.studentRequest).values({
      userId: user, coachClientId: rel.relationId, kind: "programa", text: "Quiero que me armen un programa.", status: "done", resolvedBy: coach, resolvedAt: new Date("2026-11-02T12:00:00Z"), createdAt: new Date("2026-11-01T12:00:00Z"),
    }).returning();
    expect(await pendingBriefs(user)).toEqual([]);
    expect((await programRequestState(user)).late).toMatchObject({ id: old.id, source: "coach", snoozed: false });
    expect(await completeProgramBrief(user, { ...BRIEF, hasLimitations: true, limitationsDetail: "Lumbalgia leve" })).toEqual({ completed: 1, late: true });
    const [row] = await db.select().from(schema.studentRequest).where(eq(schema.studentRequest.id, old.id));
    expect(row).toMatchObject({ status: "done", text: "Quiero que me armen un programa." });
    const seen = (await fu.coachInbox(coach, org.id)).requests.find((x) => x.id === old.id)!;
    expect(seen.brief?.missing).toBe(false);
    expect(seen.brief?.rows.find((x) => x.label === "Lesiones o limitaciones")).toMatchObject({ value: "Lumbalgia leve", alert: true });
    expect(await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.dedupeKey, `brief-late:${old.id}:${coach}`))).toHaveLength(1);
    expect((await personalOf(user)).status).toBe("complete");
    expect((await programRequestState(user)).late).toBeNull();
    // Con la relación terminada no se le ofrece mandar datos a ese coach.
    const user2 = await verified("Alumno Ido");
    const inv2 = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(user2) });
    const rel2 = await acc.acceptInvitation(user2, inv2.code, []);
    await db.insert(schema.studentRequest).values({ userId: user2, coachClientId: rel2.relationId, kind: "programa", text: "Quiero que me armen un programa.", status: "done", resolvedBy: coach, resolvedAt: new Date() });
    expect(await lateBrief(user2)).not.toBeNull();
    await db.update(schema.coachClient).set({ status: "ended" }).where(eq(schema.coachClient.id, rel2.relationId));
    expect(await lateBrief(user2)).toBeNull();
  });
});
