// Pantalla autorizada de ingreso (D127): una tablet de recepción pide el QR vigente con su secreto en un encabezado.
// No usa sesión de persona; el secreto sólo sirve para mostrar QR de su sede y se revoca desde «Acceso y presencia».
import { handle, limit } from "@/server/access/http";
import { displayQr } from "@/server/gym/access-control";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await limit("access-display", 30);
  return displayQr(req.headers.get("x-repi-display") ?? "");
});
