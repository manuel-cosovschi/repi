// Adaptador de almacenamiento privado (D39). Desarrollo: disco local fuera de /public, nunca servido estáticamente.
// En producción exige STORAGE_DIR explícito hasta elegir proveedor de objetos (URLs firmadas, cifrado, retención).
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

function root() {
  const dir = process.env.STORAGE_DIR ?? (process.env.NODE_ENV === "production" ? null : path.join(/* turbopackIgnore: true */ process.cwd(), ".storage"));
  if (!dir) throw new Error("STORAGE_DIR no configurado: no hay almacenamiento privado en producción (D39)");
  return dir;
}
const safe = (key: string) => {
  if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes("..")) throw new Error("clave de almacenamiento inválida");
  return path.join(/* turbopackIgnore: true */ root(), key); // carpeta fuera del bundle: no se traza
};

export async function putObject(key: string, bytes: Uint8Array) {
  const p = safe(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, bytes, { mode: 0o600 });
}
export async function readObject(key: string): Promise<{ stream: ReadableStream; size: number }> {
  const p = safe(key);
  const s = await stat(p);
  return { stream: Readable.toWeb(createReadStream(p)) as ReadableStream, size: s.size };
}
export async function deleteObject(key: string) { await rm(safe(key), { force: true }); }
