// Configuración del alumno (F-HX-23, D95). Hoy: unidad de peso. Idioma es-AR único y notificaciones en el centro de la app
// (sin push al alumno todavía); menores según la política que defina el titular: no hay opciones que simular acá.
// D139: además, lo que busca entrenando (objetivo, tiempo, gustos y lo que evita), que usa la IA de «No vino el profe».
import { eq } from "drizzle-orm";
import { cleanWishes, isWeightUnit, type TrainingWishes, type WeightUnit } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { userPref } = schema;

export async function mySettings(userId: string) {
  const [p] = await db.select({ weightUnit: userPref.weightUnit, wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, userId));
  return { weightUnit: (p?.weightUnit ?? "kg") as WeightUnit, wishes: (p?.wishes ?? null) as TrainingWishes | null };
}

/** Cambia sólo la presentación: los registros siguen en kg y no se reescriben. */
export async function updateSettings(userId: string, p: { weightUnit?: unknown; wishes?: unknown }) {
  if (p.weightUnit !== undefined && !isWeightUnit(p.weightUnit)) throw new AccessError("invalid", "Elegí kg o lb.");
  const now = new Date();
  if (p.weightUnit) {
    await db.insert(userPref).values({ userId, weightUnit: p.weightUnit, updatedAt: now })
      .onConflictDoUpdate({ target: userPref.userId, set: { weightUnit: p.weightUnit, updatedAt: now } });
    await audit(db, { actorUserId: userId, action: "settings.updated", resourceType: "user", resourceId: userId, meta: { weightUnit: p.weightUnit } });
  }
  if (p.wishes !== undefined) {
    const r = cleanWishes(p.wishes);
    if (!r.ok) throw new AccessError("invalid", r.error);
    await db.insert(userPref).values({ userId, wishes: r.wishes, updatedAt: now })
      .onConflictDoUpdate({ target: userPref.userId, set: { wishes: r.wishes, updatedAt: now } });
    // Sin el texto en la auditoría: sólo qué se completó.
    await audit(db, { actorUserId: userId, action: "settings.wishes", resourceType: "user", resourceId: userId, meta: { goal: r.wishes.goal, filled: Object.entries(r.wishes).filter(([, v]) => v != null).map(([k]) => k) } });
  }
  return mySettings(userId);
}
