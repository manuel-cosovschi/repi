// Comunidad del gym (Etapa 6): novedades, descuentos, desafíos con video, validación, logros, premios,
// catálogo informativo, carnet QR, asistencia por recepción. Fuentes: REPI Desktop Gym.dc.html y REPI App Alumno v4.dc.html.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  ACHIEVEMENT_KIND, CARD_TOKEN_TTL_MIN, CHALLENGE_CATEGORIES, MONTH_SESSIONS_GOAL, SAFETY_NOTE, ageAt, attemptValueOk, bestByMember, fileOk, fmtValue,
  isDivision, isNewRecord, isUnit, levelOf, localDate, weekOf, type AchievementKind, type ChallengeUnit, type Division,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit, newInviteCode, type Tx } from "../access/util";
import { minorWithoutGuardian } from "../access/services";
import { NOT_FOUND, gate, gymContext, inScope, need, scopedLocations, type GymCtx } from "../gym/services";
import { requireEnv } from "../env";
import { putObject } from "../storage";

const { user, organization, gymLocation, gymMember, rosterEntry, consentGrant, mediaObject, shiftLog, workoutSession, communityPost, challenge,
  challengeAttempt, achievement, prize, catalogItem, attendance, memberNotice } = schema;

const x10 = (v: number) => Math.round(v * 10);
const v10 = (n: number | null) => (n == null ? null : n / 10);
const todayAr = () => localDate(new Date());

// ── Archivos ────────────────────────────────────────────────────────────────
/** Sube una imagen de comunidad (staff con permiso de publicar) o un video de intento (socio). Tipo validado por firma. */
export async function uploadMedia(userId: string, p: { kind: "image" | "attempt_video"; orgId: string; mime: string; bytes: Uint8Array }) {
  if (!fileOk(p.kind, p.mime, p.bytes)) {
    throw new AccessError("invalid_file", p.kind === "image" ? "La imagen tiene que ser JPG, PNG o WebP de hasta 5 MB." : "El video tiene que ser MP4, MOV o WebM de hasta 80 MB.");
  }
  if (p.kind === "image") {
    const ctx = await gymContext(userId, p.orgId);
    if (!ctx.caps.includes("community.publish") && !ctx.caps.includes("catalog.publish")) throw new AccessError("forbidden", "Tu rol no puede publicar en la comunidad.", 403);
  } else if (!(await memberOf(userId, p.orgId))) throw NOT_FOUND();
  const id = randomUUID();
  const key = `${p.kind === "image" ? "community" : "attempt"}/${p.orgId.replace(/[^a-z0-9]/gi, "")}/${id}`;
  await putObject(key, p.bytes);
  await db.insert(mediaObject).values({ id, ownerUserId: userId, orgId: p.orgId, purpose: p.kind === "image" ? "community_image" : "attempt_video", storageKey: key, mime: p.mime, sizeBytes: p.bytes.byteLength });
  return { id };
}

/** Lectura autorizada: imágenes para socios activos y staff de la organización; videos de intento para su autor y quien valida. */
export async function authorizeCommunityMedia(actorId: string, m: typeof mediaObject.$inferSelect) {
  if (m.ownerUserId === actorId || !m.orgId) return m.ownerUserId === actorId;
  if (m.purpose === "community_image") {
    if (await memberOf(actorId, m.orgId)) return true;
    const staff = await db.select({ id: schema.staffMembership.id }).from(schema.staffMembership)
      .where(and(eq(schema.staffMembership.userId, actorId), eq(schema.staffMembership.orgId, m.orgId), eq(schema.staffMembership.status, "active")));
    return staff.length > 0;
  }
  if (m.purpose === "attempt_video") {
    const ctx = await gymContext(actorId, m.orgId).catch(() => null);
    if (!ctx || !ctx.caps.includes("challenges.validate")) return false;
    const [a] = await db.select({ loc: gymMember.locationId }).from(challengeAttempt).innerJoin(gymMember, eq(gymMember.id, challengeAttempt.gymMemberId)).where(eq(challengeAttempt.videoId, m.id));
    return !!a && inScope(ctx, a.loc);
  }
  return false;
}

export async function memberOf(userId: string, orgId: string) {
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.orgId, orgId), eq(gymMember.status, "active")));
  return m ?? null;
}
async function myGym(userId: string, orgId?: string | null) {
  const rows = await db.select({ m: gymMember, org: organization, loc: gymLocation }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active"))).orderBy(asc(gymMember.createdAt));
  const r = orgId ? rows.find((x) => x.org.id === orgId) : rows[0];
  if (!r) throw new AccessError("no_gym", "No sos socio activo de un gym en REPI.", 404);
  return r;
}
const ownImage = async (userId: string, orgId: string, imageId: string | null | undefined) => {
  if (!imageId) return null;
  const [m] = await db.select().from(mediaObject).where(and(eq(mediaObject.id, imageId), eq(mediaObject.orgId, orgId), eq(mediaObject.purpose, "community_image"), isNull(mediaObject.deletedAt)));
  if (!m || m.ownerUserId !== userId) throw new AccessError("invalid", "La imagen no es válida.");
  return m.id;
};
async function locationOk(orgId: string, locationId: string | null | undefined, ctx: Awaited<ReturnType<typeof gymContext>>) {
  if (!locationId) { if (ctx.locationIds !== null && !ctx.roles.includes("owner")) {
    // Un gerente de una sede publica para su sede; "todas las sedes" es del dueño.
    throw new AccessError("invalid", "Elegí la sede donde se publica.");
  } return null; }
  const [l] = await db.select().from(gymLocation).where(and(eq(gymLocation.id, locationId), eq(gymLocation.orgId, orgId)));
  if (!l || !inScope(ctx, l.id)) throw NOT_FOUND();
  return l.id;
}

// ── Cierre de desafíos (F-HX-10) ────────────────────────────────────────────
/** Cierra los desafíos vencidos: queda el récord vigente como ganador y se avisa a quienes participaron. Idempotente. */
export async function closeExpired(orgId: string, now = new Date()) {
  const today = localDate(now);
  const due = await db.select().from(challenge).where(and(eq(challenge.orgId, orgId), eq(challenge.status, "active"), lt(challenge.endsOn, today)));
  for (const c of due) {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(challenge).where(eq(challenge.id, c.id)).for("update");
      if (locked.status !== "active") return;
      await tx.update(challenge).set({ status: "closed", closedAt: now }).where(eq(challenge.id, c.id));
      const holder = locked.recordAttemptId ? (await tx.select({ name: user.name }).from(challengeAttempt).innerJoin(user, eq(user.id, challengeAttempt.userId)).where(eq(challengeAttempt.id, locked.recordAttemptId)))[0] : null;
      const parts = await tx.selectDistinct({ u: challengeAttempt.userId }).from(challengeAttempt).where(eq(challengeAttempt.challengeId, c.id));
      for (const p of parts) {
        await tx.insert(memberNotice).values({ userId: p.u, orgId, kind: "challenge_closed", refId: c.id, title: `Terminó «${c.title}»`,
          body: holder ? `Récord final: ${fmtValue(v10(locked.recordValue), c.unit)}.` : "Terminó sin récord validado." });
      }
      await audit(tx, { orgId, action: "challenge.closed", resourceType: "challenge", resourceId: c.id, meta: { record: !!locked.recordAttemptId } });
    });
  }
}

// ── Staff: comunidad ────────────────────────────────────────────────────────
export async function staffCommunity(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!ctx.caps.includes("community.publish") && !ctx.caps.includes("catalog.publish")) throw new AccessError("forbidden", "Tu rol no tiene acceso a esta acción.", 403);
  await closeExpired(orgId);
  const locs = await scopedLocations(ctx, null);
  const ids = locs.map((l) => l.id);
  const scope = (col: typeof communityPost.locationId | typeof challenge.locationId | typeof catalogItem.locationId) => or(isNull(col), inArray(col, ids));
  const posts = await db.select().from(communityPost).where(and(eq(communityPost.orgId, orgId), isNull(communityPost.deletedAt), scope(communityPost.locationId))).orderBy(desc(communityPost.createdAt)).limit(50);
  const chs = await db.select().from(challenge).where(and(eq(challenge.orgId, orgId), ne(challenge.status, "removed"), scope(challenge.locationId))).orderBy(desc(challenge.createdAt)).limit(50);
  const stats = chs.length ? await db.select({ ch: challengeAttempt.challengeId, parts: sql<number>`count(distinct ${challengeAttempt.userId})::int`, pending: sql<number>`count(*) filter (where ${challengeAttempt.status} = 'pending')::int` })
    .from(challengeAttempt).where(inArray(challengeAttempt.challengeId, chs.map((c) => c.id))).groupBy(challengeAttempt.challengeId) : [];
  const holders = await recordHolders(chs.map((c) => c.recordAttemptId).filter(Boolean) as string[]);
  const items = await db.select().from(catalogItem).where(and(eq(catalogItem.orgId, orgId), isNull(catalogItem.deletedAt), scope(catalogItem.locationId))).orderBy(asc(catalogItem.category), asc(catalogItem.name));
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  return {
    canPublish: ctx.caps.includes("community.publish"), canCatalog: ctx.caps.includes("catalog.publish"), allLocations: ctx.locationIds === null || ctx.roles.includes("owner"),
    locations: locs.map((l) => ({ id: l.id, name: l.name, receptionHours: l.receptionHours })),
    posts: posts.map((p) => ({ ...p, sede: p.locationId ? locName.get(p.locationId) ?? "" : "Todas las sedes", expired: !!p.validUntil && p.validUntil < todayAr() })),
    challenges: chs.map((c) => {
      const s = stats.find((x) => x.ch === c.id);
      return { id: c.id, title: c.title, rule: c.rule, unit: c.unit, lowerIsBetter: c.lowerIsBetter, category: c.category, prize: c.prize, endsOn: c.endsOn, status: c.status,
        sede: c.locationId ? locName.get(c.locationId) ?? "" : "Todas las sedes", record: fmtValue(v10(c.recordValue), c.unit), holder: c.recordAttemptId ? holders.get(c.recordAttemptId) ?? null : null,
        participants: s?.parts ?? 0, pending: s?.pending ?? 0 };
    }),
    catalog: items.map((i) => ({ ...i, sede: i.locationId ? locName.get(i.locationId) ?? "" : "Todas las sedes" })),
  };
}
async function recordHolders(attemptIds: string[]) {
  if (!attemptIds.length) return new Map<string, string>();
  const rows = await db.select({ id: challengeAttempt.id, name: user.name }).from(challengeAttempt).innerJoin(user, eq(user.id, challengeAttempt.userId)).where(inArray(challengeAttempt.id, attemptIds));
  return new Map(rows.map((r) => [r.id, shortName(r.name)]));
}
const shortName = (full: string) => { const [f, ...r] = full.trim().split(/\s+/); return r.length ? `${f} ${r[r.length - 1][0]}.` : f; };

export async function createPost(actorId: string, orgId: string, p: { locationId?: string | null; type: "novedad" | "descuento"; title: string; text?: string; badge?: string | null; imageId?: string | null; validUntil?: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "community.publish");
  const title = (p.title ?? "").trim();
  if (title.length < 3) throw new AccessError("invalid", "Escribí un título.");
  if (!["novedad", "descuento"].includes(p.type)) throw new AccessError("invalid", "Tipo inválido.");
  if (p.validUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil) || p.validUntil < todayAr())) throw new AccessError("invalid", "El vencimiento no puede ser anterior a hoy.");
  const locationId = await locationOk(orgId, p.locationId, ctx);
  const imageId = await ownImage(actorId, orgId, p.imageId);
  const [row] = await db.insert(communityPost).values({
    orgId, locationId, type: p.type, title: title.slice(0, 120), text: (p.text ?? "").trim().slice(0, 1000), badge: p.type === "descuento" ? p.badge?.trim().slice(0, 30) || null : null,
    imageId, validUntil: p.type === "descuento" ? p.validUntil ?? null : null, createdBy: actorId,
  }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "community.post_published", resourceType: "community_post", resourceId: row.id });
  return { id: row.id };
}
export async function removePost(actorId: string, orgId: string, id: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "community.publish");
  const [r] = await db.select().from(communityPost).where(and(eq(communityPost.id, id), eq(communityPost.orgId, orgId), isNull(communityPost.deletedAt)));
  if (!r || (r.locationId && !inScope(ctx, r.locationId))) throw NOT_FOUND();
  await db.update(communityPost).set({ deletedAt: new Date() }).where(eq(communityPost.id, id));
  return { ok: true };
}

export async function createChallenge(actorId: string, orgId: string, p: { locationId?: string | null; title: string; rule: string; unit: string; lowerIsBetter?: boolean; category: string; prize: string; endsOn: string }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "community.publish");
  const title = (p.title ?? "").trim(), prizeTxt = (p.prize ?? "").trim(), rule = (p.rule ?? "").trim();
  if (title.length < 3 || prizeTxt.length < 2) throw new AccessError("invalid", "Completá nombre y premio.");
  if (rule.length < 10) throw new AccessError("invalid", "Escribí la regla: cómo tiene que verse el intento en el video.");
  if (!isUnit(p.unit) || !(p.category in CHALLENGE_CATEGORIES)) throw new AccessError("invalid", "Elegí unidad y categoría.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.endsOn) || p.endsOn < todayAr()) throw new AccessError("invalid", "La fecha de fin no puede ser anterior a hoy.");
  const locationId = await locationOk(orgId, p.locationId, ctx);
  const [row] = await db.insert(challenge).values({
    orgId, locationId, title: title.slice(0, 80), rule: rule.slice(0, 400), unit: p.unit, lowerIsBetter: p.unit === "seg" ? !!p.lowerIsBetter : false,
    category: p.category as keyof typeof CHALLENGE_CATEGORIES, prize: prizeTxt.slice(0, 120), endsOn: p.endsOn, createdBy: actorId,
  }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "challenge.published", resourceType: "challenge", resourceId: row.id });
  return { id: row.id };
}

/** Retirar un desafío: los intentos pendientes se rechazan con motivo y se avisa a cada socio. */
export async function removeChallenge(actorId: string, orgId: string, id: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "community.publish");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(challenge).where(and(eq(challenge.id, id), eq(challenge.orgId, orgId))).for("update");
    if (!c || c.status === "removed" || (c.locationId && !inScope(ctx, c.locationId))) throw NOT_FOUND();
    await tx.update(challenge).set({ status: "removed" }).where(eq(challenge.id, id));
    const pend = await tx.update(challengeAttempt).set({ status: "rejected", reason: "El gym retiró el desafío", decidedBy: actorId, decidedAt: new Date() })
      .where(and(eq(challengeAttempt.challengeId, id), eq(challengeAttempt.status, "pending"))).returning();
    for (const a of pend) await tx.insert(memberNotice).values({ userId: a.userId, orgId, kind: "attempt_rejected", refId: a.id, title: `Intento no evaluado · ${c.title}`, body: "El gym retiró el desafío." });
    await audit(tx, { actorUserId: actorId, orgId, action: "challenge.removed", resourceType: "challenge", resourceId: id, meta: { pending: pend.length } });
    return { rejected: pend.length };
  });
}

export async function upsertItem(actorId: string, orgId: string, p: { id?: string | null; locationId?: string | null; category: string; name: string; priceArs: number; promo?: string | null; highlighted?: boolean; available?: boolean; imageId?: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "catalog.publish");
  const name = (p.name ?? "").trim();
  if (name.length < 2 || !Number.isInteger(p.priceArs) || p.priceArs <= 0 || p.priceArs > 10_000_000) throw new AccessError("invalid", "Completá nombre y precio.");
  const category = (p.category ?? "").trim().slice(0, 30) || "Otros";
  const values = { category, name: name.slice(0, 80), priceArs: p.priceArs, promo: p.promo?.trim().slice(0, 40) || null, highlighted: !!p.highlighted, available: p.available ?? true };
  if (p.id) {
    const [r] = await db.select().from(catalogItem).where(and(eq(catalogItem.id, p.id), eq(catalogItem.orgId, orgId), isNull(catalogItem.deletedAt)));
    if (!r || (r.locationId && !inScope(ctx, r.locationId))) throw NOT_FOUND();
    await db.update(catalogItem).set({ ...values, imageId: p.imageId === undefined ? r.imageId : await ownImage(actorId, orgId, p.imageId) }).where(eq(catalogItem.id, r.id));
    return { id: r.id };
  }
  const locationId = await locationOk(orgId, p.locationId, ctx);
  const [row] = await db.insert(catalogItem).values({ orgId, locationId, ...values, imageId: await ownImage(actorId, orgId, p.imageId), createdBy: actorId }).returning();
  return { id: row.id };
}
export async function removeItem(actorId: string, orgId: string, id: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "catalog.publish");
  const [r] = await db.select().from(catalogItem).where(and(eq(catalogItem.id, id), eq(catalogItem.orgId, orgId), isNull(catalogItem.deletedAt)));
  if (!r || (r.locationId && !inScope(ctx, r.locationId))) throw NOT_FOUND();
  await db.update(catalogItem).set({ deletedAt: new Date() }).where(eq(catalogItem.id, id));
  return { ok: true };
}
export async function setReceptionHours(actorId: string, orgId: string, locationId: string, hours: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "catalog.publish");
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  const r = await db.update(gymLocation).set({ receptionHours: hours.trim().slice(0, 120) || null }).where(and(eq(gymLocation.id, locationId), eq(gymLocation.orgId, orgId))).returning();
  if (!r.length) throw NOT_FOUND();
  return { ok: true };
}

// ── Staff: validaciones (F-GC-03) ───────────────────────────────────────────
// D165: el profe de sala y la coordinación (`challenges.witness`) ven y deciden sólo los intentos «en sala» de sus sedes;
// dueño y gerencia (`challenges.validate`), todos.
function validationScope(ctx: GymCtx) {
  if (ctx.caps.includes("challenges.validate")) return "all" as const;
  if (ctx.caps.includes("challenges.witness")) return "in_person" as const;
  throw new AccessError("forbidden", "Tu rol no tiene acceso a esta acción.", 403);
}

export async function listValidations(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  const scope = validationScope(ctx);
  const ids = (await scopedLocations(ctx, null)).map((l) => l.id);
  const rows = await db.select({ a: challengeAttempt, c: challenge, name: user.name, loc: gymMember.locationId }).from(challengeAttempt)
    .innerJoin(challenge, eq(challenge.id, challengeAttempt.challengeId)).innerJoin(gymMember, eq(gymMember.id, challengeAttempt.gymMemberId)).innerJoin(user, eq(user.id, challengeAttempt.userId))
    .where(and(eq(challengeAttempt.orgId, orgId), inArray(gymMember.locationId, ids), scope === "in_person" ? eq(challengeAttempt.method, "in_person") : undefined,
      or(eq(challengeAttempt.status, "pending"), gte(challengeAttempt.decidedAt, addDays(new Date(), -30)))))
    .orderBy(desc(challengeAttempt.createdAt)).limit(100);
  const deciders = new Map((rows.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(rows.map((r) => r.a.decidedBy).filter(Boolean) as string[])].concat(["-"]))) : []).map((u) => [u.id, u.name]));
  const view = (r: (typeof rows)[number]) => ({
    id: r.a.id, member: r.name, challenge: r.c.title, rule: r.c.rule, value: fmtValue(v10(r.a.valueX10), r.c.unit), declared: r.a.valueX10 / 10, record: fmtValue(v10(r.c.recordValue), r.c.unit),
    wouldBeRecord: isNewRecord(r.a.valueX10, r.c.recordValue, r.c.lowerIsBetter), videoId: r.a.videoId, method: r.a.method, unit: r.c.unit, lowerIsBetter: r.c.lowerIsBetter, recordX10: r.c.recordValue, at: r.a.createdAt, status: r.a.status, reason: r.a.reason, newRecord: r.a.newRecord,
    decidedBy: r.a.decidedBy ? deciders.get(r.a.decidedBy) ?? null : null, decidedAt: r.a.decidedAt,
  });
  return { pending: rows.filter((r) => r.a.status === "pending").map(view), done: rows.filter((r) => r.a.status !== "pending").map(view) };
}

/**
 * Validar o rechazar. Bloquea el intento y el desafío: no hay doble validación ni carrera entre récords.
 * Aprobar: logro "Marca validada" (uno por desafío). Sólo si mejora el récord vigente: récord, logro "Récord del gym" y premio.
 */
export async function decideAttempt(actorId: string, orgId: string, attemptId: string, p: { approve: boolean; reason?: string | null; value?: number | null }) {
  const ctx = await gymContext(actorId, orgId);
  const scope = validationScope(ctx);
  if (!p.approve && (p.reason ?? "").trim().length < 3) throw new AccessError("invalid", "Elegí o escribí el motivo del rechazo.");
  return db.transaction(async (tx) => {
    const [a0] = await tx.select().from(challengeAttempt).where(and(eq(challengeAttempt.id, attemptId), eq(challengeAttempt.orgId, orgId))).for("update");
    if (!a0) throw NOT_FOUND();
    if (scope === "in_person" && a0.method !== "in_person") throw new AccessError("forbidden", "Los intentos con video los valida la gerencia del gym.", 403);
    const [gm] = await tx.select().from(gymMember).where(eq(gymMember.id, a0.gymMemberId));
    if (!gm || !inScope(ctx, gm.locationId)) throw NOT_FOUND();
    if (a0.status !== "pending") throw new AccessError("decided", "Este intento ya fue resuelto.", 409);
    if (a0.userId === actorId) throw new AccessError("forbidden", "No podés validar tu propio intento.", 403);
    // En sala lo valida quien lo vio: el piso, con turno en la sede del socio (como las altas por QR).
    if (scope === "in_person") await gate(ctx, gm.locationId, "validar un récord en sala", tx);
    const [c] = await tx.select().from(challenge).where(eq(challenge.id, a0.challengeId)).for("update");
    // En sala, quien valida anota la marca que vio (puede corregir la declarada); con video, vale la declarada.
    let a = a0;
    if (p.approve && a0.method === "in_person" && p.value != null) {
      if (!attemptValueOk(c.unit, p.value)) throw new AccessError("invalid", "Anotá la marca que viste.");
      a = { ...a0, valueX10: x10(p.value) };
      if (a.valueX10 !== a0.valueX10) await tx.update(challengeAttempt).set({ valueX10: a.valueX10 }).where(eq(challengeAttempt.id, a.id));
    }
    const now = new Date();
    if (!p.approve) {
      const reason = p.reason!.trim().slice(0, 200);
      await tx.update(challengeAttempt).set({ status: "rejected", reason, decidedBy: actorId, decidedAt: now }).where(eq(challengeAttempt.id, a.id));
      await tx.insert(memberNotice).values({ userId: a.userId, orgId, kind: "attempt_rejected", refId: a.id, title: `Intento no aprobado · ${c.title}`, body: `Motivo: ${reason}. Podés intentarlo de nuevo.` });
      await audit(tx, { actorUserId: actorId, orgId, action: "attempt.rejected", resourceType: "challenge_attempt", resourceId: a.id });
      return { status: "rejected" as const, newRecord: false };
    }
    const record = isNewRecord(a.valueX10, c.recordValue, c.lowerIsBetter);
    await tx.update(challengeAttempt).set({ status: "approved", newRecord: record, decidedBy: actorId, decidedAt: now }).where(eq(challengeAttempt.id, a.id));
    const valTxt = fmtValue(v10(a.valueX10), c.unit);
    const witness = a.method === "in_person" ? ((await tx.select({ name: user.name }).from(user).where(eq(user.id, actorId)))[0]?.name ?? null) : null;
    await grant(tx, a.userId, orgId, "challenge_validated", c.id, `${c.title}`, `${valTxt} · ${witness ? "validado en sala" : "validado"}`);
    let prizeCode: string | null = null;
    if (record) {
      await tx.update(challenge).set({ recordValue: a.valueX10, recordAttemptId: a.id }).where(eq(challenge.id, c.id));
      await grant(tx, a.userId, orgId, "gym_record", c.id, `Récord · ${c.title}`, valTxt);
      const [existing] = await tx.select().from(prize).where(and(eq(prize.challengeId, c.id), eq(prize.userId, a.userId)));
      if (!existing) {
        for (let i = 0; i < 5 && !prizeCode; i++) {
          const code = newInviteCode();
          const r = await tx.insert(prize).values({ orgId, challengeId: c.id, attemptId: a.id, userId: a.userId, description: c.prize, code }).onConflictDoNothing().returning();
          if (r.length) prizeCode = code;
        }
      }
    }
    await tx.insert(memberNotice).values({
      userId: a.userId, orgId, kind: "attempt_approved", refId: a.id, title: record ? `¡Nuevo récord del gym! · ${c.title}` : `Marca validada · ${c.title}`,
      body: `${witness ? `Lo validó ${witness} en sala. ` : ""}${record ? `${valTxt}. ${prizeCode ? "Retirá tu premio en recepción con tu carnet." : "Ya tenías el premio de este desafío."}` : `${valTxt}. Queda en tu registro; el récord vigente es ${fmtValue(v10(c.recordValue), c.unit)}.`}`,
    });
    await audit(tx, { actorUserId: actorId, orgId, action: "attempt.approved", resourceType: "challenge_attempt", resourceId: a.id, meta: { newRecord: record, method: a.method, corrected: a.valueX10 !== a0.valueX10 } });
    return { status: "approved" as const, newRecord: record, prize: !!prizeCode };
  });
}

/** Logro permanente; idempotente por (persona, tipo, fuente). */
export async function grant(tx: Tx | typeof db, userId: string, orgId: string | null, kind: AchievementKind, sourceKey: string, title: string, detail: string) {
  const r = await tx.insert(achievement).values({ userId, orgId, kind, sourceKey, title: title.slice(0, 80), detail: detail.slice(0, 120) }).onConflictDoNothing().returning();
  return r[0] ?? null;
}

/** Logros de entrenamiento REPI (no son del gym): primer entrenamiento y constancia del mes. Se llama al terminar una sesión. */
export async function awardTrainingAchievements(userId: string, now = new Date()) {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(workoutSession).where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed")));
  const out: string[] = [];
  if (total >= 1 && (await grant(db, userId, null, "first_session", "first", ACHIEVEMENT_KIND.first_session, "Tu primera sesión registrada"))) out.push("first_session");
  const month = localDate(now).slice(0, 7);
  const from = new Date(`${month}-01T03:00:00Z`);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(workoutSession).where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, from)));
  if (n >= MONTH_SESSIONS_GOAL) {
    const label = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long" }).format(new Date(`${month}-15T12:00:00Z`));
    if (await grant(db, userId, null, "month_12", month, `${ACHIEVEMENT_KIND.month_12}`, `${MONTH_SESSIONS_GOAL} sesiones en ${label}`)) out.push("month_12");
  }
  return out;
}

// ── Recepción: carnet, ingreso y premios (F-GC-06/07/08) ────────────────────
const cardKey = () => createHmac("sha256", requireEnv("BETTER_AUTH_SECRET")).update("repi-card-v1").digest();
/** Token rotativo firmado: id de membresía + vencimiento. No contiene nombre ni DNI. */
export function signCard(gymMemberId: string, now = new Date()) {
  const exp = Math.floor(now.getTime() / 1000) + CARD_TOKEN_TTL_MIN * 60;
  const body = `${gymMemberId}.${exp}`;
  const sig = createHmac("sha256", cardKey()).update(body).digest("base64url").slice(0, 22);
  return `RC1.${Buffer.from(body).toString("base64url")}.${sig}`;
}
function readCard(token: string, now = new Date()) {
  const m = /^RC1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/.exec(token.trim());
  if (!m) return null;
  const body = Buffer.from(m[1], "base64url").toString();
  const expect = createHmac("sha256", cardKey()).update(body).digest("base64url").slice(0, 22);
  if (expect.length !== m[2].length || !timingSafeEqual(Buffer.from(expect), Buffer.from(m[2]))) return null;
  const [id, exp] = body.split(".");
  if (!id || !exp || Number(exp) * 1000 < now.getTime()) return { expired: true as const, id };
  return { expired: false as const, id };
}

export async function myCard(userId: string, orgId?: string | null) {
  const r = await myGym(userId, orgId);
  const [ro] = r.m.rosterEntryId ? await db.select({ n: rosterEntry.memberNumber }).from(rosterEntry).where(eq(rosterEntry.id, r.m.rosterEntryId)) : [];
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const prizes = await db.select({ p: prize, ch: challenge.title }).from(prize).innerJoin(challenge, eq(challenge.id, prize.challengeId))
    .where(and(eq(prize.userId, userId), eq(prize.orgId, r.org.id))).orderBy(desc(prize.createdAt));
  return {
    token: signCard(r.m.id), ttlMin: CARD_TOKEN_TTL_MIN, name: u?.name ?? "", place: `${r.org.name} · ${r.loc.name}`, memberNumber: ro?.n ?? null,
    prizes: prizes.map((x) => ({ id: x.p.id, description: x.p.description, challenge: x.ch, code: x.p.code, status: x.p.status, deliveredAt: x.p.deliveredAt })),
  };
}

async function deskCtx(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reception.desk");
  return ctx;
}
/** Recepción lee el carnet (QR o código pegado): nombre, sede y premios para retirar. Un token vencido se rechaza. */
export async function verifyCard(actorId: string, orgId: string, token: string) {
  const ctx = await deskCtx(actorId, orgId);
  const c = readCard(token);
  if (!c) throw new AccessError("invalid_card", "Carnet inválido.");
  if (c.expired) throw new AccessError("expired_card", "El carnet venció: pedile al socio que lo abra de nuevo en la app.", 409);
  const [m] = await db.select({ m: gymMember, name: user.name, loc: gymLocation.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.id, c.id), eq(gymMember.orgId, orgId)));
  if (!m) throw new AccessError("invalid_card", "Este carnet no es de este gym.");
  const prizes = await db.select({ p: prize, ch: challenge.title }).from(prize).innerJoin(challenge, eq(challenge.id, prize.challengeId))
    .where(and(eq(prize.userId, m.m.userId), eq(prize.orgId, orgId), eq(prize.status, "ready")));
  const [last] = await db.select().from(attendance).where(eq(attendance.gymMemberId, m.m.id)).orderBy(desc(attendance.at)).limit(1);
  await audit(db, { actorUserId: actorId, orgId, action: "card.verified", resourceType: "gym_member", resourceId: m.m.id });
  return {
    gymMemberId: m.m.id, name: m.name, location: m.loc, active: m.m.status === "active", otherLocation: !inScope(ctx, m.m.locationId),
    lastVisit: last?.at ?? null, prizes: prizes.map((x) => ({ id: x.p.id, description: x.p.description, challenge: x.ch, code: x.p.code })),
  };
}
export async function checkIn(actorId: string, orgId: string, token: string, locationId: string) {
  const ctx = await deskCtx(actorId, orgId);
  const c = readCard(token);
  if (!c || c.expired) throw new AccessError("invalid_card", "Carnet inválido o vencido.");
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, c.id), eq(gymMember.orgId, orgId), eq(gymMember.status, "active")));
  if (!m) throw new AccessError("invalid_card", "El socio no está activo en este gym.");
  // Un ingreso por persona y sede cada 2 horas (evita duplicados por doble lectura).
  const [dup] = await db.select().from(attendance).where(and(eq(attendance.gymMemberId, m.id), eq(attendance.locationId, locationId), gte(attendance.at, new Date(Date.now() - 2 * 3_600_000))));
  if (dup) return { duplicate: true, at: dup.at };
  // D127: con el control de acceso activo, el ingreso en recepción también habilita el entrenamiento presencial (y registra la asistencia).
  const { policyOf, staffCheckin } = await import("../gym/access-control");
  if ((await policyOf(orgId)).enabled) {
    const r = await staffCheckin(actorId, orgId, { gymMemberId: m.id, locationId, method: "desk" });
    return { duplicate: r.duplicate, at: r.pass.issuedAt ?? new Date(), presence: { expiresAt: r.pass.expiresAt } };
  }
  const [row] = await db.insert(attendance).values({ orgId, locationId, gymMemberId: m.id, source: "recepcion_qr", recordedBy: actorId }).returning();
  return { duplicate: false, at: row.at };
}
export async function deliverPrize(actorId: string, orgId: string, prizeId: string) {
  await deskCtx(actorId, orgId);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(prize).where(and(eq(prize.id, prizeId), eq(prize.orgId, orgId))).for("update");
    if (!p) throw NOT_FOUND();
    if (p.status === "delivered") throw new AccessError("delivered", "Este premio ya fue entregado.", 409);
    await tx.update(prize).set({ status: "delivered", deliveredBy: actorId, deliveredAt: new Date() }).where(eq(prize.id, p.id));
    await tx.insert(memberNotice).values({ userId: p.userId, orgId, kind: "prize_delivered", refId: p.id, title: "Premio entregado", body: `${p.description}. ¡Felicitaciones!` });
    await audit(tx, { actorUserId: actorId, orgId, action: "prize.delivered", resourceType: "prize", resourceId: p.id });
    return { ok: true };
  });
}

// ── Socio: pestaña Gym (SCR-M-19..25) ───────────────────────────────────────
export async function myGymHome(userId: string, orgId?: string | null, now = new Date()) {
  const r = await myGym(userId, orgId);
  await closeExpired(r.org.id, now);
  const today = localDate(now);
  const here = or(isNull(communityPost.locationId), eq(communityPost.locationId, r.loc.id));
  const posts = await db.select().from(communityPost).where(and(eq(communityPost.orgId, r.org.id), isNull(communityPost.deletedAt), here,
    or(isNull(communityPost.validUntil), gte(communityPost.validUntil, today)))).orderBy(desc(communityPost.createdAt)).limit(30);
  const chs = await db.select().from(challenge).where(and(eq(challenge.orgId, r.org.id), or(isNull(challenge.locationId), eq(challenge.locationId, r.loc.id)),
    or(eq(challenge.status, "active"), and(eq(challenge.status, "closed"), gte(challenge.closedAt, addDays(now, -30)))))).orderBy(asc(challenge.status), asc(challenge.endsOn));
  const mine = chs.length ? await db.select().from(challengeAttempt).where(and(eq(challengeAttempt.userId, userId), inArray(challengeAttempt.challengeId, chs.map((c) => c.id)))).orderBy(desc(challengeAttempt.createdAt)) : [];
  const holders = await recordHolders(chs.map((c) => c.recordAttemptId).filter(Boolean) as string[]);
  const items = await db.select().from(catalogItem).where(and(eq(catalogItem.orgId, r.org.id), isNull(catalogItem.deletedAt), or(isNull(catalogItem.locationId), eq(catalogItem.locationId, r.loc.id))))
    .orderBy(desc(catalogItem.highlighted), asc(catalogItem.category), asc(catalogItem.name));
  const ach = await db.select().from(achievement).where(and(eq(achievement.userId, userId), or(isNull(achievement.orgId), eq(achievement.orgId, r.org.id)))).orderBy(asc(achievement.createdAt));
  const notices = await db.select().from(memberNotice).where(and(eq(memberNotice.userId, userId), or(isNull(memberNotice.orgId), eq(memberNotice.orgId, r.org.id)))).orderBy(desc(memberNotice.createdAt)).limit(20);
  const onFloor = await db.select({ name: user.name }).from(shiftLog).innerJoin(user, eq(user.id, shiftLog.userId)).where(and(eq(shiftLog.locationId, r.loc.id), isNull(shiftLog.endedAt)));
  const prizes = await db.select({ n: sql<number>`count(*)::int` }).from(prize).where(and(eq(prize.userId, userId), eq(prize.orgId, r.org.id), eq(prize.status, "ready")));
  const lv = levelOf(ach.length);
  const locked = chs.filter((c) => c.status === "active" && !ach.some((a) => a.kind === "challenge_validated" && a.sourceKey === c.id));
  return {
    org: { id: r.org.id, name: r.org.name }, location: { id: r.loc.id, name: r.loc.name, receptionHours: r.loc.receptionHours }, safety: SAFETY_NOTE,
    minorRestricted: await minorWithoutGuardian(userId),
    onFloor: onFloor.map((x) => x.name.split(" ")[0]),
    posts: posts.map((p) => ({ id: p.id, type: p.type, title: p.title, text: p.text, badge: p.badge, imageId: p.imageId, validUntil: p.validUntil, at: p.createdAt })),
    challenges: chs.map((c) => {
      const my = mine.filter((a) => a.challengeId === c.id);
      const approved = my.filter((a) => a.status === "approved").map((a) => ({ memberId: userId, value: a.valueX10, at: a.createdAt }));
      const best = bestByMember(approved, c.lowerIsBetter)[0];
      const last = my[0];
      return {
        id: c.id, title: c.title, rule: c.rule, unit: c.unit as ChallengeUnit, lowerIsBetter: c.lowerIsBetter, category: c.category, prize: c.prize, endsOn: c.endsOn, status: c.status,
        record: fmtValue(v10(c.recordValue), c.unit), holder: c.recordAttemptId ? holders.get(c.recordAttemptId) ?? null : null, myBest: best ? fmtValue(v10(best.value), c.unit) : null,
        last: last ? { status: last.status, reason: last.reason, value: fmtValue(v10(last.valueX10), c.unit), method: last.method } : null,
      };
    }),
    catalog: items.map((i) => ({ id: i.id, category: i.category, name: i.name, priceArs: i.priceArs, promo: i.promo, highlighted: i.highlighted, available: i.available, imageId: i.imageId })),
    achievements: ach.map((a) => ({ id: a.id, kind: a.kind, title: a.title, detail: a.detail, at: a.createdAt, unseen: !a.seenAt })),
    locked: locked.map((c) => ({ title: c.title, detail: "Por superar" })),
    level: lv, readyPrizes: prizes[0]?.n ?? 0,
    notices: notices.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, at: n.createdAt, unseen: !n.seenAt })),
  };
}

export async function markNoticesSeen(userId: string) {
  const now = new Date();
  await db.update(memberNotice).set({ seenAt: now }).where(and(eq(memberNotice.userId, userId), isNull(memberNotice.seenAt)));
  await db.update(achievement).set({ seenAt: now }).where(and(eq(achievement.userId, userId), isNull(achievement.seenAt)));
}

/** Intento de récord: con video, o (D165) «en sala»: sin video, lo valida en persona un profe con turno en la sede. */
export async function submitAttempt(userId: string, p: { challengeId: string; value: number; division?: string | null; videoId?: string | null; inPerson?: boolean; confirm: boolean }) {
  const [c] = await db.select().from(challenge).where(eq(challenge.id, p.challengeId));
  if (!c) throw NOT_FOUND();
  const r = await myGym(userId, c.orgId).catch(() => { throw NOT_FOUND(); });
  if (c.locationId && c.locationId !== r.loc.id) throw NOT_FOUND();
  if (c.status !== "active" || c.endsOn < todayAr()) throw new AccessError("closed", "Este desafío ya terminó.", 409);
  { const { requireGymAction } = await import("../gym/access-control"); await requireGymAction({ userId, orgId: c.orgId, action: "gym.challenge.attempt" }); } // D127 (sólo modo estricto configurado)
  if (await minorWithoutGuardian(userId)) throw new AccessError("minor", "Los videos de récord se habilitan cuando tu adulto responsable lo autorice.", 403);
  if (!p.confirm) throw new AccessError("invalid", p.inPerson ? "Confirmá que vas a hacer el intento frente a un profe." : "Confirmá que el video es tuyo y muestra el intento completo.");
  if (!attemptValueOk(c.unit, p.value)) throw new AccessError("invalid", "Ingresá una marca válida.");
  if (p.division != null && !isDivision(p.division)) throw new AccessError("invalid", "Categoría inválida.");
  let videoId: string | null = null;
  if (!p.inPerson) {
    if (!p.videoId) throw new AccessError("invalid", "Subí el video del intento.");
    const [v] = await db.select().from(mediaObject).where(and(eq(mediaObject.id, p.videoId), eq(mediaObject.ownerUserId, userId), eq(mediaObject.purpose, "attempt_video"), eq(mediaObject.orgId, c.orgId), isNull(mediaObject.deletedAt)));
    const used = await db.select({ id: challengeAttempt.id }).from(challengeAttempt).where(eq(challengeAttempt.videoId, p.videoId));
    if (!v || used.length) throw new AccessError("invalid", "Subí el video del intento.");
    videoId = v.id;
  }
  try {
    const [a] = await db.insert(challengeAttempt).values({ challengeId: c.id, orgId: c.orgId, gymMemberId: r.m.id, userId, valueX10: x10(p.value), division: (p.division as Division) ?? null, videoId, method: p.inPerson ? "in_person" : "video" }).returning();
    await audit(db, { actorUserId: userId, orgId: c.orgId, action: "attempt.submitted", resourceType: "challenge_attempt", resourceId: a.id, meta: { method: a.method } });
    return { id: a.id };
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw new AccessError("pending", "Ya tenés un intento esperando validación en este desafío.", 409);
    throw e;
  }
}

/**
 * Ranking del desafío: sólo marcas validadas, mejor por persona. El nombre se muestra sólo si la persona aceptó
 * "Participar en desafíos y rankings" en su consentimiento con el gym; si no, figura como "Socio/a".
 */
export async function challengeRanking(userId: string, challengeId: string, filter: string, now = new Date()) {
  const [c] = await db.select().from(challenge).where(eq(challenge.id, challengeId));
  if (!c) throw NOT_FOUND();
  await myGym(userId, c.orgId).catch(() => { throw NOT_FOUND(); });
  const rows = await db.select({ a: challengeAttempt, name: user.name, birth: user.birthDate }).from(challengeAttempt).innerJoin(user, eq(user.id, challengeAttempt.userId))
    .where(and(eq(challengeAttempt.challengeId, c.id), eq(challengeAttempt.status, "approved")));
  const consent = rows.length ? new Set((await db.select({ rel: consentGrant.relationId }).from(consentGrant)
    .where(and(inArray(consentGrant.relationId, [...new Set(rows.map((r) => r.a.gymMemberId))]), eq(consentGrant.item, "rankings"), eq(consentGrant.status, "active")))).map((x) => x.rel)) : new Set<string>();
  const filtered = rows.filter((r) => filter === "F" || filter === "M" ? r.a.division === filter : filter === "40" ? (ageAt(r.birth, now) ?? 0) >= 40 : true);
  const best = bestByMember(filtered.map((r) => ({ memberId: r.a.userId, value: r.a.valueX10, at: r.a.createdAt, row: r })), c.lowerIsBetter);
  return {
    title: c.title, unit: c.unit, filters: { all: "Todas", F: "Mujeres", M: "Hombres", "40": "+40" },
    rows: best.slice(0, 20).map((b, i) => ({
      pos: i + 1, me: b.memberId === userId, value: fmtValue(v10(b.value), c.unit as ChallengeUnit),
      name: b.memberId === userId ? "Vos" : consent.has(b.row.a.gymMemberId) ? shortName(b.row.name) : "Socio/a",
      division: b.row.a.division,
    })),
    note: "Sólo marcas validadas por el gym, con video o en sala. Tu nombre aparece si aceptaste participar en rankings.",
  };
}

/** Entrenadores en sala ahora (F-HX-16) y ficha del socio con intentos y logros (F-HX-15). */
export async function memberCommunitySummary(orgId: string, gymMemberId: string) {
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m) return null;
  const attempts = await db.select({ a: challengeAttempt, c: challenge }).from(challengeAttempt).innerJoin(challenge, eq(challenge.id, challengeAttempt.challengeId))
    .where(and(eq(challengeAttempt.gymMemberId, m.id), ne(challengeAttempt.status, "rejected"))).orderBy(desc(challengeAttempt.createdAt)).limit(5);
  const ach = await db.select().from(achievement).where(and(eq(achievement.userId, m.userId), eq(achievement.orgId, orgId)));
  const visits = await db.select({ n: sql<number>`count(*)::int` }).from(attendance).where(and(eq(attendance.gymMemberId, m.id), gte(attendance.at, addDays(new Date(), -30))));
  return {
    attempts: attempts.map((x) => ({ challenge: x.c.title, value: fmtValue(v10(x.a.valueX10), x.c.unit), status: x.a.status, newRecord: x.a.newRecord, at: x.a.createdAt })),
    achievements: ach.length, level: levelOf(ach.length).level, visits30: visits[0]?.n ?? 0,
  };
}
