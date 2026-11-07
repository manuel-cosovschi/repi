// QR por campaña: repiclub.com/qr/<clave>. Clave desconocida → la campaña de /qr (D205).
import { qrRedirect } from "@/server/site/qr";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ campana: string }> }) {
  return qrRedirect((await params).campana.toLowerCase().slice(0, 40));
}
