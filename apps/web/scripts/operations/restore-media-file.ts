// Recupera UN archivo de Storage desde un respaldo ya descifrado, sin tocar nada más (05/11/2026: la foto de una publicación
// del Club que borró la purga diaria antes del arreglo del PR #30).
//
// Qué hace, y nada más:
//   1. Busca en manifest.json la clave pedida y comprueba el SHA-256 y el tamaño del archivo descifrado.
//   2. Pregunta a Storage si esa clave existe. Si existe, se detiene: NUNCA sobrescribe.
//   3. Sube ese único archivo a la misma clave (bucket privado) por el proxy de Storage.
//   4. Lo vuelve a bajar y comprueba que el SHA-256 sea el mismo.
// No toca la base de datos, ni otras claves, ni otros archivos del respaldo.
//
// Uso, en la computadora del titular (la clave privada y el secreto del proxy nunca salen de ahí), desde apps/web:
//   ./scripts/operations/restore-from-release.sh backup-20261104-234215-41935448423 ~/ruta/repi-respaldos.age.key --sin-base
//   pnpm -s exec tsx scripts/operations/restore-media-file.ts --dir=<carpeta que imprimió el paso anterior> \
//     --key=club/7dcdf93616a947be9a98b04260de7ad8/3863800a-434f-4bd2-a835-e6dd2050e0e5 --bytes=338783
// Requiere STORAGE_PROXY_SECRET en ~/.repi-secrets/vercel.env (no se imprime). Al terminar, borrá la carpeta descifrada.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { safeStorageKey, type BackupManifest } from "./guards";

const PROXY = "https://qiamewdridgdvsyysmog.supabase.co/functions/v1/repi-storage";
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const die = (m: string): never => { console.error(`restore-media-file: ${m}`); process.exit(1); };
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const dir = arg("dir") ?? die("falta --dir (la carpeta descifrada).");
const key = safeStorageKey(arg("key") ?? die("falta --key (la clave exacta del archivo)."));
const bytes = Number(arg("bytes") ?? die("falta --bytes (el tamaño esperado)."));
if (!Number.isSafeInteger(bytes) || bytes <= 0) die("--bytes no es válido.");

try { process.loadEnvFile(join(homedir(), ".repi-secrets", "vercel.env")); } catch { /* */ }
const secret = process.env.STORAGE_PROXY_SECRET ?? die("falta STORAGE_PROXY_SECRET en ~/.repi-secrets/vercel.env.");
const call = (op: "sign_read" | "put", body?: Blob) =>
  fetch(`${PROXY}?op=${op}&key=${encodeURIComponent(key)}`, { method: "POST", headers: { "x-repi-proxy": secret }, body });

const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as BackupManifest;
if (manifest.status !== "complete") die("el respaldo no está completo.");
const entry = manifest.storage.files.find((f) => f.key === key) ?? die("esa clave no está en este respaldo.");
const file = new Uint8Array(await readFile(join(dir, "storage", key)));
if (file.byteLength !== bytes || entry.bytes !== bytes) die(`el tamaño no coincide (archivo ${file.byteLength}, manifiesto ${entry.bytes}, esperado ${bytes}).`);
if (sha(file) !== entry.sha256) die("el SHA-256 del archivo no coincide con el manifiesto.");
console.log(`Archivo del respaldo íntegro: ${bytes} bytes, SHA-256 ${entry.sha256}.`);

const before = await call("sign_read");
if (before.ok) die("ese archivo YA existe en Storage: no se sobrescribe nada.");
if (before.status !== 404) die(`no se pudo comprobar si existe (${before.status}).`);

const put = await call("put", new Blob([file]));
if (!put.ok) die(`la subida falló (${put.status}).`);

const signed = await call("sign_read");
if (!signed.ok) die(`no se pudo leer lo subido (${signed.status}).`);
const back = new Uint8Array(await (await fetch(((await signed.json()) as { url: string }).url)).arrayBuffer());
if (sha(back) !== entry.sha256) die("lo subido no coincide con el respaldo: revisar antes de seguir.");
console.log(`Recuperado y comprobado: ${key} (${back.byteLength} bytes, mismo SHA-256). No se tocó nada más.`);
