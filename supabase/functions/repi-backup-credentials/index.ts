// D190: credencial TEMPORAL del rol de sólo lectura repi_backup para el respaldo de GitHub Actions.
// No hay contraseña guardada en GitHub ni en ningún otro lado: en cada respaldo el workflow presenta su token OIDC
// (audiencia repi-backup-db) y esta función, si el token es del workflow de respaldo en main de este repositorio:
//   - op=issue:  fija una contraseña aleatoria nueva que vence en 2 horas y se la devuelve (sólo a ese job, por TLS).
//   - op=revoke: la reemplaza por otra aleatoria que nadie conoce y que ya venció (el job la llama al terminar).
// El rol repi_backup no puede escribir (sin permisos de escritura y default_transaction_read_only); el usuario de la
// app (repi_app) no se toca. SUPABASE_DB_URL lo provee Supabase dentro de la función; nunca sale de acá.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.9";
import { DB_AUDIENCE, githubJwks, isBackupWorkflow, verifyGithubToken } from "./github-oidc.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const randomHex = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  const op = new URL(req.url).searchParams.get("op");
  if (req.method !== "POST" || (op !== "issue" && op !== "revoke")) return json({ error: "not_found" }, 404);
  let claims = null;
  try { claims = await verifyGithubToken(req.headers.get("x-repi-github-oidc") ?? "", await githubJwks()); } catch { return json({ error: "unavailable" }, 503); }
  if (!isBackupWorkflow(claims, DB_AUDIENCE)) return json({ error: "not_found" }, 404);
  const password = randomHex(); // 64 caracteres hexadecimales: seguro dentro de un literal SQL
  const until = new Date(Date.now() + (op === "issue" ? 2 * 3600_000 : -60_000)).toISOString();
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql.unsafe(`alter role repi_backup with password '${password}' valid until '${until}'`);
  } catch {
    return json({ error: "rotation_failed" }, 502);
  } finally {
    await sql.end({ timeout: 5 });
  }
  return op === "issue" ? json({ password, validUntil: until }) : json({ ok: true });
});
