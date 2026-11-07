// Centro de notificaciones del alumno (F-NT-01, D94; App Alumno v4 SCR-M-24). Arma la lista desde lo que ya existe —avisos
// del gym, pedidos, solicitudes de acceso del coach, reseñas, mensajes, novedades y cobros del coach— sin copiar datos a
// otra tabla. Cada ítem lleva un destino dentro de la app. «Leído» es una marca por persona (user_pref): lo anterior a la
// última apertura del centro figura como leído; no cambia el estado de cada fuente (eso lo hace su propia pantalla).
// No incluye datos de salud, check-ins ni molestias, y nada de esto se envía como push. D209: los avisos del Asistente REPI
// (brain_intervention) son una fuente más, con su propio estado de lectura (pendiente → visto al abrir el centro).
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { REQUEST_KIND, toWhom, type RequestKind } from "@repi/domain";
import { db, schema } from "@/db";
import { addDays } from "../access/util";
import { myInbox } from "../followup/services";
import { myGymRelations, myGymTasks } from "../gym/services";
import { myReviewInvites } from "../gym/reviews";
import { myThreads } from "../messages/services";
import { myCharges } from "../coachpay/services";
import { myAppointments } from "../training/agenda";
import { markAnnouncementsRead, myAnnouncements } from "../announcements/services";
import { pendingBriefs } from "../training/program-request";
import { activeInterventions } from "../brain/store";
import { getPrefs } from "../brain/prefs";

const { memberNotice, communityPost, userPref, brainIntervention } = schema;

export type NotifDest =
  | { tab: "home" | "msgs" | "perfil" | "train" }
  | { tab: "prog"; seg?: "train" | "body" | "photos" }
  | { tab: "gym"; gymTab: "news" | "ch" | "logros" }
  | { tab: "review"; invite: { id: string; trainer: string; kind: string; place: string } };
// `origin: "repi"`: novedad del producto (D202), se distingue de los avisos del gimnasio y del coach.
// `origin: "assistant"`: aviso del Asistente REPI (D209, coaching personal); `ref.interventionId` para aceptarlo o descartarlo.
export type Notif = { id: string; title: string; body: string; at: string; tone: "cyan" | "turq" | "ok" | "bad" | "mute"; dest: NotifDest; unread: boolean; origin?: "repi" | "assistant"; cta?: string | null; ref?: { interventionId: string } };
/** Destino de cada tipo de aviso del Asistente REPI (lo demás va a Inicio, donde está la tarjeta). */
const ASSISTANT_DEST: Record<string, NotifDest> = {
  pr: { tab: "prog", seg: "train" }, progressing: { tab: "prog", seg: "train" }, plateau: { tab: "prog", seg: "train" }, declining: { tab: "prog", seg: "train" },
  weekly_target_met: { tab: "prog", seg: "train" }, weekly_summary: { tab: "prog", seg: "train" },
  program_updated: { tab: "train" }, import_unknowns: { tab: "train" }, inactivity: { tab: "train" },
};
/** Avisos vigentes del Asistente REPI (sólo los de la persona; sin evaluar nada: eso lo hacen Inicio y el cron). */
async function assistantItems(userId: string, now: Date): Promise<Notif[]> {
  const [prefs, items] = await Promise.all([getPrefs(userId), activeInterventions(userId, now, 10)]);
  return items.filter((i) => i.channel !== "inline" && (prefs.proactive || i.category === "safety")).map((i) => ({
    id: `assistant:${i.id}`, title: i.title, body: clip(i.body, 160), at: i.createdAt, tone: i.category === "safety" ? "bad" : "cyan", origin: "assistant",
    dest: ASSISTANT_DEST[i.kind] ?? { tab: "home" }, unread: i.status === "pending", cta: i.actions.find((a) => a.id === "open" || a.id === "start" || a.id === "why")?.label ?? null,
    ref: { interventionId: i.id },
  }));
}
/** Destino de una novedad de REPI dentro de la app del alumno (lista cerrada). */
const ANN_DEST: Record<string, NotifDest> = {
  "member.progress": { tab: "prog", seg: "train" }, "member.progress.body": { tab: "prog", seg: "body" }, "member.progress.photos": { tab: "prog", seg: "photos" },
  "member.train": { tab: "train" }, "member.perfil": { tab: "perfil" },
};

const WINDOW_DAYS = 30, MAX = 40;
const iso = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toISOString();
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const money = (minor: number, currency: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export async function myNotifications(userId: string, now = new Date()) {
  const since = addDays(now, -WINDOW_DAYS);
  const [[pref], inbox, gymRels, tasks, invites, threads, charges, notices, appts, ann, briefs] = await Promise.all([
    db.select({ seenAt: userPref.notificationsSeenAt }).from(userPref).where(eq(userPref.userId, userId)),
    myInbox(userId), myGymRelations(userId), myGymTasks(userId), myReviewInvites(userId), myThreads(userId), myCharges(userId, now),
    db.select().from(memberNotice).where(and(eq(memberNotice.userId, userId), gte(memberNotice.createdAt, since))).orderBy(desc(memberNotice.createdAt)).limit(20),
    myAppointments(userId, now),
    myAnnouncements(userId, "member", { now }),
    pendingBriefs(userId).catch(() => []),
  ]);
  const assistant = await assistantItems(userId, now).catch(() => [] as Notif[]); // una falla del Asistente no rompe el centro
  const posts = gymRels.length ? await db.select({ p: communityPost }).from(communityPost).where(and(
    inArray(communityPost.orgId, gymRels.map((r) => r.org.id)), isNull(communityPost.deletedAt), gte(communityPost.createdAt, since),
    or(isNull(communityPost.locationId), inArray(communityPost.locationId, gymRels.map((r) => r.loc.id))),
  )).orderBy(desc(communityPost.createdAt)).limit(5) : [];
  const orgName = new Map(gymRels.map((r) => [r.org.id, r.org.name]));

  const items: Omit<Notif, "unread">[] = [];
  for (const n of notices) {
    const ok = n.kind === "attempt_approved" || n.kind === "prize_delivered";
    items.push({ id: `notice:${n.id}`, title: n.title, body: clip(n.body), at: iso(n.createdAt), tone: ok ? "cyan" : n.kind === "attempt_rejected" ? "bad" : "mute",
      dest: { tab: "gym", gymTab: n.kind === "attempt_rejected" ? "ch" : n.kind === "club_notice" ? "news" : "logros" } });
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
  // Sesiones con el coach (D98): agendadas a futuro y canceladas. La fecha del aviso es cuándo cambió, no cuándo es.
  const whenTxt = (iso: string) => new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" }).format(new Date(iso));
  for (const a of appts) {
    const future = new Date(a.startsAt).getTime() > now.getTime();
    if (a.status === "scheduled" && future) {
      items.push({ id: `appt:${a.id}:${a.startsAt}`, title: `Sesión con ${a.coach.split(" ")[0]} · ${whenTxt(a.startsAt)}`, body: `${a.modality === "online" ? "Online" : "Presencial"}${a.place ? ` · ${a.place}` : ""}${a.clientResponse === "pending" ? " · Confirmá en Inicio" : ""}`, at: iso(a.updatedAt), tone: "cyan", dest: { tab: "home" } });
    } else if (a.status === "cancelled" && future) {
      items.push({ id: `appt:${a.id}:cancelled`, title: `Cancelada: sesión del ${whenTxt(a.startsAt)}`, body: a.cancelReason ? `Motivo: ${clip(a.cancelReason)}` : `La canceló ${a.coach.split(" ")[0]}.`, at: iso(a.updatedAt), tone: "bad", dest: { tab: "home" } });
    }
  }
  const seen = pref?.seenAt ?? null;
  // Novedades de REPI (D202): su estado de lectura es por anuncio (announcement_read), compartido con coach y gimnasio.
  const annItems: Notif[] = ann.items.map((a) => ({ id: `ann:${a.id}`, title: a.title, body: clip(a.summary, 160), at: a.at, tone: "cyan", origin: "repi", cta: a.destination !== "none" ? a.ctaLabel : null,
    dest: ANN_DEST[a.destination] ?? { tab: "home" }, unread: a.unread }));
  // D206: pedido de programa sin preferencias. Es algo para hacer: queda sin leer hasta que se completa.
  const briefItems: Notif[] = briefs.map((x) => ({ id: `brief:${x.id}`, title: "Completá tu pedido de programa", body: `Contale ${toWhom(x.to)} tu objetivo, cuántos días podés entrenar y si tenés alguna lesión. Sin eso no puede armarlo.`,
    at: x.createdAt, tone: "cyan", dest: { tab: "home" }, unread: true, cta: "Completar" }));
  const list = [...briefItems, ...[...items.map((x) => ({ ...x, unread: !seen || new Date(x.at) > seen })), ...annItems, ...assistant].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX - briefItems.length)];
  return { items: list, unread: list.filter((x) => x.unread).length, seenAt: seen ? seen.toISOString() : null };
}

/**
 * D209: abrir el centro cuenta como «visto» para los avisos pendientes del Asistente REPI: no se vuelven a empujar por push
 * (caso 51) y siguen en Inicio hasta que la persona los resuelva o venzan.
 */
export async function markAssistantSeen(userId: string, now = new Date()) {
  const rows = await db.update(brainIntervention).set({ status: "shown", shownAt: now })
    .where(and(eq(brainIntervention.userId, userId), eq(brainIntervention.status, "pending"), sql`${brainIntervention.channel} <> 'inline'`, lte(brainIntervention.createdAt, now)))
    .returning({ id: brainIntervention.id });
  return rows.length;
}

/** Abrir el centro marca todo como leído hasta ahora. No resuelve pedidos ni marca mensajes. */
export async function markNotificationsSeen(userId: string, now = new Date()) {
  await markAnnouncementsRead(userId, "member", { now }); // sólo las ya publicadas y visibles para esta persona
  await markAssistantSeen(userId, now);
  await db.insert(userPref).values({ userId, notificationsSeenAt: now }).onConflictDoUpdate({ target: userPref.userId, set: { notificationsSeenAt: now, updatedAt: now } });
  return { seenAt: now.toISOString() };
}
