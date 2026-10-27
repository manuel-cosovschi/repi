// Avisos al cliente sobre sus condiciones REPI (F-BL-05, D103). Cada cambio que hace Admin (cantidad o precio, prueba,
// suspensión, rehabilitación, criterio de conteo) deja un aviso inmutable que el responsable ve en «Condiciones REPI» y
// recibe por correo; el job agrega «tu prueba termina» (7 días antes) y «terminó tu prueba». El correo registra su entrega
// real (D88): un rechazo no se muestra como enviado. Espacios demo: sin correo. El «Entendido» queda con quién y cuándo.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { MailError, deliverMail } from "../mailer";
import { logError } from "../log";

const { contractNotice: notice, clientContract, organization, staffMembership, user } = schema;
type Contract = typeof clientContract.$inferSelect;
type Kind = typeof notice.$inferInsert["kind"];
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const TRIAL_WARN_DAYS = 7;

export const dayTxt = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const unitWord = (kind: Contract["kind"], plural = true) => (kind === "gym" ? (plural ? "socios" : "socio") : plural ? "alumnos" : "alumno");

/** Sólo el dueño del espacio (owner / coach_owner activo) ve condiciones y avisos. */
export async function requireOwner(actorId: string, orgId: string) {
  const roles = (await db.select({ r: staffMembership.role }).from(staffMembership)
    .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active")))).map((x) => x.r);
  if (!roles.some((r) => r === "owner" || r === "coach_owner")) throw new AccessError("not_found", "No encontramos lo que buscás.", 404);
}

/**
 * Registra el aviso (idempotente por dedupeKey) y avisa por correo al responsable. Se llama después de confirmar el cambio:
 * si el correo falla, el cambio sigue hecho y el aviso queda visible en la app con la entrega «failed» para Admin.
 */
export async function publishNotice(c: Contract, n: { kind: Kind; title: string; body: string; effectiveFrom?: string | null; dedupeKey: string; createdBy: string | null }) {
  const [row] = await db.insert(notice).values({ contractId: c.id, kind: n.kind, title: n.title.slice(0, 160), body: n.body.slice(0, 800),
    effectiveFrom: n.effectiveFrom ?? null, dedupeKey: n.dedupeKey, createdBy: n.createdBy }).onConflictDoNothing().returning();
  if (!row) return null;
  const [o] = await db.select({ name: organization.name, isDemo: organization.isDemo }).from(organization).where(eq(organization.id, c.orgId));
  if (o.isDemo) return { id: row.id, delivery: null };
  let delivery: "submitted" | "local_only" | "failed";
  let providerStatus: number | undefined;
  const where = `${appUrl()}/${c.kind === "gym" ? "gym" : "coach"}/${c.orgId}?s=${c.kind === "gym" ? "billing" : "terms"}`;
  try {
    delivery = await deliverMail({ to: c.responsibleEmail, subject: `REPI · ${n.title} (${o.name})`,
      body: `${n.title}\n${n.body}\n\nEl detalle y el historial están en «Condiciones REPI»: ${where}\nSi algo no coincide con lo que acordaste, pedí la corrección desde esa sección.` });
  } catch (e) {
    delivery = "failed";
    if (e instanceof MailError) providerStatus = e.status; else logError("commercial.notice_mail", e);
  }
  await db.update(notice).set({ delivery }).where(eq(notice.id, row.id));
  await audit(db, { actorUserId: n.createdBy, orgId: c.orgId, action: "commercial.notice_delivery", resourceType: "contract_notice", resourceId: row.id,
    result: delivery === "failed" ? "error" : "ok", meta: { kind: n.kind, delivery, ...(providerStatus !== undefined ? { providerStatus } : {}) } });
  return { id: row.id, delivery };
}

const view = (r: { n: typeof notice.$inferSelect; ackName: string | null }) => ({
  id: r.n.id, kind: r.n.kind, title: r.n.title, body: r.n.body, effectiveFrom: r.n.effectiveFrom, at: r.n.createdAt.toISOString(),
  delivery: r.n.delivery, ackAt: r.n.ackAt?.toISOString() ?? null, ackBy: r.ackName,
});

export async function noticesOf(contractId: string, max = 50) {
  const rows = await db.select({ n: notice, ackName: user.name }).from(notice).leftJoin(user, eq(user.id, notice.ackBy))
    .where(eq(notice.contractId, contractId)).orderBy(desc(notice.createdAt)).limit(max);
  return rows.map(view);
}

/** «Entendido» del responsable: marca uno o todos los avisos pendientes de su espacio. No borra ni edita el aviso. */
export async function ackNotices(actorId: string, orgId: string, id: string | null, now = new Date()) {
  await requireOwner(actorId, orgId);
  const [c] = await db.select({ id: clientContract.id }).from(clientContract).where(eq(clientContract.orgId, orgId));
  if (!c) return { acked: 0 };
  const r = await db.update(notice).set({ ackBy: actorId, ackAt: now })
    .where(and(eq(notice.contractId, c.id), isNull(notice.ackAt), ...(id ? [eq(notice.id, id)] : []))).returning({ id: notice.id });
  if (r.length) await audit(db, { actorUserId: actorId, orgId, action: "commercial.notice_ack", resourceType: "contract_notice", resourceId: id ?? "all", meta: { count: r.length } });
  return { acked: r.length };
}

/** Job: aviso 7 días antes del fin de la prueba y al terminar (hasta 3 días después, para no avisar pruebas viejas). */
export async function trialNotices(now = new Date()) {
  const today = localDate(now);
  const rows = await db.select().from(clientContract).where(and(eq(clientContract.status, "enabled"), isNotNull(clientContract.trialUntil),
    gte(clientContract.trialUntil, addDay(today, -4)), lte(clientContract.trialUntil, addDay(today, TRIAL_WARN_DAYS)))).orderBy(asc(clientContract.trialUntil));
  if (!rows.length) return { created: 0 };
  const have = new Set((await db.select({ c: notice.contractId, k: notice.dedupeKey }).from(notice)
    .where(inArray(notice.contractId, rows.map((r) => r.id)))).map((x) => `${x.c}|${x.k}`));
  let created = 0;
  for (const c of rows) {
    const until = c.trialUntil!;
    const ended = until < today;
    const key = `${ended ? "trial_ended" : "trial_ending"}:${until}`;
    if (have.has(`${c.id}|${key}`)) continue;
    const after = dayTxt(addDay(until, 1));
    const r = await publishNotice(c, ended
      ? { kind: "trial_ended", title: "Terminó tu prueba gratuita", body: `La prueba terminó el ${dayTxt(until)}. Desde el ${after} rigen la cantidad y el precio acordados que ves en esta sección.`, effectiveFrom: addDay(until, 1), dedupeKey: key, createdBy: null }
      : { kind: "trial_ending", title: `Tu prueba gratuita termina el ${dayTxt(until)}`, body: `Desde el ${after} rigen la cantidad y el precio acordados que ves en esta sección. Si algo no coincide, pedí la corrección antes de esa fecha.`, effectiveFrom: addDay(until, 1), dedupeKey: key, createdBy: null });
    if (r) created++;
  }
  return { created };
}
