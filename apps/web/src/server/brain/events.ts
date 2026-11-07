// Eventos del cerebro (D210, contrato §2 capa 1 «server/brain/events.ts»). Sin tabla nueva: lo que REPI necesita recordar de
// lo que pasó queda en brain_memory con procedencia `system` y vencimiento por tipo (decisión y resultado: 180 días; temporal:
// fin del día). Los hechos (series, marcas, programa) nunca se copian acá: se leen de la base.
//
// Todo es de mejor esfuerzo: un evento que no se puede guardar se registra en el log (sin contenido) y NUNCA rompe la acción,
// el mensaje ni el registro de series que lo originó.
import { and, eq, isNull, ne } from "drizzle-orm";
import { fold } from "@repi/domain/brain";
import { db, schema } from "@/db";
import { logError } from "../log";
import { createMemory } from "./memory";

const { brainMemory } = schema;
type Ref = Record<string, string | number | null>;
const clipText = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

/** Clave segura para brain_memory (`[a-z0-9_:.-]`, hasta 80). Conserva los ids tal cual (guiones incluidos). */
export const memKey = (...parts: (string | number)[]) => fold(parts.map(String).join(":")).replace(/[^a-z0-9_:.-]+/g, "_").slice(0, 80);

export type DecisionKind = "accepted" | "rejected" | "modified" | "dismissed" | "never";
const DECISION_TEXT: Record<DecisionKind, string> = {
  accepted: "Aceptaste", rejected: "Rechazaste", modified: "Modificaste", dismissed: "Descartaste", never: "Pediste no ver más",
};

/**
 * Decisión de la persona sobre algo que propuso REPI (una acción del chat o un aviso). Una vigente por (decisión, tipo):
 * repetirla no la duplica (queda la primera, con su referencia). Los conteos («rechazó tres veces») se leen de brain_action, no
 * de acá. `what` es el tipo de acción o de aviso; `label` lo dice en palabras para «Lo que REPI recuerda».
 */
export async function recordDecision(userId: string, d: { decision: DecisionKind; what: string; label?: string | null; ref?: Ref | null }, now = new Date()) {
  try {
    const key = memKey(d.decision, d.what);
    const text = clipText(`${DECISION_TEXT[d.decision]}: ${d.label || d.what.replace(/_/g, " ")}.`);
    return (await createMemory(userId, { kind: "decision", key, value: { decision: d.decision, what: d.what }, text, source: "system", ref: d.ref ?? null }, now)).item;
  } catch (e) {
    logError("brain.events.decision", e);
    return null;
  }
}

/**
 * Contexto del momento (máquina ocupada, minutos de hoy): vence al terminar el día. Reemplaza al anterior de la misma clave
 * y sesión, así «me quedan 20 minutos» y después «me quedan 10» no conviven.
 */
export async function recordTemporal(userId: string, t: { key: string; value: unknown; text: string; ref?: Ref | null }, now = new Date()) {
  try {
    const key = memKey(t.key);
    await db.update(brainMemory).set({ revokedAt: now })
      .where(and(eq(brainMemory.userId, userId), eq(brainMemory.kind, "temporal"), eq(brainMemory.key, key), isNull(brainMemory.revokedAt)));
    return (await createMemory(userId, { kind: "temporal", key, value: t.value, text: clipText(t.text), source: "system", ref: t.ref ?? null }, now)).item;
  } catch (e) {
    logError("brain.events.temporal", e);
    return null;
  }
}

/**
 * Resultado (lo que pasó después: el cierre de una sesión, una acción ejecutada). Uno vigente por clave: si cambia el valor
 * (p. ej. llegó tarde una serie sin conexión), el anterior queda revocado y se guarda el nuevo; si es igual, no se duplica.
 */
export async function recordOutcome(userId: string, o: { key: string; value: unknown; text: string; ref?: Ref | null }, now = new Date()) {
  try {
    const key = memKey(o.key);
    const r = await createMemory(userId, { kind: "outcome", key, value: o.value, text: clipText(o.text), source: "system", ref: o.ref ?? null }, now);
    if (r.created) {
      await db.update(brainMemory).set({ revokedAt: now })
        .where(and(eq(brainMemory.userId, userId), eq(brainMemory.kind, "outcome"), eq(brainMemory.key, key), isNull(brainMemory.revokedAt), ne(brainMemory.id, r.item.id)));
    }
    return r.item;
  } catch (e) {
    logError("brain.events.outcome", e);
    return null;
  }
}
