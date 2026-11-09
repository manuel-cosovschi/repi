// REPI Control (D213): política de rutinas por gimnasio. «open» = funcionamiento de siempre. «supervised» = sólo el personal con
// program.edit vigente crea, modifica, asigna o publica programas; en el contexto de ese gimnasio el socio no crea, edita, importa
// ni ejecuta rutinas propias, ni pide rutinas o ajustes generados por IA. Puede registrar lo que hizo sobre el programa asignado.
//
// El contexto es la relación activa del socio (myActive): un socio con un gimnasio supervisado y un coach personal conserva sus
// rutinas propias cuando entrena con su coach. Nada de esto borra ni oculta datos: las rutinas guardadas y el historial quedan.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";

export type RoutinePolicy = "open" | "supervised";
export type MemberAuthoring = "own_routine" | "own_routine_start" | "routine_import" | "member_exercise" | "ai_routine" | "ai_adjust" | "brain_adjust";

export const SUPERVISED_MESSAGE = "En tu gimnasio las rutinas las planifica el equipo. Si necesitás un cambio, pedíselo al equipo de sala.";

/** Política de una organización. Los coaches independientes son siempre «open». */
export async function policyOfOrg(orgId: string, q: Tx | typeof db = db): Promise<RoutinePolicy> {
  const [o] = await q.select({ kind: schema.organization.kind, p: schema.organization.routinePolicy }).from(schema.organization).where(eq(schema.organization.id, orgId));
  return o?.kind === "gym" && o.p === "supervised" ? "supervised" : "open";
}

/** ¿La relación activa (o la indicada) está bajo un gimnasio supervisado? */
export async function relationSupervised(rel: { kind: "coach" | "gym"; orgId: string } | null | undefined, q: Tx | typeof db = db) {
  if (!rel || rel.kind !== "gym") return false;
  return (await policyOfOrg(rel.orgId, q)) === "supervised";
}

/**
 * Corta, del lado del servidor, una acción de autoría del socio cuando su contexto es un gimnasio supervisado. Deja auditoría
 * (sin datos personales) para que el gimnasio y REPI vean los intentos. 403 con código «supervised».
 */
export async function assertMemberAuthoring(userId: string, rel: { kind: "coach" | "gym"; orgId: string } | null | undefined, what: MemberAuthoring) {
  if (!(await relationSupervised(rel))) return;
  await audit(db, { actorUserId: userId, orgId: rel!.orgId, action: "routine_policy.blocked", resourceType: "member_authoring", result: "denied", meta: { what } });
  throw new AccessError("supervised", SUPERVISED_MESSAGE, 403);
}
