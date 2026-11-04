// Proxy de almacenamiento privado de REPI (D83). Corre dentro de Supabase, donde la clave de servicio ya está disponible
// como variable del entorno: así la app en Vercel no necesita guardar la clave secreta del proyecto.
// La app se autentica con el encabezado x-repi-proxy; acá sólo vive el SHA-256 de ese secreto (el secreto está en Vercel).
// Operaciones: sign_upload (URL firmada de subida), sign_read (URL firmada de lectura, 60 s), put (archivos chicos), delete.
// D190: el respaldo de GitHub Actions entra con un token OIDC de GitHub (encabezado x-repi-github-oidc) y sólo puede firmar
// lecturas: ninguna otra operación acepta ese token. Ver github-oidc.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { githubJwks, isBackupWorkflow, verifyGithubToken } from "./github-oidc.ts";

const SECRET_SHA256 = "07dfe02a1dc693debc4fa564ac92527438c6dc7ee4194f58c6449e2eb9e6f3f9";
const BUCKET = "repi-private";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const validKey = (k: string) => /^[a-z0-9/_-]+$/i.test(k) && !k.includes("..") && k.length <= 300;

/** Respaldo (D190): sólo lectura firmada, sólo con un token del workflow de respaldo en main. */
async function backupRead(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  if (req.method !== "POST" || u.searchParams.get("op") !== "sign_read") return json({ error: "not_found" }, 404);
  let claims = null;
  try { claims = await verifyGithubToken(req.headers.get("x-repi-github-oidc") ?? "", await githubJwks()); } catch { return json({ error: "unavailable" }, 503); }
  if (!isBackupWorkflow(claims)) return json({ error: "not_found" }, 404);
  if (!validKey(key)) return json({ error: "invalid_key" }, 400);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(key, 60);
  return error ? json({ error: "read_failed" }, error.message.toLowerCase().includes("not found") ? 404 : 502) : json({ url: data.signedUrl });
}

Deno.serve(async (req) => {
  if (req.headers.has("x-repi-github-oidc")) return backupRead(req);
  if (req.method !== "POST" || (await sha256(req.headers.get("x-repi-proxy") ?? "")) !== SECRET_SHA256) return json({ error: "not_found" }, 404);
  const u = new URL(req.url);
  const op = u.searchParams.get("op"), key = u.searchParams.get("key") ?? "";
  if (!validKey(key)) return json({ error: "invalid_key" }, 400);
  const store = sb.storage.from(BUCKET);
  if (op === "sign_upload") {
    const { data, error } = await store.createSignedUploadUrl(key);
    return error ? json({ error: error.message }, 502) : json({ url: data.signedUrl });
  }
  if (op === "sign_read") {
    const { data, error } = await store.createSignedUrl(key, 60);
    return error ? json({ error: error.message }, error.message.toLowerCase().includes("not found") ? 404 : 502) : json({ url: data.signedUrl });
  }
  if (op === "put") {
    const { error } = await store.upload(key, new Uint8Array(await req.arrayBuffer()), { upsert: true, contentType: "application/octet-stream" });
    return error ? json({ error: error.message }, 502) : json({ ok: true });
  }
  if (op === "delete") {
    const { error } = await store.remove([key]);
    return error ? json({ error: error.message }, 502) : json({ ok: true });
  }
  return json({ error: "unknown_op" }, 400);
});
