// Adaptador de almacenamiento privado (D39). Desarrollo: disco local fuera de /public, nunca servido estáticamente.
// Hospedado (D68): Supabase Storage en un bucket privado, accedido sólo desde el servidor con la clave secreta;
// el navegador nunca recibe URLs del bucket, sólo pasa por /api/media con sus permisos.
// Con SUPABASE_SECRET_KEY la app habla directo con Storage; sin ella, con el proxy `repi-storage` (Edge Function de
// Supabase, D83), que usa la clave de servicio dentro de Supabase. Sin ninguno, producción exige STORAGE_DIR.
import { createReadStream } from "node:fs";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

function root() {
  const dir = process.env.STORAGE_DIR ?? (process.env.NODE_ENV === "production" ? null : path.join(/* turbopackIgnore: true */ process.cwd(), ".storage"));
  if (!dir) throw new Error("STORAGE_DIR no configurado: no hay almacenamiento privado en producción (D39)");
  return dir;
}
const checkKey = (key: string) => {
  if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes("..")) throw new Error("clave de almacenamiento inválida");
  return key;
};
const safe = (key: string) => path.join(/* turbopackIgnore: true */ root(), checkKey(key)); // carpeta fuera del bundle: no se traza

function supabase() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "repi-private";
  const base = `${url.replace(/\/$/, "")}/storage/v1/object`;
  return { base, bucket, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}
function proxy() {
  const url = process.env.SUPABASE_STORAGE_PROXY_URL, secret = process.env.STORAGE_PROXY_SECRET;
  if (!url || !secret) return null;
  return (op: "sign_upload" | "sign_read" | "put" | "delete", key: string, body?: BodyInit) =>
    fetch(`${url}?op=${op}&key=${encodeURIComponent(checkKey(key))}`, { method: "POST", headers: { "x-repi-proxy": secret }, body });
}
/** URL firmada de lectura (60 s) vía proxy; null si el objeto no existe. */
async function proxyReadUrl(call: NonNullable<ReturnType<typeof proxy>>, key: string) {
  const r = await call("sign_read", key);
  if (r.status === 404) return null;
  return ((await (await expectOk(r, "firma de lectura")).json()) as { url: string }).url;
}
async function expectOk(r: Response, what: string) {
  if (!r.ok) throw new Error(`almacenamiento: ${what} falló (${r.status})`);
  return r;
}

export async function putObject(key: string, bytes: Uint8Array) {
  const s = supabase();
  if (s) {
    await expectOk(await fetch(`${s.base}/${s.bucket}/${checkKey(key)}`, {
      method: "POST", headers: { ...s.headers, "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
    }), "subida");
    return;
  }
  const px = proxy();
  if (px) { await expectOk(await px("put", key, new Blob([bytes as Uint8Array<ArrayBuffer>])), "subida"); return; }
  const p = safe(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, bytes, { mode: 0o600 });
}
export async function readObject(key: string): Promise<{ stream: ReadableStream; size: number }> {
  const s = supabase();
  if (s) {
    const r = await expectOk(await fetch(`${s.base}/authenticated/${s.bucket}/${checkKey(key)}`, { headers: s.headers }), "lectura");
    return { stream: r.body!, size: Number(r.headers.get("content-length") ?? 0) };
  }
  const px = proxy();
  if (px) {
    const url = await proxyReadUrl(px, key);
    if (!url) throw new Error("almacenamiento: objeto inexistente");
    const r = await expectOk(await fetch(url), "lectura");
    return { stream: r.body!, size: Number(r.headers.get("content-length") ?? 0) };
  }
  const p = safe(key);
  const st = await stat(p);
  return { stream: Readable.toWeb(createReadStream(p)) as ReadableStream, size: st.size };
}
export async function deleteObject(key: string) {
  const s = supabase();
  if (s) {
    await expectOk(await fetch(`${s.base}/${s.bucket}`, {
      method: "DELETE", headers: { ...s.headers, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [checkKey(key)] }),
    }), "borrado");
    return;
  }
  const px = proxy();
  if (px) { await expectOk(await px("delete", key), "borrado"); return; }
  await rm(safe(key), { force: true });
}

/** Subida directa desde el navegador (D71). Sólo con Supabase: URL firmada de un solo uso para esa clave (vence en 2 h).
 *  En disco local devuelve null y el cliente usa la subida por /api de siempre. */
export async function directUploadTarget(key: string): Promise<{ url: string; method: "PUT" } | null> {
  const s = supabase();
  if (!s) {
    const px = proxy();
    if (!px) return null;
    return { url: ((await (await expectOk(await px("sign_upload", key), "firma de subida")).json()) as { url: string }).url, method: "PUT" };
  }
  const r = await expectOk(await fetch(`${s.base}/upload/sign/${s.bucket}/${checkKey(key)}`, { method: "POST", headers: s.headers }), "firma de subida");
  const { url } = (await r.json()) as { url: string };
  return { url: `${s.base.replace(/\/object$/, "")}${url}`, method: "PUT" };
}

/** Tamaño real y primeros bytes de un objeto (para validar la firma del archivo sin descargarlo entero). Null si no existe. */
export async function probeObject(key: string, n = 64): Promise<{ size: number; head: Uint8Array } | null> {
  const s = supabase(), px = s ? null : proxy();
  if (s || px) {
    const url = s ? `${s.base}/authenticated/${s.bucket}/${checkKey(key)}` : await proxyReadUrl(px!, key);
    if (!url) return null;
    const r = await fetch(url, { headers: { ...(s?.headers ?? {}), Range: `bytes=0-${n - 1}` } });
    if (r.status === 400 || r.status === 404) return null;
    await expectOk(r, "lectura");
    const total = Number(r.headers.get("content-range")?.split("/")[1] ?? r.headers.get("content-length") ?? 0);
    const reader = r.body!.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    while (got < n) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.byteLength; }
    await reader.cancel().catch(() => {});
    const head = new Uint8Array(Math.min(got, n));
    let o = 0;
    for (const p of parts) { const take = Math.min(p.byteLength, head.byteLength - o); head.set(p.subarray(0, take), o); o += take; if (o >= head.byteLength) break; }
    return { size: total, head };
  }
  try {
    const p = safe(key);
    const st = await stat(p);
    const fh = await open(p, "r");
    try { const buf = new Uint8Array(Math.min(n, st.size)); await fh.read(buf, 0, buf.byteLength, 0); return { size: st.size, head: buf }; } finally { await fh.close(); }
  } catch { return null; }
}
