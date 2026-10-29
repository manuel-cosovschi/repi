// Íconos de instalación y favicon a partir del isotipo aprobado (D117).
// public/brand/repi_icon.png es un recorte de 162 px de una captura: trae fondo de afuera, un borde y esquinas propias,
// y el sistema le suma su máscara (doble marco en el iPhone, recorte en Android). Acá se rehace el cuadrado a sangre con
// la misma marca en vector: la «r» está medida sobre el original (bordes con precisión de subpíxel, curva exterior ajustada
// con error < 0,2 px), el punto es un círculo con el color medido y el fondo, el degradé del interior. El original queda intacto.
// Uso (desde apps/web): npx tsx scripts/brand-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

// Coordenadas en píxeles del original (162 px). TILE es el interior del recuadro, que pasa a ocupar todo el ícono.
const TILE = { x: 2.5, y: 8, size: 135 };
const R_PATH = [
  "M32.95 84", "C32.95 64.3 46.29 44.6 70 44.6", "L72.93 44.6", "A4.5 4.5 0 0 1 77.43 49.1", "L77.43 66.4",
  "C77.43 69.5 76 70.7 74.1 70.7", "A13.4 13.4 0 0 0 60.7 84.1", "L60.7 113.3", "A9.5 9.5 0 0 1 51.2 122.8",
  "L42.45 122.8", "A9.5 9.5 0 0 1 32.95 113.3", "Z",
].join(" ");
const DOT = { cx: 96, cy: 47, r: 13.4, color: "#00D0FD" };

/** SVG cuadrado. `content` achica la marca (zona segura de la máscara de Android); `radius` redondea (favicon y uso en la app). */
function iconSvg(size: number, { content = 1, radius = 0 } = {}) {
  const s = (size / TILE.size) * content;
  const off = (size - TILE.size * s) / 2;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#012640"/><stop offset="0.45" stop-color="#000c18"/><stop offset="1" stop-color="#00060c"/></linearGradient>
    <radialGradient id="hl" cx="0.12" cy="0.05" r="0.7"><stop offset="0" stop-color="#03335a" stop-opacity=".55"/><stop offset="1" stop-color="#03335a" stop-opacity="0"/></radialGradient>
    <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9fafc"/><stop offset="1" stop-color="#eef2f5"/></linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/><rect width="${size}" height="${size}" rx="${r}" fill="url(#hl)"/>
  <g transform="translate(${off - TILE.x * s} ${off - TILE.y * s}) scale(${s})">
    <path d="${R_PATH}" fill="url(#r)"/><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${DOT.color}"/>
  </g>
</svg>`;
}

const png = (svg: string, size: number, opaque: boolean) => {
  const img = sharp(Buffer.from(svg), { density: 288 }).resize(size, size);
  return (opaque ? img.flatten({ background: "#000c18" }) : img).png({ compressionLevel: 9 });
};

mkdirSync("public/icons", { recursive: true });
// Instalación: cuadrados opacos a sangre; iOS y Android ponen sus esquinas.
await png(iconSvg(180), 180, true).toFile("public/icons/apple-touch-icon.png");
for (const size of [192, 512, 1024]) await png(iconSvg(size), size, true).toFile(`public/icons/icon-${size}.png`);
await png(iconSvg(512, { content: 0.8 }), 512, true).toFile("public/icons/maskable-512.png");
// Pestaña del navegador y uso dentro de la app: esquinas redondeadas propias, fondo transparente.
await png(iconSvg(48, { radius: 0.22 }), 48, false).toFile("public/icons/favicon-48.png");
await png(iconSvg(256, { radius: 0.22 }), 256, false).toFile("public/icons/tile-256.png");
writeFileSync("public/icons/favicon.svg", iconSvg(64, { radius: 0.22 }));
// Insignia de avisos en Android: el sistema usa sólo la opacidad, así que va la marca sola en blanco sobre transparente.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="${TILE.x + 14} ${TILE.y + 14} ${TILE.size - 28} ${TILE.size - 28}"><path d="${R_PATH}" fill="#fff"/><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="#fff"/></svg>`;
await png(badge, 96, false).toFile("public/icons/badge-96.png");
// Cabecera de los correos: ícono (igual al de la pantalla de inicio) y marca sobre un fondo oscuro propio, en una sola imagen.
// Gmail en modo claro invierte los colores del correo pero no las imágenes: así la marca blanca no desaparece. A 3x.
{
  const k = 3, H = 56, PAD = 8, ICON = 40, GAP = 10, WM = { w: 74, h: 36 }, W = PAD + ICON + GAP + WM.w + 14;
  const plate = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * k}" height="${H * k}"><rect width="${W * k}" height="${H * k}" rx="${14 * k}" fill="#0A0F1A"/></svg>`;
  const icon = await png(iconSvg(ICON * k, { radius: 0.22 }), ICON * k, false).toBuffer();
  const wm = await sharp("public/brand/wm_full.png").resize(WM.w * k, WM.h * k).toBuffer();
  await sharp(Buffer.from(plate)).composite([
    { input: icon, left: PAD * k, top: ((H - ICON) / 2) * k },
    { input: wm, left: (PAD + ICON + GAP) * k, top: Math.round(((H - WM.h) / 2) * k) },
  ]).png({ compressionLevel: 9 }).toFile("public/icons/mail-header.png");
}
console.log("Íconos → public/icons");
