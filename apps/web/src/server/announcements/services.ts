// Novedades de REPI (PP1, D202). REPI Admin escribe, previsualiza, publica (ahora o programado) y archiva comunicados del
// producto sin desplegar. No es una segunda campanita: el alumno los ve dentro de su centro de notificaciones (feed.ts) y
// coach y gimnasio en «Novedades de REPI», con la misma lista y el mismo estado de lectura.
// - La audiencia se resuelve en el servidor con los roles reales de la persona (nunca lo que mande el navegador). Quien tiene
//   varios roles lo recibe una vez: la lectura es una fila por persona y anuncio.
// - Sin push masivo en 1.0: sólo dentro de la app.
// - Texto plano con límites y destino de una lista cerrada (announcementIssues). Editar uno publicado conserva su id: no
//   genera otro aviso ni lo vuelve a marcar como nuevo.
// - Un programado no aparece (ni puede marcarse leído) antes de su fecha.
// - Auditoría: cada alta, edición, publicación y archivo deja un audit_event (sin el texto).
import { and, desc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { ANNOUNCEMENT_DESTS, announcementFor, announcementIssues, type AnnouncementAudience, type AnnouncementDest, type AnnouncementKind } from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { AccessError, audit } from "../access/util";
import { requireAdmin } from "../commercial/services";

const { productAnnouncement, announcementRead, staffMembership, coachClient, gymMember, user } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos esa novedad.", 404);
export const ANNOUNCEMENT_WINDOW_DAYS = 60;
const LIST_MAX = 50;
export type AnnArea = "member" | "coach" | "gym";

/** Roles de la persona para segmentar (desde la base). En el gimnasio, sólo los de esa organización. */
export async function audienceRoles(userId: string, area: AnnArea, orgId?: string | null): Promise<Set<AnnouncementAudience>> {
  const out = new Set<AnnouncementAudience>();
  const [u] = await db.select({ role: user.platformRole }).from(user).where(eq(user.id, userId));
  if (!u) return out;
  if (u.role === "admin") out.add("admin");
  const staff = await db.select({ role: staffMembership.role, orgId: staffMembership.orgId }).from(staffMembership).where(and(eq(staffMembership.userId, userId), eq(staffMembership.status, "active")));
  if (area === "coach" && staff.some((s) => s.role === "coach_owner" && (!orgId || s.orgId === orgId))) out.add("coach");
  if (area === "gym") {
    const here = staff.filter((s) => s.orgId === orgId).map((s) => s.role);
    if (here.some((r) => r === "owner" || r === "manager" || r === "coordinator")) out.add("gym_admin");
    if (here.some((r) => r === "floor_trainer" || r === "reception")) out.add("floor");
  }
  if (area === "member") {
    const [c] = await db.select({ id: coachClient.id }).from(coachClient).where(and(eq(coachClient.userId, userId), eq(coachClient.status, "active"))).limit(1);
    const [g] = c ? [c] : await db.select({ id: gymMember.id }).from(gymMember).where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active"))).limit(1);
    if (c || g || !staff.length) out.add("member"); // persona que entrena (con o sin coach o gimnasio)
  }
  return out;
}

const AREA_AUD: Record<AnnArea, AnnouncementAudience[]> = { member: ["all", "member"], coach: ["all", "coach"], gym: ["all", "floor", "gym_admin"] };
/** Destino que tiene sentido en el espacio donde se muestra (si no, sin botón). */
const destFor = (d: string, area: AnnArea): AnnouncementDest => {
  const a = (ANNOUNCEMENT_DESTS as Record<string, { area: string }>)[d]?.area;
  return a === area ? (d as AnnouncementDest) : "none";
};

export type AnnouncementView = { id: string; kind: AnnouncementKind; title: string; summary: string; ctaLabel: string | null; destination: AnnouncementDest; at: string; unread: boolean };

/** Novedades publicadas que le corresponden a la persona en ese espacio, más recientes primero. */
export async function myAnnouncements(userId: string, area: AnnArea, o: { orgId?: string | null; now?: Date; windowDays?: number } = {}) {
  if (!featureOn("announcements")) return { items: [] as AnnouncementView[], unread: 0 };
  const now = o.now ?? new Date();
  const roles = await audienceRoles(userId, area, o.orgId);
  // Sólo quien tiene un rol en ese espacio (verificado en la base) ve sus novedades, también las de «todas las personas».
  const own = AREA_AUD[area].filter((a) => a !== "all" && roles.has(a));
  if (!own.length) return { items: [] as AnnouncementView[], unread: 0 };
  const wanted: AnnouncementAudience[] = ["all", ...own];
  const since = new Date(now.getTime() - (o.windowDays ?? ANNOUNCEMENT_WINDOW_DAYS) * 86_400_000);
  const rows = await db.select({ a: productAnnouncement, readAt: announcementRead.readAt }).from(productAnnouncement)
    .leftJoin(announcementRead, and(eq(announcementRead.announcementId, productAnnouncement.id), eq(announcementRead.userId, userId)))
    .where(and(eq(productAnnouncement.status, "published"), isNull(productAnnouncement.archivedAt), lte(productAnnouncement.publishAt, now), gte(productAnnouncement.publishAt, since),
      sql`${productAnnouncement.audience} && ${sql.raw(`array[${wanted.map((w) => `'${w}'`).join(",")}]::text[]`)}`))
    .orderBy(desc(productAnnouncement.publishAt)).limit(LIST_MAX);
  const items = rows.filter((r) => announcementFor(r.a.audience, new Set(wanted))).map((r): AnnouncementView => ({
    id: r.a.id, kind: r.a.kind as AnnouncementKind, title: r.a.title, summary: r.a.summary, ctaLabel: r.a.ctaLabel, destination: destFor(r.a.destination, area),
    at: r.a.publishAt!.toISOString(), unread: !r.readAt,
  }));
  return { items, unread: items.filter((x) => x.unread).length };
}

/** Marca leídas (las indicadas o todas las visibles para la persona en ese espacio). Sólo las publicadas y visibles. */
export async function markAnnouncementsRead(userId: string, area: AnnArea, o: { ids?: string[] | null; orgId?: string | null; now?: Date } = {}) {
  const { items } = await myAnnouncements(userId, area, { orgId: o.orgId, now: o.now });
  const ids = items.filter((x) => x.unread && (!o.ids || o.ids.includes(x.id))).map((x) => x.id);
  if (ids.length) await db.insert(announcementRead).values(ids.map((announcementId) => ({ announcementId, userId }))).onConflictDoNothing();
  return { read: ids.length };
}

// ── REPI Admin ──────────────────────────────────────────────────────────────
type Draft = { kind: AnnouncementKind; title: string; summary: string; ctaLabel?: string | null; destination: string; audience: string[] };
const clean = (d: Draft) => ({
  kind: d.kind, title: d.title.trim().replace(/\s+/g, " "), summary: d.summary.trim().replace(/\s+/g, " "), ctaLabel: d.ctaLabel?.trim().replace(/\s+/g, " ") || null,
  destination: d.destination, audience: [...new Set(d.audience)],
});
function validate(d: ReturnType<typeof clean>) {
  const issues = announcementIssues(d);
  if (issues.length) throw new AccessError("invalid", issues[0], 400, { issues });
}
const adminView = (a: typeof productAnnouncement.$inferSelect, reads?: number) => ({
  id: a.id, kind: a.kind, title: a.title, summary: a.summary, ctaLabel: a.ctaLabel, destination: a.destination, audience: a.audience, status: a.status,
  publishAt: a.publishAt?.toISOString() ?? null, archivedAt: a.archivedAt?.toISOString() ?? null, revision: a.revision,
  createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(), scheduled: a.status === "published" && !!a.publishAt && a.publishAt > new Date(), reads: reads ?? 0,
});

export async function adminAnnouncements(adminId: string) {
  await requireAdmin(adminId);
  const rows = await db.select().from(productAnnouncement).orderBy(desc(productAnnouncement.updatedAt)).limit(200);
  const counts = rows.length ? await db.select({ id: announcementRead.announcementId, n: sql<number>`count(*)::int` }).from(announcementRead)
    .where(inArray(announcementRead.announcementId, rows.map((r) => r.id))).groupBy(announcementRead.announcementId) : [];
  const n = new Map(counts.map((c) => [c.id, c.n]));
  return { items: rows.map((r) => adminView(r, n.get(r.id))), moduleOn: featureOn("announcements") };
}

export async function createAnnouncement(adminId: string, d: Draft) {
  await requireAdmin(adminId);
  const v = clean(d); validate(v);
  const [row] = await db.insert(productAnnouncement).values({ ...v, status: "draft", createdBy: adminId, updatedBy: adminId }).returning();
  await audit(db, { actorUserId: adminId, action: "announcement.created", resourceType: "product_announcement", resourceId: row.id });
  return adminView(row);
}

/** Editar: borrador o publicado (corrección de texto). Mismo id; no vuelve a aparecer como nuevo para quien ya lo leyó. */
export async function updateAnnouncement(adminId: string, id: string, d: Draft & { revision: number }) {
  await requireAdmin(adminId);
  const v = clean(d); validate(v);
  const [row] = await db.update(productAnnouncement).set({ ...v, revision: sql`${productAnnouncement.revision} + 1`, updatedBy: adminId, updatedAt: new Date() })
    .where(and(eq(productAnnouncement.id, id), eq(productAnnouncement.revision, d.revision), inArray(productAnnouncement.status, ["draft", "published"]))).returning();
  if (!row) {
    const [cur] = await db.select().from(productAnnouncement).where(eq(productAnnouncement.id, id));
    if (!cur) throw NOT_FOUND();
    throw new AccessError("stale", cur.status === "archived" ? "La novedad está archivada." : "Otra persona la cambió. Recargá para ver la versión vigente.", 409);
  }
  await audit(db, { actorUserId: adminId, action: "announcement.updated", resourceType: "product_announcement", resourceId: id, meta: { revision: row.revision, status: row.status } });
  return adminView(row);
}

/** Publicar ahora o programar. Idempotente: publicar dos veces no crea otro anuncio. Exige el módulo encendido. */
export async function publishAnnouncement(adminId: string, id: string, p: { at?: string | null } = {}, now = new Date()) {
  await requireAdmin(adminId);
  if (!featureOn("announcements")) throw new AccessError("module_off", "Las novedades están apagadas (interruptor «announcements»). Encendelo antes de publicar.", 409);
  const at = p.at ? new Date(p.at) : now;
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() - 60_000) throw new AccessError("invalid", "Elegí una fecha de publicación de ahora en adelante.");
  if (at.getTime() > now.getTime() + 90 * 86_400_000) throw new AccessError("invalid", "Se puede programar hasta 90 días adelante.");
  const [cur] = await db.select().from(productAnnouncement).where(eq(productAnnouncement.id, id));
  if (!cur) throw NOT_FOUND();
  validate(clean({ ...cur, kind: cur.kind as AnnouncementKind }));
  if (cur.status === "published" && cur.publishAt && cur.publishAt <= now) return { ...adminView(cur), already: true };
  if (cur.status === "archived") throw new AccessError("archived", "Está archivada: duplicala como borrador nuevo si querés volver a publicarla.", 409);
  const [row] = await db.update(productAnnouncement).set({ status: "published", publishAt: at, updatedBy: adminId, updatedAt: now }).where(eq(productAnnouncement.id, id)).returning();
  await audit(db, { actorUserId: adminId, action: at > now ? "announcement.scheduled" : "announcement.published", resourceType: "product_announcement", resourceId: id, meta: { audience: row.audience, at: at.toISOString() } });
  return { ...adminView(row), already: false };
}

/** Archivar: deja de mostrarse a todos (las lecturas quedan). */
export async function archiveAnnouncement(adminId: string, id: string, now = new Date()) {
  await requireAdmin(adminId);
  const [row] = await db.update(productAnnouncement).set({ status: "archived", archivedAt: now, updatedBy: adminId, updatedAt: now }).where(eq(productAnnouncement.id, id)).returning();
  if (!row) throw NOT_FOUND();
  await audit(db, { actorUserId: adminId, action: "announcement.archived", resourceType: "product_announcement", resourceId: id });
  return adminView(row);
}

/** Volver a borrador un programado que todavía no salió (para corregirlo o cancelarlo). */
export async function unscheduleAnnouncement(adminId: string, id: string, now = new Date()) {
  await requireAdmin(adminId);
  const [row] = await db.update(productAnnouncement).set({ status: "draft", publishAt: null, updatedBy: adminId, updatedAt: now })
    .where(and(eq(productAnnouncement.id, id), eq(productAnnouncement.status, "published"), gt(productAnnouncement.publishAt, now))).returning();
  if (!row) throw new AccessError("invalid", "Sólo se puede volver a borrador una novedad programada que todavía no salió.", 409);
  await audit(db, { actorUserId: adminId, action: "announcement.unscheduled", resourceType: "product_announcement", resourceId: id });
  return adminView(row);
}
