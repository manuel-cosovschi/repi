// Preferencias de asistencia de REPI (D210, Perfil → Asistente REPI). Sin fila = DEFAULT_PREFS del dominio. Sólo la propia
// persona las lee y cambia (userId de la sesión). Push requiere opt-in y ser adulto (contrato §7: menores sin push de coaching).
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_PREFS, type Autonomy, type BrainPrefs } from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { AccessError, audit } from "../access/util";
import { bodyEligibility } from "../progress/body";

const { brainPref } = schema;

/**
 * Interruptor del módulo «assistant» (docs/FEATURE_FLAGS.md), también en el servidor: apagado, no se generan ni se exponen avisos,
 * respuestas, acciones, push ni señales para el entrenador. Los datos no se borran y la persona sigue pudiendo ver y borrar lo que
 * REPI recuerda y sus preferencias (privacidad).
 */
export const assistantOn = () => featureOn("assistant");
export function requireAssistant() {
  if (!assistantOn()) throw new AccessError("module_off", "El Asistente REPI no está disponible.", 404);
}
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const PrefsPatch = z.object({
  proactive: z.boolean(),
  push: z.boolean(),
  categories: z.object({ training: z.boolean(), progress: z.boolean(), performance: z.boolean(), motivation: z.boolean(), weekly: z.boolean() }).strict().partial(),
  quietStart: HHMM,
  quietEnd: HHMM,
  maxPerDay: z.number().int().min(0).max(10),
  autonomy: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  tone: z.enum(["normal", "breve"]),
}).strict().partial();
export type BrainPrefsPatch = z.infer<typeof PrefsPatch>;

const fromRow = (r: typeof brainPref.$inferSelect): BrainPrefs => ({
  proactive: r.proactive, push: r.push, categories: { ...DEFAULT_PREFS.categories, ...(r.categories ?? {}) },
  quietStart: r.quietStart, quietEnd: r.quietEnd, maxPerDay: r.maxPerDay, autonomy: r.autonomy as Autonomy, tone: r.tone,
});
const defaults = (): BrainPrefs => ({ ...DEFAULT_PREFS, categories: { ...DEFAULT_PREFS.categories } });

export async function getPrefs(userId: string): Promise<BrainPrefs> {
  const [r] = await db.select().from(brainPref).where(eq(brainPref.userId, userId));
  return r ? fromRow(r) : defaults();
}

/** Cambia sólo lo enviado (validado estricto: un campo desconocido o fuera de rango responde 400). Devuelve lo vigente. */
export async function updatePrefs(userId: string, patch: unknown, now = new Date()): Promise<BrainPrefs> {
  const p = PrefsPatch.safeParse(patch);
  if (!p.success) throw new AccessError("invalid", "Revisá las preferencias: hay un valor que no corresponde.");
  if (p.data.push === true) {
    const age = await bodyEligibility(userId, now); // edad desconocida nunca se supone adulta (D203)
    if (age === "minor") throw new AccessError("minor_restricted", "Las notificaciones de REPI fuera de la app son sólo para mayores de 18 años.", 403);
    if (age !== "adult") throw new AccessError("age_required", "Para recibir notificaciones de REPI fuera de la app confirmá tu fecha de nacimiento.", 403);
  }
  const cur = await getPrefs(userId);
  const next: BrainPrefs = { ...cur, ...p.data, categories: { ...cur.categories, ...(p.data.categories ?? {}) } } as BrainPrefs;
  const values = { proactive: next.proactive, push: next.push, categories: next.categories, quietStart: next.quietStart, quietEnd: next.quietEnd,
    maxPerDay: next.maxPerDay, autonomy: next.autonomy, tone: next.tone, updatedAt: now };
  await db.insert(brainPref).values({ userId, ...values }).onConflictDoUpdate({ target: brainPref.userId, set: values });
  // Sin valores en la auditoría: sólo qué campos cambiaron.
  await audit(db, { actorUserId: userId, action: "brain.prefs_updated", resourceType: "user", resourceId: userId, meta: { fields: Object.keys(p.data) } });
  return next;
}
