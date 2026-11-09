// D200 · Seguridad de imágenes privadas (fotos de progreso). Sin dependencias nativas: lee la estructura del archivo para
// conocer el tipo REAL y sus dimensiones, y quita los metadatos que pueden revelar ubicación, dispositivo o fecha (EXIF,
// XMP, IPTC, comentarios). No decodifica ni modifica los píxeles: nunca altera cómo se ve el cuerpo en la foto.
// La app además la achica y la vuelve a codificar en el teléfono (canvas), lo que ya descarta todo metadato; esto es la
// garantía del servidor aunque alguien llame a la API directamente.

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ImageInfo = { mime: ImageMime; width: number; height: number };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const isJpeg = (b: Uint8Array) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b: Uint8Array) => b.length > 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a;
const isWebp = (b: Uint8Array) => b.length > 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";

/** Marcadores SOF (inicio de cuadro) de JPEG: llevan alto y ancho. C4 (Huffman), C8 y CC no lo son. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegInfo(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // relleno
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) return null; // fin o datos sin haber visto el cuadro
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    if (SOF.has(m)) { if (len < 7) return null; return { height: u16be(b, i + 5), width: u16be(b, i + 7) }; }
    i += 2 + len;
  }
  return null;
}
function webpInfo(b: Uint8Array): { width: number; height: number } | null {
  const c = ascii(b, 12, 4);
  if (c === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (c === "VP8L" && b[20] === 0x2f) { const v = u32le(b, 21); return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
  if (c === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/** Tipo real y dimensiones leídos del contenido (no del nombre ni del tipo declarado). Null si no es JPEG, PNG o WebP válido. */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  let d: { width: number; height: number } | null = null, mime: ImageMime;
  if (isJpeg(b)) { mime = "image/jpeg"; d = jpegInfo(b); }
  else if (isPng(b)) { mime = "image/png"; if (ascii(b, 12, 4) === "IHDR") d = { width: u32be(b, 16), height: u32be(b, 20) }; }
  else if (isWebp(b)) { mime = "image/webp"; d = webpInfo(b); }
  else return null;
  return d && d.width > 0 && d.height > 0 ? { mime, ...d } : null;
}

/**
 * JPEG: se quitan APP1–APP15 (EXIF con GPS, XMP, IPTC, datos del fabricante) y comentarios; quedan JFIF (APP0) y el perfil ICC.
 * FSA1: también entre los cuadros de un JPEG progresivo, y se descarta todo lo que sigue al fin de la imagen (EOI): las imágenes
 * secundarias de MPF (mapas de ganancia, profundidad) y los anexos del fabricante traen su propio EXIF, a veces con ubicación.
 */
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 2 <= b.length) {
    if (b[i] !== 0xff) throw new Error("jpeg");
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) { out.push(b.subarray(i, i + 2)); break; } // fin de la imagen: lo anexado después no se copia
    if (i + 4 > b.length) throw new Error("jpeg");
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new Error("jpeg");
    const seg = b.subarray(i, i + 2 + len);
    const icc = m === 0xe2 && ascii(b, i + 4, 11) === "ICC_PROFILE";
    if (!((m >= 0xe1 && m <= 0xef && !icc) || m === 0xfe)) out.push(seg);
    i += 2 + len;
    if (m === 0xda) {
      // Datos de la imagen (se copian igual) hasta el próximo marcador real: FF00 es un byte relleno y FFD0–FFD7, reinicios.
      let j = i;
      for (; j + 1 < b.length; j++) if (b[j] === 0xff && b[j + 1] !== 0x00 && b[j + 1] !== 0xff && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7)) break;
      if (j + 1 >= b.length) { out.push(b.subarray(i)); break; } // archivo cortado sin EOI: se copian los datos que hay
      out.push(b.subarray(i, j));
      i = j;
    }
  }
  return concat(out);
}
/** PNG: se quitan tEXt, zTXt, iTXt (texto libre, XMP), eXIf y tIME. Los demás bloques quedan intactos (con su CRC). */
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
function stripPng(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i), type = ascii(b, i + 4, 4), end = i + 12 + len;
    if (end > b.length) throw new Error("png");
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(out);
}
/** WebP: se quitan los bloques EXIF y XMP, se apagan sus marcas en VP8X y se recalcula el tamaño RIFF. */
function stripWebp(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4), len = u32le(b, i + 4), end = i + 8 + len + (len % 2);
    if (i + 8 + len > b.length) throw new Error("webp");
    if (type !== "EXIF" && type !== "XMP ") {
      const c = b.slice(i, Math.min(end, b.length));
      if (type === "VP8X") c[8] &= ~(0x08 | 0x04); // marcas de EXIF y XMP
      out.push(c);
    }
    i = end;
  }
  const body = concat(out), head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const size = body.length + 4;
  head[4] = size & 0xff; head[5] = (size >>> 8) & 0xff; head[6] = (size >>> 16) & 0xff; head[7] = (size >>> 24) & 0xff;
  return concat([head, body]);
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Copia de la imagen sin metadatos. Lanza si la estructura no es válida (el archivo se rechaza). */
export function stripImageMetadata(b: Uint8Array): Uint8Array {
  if (isJpeg(b)) return stripJpeg(b);
  if (isPng(b)) return stripPng(b);
  if (isWebp(b)) return stripWebp(b);
  throw new Error("formato");
}

/** ¿Quedan metadatos sensibles? Para pruebas y verificación: EXIF/XMP/GPS en cualquiera de los tres formatos. */
export function hasImageMetadata(b: Uint8Array): boolean {
  const s = ascii(b, 0, Math.min(b.length, 1 << 20));
  return /Exif\0\0|http:\/\/ns\.adobe\.com\/xap|GPSLatitude|eXIf|EXIF|XMP /.test(s);
}

/** Fotos de progreso: hasta 3 MB y entre 200 y 6000 px por lado (la app las manda a ≤ 2048 px y ~0,5 MB). */
export const PROGRESS_PHOTO_LIMITS = { maxBytes: 3 * 1024 * 1024, minSide: 200, maxSide: 6000, maxPerUser: 200, maxPerDay: 30, maxBytesPerUser: 150 * 1024 * 1024 } as const;
export const PROGRESS_POSES = { front: "Frente", side: "Perfil", back: "Espalda", other: "Otra" } as const;
export type ProgressPose = keyof typeof PROGRESS_POSES;
