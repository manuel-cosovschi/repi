import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Renderizar el PNG aprobado a los tamaños que exige la instalación, sin redibujar la marca.
// La fuente sigue siendo de 162 px: estos derivados no reemplazan un futuro original vectorial.
export const dynamic = "force-static";
export function generateStaticParams() { return ["180", "192", "512"].map(size => ({ size })); }
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: value } = await params;
  if (!["180", "192", "512"].includes(value)) return new Response(null, { status: 404 });
  const size = Number(value);
  const original = await readFile(join(process.cwd(), "public", "brand", "repi_icon.png"));
  return new ImageResponse(<img alt="" src={`data:image/png;base64,${original.toString("base64")}`} width={size} height={size} />, {
    width: size, height: size, headers: { "cache-control": "public, max-age=86400" },
  });
}
