// Adaptador de almacenamiento privado (D39). Desarrollo: disco local fuera de /public, nunca servido estáticamente.
// Hospedado (D68): Supabase Storage en un bucket privado, accedido sólo desde el servidor con la clave secreta;
// el navegador nunca recibe URLs del bucket, sólo pasa por /api/media con sus permisos.
// Sin Supabase, producción exige STORAGE_DIR explícito (volumen durable operado aparte).
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
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
  await rm(safe(key), { force: true });
}
