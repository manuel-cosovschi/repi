// Agenda coach ↔ alumno (F-CO-10 / F-HX-07, D98). El coach agenda, reprograma, cancela y marca asistencia; el alumno
// confirma o avisa que no puede y descarga el .ics. Asistencia ≠ entrenamiento registrado: no se infiere una de otra.
// Agendar no necesita el permiso de entrenamientos (es logística), pero sí una relación activa con esta organización.
import { and, asc, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { APPT_DURATIONS, APPT_MODALITY, arParts, arToUtc, overlaps, type ApptModality } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { requireCoach } from "./services";

const { coachAppointment: appt, coachClient, user, organization } = schema;
const NF = () => new AccessError("not_found", "No encontramos esa sesión.", 404);
type Row = typeof appt.$inferSelect;

const view = <E extends Record<string, unknown> = Record<never, never>>(a: Row, extra?: E) => ({
  id: a.id, coachClientId: a.coachClientId, startsAt: a.startsAt.toISOString(), ...arParts(a.startsAt), durationMin: a.durationMin, modality: a.modality,
  place: a.place, note: a.note, status: a.status, clientResponse: a.clientResponse, respondedAt: a.respondedAt, cancelReason: a.cancelReason, updatedAt: a.updatedAt.toISOString(), ...(extra as E),
});

function parseSlot(p: { date: string; time: string; durationMin: number }, now: Date) {
  const startsAt = arToUtc(p.date, p.time);
  if (!startsAt) throw new AccessError("invalid", "Revisá la fecha y la hora.");
  if (startsAt.getTime() < now.getTime() - 5 * 60_000) throw new AccessError("invalid", "No se puede agendar en el pasado.");
  if (!(APPT_DURATIONS as readonly number[]).includes(p.durationMin)) throw new AccessError("invalid", "Elegí una duración de la lista.");
  return startsAt;
}

/** Otro turno agendado del mismo coach que se pisa con este horario. */
async function assertFree(orgId: string, startsAt: Date, durationMin: number, exceptId?: string) {
  const near = await db.select().from(appt).where(and(eq(appt.coachOrgId, orgId), eq(appt.status, "scheduled"),
    gte(appt.startsAt, new Date(startsAt.getTime() - 4 * 3_600_000)), lt(appt.startsAt, new Date(startsAt.getTime() + durationMin * 60_000)),
    ...(exceptId ? [ne(appt.id, exceptId)] : [])));
  if (near.some((x) => overlaps(startsAt, durationMin, x.startsAt, x.durationMin))) throw new AccessError("busy", "Ya tenés una sesión en ese horario.", 409);
}

export async function listAgenda(actorId: string, orgId: string, p: { from: string; days: number }) {
  await requireCoach(actorId, orgId);
  const from = arToUtc(p.from, "00:00");
  if (!from || p.days < 1 || p.days > 42) throw new AccessError("invalid", "Rango inválido.");
  const to = new Date(from.getTime() + p.days * 86_400_000);
  const rows = await db.select({ a: appt, name: user.name }).from(appt).innerJoin(coachClient, eq(coachClient.id, appt.coachClientId))
    .innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(appt.coachOrgId, orgId), gte(appt.startsAt, from), lt(appt.startsAt, to))).orderBy(asc(appt.startsAt));
  return rows.map((r) => view(r.a, { client: r.name }));
}

export async function createAppointment(actorId: string, orgId: string, p: {
  coachClientId: string; date: string; time: string; durationMin: number; modality: ApptModality; place?: string | null; note?: string | null;
}, now = new Date()) {
  await requireCoach(actorId, orgId);
  const [rel] = await db.select({ status: coachClient.status }).from(coachClient).where(and(eq(coachClient.id, p.coachClientId), eq(coachClient.coachOrgId, orgId)));
  if (!rel) throw new AccessError("not_found", "No encontramos ese cliente.", 404);
  if (rel.status !== "active") throw new AccessError("inactive", "Sólo se agenda con clientes activos.", 409);
  if (!(p.modality in APPT_MODALITY)) throw new AccessError("invalid", "Elegí presencial u online.");
  const startsAt = parseSlot(p, now);
  return db.transaction(async (tx) => {
    // Serializa altas del mismo coach para que dos pestañas no tomen el mismo horario.
    await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)).for("update");
    await assertFree(orgId, startsAt, p.durationMin);
    const [a] = await tx.insert(appt).values({
      coachOrgId: orgId, coachClientId: p.coachClientId, startsAt, durationMin: p.durationMin, modality: p.modality,
      place: p.place?.trim().slice(0, 160) || null, note: p.note?.trim().slice(0, 300) || null, createdBy: actorId, createdAt: now, updatedAt: now,
    }).returning();
    await audit(tx, { actorUserId: actorId, orgId, action: "appointment.created", resourceType: "coach_appointment", resourceId: a.id });
    return view(a);
  });
}

/** Cancelar (con motivo), reprogramar (vuelve a «sin confirmar») o marcar asistencia (sólo desde la hora de inicio). */
export async function updateAppointment(actorId: string, orgId: string, id: string, p: {
  action: "cancel" | "done" | "no_show" | "reschedule"; reason?: string | null; date?: string; time?: string; durationMin?: number;
}, now = new Date()) {
  await requireCoach(actorId, orgId);
  const [a] = await db.select().from(appt).where(and(eq(appt.id, id), eq(appt.coachOrgId, orgId)));
  if (!a) throw NF();
  let set: Partial<typeof appt.$inferInsert>;
  if (p.action === "cancel") {
    if (a.status !== "scheduled") throw new AccessError("closed", "Esa sesión ya no está agendada.", 409);
    if (!p.reason?.trim()) throw new AccessError("invalid", "Escribí el motivo: lo ve tu cliente.");
    set = { status: "cancelled", cancelReason: p.reason.trim().slice(0, 200), cancelledBy: actorId };
  } else if (p.action === "reschedule") {
    if (a.status !== "scheduled") throw new AccessError("closed", "Esa sesión ya no está agendada.", 409);
    const dur = p.durationMin ?? a.durationMin;
    const startsAt = parseSlot({ date: p.date ?? "", time: p.time ?? "", durationMin: dur }, now);
    await assertFree(orgId, startsAt, dur, id);
    set = { startsAt, durationMin: dur, clientResponse: "pending", respondedAt: null };
  } else {
    if (a.status === "cancelled") throw new AccessError("closed", "Esa sesión se canceló.", 409);
    if (a.startsAt.getTime() > now.getTime()) throw new AccessError("early", "La asistencia se marca desde la hora de la sesión.", 409);
    set = { status: p.action };
  }
  const [u] = await db.update(appt).set({ ...set, updatedAt: now }).where(eq(appt.id, id)).returning();
  await audit(db, { actorUserId: actorId, orgId, action: `appointment.${p.action}`, resourceType: "coach_appointment", resourceId: id });
  return view(u);
}

// ── Alumno ──────────────────────────────────────────────────────────────────
/** Próximas sesiones (y las de los últimos 30 días) con sus coaches. Incluye canceladas para que se entere. */
export async function myAppointments(userId: string, now = new Date()) {
  const rows = await db.select({ a: appt, coach: user.name, org: organization.name }).from(appt)
    .innerJoin(coachClient, eq(coachClient.id, appt.coachClientId)).innerJoin(organization, eq(organization.id, appt.coachOrgId))
    .innerJoin(user, eq(user.id, appt.createdBy))
    .where(and(eq(coachClient.userId, userId), inArray(coachClient.status, ["active", "paused"]), gte(appt.startsAt, new Date(now.getTime() - 30 * 86_400_000))))
    .orderBy(desc(appt.startsAt)).limit(40);
  return rows.map((r) => view(r.a, { coach: r.coach, org: r.org })).reverse();
}

export async function respondAppointment(userId: string, id: string, response: "confirmed" | "declined", now = new Date()) {
  const [r] = await db.select({ a: appt }).from(appt).innerJoin(coachClient, eq(coachClient.id, appt.coachClientId))
    .where(and(eq(appt.id, id), eq(coachClient.userId, userId)));
  if (!r) throw NF();
  if (r.a.status !== "scheduled" || r.a.startsAt.getTime() < now.getTime()) throw new AccessError("closed", "Esa sesión ya no se puede confirmar.", 409);
  const [u] = await db.update(appt).set({ clientResponse: response, respondedAt: now, updatedAt: now }).where(eq(appt.id, id)).returning();
  await audit(db, { actorUserId: userId, orgId: r.a.coachOrgId, action: `appointment.${response}`, resourceType: "coach_appointment", resourceId: id });
  return view(u);
}

/** Datos para el .ics: lo descarga el alumno de la relación o el coach dueño. */
export async function appointmentForCalendar(userId: string, id: string) {
  const [r] = await db.select({ a: appt, clientUser: coachClient.userId, client: user.name, org: organization.name }).from(appt)
    .innerJoin(coachClient, eq(coachClient.id, appt.coachClientId)).innerJoin(user, eq(user.id, coachClient.userId))
    .innerJoin(organization, eq(organization.id, appt.coachOrgId)).where(eq(appt.id, id));
  if (!r) throw NF();
  if (r.clientUser !== userId) await requireCoach(userId, r.a.coachOrgId).catch(() => { throw NF(); });
  const asClient = r.clientUser === userId;
  return {
    id: r.a.id, startsAt: r.a.startsAt, durationMin: r.a.durationMin, cancelled: r.a.status === "cancelled",
    title: asClient ? `Sesión con ${r.org}` : `Sesión con ${r.client}`,
    place: r.a.modality === "online" ? (r.a.place ? `Online · ${r.a.place}` : "Online") : r.a.place,
    description: r.a.note,
  };
}
