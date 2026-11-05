// D198 (06/06): vigilante de respaldos INDEPENDIENTE del cronograma de GitHub. El workflow «Respaldo» avisa a REPI cuando
// un respaldo quedó verificado y publicado; la tarea de cada minuto de REPI (pg_cron de Supabase, no GitHub) revisa una vez
// por hora y manda un email al titular si pasaron más de 30 h sin uno. Así se detecta también una ejecución que nunca empezó.
// Se arma con la primera señal auténtica (secreto compartido o token OIDC de GitHub): antes no avisa nada (sin falsas
// alarmas). Sin datos personales.
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, rateLimit } from "../access/util";
import { alertError, type ErrorSummary } from "../alerts";
import { githubJwks, isBackupWorkflow, verifyGithubToken, type Jwk } from "./github-oidc";

export const MAX_GAP_HOURS = 30; // diario 06:17 + reserva 12:47 UTC: 30 h cubre un día con la reserva tarde
const TAG = /^backup-\d{8}-\d{6}-\d{1,20}$/;
const RUN = /^\d{1,20}$/;

export function heartbeatAuthorized(req: Request) {
  const secret = process.env.BACKUP_HEARTBEAT_SECRET;
  if (!secret || secret.length < 32) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Audiencia propia: un token pedido para Storage o para la base no sirve como señal, y viceversa. */
export const HEARTBEAT_AUDIENCE = "repi-backup-heartbeat";

/**
 * Quién manda la señal: el secreto compartido (si está configurado) o un token OIDC firmado por GitHub para el workflow
 * de respaldo en main de este repositorio (misma política que las Edge Functions, D190), atado al número de corrida.
 * El token OIDC no necesita ningún secreto guardado en GitHub y vence en minutos.
 */
export async function heartbeatSource(req: Request, run: string, keys: () => Promise<Jwk[]> = () => githubJwks()): Promise<"secret" | "oidc" | null> {
  if (heartbeatAuthorized(req)) return "secret";
  const token = req.headers.get("x-repi-github-oidc");
  if (!token) return null;
  try {
    const claims = await verifyGithubToken(token, await keys());
    if (!isBackupWorkflow(claims, HEARTBEAT_AUDIENCE) || String(claims!.run_id) !== run) return null;
    return "oidc";
  } catch { return null; }
}

export async function recordBackupHeartbeat(p: { tag: string; run: string; source?: "secret" | "oidc" }) {
  if (!TAG.test(p.tag) || !RUN.test(p.run)) return { ok: false as const };
  const [dup] = await db.select({ id: schema.auditEvent.id }).from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "backup.verified"), eq(schema.auditEvent.resourceId, p.tag))).limit(1);
  if (!dup) await audit(db, { action: "backup.verified", resourceType: "backup", resourceId: p.tag, meta: { run: p.run, source: p.source ?? "secret" } });
  return { ok: true as const };
}

export async function lastVerifiedBackup() {
  const [r] = await db.select({ tag: schema.auditEvent.resourceId, at: schema.auditEvent.at }).from(schema.auditEvent)
    .where(eq(schema.auditEvent.action, "backup.verified")).orderBy(desc(schema.auditEvent.at)).limit(1);
  return r ?? null;
}

/** Una vez por hora desde la tarea de cada minuto. Como mucho un email cada 12 h mientras siga sin respaldo. */
export async function checkBackupFreshness(now = new Date(), notify: (e: ErrorSummary, now: Date) => Promise<boolean> = alertError) {
  const last = await lastVerifiedBackup();
  if (!last) return { armed: false, late: false };
  const hours = (now.getTime() - new Date(last.at).getTime()) / 3_600_000;
  if (hours <= MAX_GAP_HOURS) return { armed: true, late: false, hours };
  try { await rateLimit("alert:backup-missing", 1, 12 * 3_600_000); } catch { return { armed: true, late: true, hours, notified: false }; }
  const notified = await notify({ scope: "respaldo", where: "respaldo diario de producción", name: "SinRespaldoVerificado",
    msg: `No hay un respaldo verificado desde hace ${Math.floor(hours)} h (último: ${last.tag}). Revisar Actions → Respaldo (docs/RESPALDOS.md).`, pg: null }, now);
  return { armed: true, late: true, hours, notified };
}
