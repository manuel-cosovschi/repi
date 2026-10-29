import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { twoFactor } from "better-auth/plugins/two-factor";
import { db, schema } from "@/db";
import { requireEnv } from "./env";
import { sendMail } from "./mailer";

// Estas identidades se sembraron con claves públicas. La demo guiada usa otros dominios
// reservados y sesiones aisladas; las cuentas del seed sólo existen para desarrollo local.
export function retiredDemoEmail(email: string) {
  return /@demo\.repi\.app$/i.test(email.trim()) &&
    (process.env.NODE_ENV === "production" || !!process.env.REPI_DEPLOY || !!process.env.VERCEL);
}
const blockedDemo = () => new APIError("FORBIDDEN", { code: "ACCOUNT_UNAVAILABLE", message: "Esta cuenta no está disponible. Usá tu cuenta personal o la demo guiada." });

const OTP_SUBJECT = {
  "email-verification": "Tu código para verificar el email",
  "forget-password": "Tu código para recuperar la contraseña",
  "sign-in": "Tu código para ingresar",
  "change-email": "Tu código para cambiar el email",
} as const;

const social: Record<string, { clientId: string; clientSecret: string }> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  social.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  social.apple = { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET };
}

export const auth = betterAuth({
  appName: "REPI",
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: requireEnv("BETTER_AUTH_URL"),
  // Dominios adicionales que sirven la misma app (p. ej. repiclub.com y el alias de Vercel durante el cambio de dominio).
  trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  telemetry: { enabled: false },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user, session: schema.session, account: schema.account,
      verification: schema.verification, twoFactor: schema.twoFactor, rateLimit: schema.rateLimit,
    },
  }),
  databaseHooks: {
    user: {
      create: { before: async (u) => { if (retiredDemoEmail(u.email)) throw blockedDemo(); } },
      update: { before: async (u) => { if (u.email && retiredDemoEmail(u.email)) throw blockedDemo(); } },
    },
    session: { create: { before: async (s) => {
      const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, s.userId));
      if (!u || retiredDemoEmail(u.email)) throw blockedDemo();
    } } },
  },
  user: {
    additionalFields: {
      birthDate: { type: "string", required: false, input: false },
      platformRole: { type: "string", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true, // rec3: "Cerramos tus otras sesiones."
    // Anti-enumeración: un registro con email existente responde igual y avisa al titular.
    async onExistingUserSignUp({ user }) {
      await sendMail({ to: user.email, subject: "Ya tenés una cuenta REPI", body: "Alguien intentó crear una cuenta con tu email. Si fuiste vos, ingresá con tu contraseña o recuperala." });
    },
  },
  emailVerification: { autoSignInAfterVerification: true, sendOnSignIn: true, sendOnSignUp: false },
  socialProviders: social,
  // En base (D74): compartido entre instancias serverless; en memoria cada función tendría su propio contador.
  rateLimit: { enabled: true, window: 60, max: 30, storage: "database", modelName: "rateLimit" },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 15 * 60, // rec2: "Vence en 15 minutos."
      allowedAttempts: 5,
      storeOTP: "hashed",
      overrideDefaultEmailVerification: true,
      disableSignUp: true, // SEC-4: ingresar con código nunca crea una cuenta (sin términos ni edad)
      sendVerificationOnSignUp: false, // lo dispara /api/access/sign-up tras registrar la aceptación legal
      async sendVerificationOTP({ email, otp, type }) {
        await sendMail({ to: email, subject: OTP_SUBJECT[type], body: `Tu código REPI es ${otp}. Vence en 15 minutos.` });
      },
    }),
    magicLink({
      disableSignUp: true, // nunca crea cuentas sin aceptación de términos
      expiresIn: 10 * 60,
      async sendMagicLink({ email, url }) {
        await sendMail({ to: email, subject: "Tu enlace para entrar a REPI", body: `Entrá sin contraseña: ${url}\nVence en 10 minutos.` });
      },
    }),
    twoFactor({ issuer: "REPI", trustDeviceMaxAge: 30 * 24 * 60 * 60 }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
