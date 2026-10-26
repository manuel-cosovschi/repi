import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as fu from "@/server/followup/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;

let n = 0;
const mail = () => `fu${++n}.${Date.now()}@test.repi.local`;
async function verified(birth = "01/01/1990") {
  const email = mail();
  const r = await acc.signUpPerson({ name: "Persona Seguimiento", email, password: "prueba1234", terms: true, birth });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
async function pair(birth?: string) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach, {});
  const user = await verified(birth);
  const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(user) });
  const rel = await acc.acceptInvitation(user, inv.code, []);
  return { coach, orgId: org.id, user, relId: rel.relationId };
}
const teen = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() - 15}`; };

beforeEach(() => resetRateLimits());

describe("check-in", () => {
  it("uno por día; repetir actualiza; valores fuera de escala se rechazan", async () => {
    const { user } = await pair();
    await fu.saveCheckin(user, { energy: 3, sleep: 4, mood: 2 });
    await fu.saveCheckin(user, { energy: 5, sleep: 4, mood: 4 });
    expect(await db.select().from(schema.checkin).where(eq(schema.checkin.userId, user))).toHaveLength(1);
    expect((await fu.todayCheckin(user))?.energy).toBe(5);
    expect((await err(fu.saveCheckin(user, { energy: 6, sleep: 1, mood: 1 })))?.code).toBe("invalid");
  });
});

describe("molestias y salud", () => {
  it("sin Salud compartida el coach no ve la molestia; compartida una a una sí, sin ver lesiones", async () => {
    const { coach, orgId, user, relId } = await pair();
    const a = await fu.reportPain(user, { zone: "Hombro der.", level: 4, context: "now", exerciseName: "Press de banca" });
    expect(a.visibleToCoach).toBe(false);
    await fu.addInjury(user, { zone: "Hombro", status: "monitoring", detail: "Tendinopatía 2024" });
    expect((await fu.coachInbox(coach, orgId)).pains).toHaveLength(0);
    const b = await fu.reportPain(user, { zone: "Rodilla der.", level: 7, context: "after", shareThis: true });
    expect(b.visibleToCoach).toBe(true);
    const inbox = await fu.coachInbox(coach, orgId);
    expect(inbox.pains.map((p) => p.zone)).toEqual(["Rodilla der."]);
    const h = await fu.clientHealth(coach, orgId, relId);
    expect(h).toMatchObject({ granted: false, injuries: [] });
    expect(h.pains).toHaveLength(1);
    expect(h.access.health.status).toBe("none");
  });

  it("solicitud de acceso de punta a punta: pedir → aceptar → ver → revocar", async () => {
    const { coach, orgId, user, relId } = await pair();
    await fu.addInjury(user, { zone: "Rodilla", status: "active" });
    await fu.reportPain(user, { zone: "Lumbar", level: 3, context: "out" });
    const r1 = await fu.requestAccess(coach, orgId, relId, "health");
    expect((await fu.requestAccess(coach, orgId, relId, "health")).duplicate).toBe(true);
    const box = await fu.myInbox(user);
    expect(box.accessRequests).toHaveLength(1);
    expect(box.accessRequests[0]).toMatchObject({ item: "health", reason: "Para adaptar ejercicios a tus molestias." });
    await fu.decideAccess(user, r1.id, true);
    expect((await err(fu.decideAccess(user, r1.id, false)))?.code).toBe("decided");
    const h = await fu.clientHealth(coach, orgId, relId);
    expect(h.granted).toBe(true);
    expect(h.injuries.map((i) => i.zone)).toEqual(["Rodilla"]);
    expect(h.pains.map((p) => p.zone)).toEqual(["Lumbar"]);
    await fu.clientHealth(coach, orgId, relId); // segunda lectura el mismo día: un solo registro
    const priv = await fu.myPrivacy(user);
    expect(priv.items.find((i) => i.key === "health")?.on).toBe(true);
    expect(priv.history.filter((x) => x.action === "read")).toHaveLength(1);
    expect(priv.history.map((x) => x.action)).toEqual(expect.arrayContaining(["requested", "granted", "read"]));
    await fu.setShare(user, "health", false);
    const after = await fu.clientHealth(coach, orgId, relId);
    expect(after).toMatchObject({ granted: false, injuries: [], pains: [] });
    expect((await fu.myPrivacy(user)).history[0].action).toBe("revoked");
  });

  it("rechazo visible al coach; puede volver a pedir; otra organización no", async () => {
    const { coach, orgId, user, relId } = await pair();
    const other = await pair();
    const r = await fu.requestAccess(coach, orgId, relId, "nutrition");
    await fu.decideAccess(user, r.id, false);
    const st = (await fu.accessStates(coach, orgId, relId)).nutrition;
    expect(st.status).toBe("denied");
    expect(st.retryAt).not.toBeNull();
    // D38: no se puede volver a pedir antes de 7 días…
    const cd = await err(fu.requestAccess(coach, orgId, relId, "nutrition"));
    expect(cd?.code).toBe("cooldown");
    expect(cd?.data?.retryAt).toBe(st.retryAt);
    // …pero sí después.
    await db.update(schema.accessRequest).set({ decidedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(schema.accessRequest.id, r.id));
    expect((await fu.requestAccess(coach, orgId, relId, "nutrition")).duplicate).toBe(false);
    expect((await err(fu.requestAccess(other.coach, other.orgId, relId, "health")))?.code).toBe("not_found");
    expect((await err(fu.clientHealth(other.coach, other.orgId, relId)))?.code).toBe("not_found");
    expect((await err(fu.decideAccess(other.user, r.id, true)))?.code).toBe("not_found");
    expect((await err(fu.requestAccess(coach, orgId, relId, "training")))?.code).toBe("invalid");
  });

  it("solicitud vencida no se puede aceptar", async () => {
    const { coach, orgId, user, relId } = await pair();
    const r = await fu.requestAccess(coach, orgId, relId, "measurements");
    await db.update(schema.accessRequest).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.accessRequest.id, r.id));
    expect((await err(fu.decideAccess(user, r.id, true)))?.code).toBe("decided");
    expect((await fu.accessStates(coach, orgId, relId)).measurements).toEqual({ status: "expired", retryAt: null });
    expect((await fu.requestAccess(coach, orgId, relId, "measurements")).duplicate).toBe(false); // vencida no espera
  });

  it("menor sin autorización del adulto no puede compartir salud, ni por solicitud ni por reporte", async () => {
    const { coach, orgId, user, relId } = await pair(teen());
    const r = await fu.requestAccess(coach, orgId, relId, "health");
    expect((await err(fu.decideAccess(user, r.id, true)))?.code).toBe("minor");
    expect((await err(fu.reportPain(user, { zone: "Codo", level: 2, context: "now", shareThis: true })))?.code).toBe("minor");
    expect((await err(fu.setShare(user, "health", true)))?.code).toBe("minor");
  });

  it("lesiones: sólo su dueño las edita o borra", async () => {
    const { user } = await pair();
    const other = await verified();
    const i = await fu.addInjury(user, { zone: "Tobillo", status: "active" });
    expect((await err(fu.updateInjury(other, i.id, { status: "resolved" })))?.code).toBe("not_found");
    await fu.updateInjury(user, i.id, { status: "resolved" });
    await fu.updateInjury(user, i.id, { delete: true });
    expect(await fu.myInjuries(user)).toHaveLength(0);
  });
});

describe("pedidos del alumno", () => {
  it("pedido con video → bandeja del coach → resuelto → aviso al alumno; acceso al video restringido", async () => {
    const { coach, orgId, user } = await pair();
    expect((await err(fu.uploadRequestVideo(user, { mime: "image/png", bytes: new Uint8Array(10) })))?.code).toBe("invalid_file");
    const v = await fu.uploadRequestVideo(user, { mime: "video/mp4", bytes: new Uint8Array(2048) });
    const r = await fu.createRequest(user, { kind: "tecnica", text: "¿Está bien la bajada?", videoId: v.id });
    expect((await err(fu.createRequest(user, { kind: "tecnica", text: "Otra vez el mismo video", videoId: v.id })))?.code).toBe("invalid");
    const box = await fu.coachInbox(coach, orgId);
    expect(box.requests[0]).toMatchObject({ id: r.id, kind: "tecnica", status: "open", videoId: v.id });
    expect(await fu.inboxCount(orgId)).toBe(1);
    expect((await fu.authorizeVideo(coach, v.id)).id).toBe(v.id);
    expect((await fu.authorizeVideo(user, v.id)).id).toBe(v.id);
    const intruder = await pair();
    expect((await err(fu.authorizeVideo(intruder.coach, v.id)))?.code).toBe("not_found");
    await fu.resolveRequest(coach, orgId, r.id);
    expect(await fu.inboxCount(orgId)).toBe(0);
    const mine = (await fu.myInbox(user)).requests.find((x) => x.id === r.id)!;
    expect(mine).toMatchObject({ status: "done", unseenResolved: true });
    await fu.markResolvedSeen(user, r.id);
    expect((await fu.myInbox(user)).requests.find((x) => x.id === r.id)!.unseenResolved).toBe(false);
    expect((await err(fu.resolveRequest(intruder.coach, intruder.orgId, r.id)))?.code).toBe("not_found");
  });

  it("«Pedir mi programa» no se duplica; sin coach no hay a quién pedir", async () => {
    const { user } = await pair();
    const a = await fu.createRequest(user, { kind: "programa", text: "Quiero que me armen un programa." });
    const b = await fu.createRequest(user, { kind: "programa", text: "Quiero que me armen un programa." });
    expect(b).toMatchObject({ id: a.id, duplicate: true });
    const lone = await verified();
    expect((await err(fu.createRequest(lone, { kind: "consulta", text: "Hola coach" })))?.code).toBe("no_coach");
    const rows = await db.select().from(schema.studentRequest).where(and(eq(schema.studentRequest.userId, user), eq(schema.studentRequest.kind, "programa")));
    expect(rows).toHaveLength(1);
  });
});

describe("retención de videos (D39)", () => {
  it("borra a los 90 días de resuelto y los huérfanos a las 24 h; el coach ve «eliminado»", async () => {
    const { coach, orgId, user } = await pair();
    const v = await fu.uploadRequestVideo(user, { mime: "video/mp4", bytes: new Uint8Array(1024) });
    const r = await fu.createRequest(user, { kind: "tecnica", text: "Mirá esta serie", videoId: v.id });
    const orphan = await fu.uploadRequestVideo(user, { mime: "video/webm", bytes: new Uint8Array(512) });
    expect(await fu.purgeMedia()).toMatchObject({ retention: 0, orphans: 0 });
    await fu.resolveRequest(coach, orgId, r.id);
    const later = new Date(Date.now() + 91 * 86_400_000);
    const out = await fu.purgeMedia(later);
    expect(out.retention).toBeGreaterThanOrEqual(1);
    expect(out.orphans).toBeGreaterThanOrEqual(1);
    for (const id of [v.id, orphan.id]) {
      const [m] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, id));
      expect(m.deletedAt).not.toBeNull();
      expect((await err(fu.authorizeVideo(user, id)))?.code).toBe("not_found");
    }
    const req = (await fu.coachInbox(coach, orgId)).requests.find((x) => x.id === r.id)!;
    expect(req).toMatchObject({ videoId: null, videoDeleted: true });
  });
});
