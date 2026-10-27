import { afterEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { MailError, sendMail } from "@/server/mailer";

// Contrato del adaptador de correo (D70). No llama al proveedor real: se verifica el pedido HTTP que se enviaría.
const env = (vars: Record<string, string | undefined>) => { for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v as string); };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("adaptador de correo", () => {
  it("sin driver va al buzón DEV fuera de producción", async () => {
    const to = `buzon.${Date.now()}@test.repi.local`;
    await sendMail({ to, subject: "Hola", body: "Tu código REPI es 123456." });
    const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to)).orderBy(desc(schema.devMailbox.createdAt));
    expect(m.subject).toBe("Hola");
  });
  it("en producción sin proveedor falla explícitamente; en DEMO declarado usa el buzón", async () => {
    env({ NODE_ENV: "production", REPI_DEPLOY: undefined, MAIL_DRIVER: undefined });
    await expect(sendMail({ to: "x@test.repi.local", subject: "s", body: "b" })).rejects.toThrow(/D24/);
    env({ REPI_DEPLOY: "demo" });
    await expect(sendMail({ to: `demo.${Date.now()}@test.repi.local`, subject: "s", body: "b" })).resolves.toBeUndefined();
  });
  it("resend: arma el pedido con remitente, destinatario y texto; sin credenciales no arranca", async () => {
    env({ MAIL_DRIVER: "resend", RESEND_API_KEY: undefined, MAIL_FROM: undefined });
    await expect(sendMail({ to: "a@b.c", subject: "s", body: "b" })).rejects.toThrow(/RESEND_API_KEY/);
    env({ RESEND_API_KEY: "re_test_clave", MAIL_FROM: "REPI <hola@example.test>", MAIL_REPLY_TO: "soporte@example.test" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendMail({ to: "alumna@example.test", subject: "Tu código", body: "Tu código REPI es 654321." });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_clave");
    expect(JSON.parse(init.body as string)).toEqual({ from: "REPI <hola@example.test>", to: ["alumna@example.test"], subject: "Tu código", text: "Tu código REPI es 654321.", reply_to: "soporte@example.test" });
  });
  it("resend: rechazo y caída se informan sin exponer el contenido, marcando si conviene reintentar", async () => {
    env({ MAIL_DRIVER: "resend", RESEND_API_KEY: "re_test_clave", MAIL_FROM: "hola@example.test" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    const e1 = await sendMail({ to: "a@example.test", subject: "s", body: "secreto 111111" }).catch((e) => e);
    expect(e1).toBeInstanceOf(MailError);
    expect(e1).toMatchObject({ status: 422, retryable: false });
    expect(String(e1.message)).not.toContain("111111");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const e2 = await sendMail({ to: "a@example.test", subject: "s", body: "b" }).catch((e) => e);
    expect(e2).toMatchObject({ status: 0, retryable: true });
  });
  it("DEMO con Resend: guarda copia en el buzón y un rechazo del proveedor no corta el flujo", async () => {
    env({ NODE_ENV: "production", REPI_DEPLOY: "demo", MAIL_DRIVER: "resend", RESEND_API_KEY: "re_test_clave", MAIL_FROM: "REPI <onboarding@resend.dev>" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const to = `demo.resend.${Date.now()}@test.repi.local`;
    await expect(sendMail({ to, subject: "Código", body: "Tu código REPI es 222222." })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, to));
    expect(m.subject).toBe("Código");
  });
});
