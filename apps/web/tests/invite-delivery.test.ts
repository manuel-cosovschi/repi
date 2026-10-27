import { and, desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import { resetRateLimits } from "@/server/access/util";
import { confirmImport } from "@/server/access/import";

// D100: la invitación del coach y del equipo registra si el correo salió; un rechazo no la anula ni se oculta.
let n = 0;
async function verified(name = "Persona Entrega", email = `de${++n}.${Date.now()}@test.repi.local`) {
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const providerDown = () => {
  vi.stubEnv("MAIL_DRIVER", "resend"); vi.stubEnv("RESEND_API_KEY", "re_test_clave"); vi.stubEnv("MAIL_FROM", "REPI <hola@example.test>");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
};

describe("entrega de invitaciones", () => {
  it("buzón local queda como local_only; un rechazo queda failed, auditado y la invitación sigue vigente", async () => {
    const coach = await verified("Coach Entrega");
    const org = await acc.createCoachOrganization(coach.id, { brand: `Entrega ${n}` });
    const ok = await acc.inviteCoachClient(coach.id, org.id, { email: `ok${n}@example.test` });
    expect(ok.delivery).toBe("local_only");
    providerDown();
    const bad = await acc.inviteCoachClient(coach.id, org.id, { email: `caido${n}@example.test` });
    expect(bad).toMatchObject({ delivery: "failed", status: "pending" });
    const [row] = await db.select().from(schema.invitation).where(eq(schema.invitation.id, bad.id));
    expect(row.delivery).toBe("failed");
    const [ev] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, bad.id), eq(schema.auditEvent.action, "invitation.delivery")));
    expect(ev).toMatchObject({ result: "error", meta: { delivery: "failed", providerStatus: 503 } });
    const r = await confirmImport(coach.id, org.id, [{ line: 2, email: `csv${n}@example.test` }]);
    expect(r.rows[0]).toMatchObject({ result: "invited", detail: "Invitación creada · el correo no salió, reenviala" });
  });
});
