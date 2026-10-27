import { AccessError } from "@/server/access/util";
import { limit, sessionUserId } from "@/server/access/http";
import { exportMyData } from "@/server/privacy/services";

// Descarga de los datos propios (F-PR-02). Sin caché compartida.
export async function GET() {
  try {
    const uid = await sessionUserId();
    await limit("privacy-export", 5);
    const data = await exportMyData(uid);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="repi-mis-datos-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    const status = e instanceof AccessError ? e.status : 500;
    return Response.json({ error: e instanceof AccessError ? e.message : "No pudimos preparar tus datos." }, { status });
  }
}
