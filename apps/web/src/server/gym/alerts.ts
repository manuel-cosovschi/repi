// Aviso en vivo al piso (pedido del usuario 26/10): el socio marca cómo se sintió una serie y, si pide atención,
// el entrenador de piso en turno en su sede recibe un push con texto mínimo y lo ve en «Mi turno».
// La alerta guardada es la fuente de verdad: el push es un atajo, no garantiza entrega.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { FLOOR_ALERT_COOLDOWN_MIN, FLOOR_ALERT_MAX_AGE_MIN, PUSH_FLOOR, SET_FEEL, type SetFeel } from "@repi/domain";
import { db, schema } from "@/db";
import { audit } from "../access/util";
import { enqueue } from "../push/services";
import { floorOnShift } from "../join/services";
import { gymContext, inScope, need, NOT_FOUND } from "./services";

const { floorAlert, gymMember, setLog, user } = schema;

type Raise = { gymMemberId: string; sessionId: string; setLogId: string; exerciseName: string; feel: SetFeel; at: Date };

/**
 * Crea la alerta y avisa al piso en turno de la sede principal del socio.
 * No avisa: series sincronizadas tarde (> 10 min), ni otra alerta del mismo socio dentro de 10 min (salvo pedido de ayuda).
 */
export async function raiseFloorAlert(r: Raise, now = new Date()) {
  if (now.getTime() - r.at.getTime() > FLOOR_ALERT_MAX_AGE_MIN * 60_000) return null;
  const [gm] = await db.select().from(gymMember).where(and(eq(gymMember.id, r.gymMemberId), eq(gymMember.status, "active")));
  if (!gm) return null;
  if (r.feel !== "ayuda") {
    const [recent] = await db.select({ id: floorAlert.id }).from(floorAlert)
      .where(and(eq(floorAlert.gymMemberId, gm.id), gte(floorAlert.createdAt, new Date(now.getTime() - FLOOR_ALERT_COOLDOWN_MIN * 60_000)))).limit(1);
    if (recent) return null;
  }
  const [a] = await db.insert(floorAlert).values({ orgId: gm.orgId, locationId: gm.locationId, gymMemberId: gm.id, sessionId: r.sessionId, setLogId: r.setLogId, exerciseName: r.exerciseName, feel: r.feel })
    .onConflictDoNothing().returning();
  if (!a) return null;
  const to = await floorOnShift(gm.orgId, gm.locationId);
  await enqueue(to, { kind: "floor_alert", dedupe: `floor:${a.id}`, ...PUSH_FLOOR, url: `/gym/${gm.orgId}?s=shift&sel=${a.id}` });
  return { id: a.id, notified: to.length };
}

/** Alertas de la última hora en la sede (más recientes primero). Requiere trabajo de piso o gestión de la sede. */
export async function listAlerts(actorId: string, orgId: string, locationId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  if (!inScope(ctx, locationId)) throw NOT_FOUND();
  const rows = await db.select({ a: floorAlert, name: user.name, w: setLog.weightKg, reps: setLog.reps, setIndex: setLog.setIndex }).from(floorAlert)
    .innerJoin(gymMember, eq(gymMember.id, floorAlert.gymMemberId)).innerJoin(user, eq(user.id, gymMember.userId))
    .leftJoin(setLog, eq(setLog.id, floorAlert.setLogId))
    .where(and(eq(floorAlert.orgId, orgId), eq(floorAlert.locationId, locationId), gte(floorAlert.createdAt, new Date(now.getTime() - 60 * 60_000))))
    .orderBy(desc(floorAlert.createdAt)).limit(30);
  const ackIds = [...new Set(rows.map((r) => r.a.ackBy).filter((x): x is string => !!x))];
  const ackNames = new Map((ackIds.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ackIds)) : []).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.a.id, member: r.name, exercise: r.a.exerciseName, feel: r.a.feel, feelLabel: SET_FEEL[r.a.feel as SetFeel] ?? r.a.feel,
    set: r.setIndex == null ? null : { n: r.setIndex + 1, weightKg: r.w == null ? null : Number(r.w), reps: r.reps },
    createdAt: r.a.createdAt, ackBy: r.a.ackBy ? ackNames.get(r.a.ackBy) ?? "Alguien del equipo" : null, ackAt: r.a.ackAt,
  }));
}

/** «Voy»: marca que alguien del piso lo atiende (visible para el resto del turno). Idempotente. */
export async function ackAlert(actorId: string, orgId: string, alertId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const [a] = await db.select().from(floorAlert).where(and(eq(floorAlert.id, alertId), eq(floorAlert.orgId, orgId)));
  if (!a || !inScope(ctx, a.locationId)) throw NOT_FOUND();
  if (a.ackBy) return { ok: true, already: a.ackBy !== actorId };
  await db.update(floorAlert).set({ ackBy: actorId, ackAt: now }).where(eq(floorAlert.id, a.id));
  await audit(db, { orgId, actorUserId: actorId, action: "floor_alert.ack", resourceType: "floor_alert", resourceId: a.id });
  return { ok: true, already: false };
}
