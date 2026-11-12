// REPI Control (D213): el socio ve su código de la pantalla de rutinas y puede elegir su PIN desde la app (si la usa).
import { z } from "zod";
import { NextResponse } from "next/server";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { myKioskAccess, setMyPin } from "@/server/gym/kiosk";

export const dynamic = "force-dynamic";
export const GET = handle(async () => NextResponse.json(await myKioskAccess(await sessionUserId()), { headers: { "cache-control": "private, no-store" } }));
export const POST = handle(async (req: Request) => {
  const me = await sessionUserId();
  await limit(`kiosk-pin:${me}`, 5, 3_600_000);
  const p = await body(req, z.object({ id: z.string().max(64), pin: z.string().max(6) }));
  return setMyPin(me, p.id, p.pin);
});
