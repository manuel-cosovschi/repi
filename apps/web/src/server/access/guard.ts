import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requiresTwoFactor, type GymRole } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "../auth";

// Guardas de superficie. Sin sesión → Acceso. Sin pertenencia → 404 (no revela que el espacio existe).
export async function requireUser(nextPath: string) {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect(`/acceso`);
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, s.user.id));
  return { session: s, user: u, nextPath };
}

export async function requireOrgMember(orgId: string, kind: "coach" | "gym", nextPath: string) {
  const { user } = await requireUser(nextPath);
  const rows = await db.select({ m: schema.staffMembership, org: schema.organization, loc: schema.gymLocation })
    .from(schema.staffMembership).innerJoin(schema.organization, eq(schema.organization.id, schema.staffMembership.orgId))
    .leftJoin(schema.gymLocation, eq(schema.gymLocation.id, schema.staffMembership.locationId))
    .where(and(eq(schema.staffMembership.userId, user.id), eq(schema.staffMembership.orgId, orgId), eq(schema.staffMembership.status, "active")));
  if (!rows.length || rows[0].org.kind !== kind) notFound();
  const roles = rows.map((r) => r.m.role);
  if (kind === "gym" && requiresTwoFactor({ gymRoles: roles as GymRole[] }) && !user.twoFactorEnabled) {
    redirect(`/acceso?step=twofaSetup&next=${encodeURIComponent(nextPath)}`);
  }
  return { user, org: rows[0].org, roles, locations: rows.map((r) => r.loc).filter(Boolean) };
}
