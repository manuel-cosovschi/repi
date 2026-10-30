// Repi Club del gym (F-RC-01..05). Especificado sin diseño (15_REPI_CLUB.md): se implementa un núcleo propio.
// Participación voluntaria; nunca datos de salud; sin enlaces; reportes, bloqueo y moderación del gym con historial.
// El ranking usa sólo sesiones del programa institucional del gym y asistencia: nunca la relación con un coach privado.
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { CLUB_AUTOHIDE_REPORTS, CLUB_COMMENT_MAX, CLUB_POST_MAX, CLUB_RATE, classifyAge, clubName, clubRanking, epley1rm, hasLink, liftRanking, localDate, parseReps, volumeKg } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit } from "../access/util";
import { NOT_FOUND, gymContext, need } from "../gym/services";

const { user, gymMember, achievement, workoutSession, attendance, clubMember, clubPost, clubReaction, clubComment, clubReport, clubBlock, clubProfile, setLog, exercise, programExercise } = schema;

async function activeMember(userId: string, orgId: string) {
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.orgId, orgId), eq(gymMember.status, "active")));
  if (!m) throw NOT_FOUND();
  return m;
}
async function joined(userId: string, orgId: string) {
  await activeMember(userId, orgId);
  const [c] = await db.select().from(clubMember).where(and(eq(clubMember.orgId, orgId), eq(clubMember.userId, userId), isNull(clubMember.leftAt)));
  if (!c) throw new AccessError("not_joined", "Sumate a Repi Club para ver y publicar.", 403);
  return c;
}

export async function clubState(userId: string, orgId: string) {
  await activeMember(userId, orgId);
  const [c] = await db.select().from(clubMember).where(and(eq(clubMember.orgId, orgId), eq(clubMember.userId, userId)));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(clubMember).where(and(eq(clubMember.orgId, orgId), isNull(clubMember.leftAt)));
  return { joined: !!c && !c.leftAt, showName: c?.showName ?? true, inRanking: c?.inRanking ?? false, members: n };
}

/**
 * SEC-6 (QA 29/10): un menor sin consentimiento aprobado de su adulto responsable no aparece en rankings (tampoco en la
 * pantalla de la sala), igual que en los desafíos. Se filtra al leer: cubre también un consentimiento que se revoca después.
 */
async function withoutRestrictedMinors<T extends { userId: string }>(rows: T[], now = new Date()) {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((r) => r.userId))];
  const born = await db.select({ id: user.id, birth: user.birthDate }).from(user).where(inArray(user.id, ids));
  const minors = born.filter((u) => u.birth && classifyAge(u.birth, localDate(now)) === "minor").map((u) => u.id);
  if (!minors.length) return rows;
  const ok = new Set((await db.select({ id: schema.guardianConsent.minorUserId }).from(schema.guardianConsent)
    .where(and(inArray(schema.guardianConsent.minorUserId, minors), eq(schema.guardianConsent.status, "approved")))).map((g) => g.id));
  const blocked = new Set(minors.filter((id) => !ok.has(id)));
  return rows.filter((r) => !blocked.has(r.userId));
}

export async function joinClub(userId: string, orgId: string, p: { showName: boolean; inRanking: boolean }) {
  await activeMember(userId, orgId);
  if (p.inRanking && !(await withoutRestrictedMinors([{ userId }])).length)
    throw new AccessError("guardian_required", "Para aparecer en el ranking hace falta el consentimiento de tu adulto responsable.");
  await db.insert(clubMember).values({ orgId, userId, showName: !!p.showName, inRanking: !!p.inRanking })
    .onConflictDoUpdate({ target: [clubMember.orgId, clubMember.userId], set: { showName: !!p.showName, inRanking: !!p.inRanking, leftAt: null } });
  await audit(db, { actorUserId: userId, orgId, action: "club.joined", resourceType: "club_member", meta: { showName: !!p.showName, inRanking: !!p.inRanking } });
  return clubState(userId, orgId);
}
/** D168: sumarse al ranking desde una invitación de REPI, sin tocar cómo figura el nombre (si es nuevo en el Club, nombre e inicial). */
export async function optIntoRanking(userId: string, orgId: string) {
  const [c] = await db.select().from(clubMember).where(and(eq(clubMember.orgId, orgId), eq(clubMember.userId, userId)));
  return joinClub(userId, orgId, { showName: c && !c.leftAt ? c.showName : true, inRanking: true });
}
/** Salir: deja de aparecer en el ranking y sus publicaciones y comentarios se ocultan (no se borran: siguen siendo suyos). */
export async function leaveClub(userId: string, orgId: string) {
  await joined(userId, orgId);
  await db.update(clubMember).set({ leftAt: new Date(), inRanking: false }).where(and(eq(clubMember.orgId, orgId), eq(clubMember.userId, userId)));
  return { ok: true };
}

const blockedSets = async (userId: string) => {
  const rows = await db.select().from(clubBlock).where(or(eq(clubBlock.userId, userId), eq(clubBlock.blockedUserId, userId)));
  return new Set(rows.map((r) => (r.userId === userId ? r.blockedUserId : r.userId)));
};

export async function feed(userId: string, orgId: string, before?: string | null) {
  await joined(userId, orgId);
  const blocked = await blockedSets(userId);
  const b = before ? new Date(before) : null;
  const rows = await db.select({ p: clubPost, name: user.name, show: clubMember.showName, a: achievement }).from(clubPost)
    .innerJoin(user, eq(user.id, clubPost.userId))
    .innerJoin(clubMember, and(eq(clubMember.orgId, clubPost.orgId), eq(clubMember.userId, clubPost.userId)))
    .leftJoin(achievement, eq(achievement.id, clubPost.achievementId))
    .where(and(eq(clubPost.orgId, orgId), or(eq(clubPost.status, "visible"), eq(clubPost.userId, userId)), ne(clubPost.status, "removed"), isNull(clubMember.leftAt),
      b && !Number.isNaN(b.getTime()) ? lt(clubPost.createdAt, b) : undefined))
    .orderBy(desc(clubPost.createdAt)).limit(30);
  const posts = rows.filter((r) => !blocked.has(r.p.userId));
  const ids = posts.map((r) => r.p.id);
  const reacts = ids.length ? await db.select({ post: clubReaction.postId, n: sql<number>`count(*)::int`, mine: sql<boolean>`bool_or(${clubReaction.userId} = ${userId})` })
    .from(clubReaction).where(inArray(clubReaction.postId, ids)).groupBy(clubReaction.postId) : [];
  const comments = ids.length ? await db.select({ c: clubComment, name: user.name, show: clubMember.showName }).from(clubComment).innerJoin(user, eq(user.id, clubComment.userId))
    .leftJoin(clubMember, and(eq(clubMember.orgId, orgId), eq(clubMember.userId, clubComment.userId)))
    .where(and(inArray(clubComment.postId, ids), or(eq(clubComment.status, "visible"), eq(clubComment.userId, userId)), ne(clubComment.status, "removed"),
      or(eq(clubComment.userId, userId), isNull(clubMember.leftAt))))
    .orderBy(clubComment.createdAt) : [];
  return posts.map(({ p, name, show, a }) => {
    const r = reacts.find((x) => x.post === p.id);
    const cs = comments.filter((c) => c.c.postId === p.id && !blocked.has(c.c.userId));
    return {
      id: p.id, mine: p.userId === userId, author: p.userId === userId ? "Vos" : clubName(name, show), authorId: p.userId, kind: p.kind, text: p.text, at: p.createdAt, hidden: p.status === "hidden",
      achievement: a ? { title: a.title, detail: a.detail } : null, payload: p.payload ?? null, applause: r?.n ?? 0, applauded: !!r?.mine,
      comments: cs.map((c) => ({ id: c.c.id, mine: c.c.userId === userId, author: c.c.userId === userId ? "Vos" : clubName(c.name, c.show ?? false), authorId: c.c.userId, text: c.c.text, at: c.c.createdAt, hidden: c.c.status === "hidden" })),
    };
  });
}

async function rate(table: "post" | "comment", userId: string) {
  const since = new Date(Date.now() - 3_600_000);
  const [{ n }] = table === "post"
    ? await db.select({ n: sql<number>`count(*)::int` }).from(clubPost).where(and(eq(clubPost.userId, userId), gte(clubPost.createdAt, since)))
    : await db.select({ n: sql<number>`count(*)::int` }).from(clubComment).where(and(eq(clubComment.userId, userId), gte(clubComment.createdAt, since)));
  if (n >= (table === "post" ? CLUB_RATE.postsPerHour : CLUB_RATE.commentsPerHour)) throw new AccessError("rate_limited", "Llegaste al límite por hora. Probá más tarde.", 429);
}
const cleanText = (t: string, max: number) => {
  const x = (t ?? "").trim();
  if (x.length > max) throw new AccessError("invalid", `Hasta ${max} caracteres.`);
  if (hasLink(x)) throw new AccessError("invalid", "No se permiten enlaces en Repi Club.");
  return x;
};

// ── Evolución por ejercicio (pedido 26/10) ──────────────────────────────────
// Fuente: sólo sesiones del programa de ESTE gym (nunca el entrenamiento con un coach privado). Una fila por sesión:
// la serie más pesada. Se publica una instantánea elegida; el historial completo nunca se expone.
type Point = { d: string; kg: number; reps: number; e1rm: number | null };
async function evolution(gymMemberId: string, exerciseId: string, limit = 8): Promise<Point[]> {
  const rows = await db.select({ sid: workoutSession.id, at: workoutSession.startedAt, w: setLog.weightKg, r: setLog.reps, target: programExercise.reps }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).leftJoin(programExercise, eq(programExercise.id, setLog.programExerciseId))
    .where(and(eq(workoutSession.gymMemberId, gymMemberId), eq(setLog.exerciseId, exerciseId), ne(workoutSession.status, "abandoned")))
    .orderBy(desc(workoutSession.startedAt)).limit(400);
  const best = new Map<string, Point>();
  for (const r of rows) {
    const kg = r.w == null ? 0 : Number(r.w), reps = r.r ?? 0;
    const timed = r.target != null && parseReps(r.target).kind === "time"; // DATA-6: segundos, sin 1RM estimado
    const cur = best.get(r.sid);
    if (!cur || kg > cur.kg || (kg === cur.kg && reps > cur.reps)) best.set(r.sid, { d: localDate(r.at), kg, reps, e1rm: timed ? null : epley1rm(kg, reps) });
  }
  return [...best.values()].slice(0, limit).reverse();
}
/** Ejercicios con registros en el programa del gym (para elegir qué mostrar). */
export async function myExercises(userId: string, orgId: string) {
  const m = await activeMember(userId, orgId);
  const rows = await db.select({ id: setLog.exerciseId, name: exercise.name, n: sql<number>`count(distinct ${workoutSession.id})::int`, last: sql<Date>`max(${workoutSession.startedAt})` }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(eq(workoutSession.gymMemberId, m.id), ne(workoutSession.status, "abandoned"))).groupBy(setLog.exerciseId, exercise.name).orderBy(desc(sql`max(${workoutSession.startedAt})`));
  return rows.map((r) => ({ id: r.id, name: r.name, sessions: r.n, last: r.last }));
}
export async function exerciseEvolution(userId: string, orgId: string, exerciseId: string) {
  const m = await activeMember(userId, orgId);
  return evolution(m.id, exerciseId);
}
/** Sesiones recientes del programa del gym que se pueden compartir (completadas, propias). */
export async function shareableSessions(userId: string, orgId: string) {
  const m = await activeMember(userId, orgId);
  const rows = await db.select().from(workoutSession).where(and(eq(workoutSession.gymMemberId, m.id), eq(workoutSession.status, "completed"))).orderBy(desc(workoutSession.startedAt)).limit(8);
  return rows.map((s) => ({ id: s.id, dayName: s.dayName, date: localDate(s.startedAt) }));
}
async function sessionSnapshot(memberId: string, sessionId: string) {
  const [s] = await db.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.gymMemberId, memberId), eq(workoutSession.status, "completed")));
  if (!s) throw new AccessError("invalid", "Elegí un entrenamiento terminado del programa del gym.");
  const logs = await db.select({ w: setLog.weightKg, r: setLog.reps, name: exercise.name, target: programExercise.reps }).from(setLog).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .leftJoin(programExercise, eq(programExercise.id, setLog.programExerciseId)).where(eq(setLog.sessionId, s.id));
  return {
    type: "session", dayName: s.dayName, date: localDate(s.startedAt), minutes: Math.round(s.activeMs / 60_000), sets: logs.length,
    volumeKg: volumeKg(logs.map((l) => ({ exerciseId: "", weightKg: l.w == null ? null : Number(l.w), reps: l.r, completed: true, timed: l.target != null && parseReps(l.target).kind === "time" }))),
    exercises: [...new Set(logs.map((l) => l.name))].slice(0, 8),
  };
}

/**
 * Publicar: texto, un logro propio, la evolución de un ejercicio o un entrenamiento terminado (todo voluntario y elegido).
 * Nunca datos de salud, Body Intelligence ni sensaciones por serie: no hay forma de adjuntarlos.
 */
export async function createClubPost(userId: string, orgId: string, p: { text?: string; achievementId?: string | null; progressExerciseId?: string | null; sessionId?: string | null }) {
  await joined(userId, orgId);
  await rate("post", userId);
  const text = cleanText(p.text ?? "", CLUB_POST_MAX);
  let achievementId: string | null = null;
  let kind: "text" | "achievement" | "progress" | "session" = "text";
  let payload: unknown = null;
  if (p.achievementId) {
    const [a] = await db.select().from(achievement).where(and(eq(achievement.id, p.achievementId), eq(achievement.userId, userId), or(isNull(achievement.orgId), eq(achievement.orgId, orgId))));
    if (!a) throw new AccessError("invalid", "Ese logro no es tuyo.");
    achievementId = a.id; kind = "achievement";
  } else if (p.progressExerciseId) {
    const m = await activeMember(userId, orgId);
    const pts = await evolution(m.id, p.progressExerciseId);
    if (pts.length < 2) throw new AccessError("invalid", "Hacen falta al menos dos entrenamientos con ese ejercicio para mostrar una evolución.");
    const [ex] = await db.select({ name: exercise.name }).from(exercise).where(eq(exercise.id, p.progressExerciseId));
    payload = { type: "progress", exercise: ex?.name ?? "Ejercicio", points: pts.map(({ d, kg, reps }) => ({ d, kg, reps })), deltaKg: Math.round((pts.at(-1)!.kg - pts[0].kg) * 100) / 100 };
    kind = "progress";
  } else if (p.sessionId) {
    const m = await activeMember(userId, orgId);
    payload = await sessionSnapshot(m.id, p.sessionId);
    kind = "session";
  }
  if (!text && kind === "text") throw new AccessError("invalid", "Escribí algo o elegí qué compartir.");
  const [row] = await db.insert(clubPost).values({ orgId, userId, kind, text, achievementId, payload }).returning();
  return { id: row.id };
}

// ── Perfil del Club: vitrina elegida (nada se muestra por defecto) ──────────
export async function myClubProfile(userId: string, orgId: string) {
  await joined(userId, orgId);
  const [p] = await db.select().from(clubProfile).where(and(eq(clubProfile.orgId, orgId), eq(clubProfile.userId, userId)));
  return { bio: p?.bio ?? "", showLevel: p?.showLevel ?? false, showcase: (p?.showcase as string[] | undefined) ?? [], exercises: await myExercises(userId, orgId) };
}
export async function setClubProfile(userId: string, orgId: string, p: { bio?: string; showLevel?: boolean; showcase?: string[] }) {
  await joined(userId, orgId);
  const bio = cleanText(p.bio ?? "", 160);
  const mine = new Set((await myExercises(userId, orgId)).map((e) => e.id));
  const showcase = [...new Set(p.showcase ?? [])].filter((x) => mine.has(x)).slice(0, 4);
  await db.insert(clubProfile).values({ orgId, userId, bio: bio || null, showLevel: !!p.showLevel, showcase })
    .onConflictDoUpdate({ target: [clubProfile.orgId, clubProfile.userId], set: { bio: bio || null, showLevel: !!p.showLevel, showcase, updatedAt: new Date() } });
  await audit(db, { actorUserId: userId, orgId, action: "club.profile_updated", resourceType: "club_profile", meta: { showcase: showcase.length, showLevel: !!p.showLevel } });
  return myClubProfile(userId, orgId);
}
/** Perfil visible para otro socio del Club: sólo lo que la persona eligió. Bloqueos y salida del Club lo ocultan. */
export async function viewClubProfile(viewerId: string, orgId: string, targetId: string, now = new Date()) {
  await joined(viewerId, orgId);
  if ((await blockedSets(viewerId)).has(targetId)) throw NOT_FOUND();
  const [t] = await db.select({ c: clubMember, name: user.name }).from(clubMember).innerJoin(user, eq(user.id, clubMember.userId))
    .where(and(eq(clubMember.orgId, orgId), eq(clubMember.userId, targetId), isNull(clubMember.leftAt)));
  if (!t) throw NOT_FOUND();
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.userId, targetId), eq(gymMember.orgId, orgId), eq(gymMember.status, "active")));
  if (!m) throw NOT_FOUND();
  const [p] = await db.select().from(clubProfile).where(and(eq(clubProfile.orgId, orgId), eq(clubProfile.userId, targetId)));
  const ids = ((p?.showcase as string[] | undefined) ?? []).slice(0, 4);
  const names = new Map((ids.length ? await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, ids)) : []).map((x) => [x.id, x.name]));
  const showcase = [];
  for (const id of ids) {
    const pts = await evolution(m.id, id);
    if (pts.length) showcase.push({ exercise: names.get(id) ?? "Ejercicio", points: pts.map(({ d, kg, reps }) => ({ d, kg, reps })) });
  }
  let monthDays: number | null = null;
  if (p?.showLevel) {
    const from = `${localDate(now).slice(0, 7)}-01`;
    const [{ n }] = await db.select({ n: sql<number>`count(distinct (${workoutSession.startedAt} at time zone 'America/Argentina/Buenos_Aires')::date)::int` }).from(workoutSession)
      .where(and(eq(workoutSession.gymMemberId, m.id), eq(workoutSession.status, "completed"), gte(workoutSession.startedAt, new Date(`${from}T03:00:00Z`))));
    monthDays = n;
  }
  const [{ posts }] = await db.select({ posts: sql<number>`count(*)::int` }).from(clubPost).where(and(eq(clubPost.orgId, orgId), eq(clubPost.userId, targetId), eq(clubPost.status, "visible")));
  return { mine: targetId === viewerId, name: targetId === viewerId ? "Vos" : clubName(t.name, t.c.showName), bio: p?.bio ?? "", showcase, monthDays, posts, since: t.c.joinedAt };
}

async function postIn(orgId: string, postId: string) {
  const [p] = await db.select().from(clubPost).where(and(eq(clubPost.id, postId), eq(clubPost.orgId, orgId), ne(clubPost.status, "removed")));
  if (!p) throw NOT_FOUND();
  return p;
}
export async function toggleApplause(userId: string, orgId: string, postId: string) {
  await joined(userId, orgId);
  const p = await postIn(orgId, postId);
  if ((await blockedSets(userId)).has(p.userId)) throw NOT_FOUND();
  const del = await db.delete(clubReaction).where(and(eq(clubReaction.postId, postId), eq(clubReaction.userId, userId))).returning();
  if (!del.length) await db.insert(clubReaction).values({ postId, userId }).onConflictDoNothing();
  return { applauded: !del.length };
}
export async function commentPost(userId: string, orgId: string, postId: string, text: string) {
  await joined(userId, orgId);
  await rate("comment", userId);
  const p = await postIn(orgId, postId);
  if (p.status !== "visible" || (await blockedSets(userId)).has(p.userId)) throw NOT_FOUND();
  const t = cleanText(text, CLUB_COMMENT_MAX);
  if (!t) throw new AccessError("invalid", "Escribí un comentario.");
  const [c] = await db.insert(clubComment).values({ postId, userId, text: t }).returning();
  return { id: c.id };
}
export async function deleteOwn(userId: string, orgId: string, type: "post" | "comment", id: string) {
  await activeMember(userId, orgId);
  if (type === "post") {
    const r = await db.update(clubPost).set({ status: "removed" }).where(and(eq(clubPost.id, id), eq(clubPost.orgId, orgId), eq(clubPost.userId, userId))).returning();
    if (!r.length) throw NOT_FOUND();
  } else {
    const [c] = await db.select({ c: clubComment }).from(clubComment).innerJoin(clubPost, eq(clubPost.id, clubComment.postId)).where(and(eq(clubComment.id, id), eq(clubPost.orgId, orgId), eq(clubComment.userId, userId)));
    if (!c) throw NOT_FOUND();
    await db.update(clubComment).set({ status: "removed" }).where(eq(clubComment.id, id));
  }
  return { ok: true };
}

/** Reportar: una vez por persona; con N reportes distintos el contenido queda oculto hasta que modere el gym. */
export async function report(userId: string, orgId: string, p: { type: "post" | "comment"; id: string; reason: string }) {
  await joined(userId, orgId);
  const reason = (p.reason ?? "").trim().slice(0, 120);
  if (reason.length < 3) throw new AccessError("invalid", "Elegí un motivo.");
  let ownerId: string;
  if (p.type === "post") ownerId = (await postIn(orgId, p.id)).userId;
  else {
    const [c] = await db.select({ c: clubComment }).from(clubComment).innerJoin(clubPost, eq(clubPost.id, clubComment.postId)).where(and(eq(clubComment.id, p.id), eq(clubPost.orgId, orgId), ne(clubComment.status, "removed")));
    if (!c) throw NOT_FOUND();
    ownerId = c.c.userId;
  }
  if (ownerId === userId) throw new AccessError("invalid", "No podés reportar tu propio contenido.");
  await db.insert(clubReport).values({ orgId, targetType: p.type, targetId: p.id, reporterId: userId, reason }).onConflictDoNothing();
  const [{ n }] = await db.select({ n: sql<number>`count(distinct ${clubReport.reporterId})::int` }).from(clubReport)
    .where(and(eq(clubReport.targetType, p.type), eq(clubReport.targetId, p.id), eq(clubReport.status, "open")));
  if (n >= CLUB_AUTOHIDE_REPORTS) {
    if (p.type === "post") await db.update(clubPost).set({ status: "hidden" }).where(and(eq(clubPost.id, p.id), eq(clubPost.status, "visible")));
    else await db.update(clubComment).set({ status: "hidden" }).where(and(eq(clubComment.id, p.id), eq(clubComment.status, "visible")));
  }
  return { hidden: n >= CLUB_AUTOHIDE_REPORTS };
}
export async function blockUser(userId: string, orgId: string, otherId: string) {
  await joined(userId, orgId);
  if (otherId === userId) throw new AccessError("invalid", "No podés bloquearte.");
  await db.insert(clubBlock).values({ userId, blockedUserId: otherId }).onConflictDoNothing();
  return { ok: true };
}

/** Ranking del mes: sesiones del programa institucional + ingresos registrados (máx. uno por día). Sólo quienes lo eligieron. */
export async function clubRankingFor(userId: string, orgId: string, now = new Date()) {
  const me = await joined(userId, orgId);
  const month = localDate(now).slice(0, 7);
  const from = new Date(`${month}-01T03:00:00Z`);
  const members = await db.select({ userId: clubMember.userId, show: clubMember.showName, name: user.name, gm: gymMember.id }).from(clubMember)
    .innerJoin(user, eq(user.id, clubMember.userId)).innerJoin(gymMember, and(eq(gymMember.userId, clubMember.userId), eq(gymMember.orgId, orgId), eq(gymMember.status, "active")))
    .where(and(eq(clubMember.orgId, orgId), isNull(clubMember.leftAt), eq(clubMember.inRanking, true)))
    .then((rows) => withoutRestrictedMinors(rows, now));
  const gms = members.map((m) => m.gm);
  const days = gms.length ? await db.execute(sql`
    select gm, count(distinct d)::int as n from (
      select ${workoutSession.gymMemberId} as gm, (${workoutSession.endedAt} at time zone 'America/Argentina/Buenos_Aires')::date as d from ${workoutSession}
        where ${inArray(workoutSession.gymMemberId, gms)} and ${workoutSession.status} = 'completed' and ${workoutSession.endedAt} >= ${from.toISOString()}
      union all
      select ${attendance.gymMemberId} as gm, (${attendance.at} at time zone 'America/Argentina/Buenos_Aires')::date as d from ${attendance}
        where ${inArray(attendance.gymMemberId, gms)} and ${attendance.at} >= ${from.toISOString()}
    ) x group by gm`) as unknown as { gm: string; n: number }[] : [];
  const rows = clubRanking(members.map((m) => ({ userId: m.userId, name: m.userId === userId ? "Vos" : clubName(m.name, m.show), sessions: days.find((d) => d.gm === m.gm)?.n ?? 0 })));
  return { month, inRanking: me.inRanking, rows: rows.slice(0, 20).map((r) => ({ pos: r.pos, name: r.name, days: r.sessions, me: r.userId === userId })), metric: "Días con entrenamiento o ingreso registrado este mes" };
}

/**
 * Ranking por ejercicio del gym (D144): mejor 1RM estimado (Epley, series de 1 a 12 reps) de los últimos 90 días en
 * sesiones del programa institucional, sólo de quienes eligieron aparecer en el ranking del Club. Lo ve cualquier socio
 * activo del gym. Subidas y bajadas contra la mejor marca de cada uno hasta hace 7 días. Sin datos de salud.
 */
export async function clubLiftRanking(userId: string, orgId: string, exerciseId: string | null, now = new Date()) {
  await activeMember(userId, orgId);
  return liftBoard(orgId, exerciseId, userId, now);
}

/** Quienes eligieron aparecer en el ranking del Club (sin menores sin consentimiento de su adulto responsable). */
export async function rankingMembers(orgId: string, now = new Date()) {
  return db.select({ userId: clubMember.userId, show: clubMember.showName, name: user.name, gm: gymMember.id }).from(clubMember)
    .innerJoin(user, eq(user.id, clubMember.userId)).innerJoin(gymMember, and(eq(gymMember.userId, clubMember.userId), eq(gymMember.orgId, orgId), eq(gymMember.status, "active")))
    .where(and(eq(clubMember.orgId, orgId), isNull(clubMember.leftAt), eq(clubMember.inRanking, true)))
    .then((rows) => withoutRestrictedMinors(rows, now));
}

/** Mejor 1RM estimado por ejercicio y socio en los últimos 90 días (y la mejor hasta hace 7 días), D144. También para D168. */
export async function liftBests(gms: string[], now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const sets = await db.select({ gm: workoutSession.gymMemberId, ex: setLog.exerciseId, w: setLog.weightKg, r: setLog.reps, at: setLog.completedAt, target: programExercise.reps }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).leftJoin(programExercise, eq(programExercise.id, setLog.programExerciseId))
    .where(and(inArray(workoutSession.gymMemberId, gms), inArray(workoutSession.status, ["completed", "in_progress", "paused"]), gte(setLog.completedAt, new Date(now.getTime() - 90 * 86_400_000))));
  // Mejor marca por ejercicio y persona, y la mejor hasta hace una semana.
  const best = new Map<string, Map<string, { best: number; before: number | null }>>();
  for (const x of sets) {
    // QA 29/10 (DATA-6): en una serie por tiempo `reps` son segundos; 140 kg × 10 s no es un 1RM de 187 kg en la TV.
    const e = x.w == null || x.r == null || (x.target != null && parseReps(x.target).kind === "time") ? null : epley1rm(Number(x.w), x.r);
    if (e == null || !x.gm) continue;
    const per = best.get(x.ex) ?? new Map(); best.set(x.ex, per);
    const cur = per.get(x.gm) ?? { best: 0, before: null };
    cur.best = Math.max(cur.best, e);
    if (x.at < weekAgo) cur.before = Math.max(cur.before ?? 0, e);
    per.set(x.gm, cur);
  }
  return best;
}

/**
 * Tablero por ejercicio (D144) para la app (`meUserId`: marca «Vos») y para la pantalla de la sala (D146, sin persona).
 * Sólo quienes eligieron «Aparecer en el ranking»; nombre según su preferencia del Club.
 */
export async function liftBoard(orgId: string, exerciseId: string | null, meUserId: string | null, now = new Date()) {
  const members = await rankingMembers(orgId, now);
  const [mine] = meUserId ? await db.select({ inRanking: clubMember.inRanking }).from(clubMember).where(and(eq(clubMember.orgId, orgId), eq(clubMember.userId, meUserId), isNull(clubMember.leftAt))) : [];
  const base = { inRanking: !!mine?.inRanking, metric: "Mejor 1RM estimado de los últimos 90 días", updatedAt: now.toISOString() };
  if (!members.length) return { ...base, exercises: [], exercise: null, rows: [] };
  const best = await liftBests(members.map((m) => m.gm), now);
  const names = best.size ? await db.select({ id: exercise.id, name: exercise.name }).from(exercise).where(inArray(exercise.id, [...best.keys()])) : [];
  const exercises = [...best.entries()].map(([id, per]) => ({ id, name: names.find((n) => n.id === id)?.name ?? "Ejercicio", people: per.size }))
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, "es")).slice(0, 12);
  const ex = exercises.find((e) => e.id === exerciseId) ?? exercises[0] ?? null;
  if (!ex) return { ...base, exercises, exercise: null, rows: [] };
  // Clave opaca y estable por gym: anima los cambios de puesto sin exponer IDs de personas.
  const key = (gm: string) => createHash("sha256").update(`${orgId}:${gm}`).digest("hex").slice(0, 12);
  const meGm = meUserId ? members.find((m) => m.userId === meUserId)?.gm : undefined;
  const rows = liftRanking([...best.get(ex.id)!.entries()].map(([gm, v]) => {
    const m = members.find((x) => x.gm === gm)!;
    return { key: key(gm), name: gm === meGm ? "Vos" : clubName(m.name, m.show), best: Math.round(v.best * 2) / 2, before: v.before == null ? null : Math.round(v.before * 2) / 2 };
  })).slice(0, 30).map((r) => ({ ...r, me: !!meGm && r.key === key(meGm) }));
  return { ...base, exercises, exercise: { id: ex.id, name: ex.name }, rows };
}

// ── Moderación del gym (F-RC-05) ────────────────────────────────────────────
export async function clubReports(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "club.moderate");
  const rows = await db.select().from(clubReport).where(and(eq(clubReport.orgId, orgId), or(eq(clubReport.status, "open"), gte(clubReport.decidedAt, addDays(new Date(), -30))))).orderBy(desc(clubReport.createdAt)).limit(100);
  const byTarget = new Map<string, typeof rows>();
  for (const r of rows) byTarget.set(`${r.targetType}:${r.targetId}`, [...(byTarget.get(`${r.targetType}:${r.targetId}`) ?? []), r]);
  const out = [];
  for (const [key, rs] of byTarget) {
    const [type, id] = key.split(":") as ["post" | "comment", string];
    const [t] = type === "post"
      ? await db.select({ text: clubPost.text, status: clubPost.status, author: user.name, at: clubPost.createdAt }).from(clubPost).innerJoin(user, eq(user.id, clubPost.userId)).where(eq(clubPost.id, id))
      : await db.select({ text: clubComment.text, status: clubComment.status, author: user.name, at: clubComment.createdAt }).from(clubComment).innerJoin(user, eq(user.id, clubComment.userId)).where(eq(clubComment.id, id));
    if (!t) continue;
    out.push({ type, id, text: t.text, author: t.author, at: t.at, status: t.status, reports: rs.length, reasons: [...new Set(rs.map((r) => r.reason))], open: rs.some((r) => r.status === "open") });
  }
  return out;
}
export async function moderateClub(actorId: string, orgId: string, p: { type: "post" | "comment"; id: string; outcome: "keep" | "remove" }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "club.moderate");
  return db.transaction(async (tx) => {
    const status = p.outcome === "remove" ? "removed" as const : "visible" as const;
    if (p.type === "post") {
      const r = await tx.update(clubPost).set({ status }).where(and(eq(clubPost.id, p.id), eq(clubPost.orgId, orgId))).returning();
      if (!r.length) throw NOT_FOUND();
    } else {
      const [c] = await tx.select({ id: clubComment.id }).from(clubComment).innerJoin(clubPost, eq(clubPost.id, clubComment.postId)).where(and(eq(clubComment.id, p.id), eq(clubPost.orgId, orgId)));
      if (!c) throw NOT_FOUND();
      await tx.update(clubComment).set({ status }).where(eq(clubComment.id, p.id));
    }
    await tx.update(clubReport).set({ status: p.outcome === "remove" ? "removed" : "kept", decidedBy: actorId, decidedAt: new Date() })
      .where(and(eq(clubReport.targetType, p.type), eq(clubReport.targetId, p.id), eq(clubReport.status, "open")));
    await audit(tx, { actorUserId: actorId, orgId, action: `club.${p.outcome}`, resourceType: `club_${p.type}`, resourceId: p.id });
    return { ok: true };
  });
}
