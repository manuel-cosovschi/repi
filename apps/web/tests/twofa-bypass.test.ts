// FSA1 (comms/admin): la verificación en dos pasos no se puede saltear entrando por otro método (enlace o código por email).
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import { resetRateLimits } from "@/server/access/util";

const PW = "Password123!";
async function lastMail(to: string) {
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  return m;
}
async function withTwoFactor(o: { platformRole?: string | null } = {}) {
  const email = `twofa-${randomUUID()}@example.test`;
  const created = await auth.api.signUpEmail({ body: { email, name: "Admin Prueba", password: PW } });
  const uid = created.user.id;
  await db.update(schema.user).set({ emailVerified: true, twoFactorEnabled: true, platformRole: o.platformRole ?? null }).where(eq(schema.user.id, uid));
  await db.insert(schema.twoFactor).values({ id: randomUUID(), userId: uid, secret: "encrypted-test-only", backupCodes: "encrypted-test-only", verified: true });
  return { uid, email };
}
const sessions = async (uid: string) => db.select().from(schema.session).where(eq(schema.session.userId, uid));

beforeEach(() => resetRateLimits());

describe("2FA: ningún método de ingreso la saltea", () => {
  it("contraseña: pide el segundo paso y no deja sesión", async () => {
    const { uid, email } = await withTwoFactor({ platformRole: "admin" });
    const r = await auth.api.signInEmail({ body: { email, password: PW } }) as { twoFactorRedirect?: boolean };
    expect(r.twoFactorRedirect).toBe(true);
    expect(await sessions(uid)).toHaveLength(0);
  });

  it("enlace por email: no crea sesión para quien tiene 2FA", async () => {
    const { uid, email } = await withTwoFactor({ platformRole: "admin" });
    await auth.api.signInMagicLink({ body: { email, callbackURL: "/acceso?step=workspace" }, headers: new Headers() });
    const m = await lastMail(email);
    const token = /token=([^&\s]+)/.exec(m?.body ?? "")?.[1];
    expect(token).toBeTruthy();
    const err = await auth.api.magicLinkVerify({ query: { token: token!, callbackURL: "/acceso?step=workspace" }, headers: new Headers() }).then(() => null, (e: { headers?: Headers }) => e);
    expect(err?.headers?.get("location")).toContain("step=twofa");
    expect(await sessions(uid)).toHaveLength(0);
  });

  it("control: sin 2FA el enlace y el código por email siguen abriendo sesión", async () => {
    const email = `sin2fa-${randomUUID()}@example.test`;
    const { user } = await auth.api.signUpEmail({ body: { email, name: "Socia Prueba", password: PW } });
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, user.id));
    await auth.api.signInMagicLink({ body: { email, callbackURL: "/acceso?step=workspace" }, headers: new Headers() });
    const token = /token=([^&\s]+)/.exec((await lastMail(email))?.body ?? "")?.[1];
    await auth.api.magicLinkVerify({ query: { token: token! }, headers: new Headers() });
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = /\b(\d{6})\b/.exec((await lastMail(email))?.body ?? "")?.[1];
    await auth.api.signInEmailOTP({ body: { email, otp: otp! } });
    expect(await sessions(user.id)).toHaveLength(2);
  });

  it("código por email: no crea sesión para quien tiene 2FA", async () => {
    const { uid, email } = await withTwoFactor({ platformRole: "admin" });
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = /\b(\d{6})\b/.exec((await lastMail(email))?.body ?? "")?.[1];
    expect(otp).toBeTruthy();
    await auth.api.signInEmailOTP({ body: { email, otp: otp! } }).catch(() => null);
    expect(await sessions(uid)).toHaveLength(0);
  });
});
