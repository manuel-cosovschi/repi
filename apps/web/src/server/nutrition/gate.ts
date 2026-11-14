// Nutrition Intelligence 1.0 (D221): quién puede usar el módulo.
// - Interruptor general `nutrition` (apagado en producción hasta completar la validación de activación).
// - Piloto: las cuentas ficticias de la demo guiada (demo_sandbox) lo tienen encendido, para verificar en producción sin
//   habilitarlo a personas reales. Ninguna cuenta real entra por esta vía.
// - Sólo adultos con fecha de nacimiento registrada (D203): menores, no en 1.0; edad desconocida, se pide la fecha.
// El servidor valida todo; la interfaz sólo oculta.
import { eq, sql } from "drizzle-orm";
import { ageEligibility, localDate, nutritionEligibility } from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { AccessError } from "../access/util";

export const NUTRITION_ITEMS = ["nutrition", "nutrition_journal"] as const;
export const isNutritionItem = (x: string) => (NUTRITION_ITEMS as readonly string[]).includes(x);

/** ¿La persona pertenece a un entorno de la demo guiada? (cuentas ficticias, se borran a las 6 h) */
export async function isSandboxUser(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.demoSandbox).where(sql`${schema.demoSandbox.userIds} @> ${JSON.stringify([userId])}::jsonb`);
  return (r?.n ?? 0) > 0;
}

/** Módulo encendido para esta persona: general o piloto de demo. */
export async function nutritionEnabledFor(userId: string) {
  return featureOn("nutrition") || (await isSandboxUser(userId));
}

export async function ageOf(userId: string, now = new Date()) {
  const [u] = await db.select({ birth: schema.user.birthDate }).from(schema.user).where(eq(schema.user.id, userId));
  if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  return ageEligibility(u.birth, localDate(now));
}

/** Estado para la interfaz: si se muestra la sección y si la persona puede usarla. */
export async function nutritionState(userId: string, now = new Date()) {
  const enabled = await nutritionEnabledFor(userId);
  if (!enabled) return { enabled: false as const };
  const e = nutritionEligibility(await ageOf(userId, now));
  return { enabled: true as const, eligible: e.ok, reason: e.ok ? null : e.reason, scan: featureOn("nutrition_scan") };
}

const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
/** Módulo apagado → 404 (como el resto de los módulos). Menor → 403 minor_restricted. Sin fecha → 403 age_required. */
export async function requireNutrition(userId: string, now = new Date()) {
  if (!(await nutritionEnabledFor(userId))) throw NF();
  const e = nutritionEligibility(await ageOf(userId, now));
  if (!e.ok) throw e.reason === "minor"
    ? new AccessError("minor_restricted", "Nutrición no está disponible para menores de 18 años.", 403)
    : new AccessError("age_required", "Para usar Nutrición confirmá tu fecha de nacimiento.", 403);
}
