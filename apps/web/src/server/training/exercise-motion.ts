// REPI Exercise Motion 1.0 (D220): qué demostración oficial corresponde a cada ejercicio. Sólo el catálogo global (sin
// organización ni dueño) y por nombre exacto; con el módulo apagado no se informa nada.
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import type { MotionRef } from "@/lib/exercise-motion/ref";

const { exercise } = schema;

export async function motionFor(exerciseIds: string[]): Promise<Map<string, MotionRef>> {
  const out = new Map<string, MotionRef>();
  const ids = [...new Set(exerciseIds.filter(Boolean))];
  if (!ids.length || !featureOn("exercise_motion")) return out;
  const { resolveExerciseMotion } = await import("@/lib/exercise-motion/resolve");
  const rows = await db.select({ id: exercise.id, name: exercise.name, orgId: exercise.orgId, owner: exercise.ownerUserId }).from(exercise).where(inArray(exercise.id, ids));
  for (const r of rows) {
    const ref = resolveExerciseMotion({ name: r.name, global: r.orgId == null && r.owner == null });
    if (ref) out.set(r.id, ref);
  }
  return out;
}
