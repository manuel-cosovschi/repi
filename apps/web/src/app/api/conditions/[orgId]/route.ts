// Condiciones comerciales visibles para el responsable del cliente y pedido de corrección (anexo §9).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as cm from "@/server/commercial/services";
import { ackNotices } from "@/server/commercial/notices";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => cm.myConditions(await sessionUserId(), (await params).orgId));

export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`conditions:${me}`, 5);
  return cm.requestCorrection(me, (await params).orgId, (await body(req, z.object({ text: z.string().max(800) }))).text);
});

// «Entendido» sobre un aviso de cambio de condiciones (o todos los pendientes si id es null). F-BL-05.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`conditions-ack:${me}`, 20);
  return ackNotices(me, (await params).orgId, (await body(req, z.object({ id: z.string().max(64).nullable() }))).id);
});
