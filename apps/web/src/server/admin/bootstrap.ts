import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError, audit, newToken, sha256 } from "../access/util";

const IDENTIFIER = "repi:first-admin";
// El mismo lock serializa emisión y consumo aun con varias instancias del servidor.
const lock = sql`select pg_advisory_xact_lock(73190, 1)`;
const unavailable = () => new AccessError("invalid_ticket", "El enlace de administración venció o ya no está disponible.", 403);

/** Sólo invocable desde la CLI con acceso a la base. No exponer por una ruta HTTP. */
export async function issueFirstAdminTicket(now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(lock);
    if ((await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.platformRole, "admin")).limit(1)).length) {
      throw new AccessError("admin_exists", "Ya existe una cuenta administradora. Usá su recuperación de acceso.", 409);
    }
    const token = newToken(), expiresAt = new Date(now.getTime() + 24 * 3600_000);
    await tx.delete(schema.verification).where(eq(schema.verification.identifier, IDENTIFIER));
    await tx.insert(schema.verification).values({ id: randomUUID(), identifier: IDENTIFIER, value: sha256(token), expiresAt });
    await audit(tx, { action: "admin.bootstrap.issued", resourceType: "admin_bootstrap", meta: { expiresAt: expiresAt.toISOString() } });
    return { token, expiresAt };
  });
}

/** La cuenta real debe demostrar control del email y configurar su propio segundo factor. */
export async function claimFirstAdmin(userId: string, token: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(lock);
    const [u] = await tx.select().from(schema.user).where(eq(schema.user.id, userId)).for("update");
    if (!u || !u.emailVerified) throw new AccessError("unverified", "Verificá tu email antes de activar la administración.", 403);
    if (/@demo\.repi\.app$|\.invalid$/i.test(u.email)) throw unavailable();
    const [factor] = await tx.select({ id: schema.twoFactor.id }).from(schema.twoFactor)
      .where(and(eq(schema.twoFactor.userId, userId), eq(schema.twoFactor.verified, true)));
    if (!u.twoFactorEnabled || !factor) throw new AccessError("twofa_required", "Activá la verificación en dos pasos antes de continuar.", 403);
    if ((await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.platformRole, "admin")).limit(1)).length) throw unavailable();
    const [ticket] = await tx.select().from(schema.verification).where(and(
      eq(schema.verification.identifier, IDENTIFIER), eq(schema.verification.value, sha256(token)), gt(schema.verification.expiresAt, now),
    )).for("update");
    if (!ticket) throw unavailable();
    await tx.update(schema.user).set({ platformRole: "admin", updatedAt: now }).where(eq(schema.user.id, userId));
    await tx.delete(schema.verification).where(eq(schema.verification.identifier, IDENTIFIER));
    await audit(tx, { actorUserId: userId, action: "admin.bootstrap.claimed", resourceType: "user", resourceId: userId });
    return { href: "/admin" };
  });
}
