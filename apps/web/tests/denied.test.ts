import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle } from "@/server/access/http";
import { AccessError } from "@/server/access/util";

// F-PR-04: cada acceso denegado queda auditado con ruta y código, sin cuerpo; los errores de datos no.
describe("auditoría de accesos denegados", () => {
  it("registra 403 y 404 con ruta, método y código; no registra 400", async () => {
    const path = `/api/gym/org-${Date.now()}/members`;
    const deny = handle(async () => { throw new AccessError("forbidden", "Tu rol no puede.", 403); });
    const res = await deny(new Request(`https://repi.test${path}?q=secreto`, { method: "POST", body: JSON.stringify({ dni: "12345678" }) }), {});
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden", error: "Tu rol no puede." });
    const bad = handle(async () => { throw new AccessError("invalid", "Revisá.", 400); });
    await bad(new Request(`https://repi.test${path}`), {});
    const rows = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "access.denied"), eq(schema.auditEvent.resourceId, path)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result: "denied", actorUserId: null, meta: { code: "forbidden", status: 403, method: "POST" } });
    expect(JSON.stringify(rows[0])).not.toMatch(/secreto|12345678/);
  });
});
