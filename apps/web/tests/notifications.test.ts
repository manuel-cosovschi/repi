import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as fu from "@/server/followup/services";
import { resetRateLimits } from "@/server/access/util";
import { markNotificationsSeen, myNotifications } from "@/server/notifications/feed";

// F-NT-01 / D94: centro de notificaciones del alumno armado desde fuentes reales, con destino y marca de leído.
let n = 0;
async function verified() {
  const email = `nt${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Avisos", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
async function pair() {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, {});
  const user = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: user.email });
  await acc.acceptInvitation(user.id, inv.code, []);
  const [rel] = await db.select().from(schema.coachClient).where(eq(schema.coachClient.userId, user.id));
  return { coach: coach.id, orgId: org.id, user: user.id, relId: rel.id };
}

beforeEach(() => resetRateLimits());

describe("centro de notificaciones del alumno", () => {
  it("junta pedidos, solicitudes de acceso y avisos con destino; sin salud; leído por marca", async () => {
    const { coach, orgId, user, relId } = await pair();
    const t0 = new Date();
    const r = await fu.createRequest(user, { kind: "tecnica", text: "¿Cómo bajo en la sentadilla?" });
    await fu.resolveRequest(coach, orgId, r.id);
    await fu.requestAccess(coach, orgId, relId, "measurements", "Para seguir tu progreso");
    await db.insert(schema.memberNotice).values({ userId: user, kind: "prize_delivered", title: "Premio entregado", body: "Remera. ¡Felicitaciones!" });
    await fu.reportPain(user, { zone: "Rodilla izq.", level: 3, context: "now", exerciseName: "Sentadilla" });
    await fu.saveCheckin(user, { energy: 2, sleep: 2, mood: 2 });

    const a = await myNotifications(user);
    const byId = (p: string) => a.items.find((x) => x.id.startsWith(p));
    expect(byId(`req:${r.id}:done`)).toMatchObject({ title: "Pedido resuelto · Revisar técnica", dest: { tab: "home" }, tone: "ok", unread: true });
    expect(byId("access:")).toMatchObject({ dest: { tab: "perfil" } });
    expect(byId("access:")!.body).toContain("medidas corporales");
    expect(byId("notice:")).toMatchObject({ title: "Premio entregado", dest: { tab: "gym", gymTab: "logros" } });
    expect(a.unread).toBe(a.items.length);
    // Ordenadas de la más nueva a la más vieja; sin molestias ni check-ins.
    expect([...a.items].sort((x, y) => y.at.localeCompare(x.at)).map((x) => x.id)).toEqual(a.items.map((x) => x.id));
    expect(JSON.stringify(a)).not.toMatch(/Rodilla|energ/i);

    const { seenAt } = await markNotificationsSeen(user, new Date(Date.now() + 1000));
    const b = await myNotifications(user);
    expect(b).toMatchObject({ unread: 0, seenAt });
    expect(b.items.length).toBe(a.items.length); // leer no borra ni resuelve nada

    await db.insert(schema.memberNotice).values({ userId: user, kind: "attempt_rejected", title: "Intento no aprobado · Dominadas", body: "Motivo: video cortado.", createdAt: new Date(Date.now() + 5000) });
    const c = await myNotifications(user);
    expect(c.unread).toBe(1);
    expect(c.items[0]).toMatchObject({ title: "Intento no aprobado · Dominadas", tone: "bad", dest: { tab: "gym", gymTab: "ch" }, unread: true });
    expect(t0 <= new Date(c.items[0].at)).toBe(true);
  });

  it("no muestra avisos de otra persona y excluye lo anterior a 30 días", async () => {
    const { user } = await pair();
    const otro = await verified();
    await db.insert(schema.memberNotice).values([
      { userId: otro.id, kind: "prize_delivered", title: "Premio de otra persona", body: "x" },
      { userId: user, kind: "challenge_closed", title: "Desafío viejo", body: "x", createdAt: new Date(Date.now() - 40 * 86_400_000) },
    ]);
    const f = await myNotifications(user);
    expect(JSON.stringify(f)).not.toContain("otra persona");
    expect(JSON.stringify(f)).not.toContain("Desafío viejo");
  });
});
