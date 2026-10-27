// Configuración del alumno (F-HX-23, D95). Hoy: unidad de peso. Idioma es-AR único y notificaciones en el centro de la app
// (sin push al alumno todavía); menores según la política que defina el titular: no hay opciones que simular acá.
import { eq } from "drizzle-orm";
import { isWeightUnit, type WeightUnit } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { userPref } = schema;

export async function mySettings(userId: string) {
  const [p] = await db.select({ weightUnit: userPref.weightUnit }).from(userPref).where(eq(userPref.userId, userId));
  return { weightUnit: (p?.weightUnit ?? "kg") as WeightUnit };
}

/** Cambia sólo la presentación: los registros siguen en kg y no se reescriben. */
export async function updateSettings(userId: string, p: { weightUnit?: unknown }) {
  if (p.weightUnit !== undefined && !isWeightUnit(p.weightUnit)) throw new AccessError("invalid", "Elegí kg o lb.");
  if (p.weightUnit) {
    const now = new Date();
    await db.insert(userPref).values({ userId, weightUnit: p.weightUnit, updatedAt: now })
      .onConflictDoUpdate({ target: userPref.userId, set: { weightUnit: p.weightUnit, updatedAt: now } });
    await audit(db, { actorUserId: userId, action: "settings.updated", resourceType: "user", resourceId: userId, meta: { weightUnit: p.weightUnit } });
  }
  return mySettings(userId);
}
