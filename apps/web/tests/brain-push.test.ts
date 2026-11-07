// D210 · Push y centro de notificaciones del Asistente REPI. Reglas al enviar (processOutbox), no sólo al encolar: horario de
// silencio posterga (caso 47), lo ya visto no se empuja (caso 51), menores nunca (caso 59), categoría o push apagados no salen,
// lo viejo no sale. Los demás tipos de push siguen igual. Opt-in del socio desde su dispositivo y fuente «Asistente REPI» en el
// centro de notificaciones. Sin claves VAPID reales ni proveedores: nada sale de la máquina.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { arParts, nextAllowed } from "@repi/domain/brain/quiet";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { updatePrefs } from "@/server/brain/prefs";
import { proactiveFor, resetProactiveThrottle } from "@/server/brain/proactive";
import { processOutbox, pushStatus, subscribe } from "@/server/push/services";
import { markNotificationsSeen, myNotifications } from "@/server/notifications/feed";

const { brainIntervention, notificationOutbox, programAssignment, pushSubscription, brainPref } = schema;
const H = 3_600_000, D = 24 * H;
let n = 0, EX = "";
const EX_NAME = "Remo con barra AC3";
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const person = async (birthDate: string | null = "1990-01-01") => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: `Persona Push ${++n}`, email: `${id}@test.repi.local`, emailVerified: true, birthDate });
  return { id, email: `${id}@test.repi.local` };
};
beforeAll(async () => {
  EX = (await db.insert(schema.exercise).values({ name: EX_NAME, muscleGroup: "Espalda" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, EX_NAME)))[0].id;
});
beforeEach(() => { resetRateLimits(); resetProactiveThrottle(); });
afterEach(() => { vi.unstubAllEnvs(); });

/** Alumno de un coach con una sesión de hace 8 días (aviso «¿Retomamos?», que puede salir por push). */
async function inactive(birth: string | null = "1990-01-01") {
  const coach = await person();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach Push ${n}` });
  const u = await person(birth);
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Base", weeks: 4, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: EX_NAME, sets: 1, reps: "8-10", rir: 2, restSec: 90 }] }] });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  await db.update(programAssignment).set({ startsOn: "2020-01-01" }).where(eq(programAssignment.coachClientId, rel.relationId));
  const at = new Date(Date.now() - 8 * D);
  const t = await tr.myTraining(u.id, at);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(u.id, { id: sid, dayId: t.program.days[0].id }, at);
  const ses = await tr.getSession(u.id, sid, at);
  await tr.logSet(u.id, sid, { id: randomUUID(), programExerciseId: ses.exercises[0].id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 }, at);
  await tr.sessionAction(u.id, sid, "finish", at);
  return u.id;
}
const hm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
/** Horario de silencio de dos horas alrededor de `now` (hora AR) y el instante en que termina. */
const quietAround = (now: Date) => {
  const m = arParts(now).minutes;
  const q = { quietStart: hm(m - 60), quietEnd: hm(m + 60) };
  return { ...q, end: nextAllowed(now, q.quietStart, q.quietEnd) };
};
const brainPushes = (user: string) => db.select().from(notificationOutbox).where(and(eq(notificationOutbox.userId, user), eq(notificationOutbox.kind, "brain_coaching")));
/** Espera a que el envío en segundo plano que dispara enqueue() termine de mirar la fila (mismo resultado que el explícito). */
const settle = async (user: string, until: (r: typeof notificationOutbox.$inferSelect) => boolean) => {
  for (let i = 0; i < 40; i++) { const [r] = await brainPushes(user); if (r && until(r)) return r; await new Promise((ok) => setTimeout(ok, 50)); }
  return (await brainPushes(user))[0];
};
/** Adulto con push de REPI y silencio ahora: el aviso queda postergado en la cola. */
async function postponed() {
  const u = await inactive();
  const now = new Date();
  const q = quietAround(now);
  await updatePrefs(u, { push: true, quietStart: q.quietStart, quietEnd: q.quietEnd });
  const r = await proactiveFor(u, now, { push: true });
  expect(r.pushed).toBe(1);
  await processOutbox(1000, new Date()); // la fila nace con la hora de la base: se procesa con la hora actual, dentro del silencio
  const row = await settle(u, (x) => x.nextAttemptAt.getTime() > Date.now());
  return { u, now, q, row, card: r.emitted.find((i) => i.kind === "inactivity")! };
}

describe("reglas al enviar el push de REPI", () => {
  it("caso 47 · horario de silencio: la tarjeta sale igual, el push se posterga hasta el fin del silencio sin gastar intentos", async () => {
    const { u, q, row, card } = await postponed();
    expect(card).toMatchObject({ status: "pending", channel: "card" });
    expect(row).toMatchObject({ status: "pending", attempts: 0, title: "¿Retomamos?" });
    expect(row.nextAttemptAt.getTime()).toBe(q.end.getTime());
    expect(row.url).toBe(`/app?repi=${card.id}`);
    // Terminado el silencio, la regla de REPI ya no lo frena (en pruebas no hay proveedor ni dispositivo: se descarta por eso).
    await processOutbox(1000, new Date(q.end.getTime() + 60_000));
    const [after] = await brainPushes(u);
    expect(after.status).toBe("skipped");
    expect(["push sin configurar", "sin dispositivos"]).toContain(after.lastError);
  });

  it("caso 51 · ya visto en la app (abrió el centro de notificaciones): no se empuja", async () => {
    const { u, q, card } = await postponed();
    await markNotificationsSeen(u);
    const [iv] = await db.select().from(brainIntervention).where(eq(brainIntervention.id, card.id));
    expect(iv.status).toBe("shown");
    await processOutbox(1000, new Date(q.end.getTime() + 60_000));
    expect((await brainPushes(u))[0]).toMatchObject({ status: "skipped", lastError: "ya visto en la app" });
  });

  it("categoría apagada o push de REPI apagado mientras esperaba: no sale", async () => {
    const a = await postponed();
    await updatePrefs(a.u, { categories: { training: false } }); // «Recordatorios de entrenamiento»
    await processOutbox(1000, new Date(a.q.end.getTime() + 60_000));
    expect((await brainPushes(a.u))[0]).toMatchObject({ status: "skipped", lastError: "categoría apagada" });
    const b = await postponed();
    await updatePrefs(b.u, { push: false });
    await processOutbox(1000, new Date(b.q.end.getTime() + 60_000));
    expect((await brainPushes(b.u))[0]).toMatchObject({ status: "skipped", lastError: "push de REPI apagado" });
  });

  it("caso 59 · menores (y edad sin confirmar) nunca reciben push de coaching, ni al encolar ni al enviar", async () => {
    for (const birth of ["2013-05-01", null]) {
      const u = await inactive(birth);
      // Aunque una preferencia vieja dijera push=true (la API no lo permite a menores), no se encola nada.
      await db.insert(brainPref).values({ userId: u, push: true, quietStart: "00:00", quietEnd: "00:00" });
      const r = await proactiveFor(u, new Date(), { push: true });
      expect(r.emitted.some((i) => i.kind === "inactivity")).toBe(true); // la tarjeta en la app sí
      expect(r.pushed).toBe(0);
      expect(await brainPushes(u)).toEqual([]);
      // Y si una fila llegara a la cola, el envío la descarta.
      const iv = r.emitted.find((i) => i.kind === "inactivity")!;
      await db.insert(notificationOutbox).values({ userId: u, kind: "brain_coaching", title: "x", body: "x", url: "/app", dedupeKey: `brain:reminder:${iv.id}:${u}` });
      await processOutbox(1000, new Date());
      expect((await brainPushes(u))[0]).toMatchObject({ status: "skipped", lastError: "menor o edad sin confirmar" });
    }
  });

  it("lo que no se pudo mandar en el día ya no sale; los demás tipos de push no cambian (sin postergar por el silencio de REPI)", async () => {
    const u = await inactive();
    const now = new Date();
    const q = quietAround(now);
    await updatePrefs(u, { push: true, quietStart: "00:00", quietEnd: "00:00" });
    const r = await proactiveFor(u, now); // sin push: se encola a mano, vieja
    const iv = r.emitted.find((i) => i.kind === "inactivity")!;
    await db.insert(notificationOutbox).values({ userId: u, kind: "brain_coaching", title: "x", body: "x", url: "/app", dedupeKey: `brain:reminder:${iv.id}:${u}`, createdAt: new Date(now.getTime() - 25 * H), nextAttemptAt: new Date(now.getTime() - 60_000) });
    await processOutbox(1000, now);
    expect((await brainPushes(u))[0]).toMatchObject({ status: "skipped", lastError: "aviso vencido" });
    // Otro tipo (pedido de programa) en horario de silencio de REPI: sigue su camino de siempre.
    await updatePrefs(u, { quietStart: q.quietStart, quietEnd: q.quietEnd });
    await db.insert(notificationOutbox).values({ userId: u, kind: "program_brief", title: "x", body: "x", url: "/app", dedupeKey: `brief:test:${randomUUID()}:${u}`, nextAttemptAt: new Date(now.getTime() - 60_000) });
    await processOutbox(1000, now);
    const [other] = await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.userId, u), eq(notificationOutbox.kind, "program_brief")));
    expect(other.status).toBe("skipped");
    expect(["push sin configurar", "sin dispositivos"]).toContain(other.lastError);
    expect(other.nextAttemptAt.getTime()).toBeLessThanOrEqual(now.getTime());
  });
});

describe("opt-in del socio y centro de notificaciones", () => {
  const sub = () => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, keys: { p256dh: "p256dh-de-prueba", auth: "auth-de-prueba" } });
  it("el socio adulto registra su dispositivo para REPI en un paso; menor o edad desconocida: 403 y no se registra nada", async () => {
    const adult = await person("1990-01-01"), minor = await person("2012-03-01"), unknown = await person(null);
    expect((await pushStatus(adult.id)).coaching).toEqual({ enabled: false, eligible: true });
    expect(await subscribe(adult.id, sub(), "Prueba", { coaching: true })).toEqual({ ok: true, coaching: true });
    expect((await pushStatus(adult.id))).toMatchObject({ devices: 1, coaching: { enabled: true, eligible: true } });
    expect(await err(subscribe(minor.id, sub(), "Prueba", { coaching: true }))).toMatchObject({ code: "minor_restricted", status: 403 });
    expect(await err(subscribe(unknown.id, sub(), "Prueba", { coaching: true }))).toMatchObject({ code: "age_required", status: 403 });
    for (const u of [minor.id, unknown.id]) {
      expect(await db.select().from(pushSubscription).where(eq(pushSubscription.userId, u))).toEqual([]);
      expect((await pushStatus(u)).coaching).toEqual({ enabled: false, eligible: false });
    }
    // Sin `coaching`, igual que siempre (cualquier persona, sin tocar sus preferencias de REPI).
    expect(await subscribe(minor.id, sub(), "Prueba")).toEqual({ ok: true });
    expect((await pushStatus(minor.id)).coaching.enabled).toBe(false);
  });

  it("los avisos de REPI aparecen como «Asistente REPI» en el centro; abrirlo los marca vistos; con la asistencia apagada no aparecen", async () => {
    const u = await inactive();
    const r = await proactiveFor(u);
    const iv = r.emitted.find((i) => i.kind === "inactivity")!;
    const feed = await myNotifications(u);
    const item = feed.items.find((x) => x.id === `assistant:${iv.id}`);
    expect(item).toMatchObject({ origin: "assistant", unread: true, title: "¿Retomamos?", ref: { interventionId: iv.id }, dest: { tab: "train" }, cta: "Empezar" });
    await markNotificationsSeen(u);
    expect((await myNotifications(u)).items.find((x) => x.id === `assistant:${iv.id}`)?.unread).toBe(false);
    await updatePrefs(u, { proactive: false });
    expect((await myNotifications(u)).items.some((x) => x.origin === "assistant")).toBe(false);
    // Otra persona no ve nada de esto.
    const other = await person();
    expect((await myNotifications(other.id)).items.some((x) => x.origin === "assistant")).toBe(false);
  });
});

describe("módulo «assistant» apagado (revisión AC3: hallazgo 31)", () => {
  it("lo encolado no sale y la campanita no lista avisos del Asistente; los datos quedan", async () => {
    const a = await postponed();
    expect((await myNotifications(a.u)).items.some((x) => x.origin === "assistant")).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_REPI_FEATURES", "-assistant");
    await processOutbox(1000, new Date(a.q.end.getTime() + 60_000));
    expect((await brainPushes(a.u))[0]).toMatchObject({ status: "skipped", lastError: "asistente apagado" });
    expect((await myNotifications(a.u)).items.some((x) => x.origin === "assistant")).toBe(false);
    expect((await db.select().from(brainIntervention).where(eq(brainIntervention.id, a.card.id)))[0].status).toBe("pending");
  });
});
