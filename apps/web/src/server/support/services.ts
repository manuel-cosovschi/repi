// Soporte e incidentes (N-O11, D93). Canal visible para cualquier persona —con o sin sesión— y bandeja de REPI Admin con
// estados, severidad «incidente», nota interna y respuesta. Procedimiento: docs/SOPORTE_OPERACION.md.
// Reglas: identidad no equivale a coincidencia de email (una consulta sin sesión nunca se liga a una cuenta ni expone si el
// correo existe); Admin resuelve con metadatos y los flujos propios de la persona, sin impersonar ni cambiar credenciales.
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { isEmail, normalizeEmail } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, rateLimit, sha256 } from "../access/util";
import { requireAdmin } from "../commercial/services";

const { supportTicket, user } = schema;

export const SUPPORT_CATEGORIES = ["access", "training", "sync", "billing", "privacy", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

// Sin 0/O ni 1/I/L: se dicta por teléfono.
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newCode = () => "S-" + Array.from(randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join("");

/** Lista cerrada de datos técnicos. Cualquier otra clave se descarta; textos recortados; nada de contenido. */
export function cleanDiagnostics(d: unknown): Record<string, string | number | boolean> | null {
  if (!d || typeof d !== "object") return null;
  const x = d as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  if (typeof x.appVersion === "string") out.appVersion = x.appVersion.slice(0, 40);
  if (typeof x.platform === "string") out.platform = x.platform.slice(0, 160);
  if (typeof x.standalone === "boolean") out.standalone = x.standalone;
  if (typeof x.online === "boolean") out.online = x.online;
  if (typeof x.pendingSync === "number" && Number.isInteger(x.pendingSync) && x.pendingSync >= 0) out.pendingSync = Math.min(x.pendingSync, 100_000);
  // Sólo la ruta, sin query ni fragmento (pueden llevar códigos de invitación).
  if (typeof x.path === "string" && x.path.startsWith("/")) out.path = x.path.split(/[?#]/)[0].slice(0, 100);
  return Object.keys(out).length ? out : null;
}

export async function openTicket(p: {
  userId: string | null; email?: string | null; category: SupportCategory; message: string; diagnostics?: unknown;
}, now = new Date()) {
  const message = (p.message ?? "").trim();
  if (!SUPPORT_CATEGORIES.includes(p.category)) throw new AccessError("invalid", "Elegí un tema.");
  if (message.length < 10) throw new AccessError("invalid", "Contanos un poco más (al menos 10 caracteres).");
  let email: string;
  if (p.userId) {
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, p.userId));
    if (!u) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
    email = u.email;
  } else {
    if (!p.email || !isEmail(p.email)) throw new AccessError("invalid", "Escribí un email para poder responderte.");
    email = normalizeEmail(p.email);
    // Además del límite por IP de la ruta: pocas consultas por correo y por día (la clave guarda un hash, no el email).
    await rateLimit(`support-email:${sha256(email)}`, 3, 86_400_000).catch((e) => {
      throw e instanceof AccessError && e.code === "rate_limited" ? new AccessError("rate_limited", "Ya recibimos varias consultas de este correo hoy. Te respondemos por ahí.", 429) : e;
    });
  }
  const owner = p.userId ? eq(supportTicket.userId, p.userId) : and(sql`${supportTicket.userId} is null`, eq(supportTicket.contactEmail, email));
  // Doble toque o reenvío: el mismo texto abierto en los últimos 10 minutos devuelve la misma consulta.
  const [dup] = await db.select().from(supportTicket)
    .where(and(owner, eq(supportTicket.message, message.slice(0, 2000)), eq(supportTicket.status, "open"), gte(supportTicket.createdAt, new Date(now.getTime() - 600_000))));
  if (dup) return { code: dup.code, createdAt: dup.createdAt, already: true };
  for (let i = 0; ; i++) {
    try {
      const [t] = await db.insert(supportTicket).values({
        code: newCode(), userId: p.userId, contactEmail: email, identity: p.userId ? "session" : "unverified",
        category: p.category, message: message.slice(0, 2000), diagnostics: cleanDiagnostics(p.diagnostics), createdAt: now, updatedAt: now,
      }).returning();
      // Auditoría sin el texto de la consulta.
      await audit(db, { actorUserId: p.userId, action: "support.opened", resourceType: "support_ticket", resourceId: t.id, meta: { category: t.category, identity: t.identity } });
      return { code: t.code, createdAt: t.createdAt, already: false };
    } catch (e) {
      if (i < 3 && (e as { code?: string }).code === "23505") continue; // código repetido: otro intento
      throw e;
    }
  }
}

/** Sólo las consultas abiertas con esta cuenta; las enviadas sin sesión no se suman aunque coincida el email. */
export const myTickets = (userId: string) =>
  db.select({ code: supportTicket.code, category: supportTicket.category, message: supportTicket.message, status: supportTicket.status, resolution: supportTicket.resolution, createdAt: supportTicket.createdAt, resolvedAt: supportTicket.resolvedAt })
    .from(supportTicket).where(eq(supportTicket.userId, userId)).orderBy(desc(supportTicket.createdAt)).limit(50);

// ── REPI Admin ──────────────────────────────────────────────────────────────
export async function listTickets(adminId: string, filter: "active" | "resolved" | "all" = "active") {
  await requireAdmin(adminId);
  const where = filter === "active" ? inArray(supportTicket.status, ["open", "in_progress"]) : filter === "resolved" ? eq(supportTicket.status, "resolved") : undefined;
  const rows = await db.select({ t: supportTicket, name: user.name, emailVerified: user.emailVerified, accountEmail: user.email })
    .from(supportTicket).leftJoin(user, eq(user.id, supportTicket.userId)).where(where)
    .orderBy(sql`case when ${supportTicket.severity} = 'incident' and ${supportTicket.status} <> 'resolved' then 0 else 1 end`, desc(supportTicket.createdAt)).limit(200);
  // Identificación mínima: nombre y correo de la cuenta con sesión; nada de su contenido privado.
  return rows.map(({ t, name, emailVerified, accountEmail }) => ({ ...t, account: t.userId ? { name, email: accountEmail, emailVerified } : null }));
}

export async function updateTicket(adminId: string, id: string, p: {
  status?: "open" | "in_progress" | "resolved"; severity?: "normal" | "incident"; internalNote?: string | null; resolution?: string | null;
}, now = new Date()) {
  await requireAdmin(adminId);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportTicket).where(eq(supportTicket.id, id)).for("update");
    if (!t) throw new AccessError("not_found", "No encontramos esa consulta.", 404);
    const status = p.status ?? t.status;
    const resolution = p.resolution === undefined ? t.resolution : p.resolution?.trim().slice(0, 1000) || null;
    if (status === "resolved" && !resolution) throw new AccessError("invalid", "Escribí la respuesta o qué se hizo antes de cerrarla.");
    const set = {
      status, resolution, severity: p.severity ?? t.severity,
      internalNote: p.internalNote === undefined ? t.internalNote : p.internalNote?.trim().slice(0, 1000) || null,
      resolvedBy: status === "resolved" ? (t.status === "resolved" ? t.resolvedBy : adminId) : null,
      resolvedAt: status === "resolved" ? (t.status === "resolved" ? t.resolvedAt : now) : null,
      updatedAt: now,
    };
    const [r] = await tx.update(supportTicket).set(set).where(eq(supportTicket.id, id)).returning();
    const action = status !== t.status ? (status === "resolved" ? "support.resolved" : t.status === "resolved" ? "support.reopened" : "support.status")
      : set.severity !== t.severity ? "support.severity" : "support.updated";
    await audit(tx, { actorUserId: adminId, action, resourceType: "support_ticket", resourceId: id, meta: { from: t.status, to: status, severity: set.severity } });
    return r;
  });
}

export async function supportCounts() {
  const n = sql<number>`count(*)::int`;
  const active = inArray(supportTicket.status, ["open", "in_progress"]);
  const [[a], [i]] = await Promise.all([
    db.select({ n }).from(supportTicket).where(active),
    db.select({ n }).from(supportTicket).where(and(active, eq(supportTicket.severity, "incident"))),
  ]);
  return { supportOpen: a?.n ?? 0, incidentsOpen: i?.n ?? 0 };
}
