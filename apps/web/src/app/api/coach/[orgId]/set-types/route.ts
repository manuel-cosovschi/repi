// D192: tipos de serie personalizados del coach (biblioteca privada en su organización).
import { body, handle, sessionUserId } from "@/server/access/http";
import { requireCoach } from "@/server/training/services";
import * as st from "@/server/training/set-types";
import { SetTypeZ } from "@/server/training/workflow-schema";

type Ctx = { params: Promise<{ orgId: string }> };
export const GET = handle<Ctx>(async (_r, { params }) => { const { orgId } = await params; const me = await sessionUserId(); await requireCoach(me, orgId); return st.listSetTypes({ orgId, userId: me }); });
export const POST = handle<Ctx>(async (req, { params }) => { const { orgId } = await params; const me = await sessionUserId(); await requireCoach(me, orgId); return st.createSetType({ orgId, userId: me }, await body(req, SetTypeZ)); });
