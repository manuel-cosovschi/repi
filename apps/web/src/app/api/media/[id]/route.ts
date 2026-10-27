import { AccessError } from "@/server/access/util";
import { sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";
import { readObject } from "@/server/storage";

// Descarga autorizada de un archivo privado. Sin caché compartida.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const v = await fu.authorizeVideo(await sessionUserId(), (await params).id);
    const o = await readObject(v.storageKey);
    return new Response(o.stream, { headers: { "content-type": v.mime, ...(o.size ? { "content-length": String(o.size) } : {}), "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    const status = e instanceof AccessError ? e.status : 404;
    return new Response(null, { status });
  }
}
