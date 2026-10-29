// Pantalla del ranking en la sala (D146): una TV o tablet del gimnasio muestra en vivo el ranking por ejercicio (D144).
// Igual que la pantalla de ingreso (D127): no usa la sesión de una persona; el enlace trae un secreto revocable que queda en
// el equipo y sólo sirve para leer este tablero. Sólo aparecen quienes eligieron «Aparecer en el ranking».
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { NOT_FOUND, gymContext, needRoles, scopedLocations } from "../gym/services";
import { liftBoard } from "./club";

const { gymAccessDisplay, organization } = schema;
const MANAGE = ["owner", "manager"];
const site = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

async function manage(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  needRoles(ctx, MANAGE);
  return ctx;
}

export async function rankingScreens(actorId: string, orgId: string) {
  await manage(actorId, orgId);
  const rows = await db.select().from(gymAccessDisplay)
    .where(and(eq(gymAccessDisplay.orgId, orgId), eq(gymAccessDisplay.purpose, "ranking"), isNull(gymAccessDisplay.revokedAt))).orderBy(desc(gymAccessDisplay.createdAt));
  return { screens: rows.map((d) => ({ id: d.id, name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt })) };
}

/** El enlace se muestra una sola vez (el secreto va en el fragmento y se guarda sólo su hash). */
export async function createRankingScreen(actorId: string, orgId: string, name: string) {
  const ctx = await manage(actorId, orgId);
  const n = (name ?? "").trim().slice(0, 60);
  if (n.length < 2) throw new AccessError("invalid", "Poné un nombre para reconocer la pantalla (por ejemplo, «TV de la sala»).");
  const [loc] = await scopedLocations(ctx, null);
  if (!loc) throw NOT_FOUND();
  const secret = randomBytes(32).toString("base64url");
  const [d] = await db.insert(gymAccessDisplay).values({ orgId, locationId: loc.id, name: n, purpose: "ranking", secretHash: hash(secret), createdBy: actorId }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "club.screen_created", resourceType: "gym_access_display", resourceId: d.id });
  return { id: d.id, link: `${site()}/ranking/pantalla#k=${secret}` };
}

export async function revokeRankingScreen(actorId: string, orgId: string, id: string) {
  await manage(actorId, orgId);
  const [d] = await db.update(gymAccessDisplay).set({ revokedAt: new Date() })
    .where(and(eq(gymAccessDisplay.id, id), eq(gymAccessDisplay.orgId, orgId), eq(gymAccessDisplay.purpose, "ranking"), isNull(gymAccessDisplay.revokedAt))).returning();
  if (!d) throw NOT_FOUND();
  await audit(db, { actorUserId: actorId, orgId, action: "club.screen_revoked", resourceType: "gym_access_display", resourceId: id });
  return { ok: true };
}

/** La pantalla pide el tablero con su secreto en un encabezado. Sin personas identificadas más allá de lo que eligieron mostrar. */
export async function screenBoard(secret: string, exerciseId: string | null, now = new Date()) {
  if (!secret || secret.length < 30 || secret.length > 100) throw new AccessError("invalid_display", "Pantalla no autorizada.", 401);
  const [d] = await db.select({ d: gymAccessDisplay, org: organization.name, status: organization.status }).from(gymAccessDisplay)
    .innerJoin(organization, eq(organization.id, gymAccessDisplay.orgId)).where(eq(gymAccessDisplay.secretHash, hash(secret)));
  if (!d || d.d.revokedAt || d.d.purpose !== "ranking") throw new AccessError("invalid_display", "Esta pantalla ya no está autorizada. Pedí una nueva en Comunidad › Pantalla del ranking.", 401);
  if (d.status === "paused" || d.status === "closed") throw new AccessError("org_unavailable", "El gimnasio no tiene REPI activo en este momento.", 403);
  if (!d.d.lastSeenAt || now.getTime() - d.d.lastSeenAt.getTime() > 60_000) await db.update(gymAccessDisplay).set({ lastSeenAt: now }).where(eq(gymAccessDisplay.id, d.d.id));
  const board = await liftBoard(d.d.orgId, exerciseId, null, now);
  return { gym: d.org, metric: board.metric, updatedAt: board.updatedAt, exercises: board.exercises.slice(0, 8), exercise: board.exercise, rows: board.rows.slice(0, 10).map(({ me: _me, ...r }) => r) };
}

