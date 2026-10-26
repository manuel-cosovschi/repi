import { eq } from "drizzle-orm";
import { classifyAge } from "@repi/domain";
import { db, schema } from "@/db";
import { handle, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";
import { todayIso } from "@/server/access/util";

// Estado del usuario en sesión para decidir el paso siguiente del flujo de Acceso.
export const GET = handle(async () => {
  const uid = await sessionUserId();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, uid));
  const minor = !!u.birthDate && classifyAge(u.birthDate, todayIso()) === "minor";
  return {
    user: { name: u.name, email: u.email, twoFactorEnabled: !!u.twoFactorEnabled },
    minor, guardian: minor ? await svc.guardianStatus(uid) : null,
    member: await svc.memberOnboardingState(uid),
    workspaces: await svc.listWorkspaces(uid),
  };
});
