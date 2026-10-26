// QR fijo de sede (anexo §5). GET es público y no revela datos de socios; POST crea la solicitud con la cuenta verificada.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as join from "@/server/join/services";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await limit("join-info", 30);
  return join.publicJoinInfo((await params).slug);
});

export const POST = handle<Ctx>(async (req, { params }) => {
  await limit("join-request", 10);
  const me = await sessionUserId();
  return join.requestAccess(me, (await params).slug, await body(req, z.object({ name: z.string().max(80).optional(), terms: z.boolean() })));
});
