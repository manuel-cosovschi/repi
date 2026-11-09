// FSA1 · seguridad: la verificación en dos pasos no se saltea entrando con un código o un enlace por email. Con 2FA activa
// (REPI Admin, dueño), sólo el email no alcanza: el ingreso sin contraseña también pide el segundo paso y no deja sesión.
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { resetRateLimits } from "@/server/access/util";

const BASE = "http://localhost:3000";
const post = (path: string, body: unknown) => authPost(new Request(`${BASE}/api/auth${path}`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  body: JSON.stringify(body),
}));
const person = async (twoFactor: boolean) => {
  const id = randomUUID(), email = `${id}@example.test`;
  await db.insert(schema.user).values({ id, name: "Persona 2FA", email, emailVerified: true, twoFactorEnabled: twoFactor });
  if (twoFactor) await db.insert(schema.twoFactor).values({ id: randomUUID(), userId: id, secret: "encrypted-test-only", backupCodes: "encrypted-test-only", verified: true });
  return { id, email };
};
const lastMail = async (to: string) => (await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to)).orderBy(desc(schema.devMailbox.createdAt)).limit(1))[0];
const sessions = (userId: string) => db.select().from(schema.session).where(eq(schema.session.userId, userId));
const sessionCookie = (r: Response) => r.headers.getSetCookie().some((c) => /session_token=[^;]+/.test(c) && !/Max-Age=0/i.test(c));

beforeEach(() => resetRateLimits());

describe("2FA: el ingreso sin contraseña no saltea el segundo paso", () => {
  it("código por email (sign-in/email-otp): con 2FA no deja sesión y pide el segundo paso; sin 2FA entra", async () => {
    const strict = await person(true);
    expect((await post("/email-otp/send-verification-otp", { email: strict.email, type: "sign-in" })).status).toBe(200);
    const otp = /(\d{6})/.exec((await lastMail(strict.email)).body)![1];
    const r = await post("/sign-in/email-otp", { email: strict.email, otp });
    expect(sessionCookie(r)).toBe(false);
    expect(await sessions(strict.id)).toHaveLength(0);
    expect(await r.json()).toMatchObject({ twoFactorRedirect: true });

    const plain = await person(false);
    await post("/email-otp/send-verification-otp", { email: plain.email, type: "sign-in" });
    const ok = await post("/sign-in/email-otp", { email: plain.email, otp: /(\d{6})/.exec((await lastMail(plain.email)).body)![1] });
    expect(ok.status).toBe(200);
    expect(sessionCookie(ok)).toBe(true);
    expect(await sessions(plain.id)).toHaveLength(1);
  });

  it("enlace por email (magic link): con 2FA no deja sesión y lleva al segundo paso; sin 2FA entra", async () => {
    const strict = await person(true);
    expect((await post("/sign-in/magic-link", { email: strict.email, callbackURL: "/acceso?step=workspace" })).status).toBe(200);
    const url = /(https?:\/\/\S+)/.exec((await lastMail(strict.email)).body)![1];
    const r = await authGet(new Request(url.replace(/^https?:\/\/[^/]+/, BASE)));
    expect(sessionCookie(r)).toBe(false);
    expect(await sessions(strict.id)).toHaveLength(0);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/\/acceso\?step=twofa/);
    expect(r.headers.getSetCookie().some((c) => /two_factor=/.test(c))).toBe(true);

    const plain = await person(false);
    await post("/sign-in/magic-link", { email: plain.email, callbackURL: "/acceso?step=workspace" });
    const url2 = /(https?:\/\/\S+)/.exec((await lastMail(plain.email)).body)![1];
    const ok = await authGet(new Request(url2.replace(/^https?:\/\/[^/]+/, BASE)));
    expect(sessionCookie(ok)).toBe(true);
    expect(await sessions(plain.id)).toHaveLength(1);
  });

  it("la contraseña con 2FA sigue pidiendo el segundo paso (control existente)", async () => {
    const strict = await person(true);
    await db.insert(schema.account).values({ id: randomUUID(), accountId: strict.id, providerId: "credential", userId: strict.id,
      password: await (await import("better-auth/crypto")).hashPassword("Password123!") });
    const r = await post("/sign-in/email", { email: strict.email, password: "Password123!" });
    expect(await r.json()).toMatchObject({ twoFactorRedirect: true });
    expect(await db.select().from(schema.session).where(and(eq(schema.session.userId, strict.id)))).toHaveLength(0);
  });
});
