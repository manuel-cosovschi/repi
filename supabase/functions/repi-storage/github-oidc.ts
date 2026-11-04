// D190: el respaldo diario de GitHub Actions lee los archivos privados sin guardar ningún secreto de Storage en GitHub.
// El job presenta un token OIDC firmado por GitHub; acá se verifica la firma (RS256, claves públicas de GitHub) y que venga
// exactamente del workflow de respaldo de este repositorio, en main, por el cronograma, una ejecución manual o un pedido por issue
// (el workflow sólo acepta issues abiertos por el dueño).
// Ese token sólo habilita `sign_read` (lectura firmada por 60 s): nunca subir, reemplazar ni borrar.
// Módulo puro (sólo WebCrypto): lo usan la Edge Function (Deno) y las pruebas (Node).

export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
export const BACKUP_AUDIENCE = "repi-storage-backup";
export const BACKUP_POLICY = {
  repository: "manuel-cosovschi/repi",
  repositoryOwnerId: "106606403",
  workflowRef: "manuel-cosovschi/repi/.github/workflows/backup.yml@refs/heads/main",
  ref: "refs/heads/main",
  events: ["schedule", "workflow_dispatch", "issues"],
} as const;

export type Jwk = { kty: string; kid?: string; n?: string; e?: string; alg?: string; use?: string };
export type Claims = Record<string, unknown>;

const b64url = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const text = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

/** Verifica firma y vigencia; devuelve los claims o null. Nunca lanza con el contenido del token. */
export async function verifyGithubToken(token: string, jwks: Jwk[], now = Date.now()): Promise<Claims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 8192) return null;
    const header = text(parts[0]) as { alg?: string; kid?: string; typ?: string };
    if (header.alg !== "RS256" || !header.kid) return null;
    const jwk = jwks.find((k) => k.kid === header.kid && k.kty === "RSA" && (!k.use || k.use === "sig"));
    if (!jwk?.n || !jwk.e) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const claims = text(parts[1]) as Claims;
    const sec = Math.floor(now / 1000);
    if (claims.iss !== GITHUB_ISSUER) return null;
    if (typeof claims.exp !== "number" || claims.exp < sec - 30) return null;
    if (typeof claims.nbf === "number" && claims.nbf > sec + 60) return null;
    if (typeof claims.iat === "number" && claims.iat > sec + 60) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Sólo el workflow de respaldo, en main, de este repositorio y con la audiencia de Storage. */
export function isBackupWorkflow(claims: Claims | null): boolean {
  if (!claims) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return aud.length === 1 && aud[0] === BACKUP_AUDIENCE
    && claims.repository === BACKUP_POLICY.repository
    && String(claims.repository_owner_id) === BACKUP_POLICY.repositoryOwnerId
    && claims.ref === BACKUP_POLICY.ref
    && claims.workflow_ref === BACKUP_POLICY.workflowRef
    && (BACKUP_POLICY.events as readonly string[]).includes(String(claims.event_name));
}

let cache: { at: number; keys: Jwk[] } | null = null;
/** Claves públicas de GitHub, en memoria 10 min. */
export async function githubJwks(fetcher: typeof fetch = fetch, now = Date.now()): Promise<Jwk[]> {
  if (cache && now - cache.at < 600_000) return cache.keys;
  const r = await fetcher(`${GITHUB_ISSUER}/.well-known/jwks`);
  if (!r.ok) throw new Error("jwks");
  const keys = ((await r.json()) as { keys?: Jwk[] }).keys ?? [];
  cache = { at: now, keys };
  return keys;
}
