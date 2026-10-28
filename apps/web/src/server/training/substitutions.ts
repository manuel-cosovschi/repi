// Reemplazos aprobados (Adaptive Coach 1b, EXT-05). Los define quien arma programas en la organización: el coach dueño
// de su espacio o el staff del gimnasio con «program.edit». Valen para toda la organización y sólo ordenan y marcan las
// alternativas que la persona ya podía elegir en la sesión (D106): no habilitan ejercicios incompatibles ni proponen cargas.
import { aliasedTable, and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { APPROVED_SUBS_MAX, canSubstitute, cleanSubNote } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { gymContext, need } from "../gym/services";
import { requireCoach } from "./services";

const { organization, exercise, exerciseSubstitution } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

async function requireAuthor(actorId: string, orgId: string) {
  const [o] = await db.select({ kind: organization.kind }).from(organization).where(eq(organization.id, orgId));
  if (!o) throw NOT_FOUND();
  if (o.kind === "coach") await requireCoach(actorId, orgId);
  else need(await gymContext(actorId, orgId), "program.edit");
}

const sub = aliasedTable(exercise, "sub");
export async function listSubstitutions(actorId: string, orgId: string) {
  await requireAuthor(actorId, orgId);
  const rows = await db.select({ id: exerciseSubstitution.id, exerciseId: exerciseSubstitution.exerciseId, substituteExerciseId: exerciseSubstitution.substituteExerciseId, name: sub.name, group: sub.muscleGroup, note: exerciseSubstitution.note })
    .from(exerciseSubstitution).innerJoin(sub, eq(sub.id, exerciseSubstitution.substituteExerciseId))
    .where(eq(exerciseSubstitution.orgId, orgId)).orderBy(asc(exerciseSubstitution.createdAt));
  return { substitutions: rows };
}

export async function addSubstitution(actorId: string, orgId: string, p: { exerciseId: string; substituteExerciseId: string; note?: string | null }) {
  await requireAuthor(actorId, orgId);
  const ex = await db.select({ id: exercise.id, kind: exercise.kind, name: exercise.name, group: exercise.muscleGroup }).from(exercise)
    .where(and(or(eq(exercise.id, p.exerciseId), eq(exercise.id, p.substituteExerciseId)), or(isNull(exercise.orgId), eq(exercise.orgId, orgId))));
  const a = ex.find((x) => x.id === p.exerciseId), b = ex.find((x) => x.id === p.substituteExerciseId);
  if (!a || !b) throw new AccessError("invalid", "Ese ejercicio no está en tu biblioteca.");
  if (!canSubstitute(a, b)) throw new AccessError("invalid", "Elegí un ejercicio distinto que se registre igual (cargas, peso corporal o tiempo).");
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(exerciseSubstitution)
      .where(and(eq(exerciseSubstitution.orgId, orgId), eq(exerciseSubstitution.exerciseId, a.id)));
    if (n >= APPROVED_SUBS_MAX) throw new AccessError("limit", `Hasta ${APPROVED_SUBS_MAX} reemplazos por ejercicio.`, 409);
    const [row] = await tx.insert(exerciseSubstitution).values({ orgId, exerciseId: a.id, substituteExerciseId: b.id, note: cleanSubNote(p.note), createdBy: actorId })
      .onConflictDoNothing().returning();
    if (!row) throw new AccessError("duplicate", `${b.name} ya está aprobado para ${a.name}.`, 409);
    await audit(tx, { actorUserId: actorId, orgId, action: "substitution.add", resourceType: "exercise_substitution", resourceId: row.id, meta: { exerciseId: a.id, substituteExerciseId: b.id } });
    return { substitution: { id: row.id, exerciseId: a.id, substituteExerciseId: b.id, name: b.name, group: b.group, note: row.note } };
  });
}

export async function removeSubstitution(actorId: string, orgId: string, id: string) {
  await requireAuthor(actorId, orgId);
  return db.transaction(async (tx) => {
    const del = await tx.delete(exerciseSubstitution).where(and(eq(exerciseSubstitution.id, id), eq(exerciseSubstitution.orgId, orgId))).returning();
    if (!del.length) throw NOT_FOUND();
    await audit(tx, { actorUserId: actorId, orgId, action: "substitution.remove", resourceType: "exercise_substitution", resourceId: id, meta: { exerciseId: del[0].exerciseId, substituteExerciseId: del[0].substituteExerciseId } });
    return { ok: true };
  });
}
