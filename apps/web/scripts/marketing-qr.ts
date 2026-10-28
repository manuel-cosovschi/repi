// Genera el QR de instalación suelto (SVG y PNG) en public/marketing (D115). El cartel A4 sale de /instalar/cartel.
// Uso (desde apps/web): npx tsx scripts/marketing-qr.ts
import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { renderSVG } from "uqr";
import { SITE } from "../src/lib/contact";

mkdirSync("public/marketing", { recursive: true });
const svg = renderSVG(SITE.install, { border: 2 });
writeFileSync("public/marketing/repi-qr-instalar.svg", svg);
await sharp(Buffer.from(svg), { density: 600 }).resize(2048, 2048, { kernel: "nearest" }).flatten({ background: "#ffffff" }).png().toFile("public/marketing/repi-qr-instalar.png");
console.log(`QR → ${SITE.install}`);
