import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as cm from "@/server/community/services";
import * as club from "@/server/community/club";
import * as fu from "@/server/followup/services";
import { AccessError, addDays, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `cm${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Comunidad", birth = "01/01/1990") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const MP4 = () => { const u = new Uint8Array(64); u.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); return u; };
const PNG = () => { const u = new Uint8Array(64); u.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return u; };
const today = () => localDate(new Date());
beforeEach(() => resetRateLimits());

async function world() {
  const owner = await verified("Dueño");
  const org = await acc.createGymOrganization(owner, { name: `Gym C ${n}-${Date.now()}` });
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Palermo" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Belgrano" }).returning();
  const staff = async (name: string, role: "manager" | "floor_trainer" | "reception", loc: string) => {
    const u = await verified(name);
    await db.insert(schema.staffMembership).values({ userId: u, orgId: org.id, locationId: loc, role });
    return u;
  };
  const manager = await staff("Lucía Gerente", "manager", A.id);
  const trainer = await staff("Agustín Sala", "floor_trainer", A.id);
  const recep = await staff("Recepción", "reception", A.id);
  const member = async (name: string, loc = A.id, rankings = false, birth?: string) => {
    const u = await verified(name, birth);
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: loc, userId: u, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    if (rankings) await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "rankings", termsVersion: "t" });
    return { userId: u, memberId: m.id };
  };
  return { org: org.id, A: A.id, B: B.id, owner, manager, trainer, recep, member };
}
async function attempt(userId: string, orgId: string, challengeId: string, value: number, division: "F" | "M" | null = null) {
  const v = await cm.uploadMedia(userId, { kind: "attempt_video", orgId, mime: "video/mp4", bytes: MP4() });
  return cm.submitAttempt(userId, { challengeId, value, division, videoId: v.id, confirm: true });
}

describe("publicaciones y catálogo", () => {
  it("sólo quien tiene permiso publica; el socio ve lo de su sede y no los descuentos vencidos", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    const other = await w.member("Socio Belgrano", w.B);
    expect((await err(cm.createPost(w.trainer, w.org, { type: "novedad", title: "Hola equipo", locationId: w.A })))?.code).toBe("forbidden");
    expect((await err(cm.createPost(w.manager, w.org, { type: "novedad", title: "Para todas" })))?.code).toBe("invalid"); // gerente de una sede: elige sede
    const img = await cm.uploadMedia(w.manager, { kind: "image", orgId: w.org, mime: "image/png", bytes: PNG() });
    await cm.createPost(w.manager, w.org, { type: "novedad", title: "Nueva zona de peso libre", text: "2 racks más", locationId: w.A, imageId: img.id });
    await cm.createPost(w.manager, w.org, { type: "descuento", title: "20% whey", badge: "20% OFF", validUntil: today(), locationId: w.A });
    await db.update(schema.communityPost).set({ validUntil: localDate(addDays(new Date(), -1)) }).where(eq(schema.communityPost.title, "20% whey"));
    const home = await cm.myGymHome(vale.userId);
    expect(home.posts.map((p) => p.title)).toEqual(["Nueva zona de peso libre"]);
    expect((await cm.myGymHome(other.userId)).posts).toHaveLength(0); // otra sede
    // Imagen: la ve un socio del gym, no un externo.
    const [m] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, img.id));
    expect(await cm.authorizeCommunityMedia(vale.userId, m)).toBe(true);
    expect(await cm.authorizeCommunityMedia(await verified(), m)).toBe(false);
    // Archivo con firma falsa
    expect((await err(cm.uploadMedia(w.manager, { kind: "image", orgId: w.org, mime: "image/png", bytes: MP4() })))?.code).toBe("invalid_file");
  });

  it("recepción carga el catálogo; sin precio no se publica; destacado primero", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    expect((await err(cm.upsertItem(w.recep, w.org, { category: "Bebidas", name: "Agua", priceArs: 0, locationId: w.A })))?.code).toBe("invalid");
    await cm.upsertItem(w.recep, w.org, { category: "Bebidas", name: "Agua 1,5 L", priceArs: 1800, locationId: w.A });
    await cm.upsertItem(w.recep, w.org, { category: "Suplementos", name: "Whey 1 kg", priceArs: 42000, promo: "20% OFF con la app", highlighted: true, locationId: w.A });
    await cm.setReceptionHours(w.recep, w.org, w.A, "Lun a vie 7 a 23");
    const h = await cm.myGymHome(vale.userId);
    expect(h.catalog.map((i) => i.name)).toEqual(["Whey 1 kg", "Agua 1,5 L"]);
    expect(h.location.receptionHours).toBe("Lun a vie 7 a 23");
    expect((await err(cm.createChallenge(w.recep, w.org, { title: "x", rule: "y", unit: "reps", category: "fuerza", prize: "z", endsOn: today(), locationId: w.A })))?.code).toBe("forbidden");
  });
});

describe("desafíos, validación, récords, logros y premios", () => {
  it("video obligatorio, uno pendiente por desafío; intento válido ≠ récord; premio sólo con récord y una vez", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez", w.A, true);
    const juli = await w.member("Julián Ortiz", w.A, false);
    const ch = await cm.createChallenge(w.manager, w.org, { title: "Dominadas máximas", rule: "Una serie, mentón sobre la barra, sin balanceo.", unit: "reps", category: "fuerza", prize: "Shaker REPI", endsOn: today(), locationId: w.A });
    expect((await err(cm.submitAttempt(vale.userId, { challengeId: ch.id, value: 12, videoId: randomUUID(), confirm: true })))?.code).toBe("invalid");
    const a1 = await attempt(vale.userId, w.org, ch.id, 12, "F");
    expect((await err(attempt(vale.userId, w.org, ch.id, 13)))?.code).toBe("pending");
    expect((await err(cm.decideAttempt(w.trainer, w.org, a1.id, { approve: true })))?.code).toBe("forbidden");
    expect((await err(cm.decideAttempt(w.manager, w.org, a1.id, { approve: false })))?.code).toBe("invalid"); // rechazar exige motivo
    const d1 = await cm.decideAttempt(w.manager, w.org, a1.id, { approve: true });
    expect(d1).toMatchObject({ status: "approved", newRecord: true, prize: true });
    expect((await err(cm.decideAttempt(w.manager, w.org, a1.id, { approve: true })))?.code).toBe("decided"); // sin doble validación
    // Julián iguala: válido pero no es récord ni tiene premio.
    const a2 = await attempt(juli.userId, w.org, ch.id, 12, "M");
    expect(await cm.decideAttempt(w.manager, w.org, a2.id, { approve: true })).toMatchObject({ newRecord: false });
    // Vale mejora su propia marca: nuevo récord, sin segundo premio ni logro duplicado.
    const a3 = await attempt(vale.userId, w.org, ch.id, 14);
    expect(await cm.decideAttempt(w.manager, w.org, a3.id, { approve: true })).toMatchObject({ newRecord: true, prize: false });
    const prizes = await db.select().from(schema.prize).where(eq(schema.prize.userId, vale.userId));
    expect(prizes).toHaveLength(1);
    const ach = await db.select().from(schema.achievement).where(eq(schema.achievement.userId, vale.userId));
    expect(ach.map((a) => a.kind).sort()).toEqual(["challenge_validated", "gym_record"]);
    const h = await cm.myGymHome(vale.userId);
    expect(h.challenges[0]).toMatchObject({ record: "14 reps", myBest: "14 reps" });
    expect(h.level.level).toBe(2);
    expect(h.notices.some((x) => x.kind === "attempt_approved")).toBe(true);
    // Rechazo con motivo y aviso
    const a4 = await attempt(juli.userId, w.org, ch.id, 30);
    await cm.decideAttempt(w.manager, w.org, a4.id, { approve: false, reason: "No se ve el intento completo" });
    expect((await cm.myGymHome(juli.userId)).challenges[0].last).toMatchObject({ status: "rejected", reason: "No se ve el intento completo" });
    // Ranking: sólo validados; Julián sin consentimiento de rankings figura anónimo.
    const rk = await cm.challengeRanking(juli.userId, ch.id, "all");
    expect(rk.rows.map((r) => [r.pos, r.name, r.value])).toEqual([[1, "Valentina G.", "14 reps"], [2, "Vos", "12 reps"]]);
    expect((await cm.challengeRanking(vale.userId, ch.id, "all")).rows[1].name).toBe("Socio/a");
    expect((await cm.challengeRanking(vale.userId, ch.id, "M")).rows.map((r) => r.value)).toEqual(["12 reps"]);
    // Video del intento: lo ve quien valida, no otro socio ni el entrenador de sala.
    const [att] = await db.select().from(schema.challengeAttempt).where(eq(schema.challengeAttempt.id, a1.id));
    const [vid] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, att.videoId));
    expect(await cm.authorizeCommunityMedia(w.manager, vid)).toBe(true);
    expect(await cm.authorizeCommunityMedia(juli.userId, vid)).toBe(false);
    expect(await cm.authorizeCommunityMedia(w.trainer, vid)).toBe(false);
  });

  it("tiempos: menor es mejor; desafío vencido se cierra y avisa; menor sin autorización no sube video", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    const ch = await cm.createChallenge(w.manager, w.org, { title: "Remo 500 m", rule: "Remoergómetro resistencia 5, pantalla visible.", unit: "seg", lowerIsBetter: true, category: "cardio", prize: "Toalla", endsOn: today(), locationId: w.A });
    const a = await attempt(vale.userId, w.org, ch.id, 98);
    await cm.decideAttempt(w.manager, w.org, a.id, { approve: true });
    const b = await attempt(vale.userId, w.org, ch.id, 101);
    expect(await cm.decideAttempt(w.manager, w.org, b.id, { approve: true })).toMatchObject({ newRecord: false });
    await db.update(schema.challenge).set({ endsOn: localDate(addDays(new Date(), -2)) }).where(eq(schema.challenge.id, ch.id));
    await cm.closeExpired(w.org);
    const [c] = await db.select().from(schema.challenge).where(eq(schema.challenge.id, ch.id));
    expect(c.status).toBe("closed");
    expect((await cm.myGymHome(vale.userId)).notices.some((x) => x.kind === "challenge_closed")).toBe(true);
    expect((await err(attempt(vale.userId, w.org, ch.id, 90)))?.code).toBe("closed");
    const d = new Date(); const teen = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() - 15}`;
    const kid = await w.member("Menor Socio", w.A, false, teen);
    const ch2 = await cm.createChallenge(w.manager, w.org, { title: "Plancha", rule: "Antebrazos y puntas de pie, cuerpo alineado.", unit: "seg", category: "resistencia", prize: "Remera", endsOn: today(), locationId: w.A });
    expect((await err(attempt(kid.userId, w.org, ch2.id, 60)))?.code).toBe("minor");
  });

  it("carnet rotativo, ingreso sin duplicar y entrega de premio una sola vez", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    const ch = await cm.createChallenge(w.manager, w.org, { title: "Dominadas", rule: "Mentón sobre la barra, sin balanceo.", unit: "reps", category: "fuerza", prize: "Shaker", endsOn: today(), locationId: w.A });
    const a = await attempt(vale.userId, w.org, ch.id, 10);
    await cm.decideAttempt(w.manager, w.org, a.id, { approve: true });
    const card = await cm.myCard(vale.userId);
    expect(card.token).not.toContain(vale.memberId.slice(0, 0) + "Valentina");
    expect(card.prizes[0].status).toBe("ready");
    expect((await err(cm.verifyCard(w.trainer, w.org, card.token)))?.code).toBe("forbidden");
    const v = await cm.verifyCard(w.recep, w.org, card.token);
    expect([v.name, v.prizes.length]).toEqual(["Valentina Gómez", 1]);
    expect((await err(cm.verifyCard(w.recep, w.org, card.token.slice(0, -2) + "xx")))?.code).toBe("invalid_card");
    expect((await err(cm.verifyCard(w.recep, w.org, cm.signCard(vale.memberId, addDays(new Date(), -1)))))?.code).toBe("expired_card");
    expect((await cm.checkIn(w.recep, w.org, card.token, w.A)).duplicate).toBe(false);
    expect((await cm.checkIn(w.recep, w.org, card.token, w.A)).duplicate).toBe(true);
    await cm.deliverPrize(w.recep, w.org, v.prizes[0].id);
    expect((await err(cm.deliverPrize(w.recep, w.org, v.prizes[0].id)))?.code).toBe("delivered");
    expect((await cm.myCard(vale.userId)).prizes[0].status).toBe("delivered");
    const otherGym = await world();
    expect((await err(cm.verifyCard(otherGym.recep, otherGym.org, card.token)))?.code).toBe("invalid_card");
  });

  it("logros de entrenamiento al terminar la primera sesión, sin duplicar", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    expect(await cm.awardTrainingAchievements(vale.userId)).toEqual([]);
    const [m] = await db.select().from(schema.gymMember).where(eq(schema.gymMember.id, vale.memberId));
    expect(m).toBeTruthy();
    await db.insert(schema.achievement).values({ userId: vale.userId, kind: "first_session", sourceKey: "first", title: "x", detail: "y" }).onConflictDoNothing();
    expect(await cm.grant(db, vale.userId, null, "first_session", "first", "x", "y")).toBeNull();
  });

  it("purga: video de intento decidido hace más de 90 días", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    const ch = await cm.createChallenge(w.manager, w.org, { title: "Sentadilla", rule: "Profundidad bajo paralelo, sin rebote.", unit: "kg", category: "fuerza", prize: "Remera", endsOn: today(), locationId: w.A });
    const a = await attempt(vale.userId, w.org, ch.id, 82.5);
    await cm.decideAttempt(w.manager, w.org, a.id, { approve: true });
    await db.update(schema.challengeAttempt).set({ decidedAt: addDays(new Date(), -91) }).where(eq(schema.challengeAttempt.id, a.id));
    const r = await fu.purgeMedia();
    expect(r.retention).toBeGreaterThanOrEqual(1);
    const [att] = await db.select().from(schema.challengeAttempt).where(eq(schema.challengeAttempt.id, a.id));
    const [vid] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, att.videoId));
    expect(vid.deletedAt).not.toBeNull();
    expect((await cm.myGymHome(vale.userId)).challenges[0].myBest).toBe("82,5 kg"); // la marca queda aunque se borre el video
  });
});

describe("Repi Club", () => {
  it("voluntario; sin enlaces; logros propios; aplausos y comentarios; bloqueo; reportes ocultan; moderación", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    const juli = await w.member("Julián Ortiz");
    const r1 = await w.member("Paula Díaz"), r2 = await w.member("Tomás Herrera"), r3 = await w.member("Carla Medina");
    expect((await err(club.feed(vale.userId, w.org)))?.code).toBe("not_joined");
    await club.joinClub(vale.userId, w.org, { showName: true, inRanking: true });
    for (const u of [juli, r1, r2, r3]) await club.joinClub(u.userId, w.org, { showName: false, inRanking: false });
    expect((await err(club.createClubPost(vale.userId, w.org, { text: "Sigan www.spam.com" })))?.code).toBe("invalid");
    const [foreign] = await db.insert(schema.achievement).values({ userId: juli.userId, kind: "first_session", sourceKey: "first", title: "Primer entrenamiento", detail: "x" }).returning();
    expect((await err(club.createClubPost(vale.userId, w.org, { achievementId: foreign.id })))?.code).toBe("invalid");
    const [mine] = await db.insert(schema.achievement).values({ userId: vale.userId, kind: "first_session", sourceKey: "first", title: "Primer entrenamiento", detail: "Tu primera sesión" }).returning();
    const p = await club.createClubPost(vale.userId, w.org, { text: "¡Arranqué!", achievementId: mine.id });
    expect((await club.toggleApplause(juli.userId, w.org, p.id)).applauded).toBe(true);
    await club.commentPost(juli.userId, w.org, p.id, "¡Vamos!");
    const f = await club.feed(juli.userId, w.org);
    expect(f[0]).toMatchObject({ author: "Valentina G.", applause: 1, applauded: true, achievement: { title: "Primer entrenamiento" } });
    expect((await club.feed(vale.userId, w.org))[0].comments[0].author).toBe("Socio/a del gym"); // Julián eligió no mostrar su nombre
    // Bloqueo: Vale deja de ver a Julián (y viceversa).
    await club.blockUser(vale.userId, w.org, juli.userId);
    expect((await club.feed(vale.userId, w.org))[0].comments).toHaveLength(0);
    expect(await club.feed(juli.userId, w.org)).toHaveLength(0);
    // Tres reportes distintos ocultan; moderación decide.
    for (const u of [r1, r2]) await club.report(u.userId, w.org, { type: "post", id: p.id, reason: "Spam" });
    expect((await club.report(r3.userId, w.org, { type: "post", id: p.id, reason: "Spam" })).hidden).toBe(true);
    expect((await club.feed(r1.userId, w.org)).some((x) => x.id === p.id)).toBe(false);
    expect((await club.feed(vale.userId, w.org))[0].hidden).toBe(true); // la autora lo ve marcado
    expect((await err(club.clubReports(w.trainer, w.org)))?.code).toBe("forbidden");
    const reps = await club.clubReports(w.manager, w.org);
    expect(reps[0]).toMatchObject({ id: p.id, reports: 3, open: true });
    await club.moderateClub(w.manager, w.org, { type: "post", id: p.id, outcome: "keep" });
    expect((await club.feed(r1.userId, w.org)).some((x) => x.id === p.id)).toBe(true);
    const outsider = await verified();
    expect((await err(club.feed(outsider, w.org)))?.code).toBe("not_found");
  });

  it("ranking del mes sólo con quienes lo eligieron y con datos del gym (no del coach privado)", async () => {
    const w = await world();
    const vale = await w.member("Valentina Gómez");
    const juli = await w.member("Julián Ortiz");
    await club.joinClub(vale.userId, w.org, { showName: true, inRanking: true });
    await club.joinClub(juli.userId, w.org, { showName: true, inRanking: false });
    await db.insert(schema.attendance).values([
      { orgId: w.org, locationId: w.A, gymMemberId: vale.memberId, source: "recepcion_qr" },
      { orgId: w.org, locationId: w.A, gymMemberId: vale.memberId, source: "recepcion_qr" }, // mismo día cuenta una vez
    ]);
    const r = await club.clubRankingFor(vale.userId, w.org);
    expect(r.rows).toEqual([{ pos: 1, name: "Vos", days: 1, me: true }]);
  });
});
