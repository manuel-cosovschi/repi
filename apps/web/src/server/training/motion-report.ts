// REPI Admin · Demostraciones (D220): cobertura de la biblioteca oficial de REPI Exercise Motion sobre el catálogo global y
// sobre el uso real (series registradas en los últimos 90 días, sólo totales por ejercicio: ningún dato de personas).
import { and, gte, isNull, sql } from "drizzle-orm";
import { EXERCISE_CATALOG } from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { requireAdmin } from "../commercial/services";

const { setLog, exercise } = schema;

export async function motionReport(actorId: string, now = new Date()) {
  await requireAdmin(actorId);
  const { LIBRARY, LIBRARY_VERSION } = await import("@/lib/exercise-motion/library");
  const { motionCoverage, resolveExerciseMotion } = await import("@/lib/exercise-motion/resolve");
  const cov = motionCoverage(EXERCISE_CATALOG.map((r) => r[0]));
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const used = await db.select({ name: exercise.name, n: sql<number>`count(*)::int` }).from(setLog)
    .innerJoin(exercise, sql`${exercise.id} = ${setLog.exerciseId}`)
    .where(and(isNull(exercise.orgId), isNull(exercise.ownerUserId), gte(setLog.completedAt, since)))
    .groupBy(exercise.name);
  const total = used.reduce((a, r) => a + r.n, 0);
  const by = (m: "exact" | "compatible") => used.filter((r) => resolveExerciseMotion({ name: r.name, global: true })?.match === m).reduce((a, r) => a + r.n, 0);
  return {
    on: featureOn("exercise_motion"), version: LIBRARY_VERSION,
    catalog: { total: cov.total, exact: cov.exact, compatible: cov.compatible },
    usage: { sets: total, exact: by("exact"), compatible: by("compatible") },
    missing: used.filter((r) => !resolveExerciseMotion({ name: r.name, global: true })).sort((a, b) => b.n - a.n).slice(0, 15),
    library: LIBRARY.map((e) => ({ id: e.id, title: e.title, group: e.group, version: e.version, view: e.motion.view, review: e.review, catalog: e.catalog, compatible: e.compatible ?? [] })),
  };
}
