// Dispositivos para push (anexo §7): registro sólo por acción explícita, pausa y baja por dispositivo.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as push from "@/server/push/services";

type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

export const GET = handle<Ctx>(async () => push.pushStatus(await sessionUserId()));

export const POST = handle<Ctx>(async (req, { params }) => {
  const [a] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`push:${me}`, 20);
  if (a === "subscribe") {
    const p = await body(req, z.object({ endpoint: z.string().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }));
    return push.subscribe(me, p, req.headers.get("user-agent"));
  }
  if (a === "unsubscribe") return push.unsubscribe(me, (await body(req, z.object({ endpoint: z.string().max(1000) }))).endpoint);
  if (a === "pause") return push.setPaused(me, (await body(req, z.object({ paused: z.boolean() }))).paused);
  throw NF();
});
