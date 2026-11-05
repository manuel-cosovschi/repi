// D198: vigilante de respaldos independiente del cronograma de GitHub.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { checkBackupFreshness, heartbeatAuthorized, recordBackupHeartbeat } from "@/server/ops/backup-watch";
import { resetRateLimits } from "@/server/access/util";

const H = 3_600_000;
beforeEach(async () => {
  await db.delete(schema.auditEvent).where(eq(schema.auditEvent.action, "backup.verified"));
  await resetRateLimits();
});

describe("vigilante de respaldos (D198)", () => {
  it("sin ninguna señal no está armado y no avisa (antes de configurarlo no hay falsas alarmas)", async () => {
    const notify = vi.fn(async () => true);
    expect(await checkBackupFreshness(new Date(), notify)).toMatchObject({ armed: false, late: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it("con un respaldo reciente no avisa; pasadas 30 h avisa una sola vez cada 12 h", async () => {
    expect((await recordBackupHeartbeat({ tag: "backup-20261105-144245-42047337258", run: "42047337258" })).ok).toBe(true);
    expect((await recordBackupHeartbeat({ tag: "backup-20261105-144245-42047337258", run: "42047337258" })).ok).toBe(true); // idempotente
    expect((await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.action, "backup.verified"))).length).toBe(1);
    const notify = vi.fn(async () => true);
    const t0 = Date.now();
    expect(await checkBackupFreshness(new Date(t0 + 29 * H), notify)).toMatchObject({ armed: true, late: false });
    expect(notify).not.toHaveBeenCalled();
    expect(await checkBackupFreshness(new Date(t0 + 31 * H), notify)).toMatchObject({ armed: true, late: true, notified: true });
    expect(await checkBackupFreshness(new Date(t0 + 32 * H), notify)).toMatchObject({ late: true, notified: false });
    expect(notify).toHaveBeenCalledTimes(1);
    const arg = (notify.mock.calls[0] as unknown as [{ msg: string }])[0];
    expect(arg.msg).toContain("backup-20261105-144245-42047337258");
    expect(arg.msg).not.toMatch(/@/); // sin datos personales
  });

  it("rechaza etiquetas o ejecuciones mal formadas", async () => {
    expect((await recordBackupHeartbeat({ tag: "x'; drop table", run: "1" })).ok).toBe(false);
    expect((await recordBackupHeartbeat({ tag: "backup-20261105-144245-1", run: "abc" })).ok).toBe(false);
  });

  it("la señal exige un secreto largo y exacto", () => {
    const req = (a?: string) => new Request("http://x/api/cron/backup-heartbeat", { method: "POST", headers: a ? { authorization: a } : {} });
    const prev = process.env.BACKUP_HEARTBEAT_SECRET;
    try {
      delete process.env.BACKUP_HEARTBEAT_SECRET;
      expect(heartbeatAuthorized(req("Bearer "))).toBe(false);
      process.env.BACKUP_HEARTBEAT_SECRET = "corto";
      expect(heartbeatAuthorized(req("Bearer corto"))).toBe(false);
      process.env.BACKUP_HEARTBEAT_SECRET = "s".repeat(40);
      expect(heartbeatAuthorized(req(`Bearer ${"s".repeat(40)}`))).toBe(true);
      expect(heartbeatAuthorized(req(`Bearer ${"s".repeat(39)}x`))).toBe(false);
      expect(heartbeatAuthorized(req())).toBe(false);
    } finally { if (prev === undefined) delete process.env.BACKUP_HEARTBEAT_SECRET; else process.env.BACKUP_HEARTBEAT_SECRET = prev; }
  });
});
