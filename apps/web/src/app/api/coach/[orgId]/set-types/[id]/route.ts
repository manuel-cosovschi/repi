// D192: renombrar o quitar un tipo propio. Sólo el dueño; programas y registros anteriores no cambian.
import { body, handle, sessionUserId } from "@/server/access/http";
import { requireCoach } from "@/server/training/services";
import * as st from "@/server/training/set-types";
import { SetTypeZ } from "@/server/training/workflow-schema";

type Ctx = { params: Promise<{ orgId: string; id: string }> };
export const PATCH = handle<Ctx>(async (req, { params }) => { const { orgId, id } = await params; const me = await sessionUserId(); await requireCoach(me, orgId); return st.updateSetType({ orgId, userId: me }, id, await body(req, SetTypeZ)); });
export const DELETE = handle<Ctx>(async (_r, { params }) => { const { orgId, id } = await params; const me = await sessionUserId(); await requireCoach(me, orgId); return st.archiveSetType({ orgId, userId: me }, id); });
