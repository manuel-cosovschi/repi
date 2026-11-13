// 13/11/2026 (pedido del titular): cada escaneo del QR de repiclub.com/qr avisa al teléfono de REPI Admin.
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import { isBot, notifyQrScan, qrScanText } from "@/server/site/qr";

let n = 0;
const person = async (name: string) => (await acc.signUpPerson({ name, email: `qr${++n}.${Date.now()}@test.repi.local`, password: "prueba1234", terms: true, birth: "01/01/1990" })).userId!;

describe("aviso por escaneo del QR", () => {
  it("el texto dice qué material se escaneó y cuántos escaneos van hoy, sin datos de quien escaneó", () => {
    expect(qrScanText("Remera REPI · ATICMA Awards 2026 (repiclub.com/qr)", 1)).toEqual({ title: "Escanearon el QR de REPI", body: "Remera REPI · ATICMA Awards 2026 · primer escaneo de hoy." });
    expect(qrScanText("Folleto comercial (repiclub.com/qr/folleto)", 4).body).toBe("Folleto comercial · 4 escaneos hoy.");
  });

  it("las vistas previas de enlaces y las herramientas no cuentan como una persona escaneando", () => {
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isBot("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36")).toBe(false);
    for (const ua of ["WhatsApp/2.24.1 A", "facebookexternalhit/1.1", "TelegramBot (like TwitterBot)", "Slackbot-LinkExpanding 1.0", "Googlebot/2.1", "curl/8.5.0", "", null]) expect(isBot(ua)).toBe(true);
  });

  it("encola un aviso para cada cuenta de REPI Admin y para nadie más", async () => {
    const admin = await person("Admin QR"), socio = await person("Socio QR");
    await db.update(schema.user).set({ platformRole: "admin" }).where(eq(schema.user.id, admin));
    await db.insert(schema.siteEvent).values({ name: "qr_scan", source: "qr", campaign: "aticma-2026", path: "/qr" });
    expect(await notifyQrScan("Remera REPI · ATICMA Awards 2026 (repiclub.com/qr)")).toBeGreaterThanOrEqual(1);
    const mine = await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.userId, admin), eq(schema.notificationOutbox.kind, "site_qr")));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Escanearon el QR de REPI", url: "/admin?s=site" });
    expect(mine[0].body).toMatch(/^Remera REPI · ATICMA Awards 2026 · (primer escaneo de hoy|\d+ escaneos hoy)\.$/);
    expect(await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.userId, socio), eq(schema.notificationOutbox.kind, "site_qr")))).toHaveLength(0);
    // Cada escaneo es un aviso propio (no se pisan entre sí).
    await notifyQrScan("Remera REPI · ATICMA Awards 2026 (repiclub.com/qr)");
    expect(await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.userId, admin), eq(schema.notificationOutbox.kind, "site_qr")))).toHaveLength(2);
  });
});
