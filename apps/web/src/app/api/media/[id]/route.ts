import { AccessError } from "@/server/access/util";
import { recordDenied, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";
import { readObject, StorageRangeError } from "@/server/storage";
import { logError } from "@/server/log";

// Descarga autorizada de un archivo privado. Sin caché compartida.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const v = await fu.authorizeVideo(await sessionUserId(), (await params).id);
    const o = await readObject(v.storageKey, req.headers.get("range"));
    return new Response(o.stream, { status: o.status, headers: { "content-type": v.mime, ...(o.size ? { "content-length": String(o.size) } : {}), ...(o.contentRange ? { "content-range": o.contentRange } : {}), "accept-ranges": "bytes", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    if (e instanceof StorageRangeError) return new Response(null, { status: 416, headers: { "content-range": `bytes */${e.total}`, "cache-control": "private, no-store" } });
    if (!(e instanceof AccessError)) logError("media", e, req);
    else await recordDenied(req, e);
    const status = e instanceof AccessError ? e.status : 404;
    return new Response(null, { status });
  }
}
