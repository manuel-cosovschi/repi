// D149: correos con la estética de REPI y alertas de errores por email con límite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctaLabel, mailBlocks, renderMailHtml } from "@/server/mail-template";
import { alertError } from "@/server/alerts";
import { resetRateLimits } from "@/server/access/util";
import { sendMail } from "@/server/mailer";

beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function provider() {
  vi.stubEnv("MAIL_DRIVER", "resend");
  vi.stubEnv("RESEND_API_KEY", "unit-test-key-not-a-credential");
  vi.stubEnv("MAIL_FROM", "REPI <test@example.invalid>");
  const f = vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("plantilla de correo", () => {
  it("destaca el código, convierte enlaces en botón y no deja HTML del texto sin escapar", () => {
    expect(mailBlocks("Tu código REPI es 113751. Vence en 15 minutos.")).toEqual([
      { kind: "p", text: "Tu código REPI es:" }, { kind: "code", label: null, code: "113751" }, { kind: "p", text: "Vence en 15 minutos." }]);
    expect(mailBlocks("Código: ABC123\nAbrí https://repiclub.com/acceso?code=ABC123")).toEqual([
      { kind: "code", label: "Tu código", code: "ABC123" }, { kind: "cta", lead: "", url: "https://repiclub.com/acceso?code=ABC123" }]);
    expect(ctaLabel("https://repiclub.com/activar/tok")).toBe("Activar mi espacio");
    const html = renderMailHtml({ subject: "Hola <b>", body: "Texto <script>x</script>\nEntrá: https://repiclub.com/api/auth/magic-link/verify?token=t" }, "https://repiclub.com");
    expect(html).toContain("https://repiclub.com/brand/repi_icon.png");
    expect(html).toContain("Hola &lt;b&gt;");
    expect(html).toContain("Texto &lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain(">Entrar a REPI</a>");
  });

  it("todos los correos salen con versión HTML y la de texto de siempre", async () => {
    const f = provider();
    await sendMail({ to: "persona@test.repi.local", subject: "Tu código para verificar el email", body: "Tu código REPI es 113751. Vence en 15 minutos." });
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.text).toBe("Tu código REPI es 113751. Vence en 15 minutos.");
    expect(sent.html).toContain("113751");
  });
});

describe("alertas de errores", () => {
  const e = { scope: "media", where: "GET /api/media/x", name: "Error", msg: "almacenamiento: lectura falló (500)", pg: null };
  it("sin ALERT_EMAIL o sin proveedor no manda nada", async () => {
    const f = provider();
    expect(await alertError(e)).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ALERT_EMAIL", "titular@test.repi.local");
    vi.stubEnv("MAIL_DRIVER", "");
    expect(await alertError(e)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("avisa una vez por hora por error igual, sin datos de la persona", async () => {
    const f = provider();
    vi.stubEnv("ALERT_EMAIL", "titular@test.repi.local");
    expect(await alertError(e)).toBe(true);
    expect(await alertError(e)).toBe(false);
    expect(await alertError({ ...e, msg: "otro error" })).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.to).toEqual(["titular@test.repi.local"]);
    expect(sent.subject).toBe("Error en REPI: media");
    expect(sent.text).toContain("GET /api/media/x");
  });
});
