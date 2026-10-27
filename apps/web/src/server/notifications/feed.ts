// Centro de notificaciones del alumno (F-NT-01, D94; App Alumno v4 SCR-M-24). Arma la lista desde lo que ya existe —avisos
// del gym, pedidos, solicitudes de acceso del coach, reseñas, mensajes, novedades y cobros del coach— sin copiar datos a
// otra tabla. Cada ítem lleva un destino dentro de la app. «Leído» es una marca por persona (user_pref): lo anterior a la
// última apertura del centro figura como leído; no cambia el estado de cada fuente (eso lo hace su propia pantalla).
// No incluye datos de salud, check-ins ni molestias, y nada de esto se envía como push.
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { REQUEST_KIND, type RequestKind } from "@repi/domain";
import { db, schema } from "@/db";
import { addDays } from "../access/util";
import { myInbox } from "../followup/services";
import { myGymRelations, myGymTasks } from "../gym/services";
import { myReviewInvites } from "../gym/reviews";
import { myThreads } from "../messages/services";
import { myCharges } from "../coachpay/services";

const { memberNotice, communityPost, userPref } = schema;

export type NotifDest =
  | { tab: "home" | "msgs" | "perfil" }
  | { tab: "gym"; gymTab: "news" | "ch" | "logros" }
  | { tab: "review"; invite: { id: string; trainer: string; kind: string; place: string } };
export type Notif = { id: string; title: string; body: string; at: string; tone: "cyan" | "turq" | "ok" | "bad" | "mute"; dest: NotifDest; unread: boolean };

const WINDOW_DAYS = 30, MAX = 40;
const iso = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toISOString();
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const money = (minor: number, currency: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export async function myNotifications(userId: string, now = new Date()) {
  const since = addDays(now, -WINDOW_DAYS);
  const [[pref], inbox, gymRels, tasks, invites, threads, charges, notices] = await Promise.all([
    db.select({ seenAt: userPref.notificationsSeenAt }).from(userPref).where(eq(userPref.userId, userId)),
    myInbox(userId), myGymRelations(userId), myGymTasks(userId), myReviewInvites(userId), myThreads(userId), myCharges(userId, now),
    db.select().from(memberNotice).where(and(eq(memberNotice.userId, userId), gte(memberNotice.createdAt, since))).orderBy(desc(memberNotice.createdAt)).limit(20),
  ]);
  const posts = gymRels.length ? await db.select({ p: communityPost }).from(communityPost).where(and(
    inArray(communityPost.orgId, gymRels.map((r) => r.org.id)), isNull(communityPost.deletedAt), gte(communityPost.createdAt, since),
    or(isNull(communityPost.locationId), inArray(communityPost.locationId, gymRels.map((r) => r.loc.id))),
  )).orderBy(desc(communityPost.createdAt)).limit(5) : [];
  const orgName = new Map(gymRels.map((r) => [r.org.id, r.org.name]));

  const items: Omit<Notif, "unread">[] = [];
  for (const n of notices) {
    const ok = n.kind === "attempt_approved" || n.kind === "prize_delivered";
    items.push({ id: `notice:${n.id}`, title: n.title, body: clip(n.body), at: iso(n.createdAt), tone: ok ? "cyan" : n.kind === "attempt_rejected" ? "bad" : "mute",
      dest: { tab: "gym", gymTab: n.kind === "attempt_rejected" ? "ch" : "logros" } });
  }
  for (const a of inbox.accessRequests) {
    items.push({ id: `access:${a.id}`, title: `${a.from} pidió acceso`, body: `Quiere ver tu ${a.phrase}. Decidís vos en Perfil.`, at: iso(a.createdAt), tone: "cyan", dest: { tab: "perfil" } });
  }
  for (const r of inbox.requests) {
    if (new Date(r.resolvedAt ?? r.createdAt) < since) continue;
    const kind = REQUEST_KIND[r.kind as RequestKind] ?? r.kind;
    items.push(r.status === "done"
      ? { id: `req:${r.id}:done`, title: `Pedido resuelto · ${kind}`, body: clip(r.text), at: iso(r.resolvedAt ?? r.createdAt), tone: "ok", dest: { tab: "home" } }
      : { id: `req:${r.id}`, title: `Pedido enviado · ${kind}`, body: clip(r.text), at: iso(r.createdAt), tone: "turq", dest: { tab: "home" } });
  }
  for (const t of tasks) {
    const at = t.status === "done" && t.completedAt ? t.completedAt : t.createdAt;
    if (new Date(at) < since) continue;
    items.push({
      id: `task:${t.id}:${t.status}`, at: iso(at), dest: { tab: "home" },
      title: t.status === "done" ? `Pedido resuelto · ${t.label}` : t.status === "taken" ? `Pedido en curso · ${t.label}` : `Pedido enviado · ${t.label}`,
      body: t.status === "done" ? (t.doneBy ? `Lo resolvió ${t.doneBy}.` : "El equipo de sala lo resolvió.") : t.status === "taken" ? "El equipo de sala lo tomó." : clip(t.text ?? ""),
      tone: t.status === "done" ? "ok" : "turq",
    });
  }
  for (const i of invites) {
    items.push({ id: `review:${i.id}`, title: `¿Cómo te atendió ${i.trainer}?`, body: `Opcional · ${i.kind.toLowerCase()} · ${i.place}`, at: iso(i.createdAt), tone: "turq",
      dest: { tab: "review", invite: { id: i.id, trainer: i.trainer, kind: i.kind, place: i.place } } });
  }
  for (const t of threads) {
    if (!t.unread || !t.last || t.last.mine) continue;
    items.push({ id: `msg:${t.id}:${iso(t.last.at)}`, title: `${t.title} te escribió`, body: t.unread > 1 ? `${t.unread} mensajes sin leer` : clip(t.last.body, 90), at: iso(t.last.at), tone: "mute", dest: { tab: "msgs" } });
  }
  for (const { p } of posts) {
    items.push({ id: `post:${p.id}`, title: `${orgName.get(p.orgId) ?? "Tu gym"} · ${p.title}`, body: clip(p.text ?? ""), at: iso(p.createdAt), tone: "mute", dest: { tab: "gym", gymTab: "news" } });
  }
  for (const c of charges.coaches) for (const x of c.charges) {
    if (x.status !== "pending") continue;
    items.push({
      id: `charge:${x.id}`, title: x.overdue ? `Pago vencido · ${x.concept}` : `Pago con tu coach · ${x.concept}`,
      body: `${money(x.amountMinor, x.currency)} · ${x.overdue ? "venció" : "vence"} el ${ddmm(x.dueOn)} · ${c.coach}`, at: iso(x.createdAt), tone: x.overdue ? "bad" : "turq", dest: { tab: "perfil" },
    });
  }
  const seen = pref?.seenAt ?? null;
  const list = items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX).map((x) => ({ ...x, unread: !seen || new Date(x.at) > seen }));
  return { items: list, unread: list.filter((x) => x.unread).length, seenAt: seen ? seen.toISOString() : null };
}

/** Abrir el centro marca todo como leído hasta ahora. No resuelve pedidos ni marca mensajes. */
export async function markNotificationsSeen(userId: string, now = new Date()) {
  await db.insert(userPref).values({ userId, notificationsSeenAt: now }).onConflictDoUpdate({ target: userPref.userId, set: { notificationsSeenAt: now, updatedAt: now } });
  return { seenAt: now.toISOString() };
}
