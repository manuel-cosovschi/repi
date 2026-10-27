// Importación CSV de clientes del coach (F-CO-11, D99). Importar = invitar por email a cada fila válida: no crea cuentas
// ni relaciones (identidad ≠ pertenencia; la persona acepta con su propia cuenta). El servidor valida y deduplica todo
// de nuevo al confirmar, así reintentar la misma planilla no duplica invitaciones ni reinvita a clientes vigentes.
import { and, eq, gt, inArray } from "drizzle-orm";
import { CSV_MAX_ROWS, isEmail, normalizeEmail } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "./util";
import { inviteCoachClient } from "./services";
import { requireCoach } from "../training/services";

const { invitation, coachClient, user } = schema;

export type ImportStatus = "ok" | "invalid_email" | "duplicate_in_file" | "already_client" | "pending_invitation";
export const IMPORT_STATUS: Record<ImportStatus, string> = {
  ok: "Se invita", invalid_email: "Email inválido o vacío", duplicate_in_file: "Repetido en el archivo",
  already_client: "Ya es tu cliente", pending_invitation: "Ya tiene una invitación vigente",
};
type InRow = { line: number; name?: string | null; email: string };

export async function previewImport(actorId: string, orgId: string, rows: InRow[], now = new Date()) {
  await requireCoach(actorId, orgId);
  if (!rows.length) throw new AccessError("invalid", "El archivo no tiene filas.");
  if (rows.length > CSV_MAX_ROWS) throw new AccessError("invalid", `Hasta ${CSV_MAX_ROWS} filas por importación.`);
  const emails = [...new Set(rows.map((r) => (isEmail(r.email) ? normalizeEmail(r.email) : null)).filter((e): e is string => !!e))];
  const clients = emails.length ? await db.select({ email: user.email }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(coachClient.coachOrgId, orgId), inArray(coachClient.status, ["active", "paused"]), inArray(user.email, emails))) : [];
  const pending = emails.length ? await db.select({ email: invitation.email }).from(invitation)
    .where(and(eq(invitation.orgId, orgId), eq(invitation.kind, "coach_client"), eq(invitation.status, "pending"), gt(invitation.expiresAt, now), inArray(invitation.email, emails))) : [];
  const isClient = new Set(clients.map((c) => normalizeEmail(c.email))), isPending = new Set(pending.map((p) => p.email!));
  const seen = new Set<string>();
  return rows.map((r) => {
    const email = isEmail(r.email) ? normalizeEmail(r.email) : null;
    const status: ImportStatus = !email ? "invalid_email" : seen.has(email) ? "duplicate_in_file" : isClient.has(email) ? "already_client" : isPending.has(email) ? "pending_invitation" : "ok";
    if (email) seen.add(email);
    return { line: r.line, name: r.name?.trim().slice(0, 80) || null, email: email ?? r.email.slice(0, 200), status, label: IMPORT_STATUS[status] };
  });
}

/** Invita sólo las filas válidas según una vista previa recalculada ahora. Devuelve el informe por fila. */
export async function confirmImport(actorId: string, orgId: string, rows: InRow[], now = new Date()) {
  const preview = await previewImport(actorId, orgId, rows, now);
  const report: { line: number; email: string; result: "invited" | "skipped" | "failed"; detail: string }[] = [];
  for (const r of preview) {
    if (r.status !== "ok") { report.push({ line: r.line, email: r.email, result: "skipped", detail: r.label }); continue; }
    try {
      const inv = await inviteCoachClient(actorId, orgId, { email: r.email });
      report.push({ line: r.line, email: r.email, result: "invited", detail: inv.delivery === "failed" ? "Invitación creada · el correo no salió, reenviala" : inv.delivery === "local_only" ? "Invitación creada · buzón local" : "Invitación enviada" });
    } catch (e) {
      report.push({ line: r.line, email: r.email, result: "failed", detail: e instanceof AccessError ? e.message : "No se pudo invitar" });
      if (e instanceof AccessError && (e.status === 403 || e.code === "org_not_enabled")) break; // el espacio no admite altas: no seguir
    }
  }
  const count = (k: "invited" | "skipped" | "failed") => report.filter((x) => x.result === k).length;
  // Auditoría sin emails: sólo cantidades.
  await audit(db, { actorUserId: actorId, orgId, action: "import.clients", resourceType: "organization", resourceId: orgId, meta: { rows: rows.length, invited: count("invited"), skipped: count("skipped"), failed: count("failed") } });
  return { invited: count("invited"), skipped: count("skipped"), failed: count("failed"), rows: report };
}
