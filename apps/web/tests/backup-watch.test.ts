// D198: vigilante de respaldos independiente del cronograma de GitHub.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { checkBackupFreshness, heartbeatAuthorized, heartbeatSource, HEARTBEAT_AUDIENCE, recordBackupHeartbeat } from "@/server/ops/backup-watch";
import { BACKUP_AUDIENCE, BACKUP_POLICY, GITHUB_ISSUER, type Jwk } from "@/server/ops/github-oidc";
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

  it("token OIDC de GitHub: sólo el workflow de respaldo en main, con la audiencia del vigilante y la misma corrida", async () => {
    const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64url");
    const k = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const jwk = { ...(await crypto.subtle.exportKey("jwk", k.publicKey)), kid: "k1", use: "sig" } as Jwk;
    const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const sign = async (claims: Record<string, unknown>, priv = k.privateKey) => {
      const h = b64(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" })), b = b64(JSON.stringify(claims));
      return `${h}.${b}.${b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", priv, new TextEncoder().encode(`${h}.${b}`))))}`;
    };
    const sec = Math.floor(Date.now() / 1000);
    const good = { iss: GITHUB_ISSUER, aud: HEARTBEAT_AUDIENCE, repository: BACKUP_POLICY.repository, repository_owner_id: BACKUP_POLICY.repositoryOwnerId,
      ref: "refs/heads/main", workflow_ref: BACKUP_POLICY.workflowRef, event_name: "issues", run_id: "42108774553", iat: sec - 5, nbf: sec - 5, exp: sec + 290 };
    const req = (t: string) => new Request("http://x/api/cron/backup-heartbeat", { method: "POST", headers: { "x-repi-github-oidc": t } });
    const keys = async () => [jwk];
    const prev = process.env.BACKUP_HEARTBEAT_SECRET;
    delete process.env.BACKUP_HEARTBEAT_SECRET;
    try {
      expect(await heartbeatSource(req(await sign(good)), "42108774553", keys)).toBe("oidc");
      expect(await heartbeatSource(req(await sign({ ...good, event_name: "schedule" })), "42108774553", keys)).toBe("oidc");
      expect(await heartbeatSource(req(await sign(good)), "999", keys)).toBeNull(); // otra corrida
      expect(await heartbeatSource(req(await sign({ ...good, aud: BACKUP_AUDIENCE })), "42108774553", keys)).toBeNull(); // token de Storage
      expect(await heartbeatSource(req(await sign({ ...good, event_name: "pull_request", ref: "refs/pull/1/merge" })), "42108774553", keys)).toBeNull();
      expect(await heartbeatSource(req(await sign({ ...good, workflow_ref: "manuel-cosovschi/repi/.github/workflows/ci.yml@refs/heads/main" })), "42108774553", keys)).toBeNull();
      expect(await heartbeatSource(req(await sign({ ...good, repository: "otro/repi" })), "42108774553", keys)).toBeNull();
      expect(await heartbeatSource(req(await sign({ ...good, exp: sec - 120 })), "42108774553", keys)).toBeNull(); // vencido
      expect(await heartbeatSource(req(await sign(good, other.privateKey)), "42108774553", keys)).toBeNull(); // firma ajena
      expect(await heartbeatSource(req("no-es-un-token"), "42108774553", keys)).toBeNull();
      expect(await heartbeatSource(req(await sign(good)), "42108774553", async () => { throw new Error("sin red"); })).toBeNull();
      expect(await heartbeatSource(new Request("http://x", { method: "POST" }), "42108774553", keys)).toBeNull();
    } finally { if (prev !== undefined) process.env.BACKUP_HEARTBEAT_SECRET = prev; }
  });
});

