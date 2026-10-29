// D154: lo que el cliente hizo la última vez en cada ejercicio, para la carga sugerida al actualizar su rutina.
import { handle, sessionUserId } from "@/server/access/http";
import { coachProgramLastTimes } from "@/server/training/services";

export const GET = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (req, { params }) => {
  const p = await params;
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  return coachProgramLastTimes(await sessionUserId(), p.orgId, p.pid, ids);
});
