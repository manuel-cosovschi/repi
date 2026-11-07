// QR permanente impreso (remera ATICMA 2026). El destino vive en src/lib/qr.ts (D205).
import { qrRedirect } from "@/server/site/qr";

export const dynamic = "force-dynamic";

export function GET() {
  return qrRedirect();
}
