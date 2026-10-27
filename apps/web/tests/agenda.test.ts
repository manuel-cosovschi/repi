import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { arParts } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import { resetRateLimits } from "@/server/access/util";
import { myNotifications } from "@/server/notifications/feed";
import { appointmentForCalendar, createAppointment, listAgenda, myAppointments, respondAppointment, updateAppointment } from "@/server/training/agenda";

// F-CO-10 / F-HX-07 / D98: agenda con estado del turno, respuesta del alumno y asistencia marcada por el coach.
let n = 0;
async function verified(name = "Persona Agenda") {
  const email = `ag${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
async function pair() {
  const coach = await verified("Coach Agenda");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Agenda ${n}` });
  const u = await verified("Alumna Agenda");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  return { coach: coach.id, orgId: org.id, relId: rel.relationId, user: u.id };
}
const inDays = (d: number, time = "18:00") => ({ date: arParts(new Date(Date.now() + d * 86_400_000)).date, time });
beforeEach(() => resetRateLimits());

describe("agenda del coach", () => {
  it("agenda, lista por rango, evita superposición y el alumno confirma", async () => {
    const c = await pair();
    const slot = inDays(3);
    const a = await createAppointment(c.coach, c.orgId, { coachClientId: c.relId, ...slot, durationMin: 60, modality: "presencial", place: "Gym Norte · sala 2", note: "Evaluación" });
    expect(a).toMatchObject({ status: "scheduled", clientResponse: "pending", ...slot, durationMin: 60 });
    await expect(createAppointment(c.coach, c.orgId, { coachClientId: c.relId, date: slot.date, time: "18:30", durationMin: 30, modality: "online" })).rejects.toMatchObject({ code: "busy" });
    await createAppointment(c.coach, c.orgId, { coachClientId: c.relId, date: slot.date, time: "19:00", durationMin: 30, modality: "online" }); // pegada: no se pisa
    const week = await listAgenda(c.coach, c.orgId, { from: inDays(0).date, days: 7 });
    expect(week.map((x) => x.time)).toEqual(["18:00", "19:00"]);
    expect(week[0].client).toBe("Alumna Agenda");
    const mine = await myAppointments(c.user);
    expect(mine[0]).toMatchObject({ id: a.id, coach: "Coach Agenda", place: "Gym Norte · sala 2" });
    const feed = await myNotifications(c.user);
    expect(feed.items.find((x) => x.id.startsWith(`appt:${a.id}`))).toMatchObject({ dest: { tab: "home" }, tone: "cyan" });
    expect((await respondAppointment(c.user, a.id, "confirmed")).clientResponse).toBe("confirmed");
    const ics = await appointmentForCalendar(c.user, a.id);
    expect(ics.title).toContain("Sesión con");
  });

  it("reprogramar vuelve a «sin confirmar»; cancelar exige motivo y lo ve el alumno; no se confirma lo cancelado", async () => {
    const c = await pair();
    const a = await createAppointment(c.coach, c.orgId, { coachClientId: c.relId, ...inDays(2, "10:00"), durationMin: 45, modality: "online" });
    await respondAppointment(c.user, a.id, "confirmed");
    const r = await updateAppointment(c.coach, c.orgId, a.id, { action: "reschedule", ...inDays(4, "11:30") });
    expect(r).toMatchObject({ time: "11:30", clientResponse: "pending" });
    await expect(updateAppointment(c.coach, c.orgId, a.id, { action: "cancel", reason: " " })).rejects.toMatchObject({ code: "invalid" });
    await updateAppointment(c.coach, c.orgId, a.id, { action: "cancel", reason: "Viaje" });
    expect((await myAppointments(c.user)).find((x) => x.id === a.id)).toMatchObject({ status: "cancelled", cancelReason: "Viaje" });
    await expect(respondAppointment(c.user, a.id, "confirmed")).rejects.toMatchObject({ code: "closed" });
  });

  it("asistencia sólo desde la hora de inicio y separada del entrenamiento; validaciones y permisos", async () => {
    const c = await pair();
    const a = await createAppointment(c.coach, c.orgId, { coachClientId: c.relId, ...inDays(1, "09:00"), durationMin: 60, modality: "presencial" });
    await expect(updateAppointment(c.coach, c.orgId, a.id, { action: "done" })).rejects.toMatchObject({ code: "early" });
    const later = new Date(new Date(a.startsAt).getTime() + 70 * 60_000);
    expect((await updateAppointment(c.coach, c.orgId, a.id, { action: "no_show" }, later)).status).toBe("no_show");
    expect(await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.coachClientId, c.relId))).toHaveLength(0);
    await expect(createAppointment(c.coach, c.orgId, { coachClientId: c.relId, date: "2020-01-01", time: "10:00", durationMin: 60, modality: "online" })).rejects.toMatchObject({ code: "invalid" });
    await expect(createAppointment(c.coach, c.orgId, { coachClientId: c.relId, ...inDays(5), durationMin: 50, modality: "online" })).rejects.toMatchObject({ code: "invalid" });
    await expect(createAppointment(c.coach, c.orgId, { coachClientId: c.relId, date: "2026-02-31", time: "10:00", durationMin: 60, modality: "online" })).rejects.toMatchObject({ code: "invalid" });
    const other = await verified("Otro Coach");
    const org2 = await acc.createCoachOrganization(other.id, { brand: `Otra ${n}` });
    await expect(createAppointment(other.id, org2.id, { coachClientId: c.relId, ...inDays(6), durationMin: 60, modality: "online" })).rejects.toMatchObject({ status: 404 });
    await expect(updateAppointment(other.id, org2.id, a.id, { action: "cancel", reason: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(appointmentForCalendar(other.id, a.id)).rejects.toMatchObject({ status: 404 });
    const stranger = await verified("Ajena");
    await expect(respondAppointment(stranger.id, a.id, "declined")).rejects.toMatchObject({ status: 404 });
    expect(await myAppointments(stranger.id)).toEqual([]);
  });
});
