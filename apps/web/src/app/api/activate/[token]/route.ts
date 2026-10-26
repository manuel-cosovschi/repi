// Invitación de bienvenida al responsable (anexo §4). GET informa el estado sin exponer el email completo.
import { handle, limit, sessionUserId } from "@/server/access/http";
import * as cm from "@/server/commercial/services";

type Ctx = { params: Promise<{ token: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await limit("activate-info", 20);
  return cm.lookupOwnerInvitation((await params).token);
});

export const POST = handle<Ctx>(async (_req, { params }) => {
  await limit("activate", 10);
  return cm.acceptOwnerInvitation(await sessionUserId(), (await params).token);
});
