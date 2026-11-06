// D200: archivo de una foto de progreso propia. Sólo su dueño (otra persona o sin sesión: 404 / 401). Sin caché compartida
// ni URL del bucket: se entrega desde el servidor en cada pedido.
import { AccessError } from "@/server/access/util";
import { recordDenied, sessionUserId } from "@/server/access/http";
import { myPhotoFile } from "@/server/progress/photos";
import { readObject } from "@/server/storage";
import { logError } from "@/server/log";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const f = await myPhotoFile(await sessionUserId(), (await params).id.slice(0, 64));
    const o = await readObject(f.key);
    return new Response(o.stream, { status: 200, headers: { "content-type": f.mime, ...(o.size ? { "content-length": String(o.size) } : {}), "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline", "cross-origin-resource-policy": "same-origin" } });
  } catch (e) {
    if (!(e instanceof AccessError)) logError("progress-photo", e, req);
    else await recordDenied(req, e);
    return new Response(null, { status: e instanceof AccessError ? e.status : 404, headers: { "cache-control": "private, no-store" } });
  }
}
