// Centro de avisos del staff gym (F-HX-26, D101). La bandeja persiste aunque el push no llegue (o el teléfono esté
// apagado): son las filas de notification_outbox de esta persona (altas, escalamientos y alertas de sala), con su estado
// leído (marca propia) y resuelto (tomado del origen: solicitud decidida o alerta atendida, por quien sea). Sólo avisos
// de este gym y de las sedes donde la persona sigue teniendo acceso; el destino abre la pantalla correspondiente.
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { gymContext } from "./services";

const { notificationOutbox: outbox, membershipRequest, floorAlert, gymLocation, user } = schema;
const STAFF_KINDS = ["join_request", "join_escalation", "floor_alert"] as const;
const WINDOW_DAYS = 14;

const REQ_STATE: Record<string, string> = { approved: "Aprobada", rejected: "Rechazada", cancelled: "Cancelada por la persona", expired: "Venció" };

export async function myStaffNotices(actorId: string, orgId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  const rows = await db.select().from(outbox).where(and(eq(outbox.userId, actorId), inArray(outbox.kind, [...STAFF_KINDS]),
    gte(outbox.createdAt, new Date(now.getTime() - WINDOW_DAYS * 86_400_000)))).orderBy(desc(outbox.createdAt)).limit(80);
  // dedupeKey = «join:<id>:<user>», «esc:<id>:<user>» o «floor:<id>:<user>».
  const src = (r: typeof rows[number]) => r.dedupeKey.split(":")[1] ?? "";
  const reqIds = rows.filter((r) => r.kind !== "floor_alert").map(src), alertIds = rows.filter((r) => r.kind === "floor_alert").map(src);
  const reqs = reqIds.length ? await db.select({ r: membershipRequest, loc: gymLocation.name, by: user.name }).from(membershipRequest)
    .innerJoin(gymLocation, eq(gymLocation.id, membershipRequest.locationId)).leftJoin(user, eq(user.id, membershipRequest.decidedBy))
    .where(inArray(membershipRequest.id, reqIds)) : [];
  const alerts = alertIds.length ? await db.select({ a: floorAlert, loc: gymLocation.name, by: user.name }).from(floorAlert)
    .innerJoin(gymLocation, eq(gymLocation.id, floorAlert.locationId)).leftJoin(user, eq(user.id, floorAlert.ackBy))
    .where(inArray(floorAlert.id, alertIds)) : [];
  const reqById = new Map(reqs.map((x) => [x.r.id, x])), alertById = new Map(alerts.map((x) => [x.a.id, x]));
  const allowed = (orgOf: string, locationId: string) => orgOf === orgId && (ctx.locationIds == null || ctx.locationIds.includes(locationId));
  const items = [];
  for (const r of rows) {
    if (r.kind === "floor_alert") {
      const x = alertById.get(src(r));
      if (!x || !allowed(x.a.orgId, x.a.locationId)) continue;
      items.push({
        id: r.id, kind: r.kind, title: `Alerta de sala · ${x.loc}`, body: `${x.a.exerciseName}: un socio pidió atención.`, at: r.createdAt.toISOString(),
        read: !!r.readAt, resolved: !!x.a.ackAt, resolution: x.a.ackAt ? `Atendida${x.by ? ` por ${x.by}` : ""}` : "Sin atender",
        go: { s: "shift", sel: x.a.id }, locationId: x.a.locationId,
      });
    } else {
      const x = reqById.get(src(r));
      if (!x || !allowed(x.r.orgId, x.r.locationId)) continue;
      const pending = x.r.status === "pending";
      items.push({
        id: r.id, kind: r.kind, title: `${r.kind === "join_escalation" ? "Solicitud esperando" : "Solicitud de acceso"} · ${x.loc}`,
        body: r.kind === "join_escalation" ? "Nadie la resolvió en piso todavía." : "Alguien escaneó el QR y pidió acceso.", at: r.createdAt.toISOString(),
        read: !!r.readAt, resolved: !pending, resolution: pending ? "Pendiente" : `${REQ_STATE[x.r.status] ?? x.r.status}${x.by ? ` · ${x.by}` : ""}`,
        go: { s: "joins", sel: x.r.id }, locationId: x.r.locationId,
      });
    }
  }
  return { items, unread: items.filter((i) => !i.read && !i.resolved).length, windowDays: WINDOW_DAYS };
}

/** Marca como leídos los avisos indicados (o todos los de la persona). Nunca toca los de otra persona. */
export async function markStaffNoticesRead(actorId: string, orgId: string, ids: string[] | null, now = new Date()) {
  await gymContext(actorId, orgId);
  await db.update(outbox).set({ readAt: now }).where(and(eq(outbox.userId, actorId), isNull(outbox.readAt), inArray(outbox.kind, [...STAFF_KINDS]),
    ...(ids ? [inArray(outbox.id, ids.length ? ids : ["-"])] : [])));
  return { ok: true };
}
