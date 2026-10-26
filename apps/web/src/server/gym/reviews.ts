// Reseñas verificadas y moderación (F-RV-01..06, F-GP-04). DEC-08: el entrenador ve sin nombre; gerencia con nombre;
// otros socios no. El staff nunca edita el texto del socio. Retiradas no cuentan en agregados.
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { REVIEW_APPEAL_DAYS, TASK_CATEGORY, gymCan, reviewAggregate, starsOk, type ReviewStatus, type TaskCategory } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit } from "../access/util";
import { NOT_FOUND, gymContext, inScope, need, nextNumber, scopedLocations } from "./services";

const { user, organization, gymLocation, gymTask, reviewInvite, review, moderationCase, moderationLog, auditEvent } = schema;

// ── Socio ───────────────────────────────────────────────────────────────────
async function expireInvites(now = new Date()) {
  await db.update(reviewInvite).set({ status: "expired" }).where(and(eq(reviewInvite.status, "pending"), lt(reviewInvite.expiresAt, now)));
}

export async function myReviewInvites(userId: string) {
  await expireInvites();
  const rows = await db.select({ i: reviewInvite, trainer: user.name, org: organization.name, loc: gymLocation.name }).from(reviewInvite)
    .innerJoin(user, eq(user.id, reviewInvite.trainerUserId)).innerJoin(organization, eq(organization.id, reviewInvite.orgId)).innerJoin(gymLocation, eq(gymLocation.id, reviewInvite.locationId))
    .where(and(eq(reviewInvite.memberUserId, userId), eq(reviewInvite.status, "pending"))).orderBy(desc(reviewInvite.createdAt));
  return rows.map((r) => ({ id: r.i.id, trainer: r.trainer, kind: TASK_CATEGORY[r.i.category as TaskCategory] ?? r.i.category, place: `${r.org} · ${r.loc}`, expiresAt: r.i.expiresAt }));
}

export async function myGivenReviews(userId: string) {
  const rows = await db.select({ r: review, trainer: user.name }).from(review).innerJoin(user, eq(user.id, review.trainerUserId))
    .where(eq(review.memberUserId, userId)).orderBy(desc(review.createdAt)).limit(20);
  return rows.map(({ r, trainer }) => ({
    id: r.id, trainer, kind: TASK_CATEGORY[r.category as TaskCategory] ?? r.category, stars: r.stars, text: r.text, at: r.createdAt,
    status: r.status, response: r.status === "removed" ? null : r.response,
  }));
}

export async function submitReview(userId: string, inviteId: string, p: { stars: number; dims?: (number | null)[]; text?: string | null }) {
  if (!starsOk(p.stars)) throw new AccessError("invalid", "Elegí una calificación general.");
  const dims = [0, 1, 2].map((i) => (p.dims?.[i] != null ? p.dims[i] : null));
  if (dims.some((d) => d !== null && !starsOk(d))) throw new AccessError("invalid", "Las dimensiones van de 1 a 5.");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(reviewInvite).where(and(eq(reviewInvite.id, inviteId), eq(reviewInvite.memberUserId, userId))).for("update");
    if (!inv) throw NOT_FOUND();
    if (inv.status === "done") throw new AccessError("duplicate", "Ya opinaste sobre esta atención.", 409);
    if (inv.status !== "pending" || inv.expiresAt < new Date()) throw new AccessError("expired", "Esta invitación ya no está disponible.", 409);
    const [r] = await tx.insert(review).values({
      inviteId: inv.id, orgId: inv.orgId, locationId: inv.locationId, trainerUserId: inv.trainerUserId, memberUserId: userId, category: inv.category,
      stars: p.stars, dim1: dims[0], dim2: dims[1], dim3: dims[2], text: p.text?.trim().slice(0, 800) || null,
    }).returning();
    await tx.update(reviewInvite).set({ status: "done" }).where(eq(reviewInvite.id, inv.id));
    await audit(tx, { actorUserId: userId, orgId: inv.orgId, action: "review.submitted", resourceType: "review", resourceId: r.id });
    return { id: r.id };
  });
}

export async function dismissInvite(userId: string, inviteId: string) {
  const r = await db.update(reviewInvite).set({ status: "dismissed" }).where(and(eq(reviewInvite.id, inviteId), eq(reviewInvite.memberUserId, userId), eq(reviewInvite.status, "pending"))).returning();
  if (!r.length) throw NOT_FOUND();
  return { ok: true };
}

// ── Entrenador ──────────────────────────────────────────────────────────────
const dimsOf = (r: typeof review.$inferSelect) => [r.dim1, r.dim2, r.dim3];

export async function myTrainerReviews(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "perf.own");
  const rows = await db.select().from(review).where(and(eq(review.orgId, orgId), eq(review.trainerUserId, actorId))).orderBy(desc(review.createdAt)).limit(50);
  const cases = rows.length ? await db.select().from(moderationCase).where(inArray(moderationCase.reviewId, rows.map((r) => r.id))) : [];
  return {
    responsesEnabled: ctx.org.reviewResponses,
    aggregate: reviewAggregate(rows.map((r) => ({ stars: r.stars, dims: dimsOf(r), status: r.status as ReviewStatus }))),
    reviews: rows.filter((r) => r.status !== "removed").map((r) => ({
      id: r.id, stars: r.stars, dims: dimsOf(r), kind: TASK_CATEGORY[r.category as TaskCategory] ?? r.category, at: r.createdAt,
      text: r.status === "published" ? r.text : null, // reportada o en edición: el texto queda fuera de vista mientras se modera
      status: r.status, response: r.response, caseRef: cases.find((c) => c.reviewId === r.id) ? `MC-${cases.find((c) => c.reviewId === r.id)!.number}` : null,
    })), // sin nombre del socio (DEC-08)
  };
}

export async function respondReview(actorId: string, orgId: string, reviewId: string, text: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "perf.own");
  if (!ctx.org.reviewResponses) throw new AccessError("disabled", "El gym desactivó las respuestas a reseñas.", 403);
  const t = (text ?? "").trim();
  if (t.length < 2) throw new AccessError("invalid", "Escribí tu respuesta.");
  const r = await db.update(review).set({ response: t.slice(0, 600), respondedAt: new Date() })
    .where(and(eq(review.id, reviewId), eq(review.orgId, orgId), eq(review.trainerUserId, actorId), eq(review.status, "published"), isNull(review.response))).returning();
  if (!r.length) throw new AccessError("invalid", "Esta reseña no admite respuesta.", 409);
  await audit(db, { actorUserId: actorId, orgId, action: "review.responded", resourceType: "review", resourceId: reviewId });
  return { ok: true };
}

/** Reportar reseña o disputar atribución: abre un caso para quien modera (por capacidad, no por título). */
export async function openCase(actorId: string, orgId: string, p: { type: "review_report" | "attribution"; refId: string; reason: string; detail?: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "perf.own");
  const reason = (p.reason ?? "").trim();
  if (reason.length < 3) throw new AccessError("invalid", "Elegí un motivo.");
  return db.transaction(async (tx) => {
    let locationId: string;
    if (p.type === "review_report") {
      const [r] = await tx.select().from(review).where(and(eq(review.id, p.refId), eq(review.orgId, orgId), eq(review.trainerUserId, actorId))).for("update");
      if (!r) throw NOT_FOUND();
      if (r.status !== "published") throw new AccessError("invalid", "Esta reseña ya está en moderación.", 409);
      await tx.update(review).set({ status: "reported" }).where(eq(review.id, r.id));
      locationId = r.locationId;
    } else {
      const [t] = await tx.select().from(gymTask).where(and(eq(gymTask.id, p.refId), eq(gymTask.orgId, orgId), eq(gymTask.completedBy, actorId)));
      if (!t) throw NOT_FOUND();
      const [open] = await tx.select({ id: moderationCase.id }).from(moderationCase).where(and(eq(moderationCase.taskId, t.id), inArray(moderationCase.status, ["open", "in_review", "appealed"])));
      if (open) throw new AccessError("invalid", "Ya hay una disputa abierta para esta tarea.", 409);
      locationId = t.locationId;
    }
    const number = await nextNumber(tx, "moderation_case", orgId);
    const [c] = await tx.insert(moderationCase).values({
      number, orgId, locationId, type: p.type, reviewId: p.type === "review_report" ? p.refId : null, taskId: p.type === "attribution" ? p.refId : null,
      openedBy: actorId, reason: reason.slice(0, 120), detail: p.detail?.trim().slice(0, 600) || null,
    }).returning();
    await tx.insert(moderationLog).values({ caseId: c.id, actorUserId: actorId, text: `${p.type === "attribution" ? "Disputa enviada" : "Reportada"} por ${ctx.name}` });
    if (p.type === "review_report") await tx.insert(moderationLog).values({ caseId: c.id, actorUserId: actorId, text: "Texto oculto al entrenador mientras se modera" });
    await audit(tx, { actorUserId: actorId, orgId, action: "moderation.opened", resourceType: "moderation_case", resourceId: c.id, meta: { type: p.type } });
    return { ref: `MC-${c.number}` };
  });
}

export async function myAttributions(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "perf.own");
  const rows = await db.select({ t: gymTask, member: user.name }).from(gymTask).leftJoin(schema.gymMember, eq(schema.gymMember.id, gymTask.gymMemberId)).leftJoin(user, eq(user.id, schema.gymMember.userId))
    .where(and(eq(gymTask.orgId, orgId), eq(gymTask.completedBy, actorId))).orderBy(desc(gymTask.completedAt)).limit(10);
  const cases = await db.select().from(moderationCase).where(and(eq(moderationCase.orgId, orgId), eq(moderationCase.openedBy, actorId))).orderBy(desc(moderationCase.createdAt)).limit(20);
  return {
    attributions: rows.map((r) => ({ taskId: r.t.id, ref: `T-${r.t.number}`, label: `${TASK_CATEGORY[r.t.category]}${r.member ? ` · ${r.member}` : ""}`, at: r.t.completedAt, offShift: r.t.completedOffShift, disputed: cases.some((c) => c.taskId === r.t.id && c.status !== "resolved") })),
    cases: cases.map((c) => ({
      id: c.id, ref: `MC-${c.number}`, type: c.type, reason: c.reason, status: c.status, outcome: c.outcome, at: c.createdAt,
      canAppeal: c.status === "resolved" && !!c.appealUntil && c.appealUntil > new Date(), appealUntil: c.appealUntil,
    })),
  };
}

export async function appealCase(actorId: string, orgId: string, caseId: string, text: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "perf.own");
  const t = (text ?? "").trim();
  if (t.length < 3) throw new AccessError("invalid", "Contá por qué apelás.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(moderationCase).where(and(eq(moderationCase.id, caseId), eq(moderationCase.orgId, orgId), eq(moderationCase.openedBy, actorId))).for("update");
    if (!c) throw NOT_FOUND();
    if (c.status !== "resolved" || !c.appealUntil || c.appealUntil < new Date()) throw new AccessError("invalid", "Este caso ya no admite apelación.", 409);
    await tx.update(moderationCase).set({ status: "appealed", appealUntil: null }).where(eq(moderationCase.id, c.id));
    await tx.insert(moderationLog).values({ caseId: c.id, actorUserId: actorId, text: `Apelación de ${ctx.name}: ${t.slice(0, 300)}` });
    return { ok: true };
  });
}

// ── Gerencia ────────────────────────────────────────────────────────────────
export async function reviewAnalytics(actorId: string, orgId: string, locationId: string | null, days = 90, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reviews.read_named");
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const from = addDays(now, -days);
  const rows = await db.select({ r: review, member: user.name }).from(review).innerJoin(user, eq(user.id, review.memberUserId))
    .where(and(inArray(review.locationId, ids), gte(review.createdAt, from))).orderBy(desc(review.createdAt));
  const trainers = rows.length ? new Map((await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(rows.map((r) => r.r.trainerUserId))]))).map((u) => [u.id, u.name])) : new Map<string, string>();
  const agg = reviewAggregate(rows.map(({ r }) => ({ stars: r.stars, dims: dimsOf(r), status: r.status as ReviewStatus })));
  // Tendencia mensual (sólo meses con datos; promedio oculto con muestra chica).
  const months = new Map<string, typeof rows>();
  for (const x of rows) { const k = x.r.createdAt.toISOString().slice(0, 7); months.set(k, [...(months.get(k) ?? []), x]); }
  const trend = [...months.entries()].sort().map(([k, xs]) => ({ month: k, ...reviewAggregate(xs.map(({ r }) => ({ stars: r.stars, dims: dimsOf(r), status: r.status as ReviewStatus }))) }))
    .map((m) => ({ month: m.month, n: m.n, avg: m.avg }));
  // Una constancia de consulta cada 10 minutos por persona (evita ruido por recargas).
  const [recent] = await db.select({ id: auditEvent.id }).from(auditEvent)
    .where(and(eq(auditEvent.actorUserId, actorId), eq(auditEvent.orgId, orgId), eq(auditEvent.action, "reviews.viewed"), gte(auditEvent.at, new Date(now.getTime() - 600_000)))).limit(1);
  if (!recent) await audit(db, { actorUserId: actorId, orgId, action: "reviews.viewed", resourceType: "review_analytics", meta: { locations: ids.length, days } });
  return {
    days, aggregate: agg, trend,
    reviews: rows.filter((x) => x.r.status === "published").slice(0, 30).map(({ r, member }) => ({
      id: r.id, stars: r.stars, dims: dimsOf(r), text: r.text, kind: TASK_CATEGORY[r.category as TaskCategory] ?? r.category, at: r.createdAt,
      member, trainer: trainers.get(r.trainerUserId) ?? "", response: r.response,
    })),
  };
}

export async function listCases(actorId: string, orgId: string, locationId: string | null) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reviews.moderate");
  const ids = (await scopedLocations(ctx, locationId)).map((l) => l.id);
  const rows = await db.select().from(moderationCase).where(inArray(moderationCase.locationId, ids)).orderBy(desc(moderationCase.createdAt)).limit(50);
  const users = rows.length ? new Map((await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [...new Set(rows.flatMap((r) => [r.openedBy, r.resolvedBy].filter(Boolean) as string[]))]))).map((u) => [u.id, u.name])) : new Map<string, string>();
  return rows.map((c) => ({ id: c.id, ref: `MC-${c.number}`, type: c.type, reason: c.reason, by: users.get(c.openedBy) ?? "", status: c.status, outcome: c.outcome, at: c.createdAt }));
}

export async function caseDetail(actorId: string, orgId: string, caseId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reviews.moderate");
  const [c] = await db.select().from(moderationCase).where(and(eq(moderationCase.id, caseId), eq(moderationCase.orgId, orgId)));
  if (!c || !inScope(ctx, c.locationId)) throw NOT_FOUND();
  const log = await db.select({ l: moderationLog, who: user.name }).from(moderationLog).innerJoin(user, eq(user.id, moderationLog.actorUserId)).where(eq(moderationLog.caseId, c.id)).orderBy(moderationLog.at);
  let rev = null; let task = null;
  if (c.reviewId) {
    const [r] = await db.select({ r: review, member: user.name }).from(review).innerJoin(user, eq(user.id, review.memberUserId)).where(eq(review.id, c.reviewId));
    if (r) rev = { stars: r.r.stars, text: r.r.text, kind: TASK_CATEGORY[r.r.category as TaskCategory] ?? r.r.category, at: r.r.createdAt, member: r.member, status: r.r.status };
  }
  if (c.taskId) {
    const [t] = await db.select().from(gymTask).where(eq(gymTask.id, c.taskId));
    if (t) task = { ref: `T-${t.number}`, label: TASK_CATEGORY[t.category], completedAt: t.completedAt };
  }
  const [opener] = await db.select({ name: user.name }).from(user).where(eq(user.id, c.openedBy));
  const opened = `${ctx.name} tomó el caso`;
  if (!log.some((x) => x.l.actorUserId === actorId && x.l.text === opened)) {
    await db.insert(moderationLog).values({ caseId: c.id, actorUserId: actorId, text: opened });
    log.push({ l: { id: "", caseId: c.id, actorUserId: actorId, text: opened, at: new Date() }, who: ctx.name });
    if (c.status === "open") await db.update(moderationCase).set({ status: "in_review" }).where(eq(moderationCase.id, c.id));
  }
  await audit(db, { actorUserId: actorId, orgId, action: "moderation.viewed", resourceType: "moderation_case", resourceId: c.id });
  return {
    id: c.id, ref: `MC-${c.number}`, type: c.type, reason: c.reason, detail: c.detail, status: c.status, outcome: c.outcome, by: opener?.name ?? "", at: c.createdAt,
    review: rev, task, log: log.map((x) => ({ at: x.l.at, text: x.l.text })),
    staffEditsText: false, // el staff nunca edita el texto del socio
  };
}

/** Resolver: mantener / retirar / pedir edición al socio (reseñas) o corregir/rechazar (atribución). Con log y ventana de apelación. */
export async function resolveCase(actorId: string, orgId: string, caseId: string, p: { outcome: "keep" | "remove" | "edit" | "fix" | "reject"; note?: string | null; fixToUserId?: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reviews.moderate");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(moderationCase).where(and(eq(moderationCase.id, caseId), eq(moderationCase.orgId, orgId))).for("update");
    if (!c || !inScope(ctx, c.locationId)) throw NOT_FOUND();
    if (c.status === "resolved") throw new AccessError("closed", "Este caso ya está resuelto.", 409);
    const valid = c.type === "review_report" ? ["keep", "remove", "edit"] : ["fix", "reject"];
    if (!valid.includes(p.outcome)) throw new AccessError("invalid", "Resultado inválido para este caso.");
    if (c.reviewId) {
      const status: ReviewStatus = p.outcome === "remove" ? "removed" : p.outcome === "edit" ? "edit_requested" : "published";
      await tx.update(review).set({ status }).where(eq(review.id, c.reviewId));
    }
    if (c.taskId && p.outcome === "fix") {
      // Corrige la atribución: a otra persona de la sala o sin atribución (no cuenta para nadie).
      await tx.update(gymTask).set({ completedBy: p.fixToUserId ?? null }).where(eq(gymTask.id, c.taskId));
    }
    const label = { keep: "se mantiene", remove: "retirada", edit: "edición pedida al socio", fix: "atribución corregida", reject: "disputa rechazada" }[p.outcome];
    const final = c.status === "appealed";
    await tx.update(moderationCase).set({ status: "resolved", outcome: p.outcome, resolvedBy: actorId, resolvedAt: new Date(), appealUntil: final ? null : addDays(new Date(), REVIEW_APPEAL_DAYS) }).where(eq(moderationCase.id, c.id));
    await tx.insert(moderationLog).values({ caseId: c.id, actorUserId: actorId, text: `${ctx.name}: resuelta · ${label}${p.note?.trim() ? ` — ${p.note.trim().slice(0, 300)}` : ""}${final ? " (decisión final tras apelación)" : ""}` });
    await audit(tx, { actorUserId: actorId, orgId, action: "moderation.resolved", resourceType: "moderation_case", resourceId: c.id, meta: { outcome: p.outcome } });
    return { ref: `MC-${c.number}`, label };
  });
}

/** Historial de accesos del gym (reseñas, moderación, intentos sobre datos privados). Sin contenido sensible. */
export async function accessHistory(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "reviews.moderate");
  const rows = await db.select({ e: auditEvent, who: user.name }).from(auditEvent).leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(and(eq(auditEvent.orgId, orgId), or(sql`${auditEvent.action} like 'moderation.%'`, sql`${auditEvent.action} like 'review%'`, eq(auditEvent.action, "private.read_attempt"))))
    .orderBy(desc(auditEvent.at)).limit(40);
  const T: Record<string, string> = {
    "moderation.opened": "abrió un caso de moderación", "moderation.viewed": "revisó un caso", "moderation.resolved": "resolvió un caso",
    "reviews.viewed": "consultó el análisis de reseñas", "review.submitted": "dejó una reseña", "review.responded": "respondió una reseña",
    "private.read_attempt": "intentó abrir datos privados de un entrenador · acceso denegado",
  };
  return rows.map((r) => ({ at: r.e.at, text: `${r.e.action === "review.submitted" ? "Un socio" : r.who ?? "Alguien"} ${T[r.e.action] ?? r.e.action}`, result: r.e.result }));
}

export const canModerate = (roles: string[]) => gymCan(roles, "reviews.moderate");
