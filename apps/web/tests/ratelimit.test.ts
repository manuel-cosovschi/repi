import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { rateLimit, resetRateLimits } from "@/server/access/util";

// D74: el límite vive en la base, así lo comparten todas las instancias serverless.
beforeEach(() => resetRateLimits());

describe("límite de intentos compartido", () => {
  it("corta al superar el máximo de la ventana y se reinicia al vencer", async () => {
    await rateLimit("prueba:1.2.3.4", 2, 60_000);
    await rateLimit("prueba:1.2.3.4", 2, 60_000);
    await expect(rateLimit("prueba:1.2.3.4", 2, 60_000)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    await rateLimit("prueba:5.6.7.8", 2, 60_000); // otra clave no se ve afectada
    await db.update(schema.appRateLimit).set({ windowStart: new Date(Date.now() - 61_000) }).where(eq(schema.appRateLimit.key, "prueba:1.2.3.4"));
    await expect(rateLimit("prueba:1.2.3.4", 2, 60_000)).resolves.toBeUndefined();
  });
  it("pedidos simultáneos cuentan todos (sin carreras)", async () => {
    const r = await Promise.allSettled(Array.from({ length: 8 }, () => rateLimit("prueba:carrera", 5, 60_000)));
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(3);
  });
});
