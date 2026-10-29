// Pantalla del ranking en la sala (D146): la TV pide el tablero con su secreto en un encabezado. Sin sesión de persona.
import { handle, limit } from "@/server/access/http";
import { screenBoard } from "@/server/community/screen";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await limit("ranking-display", 30);
  const ex = new URL(req.url).searchParams.get("ex")?.slice(0, 64) || null;
  return screenBoard(req.headers.get("x-repi-display") ?? "", ex);
});
