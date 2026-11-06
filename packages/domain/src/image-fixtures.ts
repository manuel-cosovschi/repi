// Imágenes mínimas con metadatos sensibles para las pruebas (no se exporta desde index.ts).

/** Texto latin1 → bytes (sin TextEncoder: el paquete de dominio no tiene tipos del navegador ni de Node). */
export const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
/** Bytes → texto latin1, para buscar marcas en las pruebas. */
export const dec = (b: Uint8Array) => Array.from(b, (x) => String.fromCharCode(x)).join("");
/** CRC-32 (PNG) sin zlib. */
function crc32(b: Uint8Array) {
  let c = ~0;
  for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
export const cat = (...p: (Uint8Array | number[])[]) => { const a = p.map((x) => (x instanceof Uint8Array ? x : Uint8Array.from(x))); const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const seg = (m: number, data: Uint8Array) => cat([0xff, m, (data.length + 2) >> 8, (data.length + 2) & 0xff], data);

/** JPEG mínimo con EXIF (GPS), XMP, comentario, ICC y cuadro de 640×480. */
export function jpegWithGps() {
  const exif = cat(enc("Exif\0\0MM\0*GPSLatitude -34.6037 GPSLongitude -58.3816"));
  const xmp = cat(enc("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>casa</x:xmpmeta>"));
  const sof = Uint8Array.from([8, 480 >> 8, 480 & 0xff, 640 >> 8, 640 & 0xff, 1, 1, 0x11, 0]);
  return cat([0xff, 0xd8], seg(0xe0, enc("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")), seg(0xe1, exif), seg(0xe1, xmp), seg(0xe2, enc("ICC_PROFILE\0\x01\x01perfil")), seg(0xfe, enc("comentario")),
    seg(0xc0, sof), seg(0xda, Uint8Array.from([1, 1, 0, 0, 0x3f, 0])), [0x12, 0x34, 0x56, 0xff, 0xd9]);
}
const chunk = (type: string, data: Uint8Array) => { const td = cat(enc(type), data); const c = crc32(td); return cat([data.length >>> 24, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255], td, [c >>> 24, (c >> 16) & 255, (c >> 8) & 255, c & 255]); };
export function pngWithText() {
  const ihdr = Uint8Array.from([0, 0, 3, 0, 0, 0, 2, 0, 8, 2, 0, 0, 0]); // 768×512
  return cat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk("IHDR", ihdr), chunk("tEXt", enc("Comment\0GPSLatitude -34")), chunk("eXIf", enc("MM\0*")), chunk("IDAT", Uint8Array.from([1, 2, 3])), chunk("IEND", new Uint8Array()));
}
const rc = (type: string, data: Uint8Array) => cat(enc(type), [data.length & 255, (data.length >> 8) & 255, (data.length >> 16) & 255, data.length >>> 24], data, data.length % 2 ? [0] : []);
export function webpWithExif() {
  const vp8x = Uint8Array.from([0x08 | 0x04, 0, 0, 0, (1023) & 255, 1023 >> 8, 0, (767) & 255, 767 >> 8, 0]); // 1024×768
  const body = cat(enc("WEBP"), rc("VP8X", vp8x), rc("VP8L", Uint8Array.from([0x2f, 0, 0, 0, 0])), rc("EXIF", enc("Exif\0\0GPSLatitude")), rc("XMP ", enc("<x/>")));
  return cat(enc("RIFF"), [body.length & 255, (body.length >> 8) & 255, (body.length >> 16) & 255, body.length >>> 24], body);
}

