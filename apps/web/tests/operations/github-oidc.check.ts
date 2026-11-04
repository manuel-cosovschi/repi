import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_AUDIENCE, BACKUP_POLICY, GITHUB_ISSUER, isBackupWorkflow, verifyGithubToken, type Jwk } from "../../../../supabase/functions/repi-storage/github-oidc";

// D190: Storage sólo firma lecturas para un token de GitHub del workflow de respaldo, en main, de este repositorio.
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64url");
async function keypair(kid: string) {
  const k = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = (await crypto.subtle.exportKey("jwk", k.publicKey)) as Jwk;
  return { priv: k.privateKey, jwk: { ...jwk, kid, use: "sig" } };
}
async function sign(priv: CryptoKey, kid: string, claims: Record<string, unknown>, alg = "RS256") {
  const head = b64(JSON.stringify({ alg, kid, typ: "JWT" })), body = b64(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", priv, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}
const NOW = Date.parse("2026-11-04T06:20:00Z"), sec = NOW / 1000;
const good = { iss: GITHUB_ISSUER, aud: BACKUP_AUDIENCE, repository: BACKUP_POLICY.repository, repository_owner_id: BACKUP_POLICY.repositoryOwnerId,
  ref: "refs/heads/main", workflow_ref: BACKUP_POLICY.workflowRef, event_name: "schedule", iat: sec - 10, nbf: sec - 10, exp: sec + 290 };

test("acepta sólo un token firmado por GitHub, vigente, del workflow de respaldo en main", async () => {
  const { priv, jwk } = await keypair("k1");
  const claims = await verifyGithubToken(await sign(priv, "k1", good), [jwk], NOW);
  assert.equal(isBackupWorkflow(claims), true);
  assert.equal(isBackupWorkflow(await verifyGithubToken(await sign(priv, "k1", { ...good, event_name: "workflow_dispatch" }), [jwk], NOW)), true);
});

test("rechaza firma ajena, clave desconocida, vencido, otro emisor y algoritmo distinto", async () => {
  const { priv, jwk } = await keypair("k1");
  const other = await keypair("k1");
  assert.equal(await verifyGithubToken(await sign(other.priv, "k1", good), [jwk], NOW), null);
  assert.equal(await verifyGithubToken(await sign(priv, "k9", good), [jwk], NOW), null);
  assert.equal(await verifyGithubToken(await sign(priv, "k1", { ...good, exp: sec - 120 }), [jwk], NOW), null);
  assert.equal(await verifyGithubToken(await sign(priv, "k1", { ...good, iss: "https://evil.example" }), [jwk], NOW), null);
  assert.equal(await verifyGithubToken(await sign(priv, "k1", good, "none"), [jwk], NOW), null);
  const t = await sign(priv, "k1", good);
  const [h, , s] = t.split(".");
  assert.equal(await verifyGithubToken(`${h}.${b64(JSON.stringify({ ...good, repository: "x/y" }))}.${s}`, [jwk], NOW), null, "claims alterados");
  for (const bad of ["", "a.b", "a.b.c", "x".repeat(9000)]) assert.equal(await verifyGithubToken(bad, [jwk], NOW), null);
});

test("rechaza otra rama, PR, otro workflow, otro repositorio u otra audiencia", async () => {
  for (const change of [{ ref: "refs/heads/feature" }, { ref: "refs/pull/9/merge", event_name: "pull_request" }, { event_name: "push" },
    { workflow_ref: "manuel-cosovschi/repi/.github/workflows/ci.yml@refs/heads/main" },
    { workflow_ref: "manuel-cosovschi/repi/.github/workflows/backup.yml@refs/heads/feature" },
    { repository: "otro/repi" }, { repository_owner_id: "1" }, { aud: "otra" }, { aud: [BACKUP_AUDIENCE, "otra"] }]) {
    assert.equal(isBackupWorkflow({ ...good, ...change }), false, JSON.stringify(change));
  }
  assert.equal(isBackupWorkflow(null), false);
});
