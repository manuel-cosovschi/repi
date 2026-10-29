// API del escritorio Gym (Etapa 5). Un único punto de entrada; la autorización por capacidad y sede vive en los servicios.
import { z } from "zod";
import { DetailZ } from "@/server/training/detail-schema";
import { isPeriod, type Period } from "@repi/domain";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as gym from "@/server/gym/services";
import * as rv from "@/server/gym/reviews";
import * as mt from "@/server/gym/metrics";
import * as msg from "@/server/messages/services";
import * as cm from "@/server/community/services";
import * as club from "@/server/community/club";
import * as screen from "@/server/community/screen";
import * as join from "@/server/join/services";
import * as alerts from "@/server/gym/alerts";
import * as notices from "@/server/gym/notices";
import * as connect from "@/server/gym/connect";
import * as ac from "@/server/gym/access-control";
import * as floor from "@/server/gym/floor-now";
import * as guide from "@/server/gym/owner-assistant";

type Ctx = { params: Promise<{ orgId: string; path: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const id = z.string().min(1).max(64);
const period = (u: URL): Period => { const p = u.searchParams.get("period"); return isPeriod(p) ? p : "30d"; };
const loc = (u: URL) => u.searchParams.get("loc")?.slice(0, 64) || null;
const DOC = z.object({
  name: z.string().max(120), weeks: z.number().int(), note: z.string().max(1000),
  days: z.array(z.object({ name: z.string().max(60), exercises: z.array(z.object({
    exerciseId: id, name: z.string().max(120), sets: z.number().int(), reps: z.string().max(20), rir: z.number().int().nullable(), restSec: z.number().int(), note: z.string().max(300).nullable().optional(), detail: DetailZ,
  })) })),
});

export const GET = handle<Ctx>(async (req, { params }) => {
  const { orgId, path } = await params;
  const me = await sessionUserId();
  const u = new URL(req.url);
  const [a, b, c] = path;
  switch (a) {
    case "context": {
      const ctx = await gym.gymContext(me, orgId);
      const { allowed } = await gym.scopedLocation(ctx, null);
      return { org: { id: ctx.org.id, name: ctx.org.name }, name: ctx.name, roles: ctx.roles, caps: ctx.caps, locations: allowed.map((l) => ({ id: l.id, name: l.name })), afterHoursAccess: ctx.afterHoursAccess, connect: connect.connectOn(ctx.org), accessControl: (await ac.policyOf(orgId)).enabled };
    }
    case "notices": return notices.myStaffNotices(me, orgId);
    case "shift": return gym.myShift(me, orgId, loc(u));
    case "queue": return gym.listQueue(me, orgId, loc(u) ?? "");
    case "tasks": return gym.managerTasks(me, orgId, loc(u), u.searchParams.get("filter") ?? "all");
    case "handoff": return gym.handoffOptions(me, orgId, loc(u) ?? "");
    case "members": {
      if (!b) return gym.listMembers(me, orgId, loc(u) ?? "", u.searchParams.get("q") ?? "");
      const d = await gym.memberDetail(me, orgId, b);
      return { ...d, community: await cm.memberCommunitySummary(orgId, b) }; // intentos y logros en la ficha (F-HX-15)
    }
    case "library": return gym.gymLibrary(me, orgId);
    case "team": return gym.teamList(me, orgId, loc(u));
    case "shifts": return gym.weekPlan(me, orgId, loc(u) ?? "", u.searchParams.get("week"));
    case "perf":
      if (b === "me") return mt.myPerformance(me, orgId, period(u));
      if (b === "trainer" && c) return mt.trainerDetail(me, orgId, c, period(u));
      return mt.performanceCenter(me, orgId, loc(u), period(u));
    case "panel": return mt.managerPanel(me, orgId, loc(u));
    case "engage": return mt.engagement(me, orgId, loc(u));
    case "exec": return mt.executive(me, orgId);
    case "config": return mt.gymConfig(me, orgId);
    case "reviews": return b === "mine" ? rv.myTrainerReviews(me, orgId) : rv.reviewAnalytics(me, orgId, loc(u), Math.min(365, Number(u.searchParams.get("days")) || 90));
    case "attributions": return rv.myAttributions(me, orgId);
    case "cases": return b ? rv.caseDetail(me, orgId, b) : rv.listCases(me, orgId, loc(u));
    case "access-history": return rv.accessHistory(me, orgId);
    case "messages": return msg.floorThreads(me, orgId, loc(u) ?? "");
    case "community": return cm.staffCommunity(me, orgId);
    case "validations": return cm.listValidations(me, orgId);
    case "club": return b === "screens" ? screen.rankingScreens(me, orgId) : club.clubReports(me, orgId);
    // Anexo 26/10: bandeja de solicitudes por QR, enlaces por sede, accesos habilitados y alertas de sala.
    case "joins": return join.joinInbox(me, orgId);
    case "join-links": return join.joinLinks(me, orgId);
    case "join-qr": return join.showJoinQr(me, orgId);
    case "accesses": return join.listAccesses(me, orgId, u.searchParams.get("q")?.slice(0, 80) ?? "");
    case "alerts": return alerts.listAlerts(me, orgId, loc(u) ?? "");
    // Control de acceso (D127): política, QR dinámico de sede, panel y búsqueda para validar a mano.
    case "access":
      if (b === "settings") return ac.accessSettings(me, orgId);
      if (b === "report") return ac.accessReport(me, orgId, loc(u), Number(u.searchParams.get("days")) || 7);
      if (b === "qr") return ac.staffQr(me, orgId, loc(u) ?? "");
      if (b === "members") return ac.memberLookup(me, orgId, u.searchParams.get("q") ?? "");
      break;
    // REPI Connect (D126): bandeja del profesor, detalle con contexto e indicadores agregados para gestión.
    case "floor-now": return floor.staffFloorNow(me, orgId, loc(u)); // D131: en sala ahora
    case "setup": return guide.ownerSetup(me, orgId); // D135: primeros pasos del dueño
    case "connect":
      if (b === "board") return connect.staffBoard(me, orgId, loc(u));
      if (b === "tasks" && c) return connect.staffTask(me, orgId, c);
      if (b === "report") return connect.connectReport(me, orgId, loc(u), Number(u.searchParams.get("days")) || 30);
      break;
  }
  throw NF();
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { orgId, path } = await params;
  const me = await sessionUserId();
  await limit(`gym:${me}`, 120);
  const [a, b, c] = path;
  if (a === "notices" && b === "read") return notices.markStaffNoticesRead(me, orgId, (await body(req, z.object({ ids: z.array(id).max(100).nullable() }))).ids);
  if (a === "shift" && b === "start") return gym.startShift(me, orgId, (await body(req, z.object({ loc: id }))).loc);
  if (a === "shift" && b === "close") {
    const p = await body(req, z.object({ loc: id, toUserId: id.nullable(), items: z.array(z.object({ taskId: id, summary: z.string().max(500) })).max(50) }));
    return gym.closeShift(me, orgId, p.loc, p);
  }
  if (a === "tasks" && !b) {
    const p = await body(req, z.object({ loc: id, gymMemberId: id.nullable().optional(), category: z.string().max(40), priority: z.enum(["alta", "media", "baja"]).optional(), summary: z.string().max(500), assignToMe: z.boolean().optional(), dueAt: z.string().max(40).nullable().optional() }));
    return gym.createTask(me, orgId, p.loc, p);
  }
  if (a === "tasks" && b && c === "take") return gym.takeTask(me, orgId, b);
  if (a === "tasks" && b && c === "complete") return gym.completeTask(me, orgId, b);
  if (a === "tasks" && b && c === "accept") return gym.acceptHandoff(me, orgId, b);
  if (a === "tasks" && b && c === "reassign") return gym.reassignTask(me, orgId, b, (await body(req, z.object({ toUserId: id.nullable() }))).toUserId);
  if (a === "members" && b && c === "program") return gym.saveMemberProgram(me, orgId, b, await body(req, z.object({ doc: DOC, reason: z.string().max(300), completeTaskId: id.nullable().optional() })));
  if (a === "members" && b && c === "notes") return gym.addNote(me, orgId, b, await body(req, z.object({ kind: z.enum(["institutional", "personal"]), text: z.string().max(1000) })));
  if (a === "members" && b && c === "conversation") return msg.floorConversationFor(me, orgId, b);
  if (a === "team" && b && c === "after-hours") return gym.setAfterHours(me, orgId, b, (await body(req, z.object({ on: z.boolean() }))).on);
  if (a === "team" && b && c === "private") return gym.tryPrivate(me, orgId, b, (await body(req, z.object({ what: z.string().max(80) }))).what);
  if (a === "shifts") { const p = await body(req, z.object({ loc: id, userId: id, date: z.string().max(10), code: z.string().max(1).nullable() })); return gym.setPlanCell(me, orgId, p.loc, p); }
  if (a === "engage" && b === "program-tasks") return mt.createProgramTasks(me, orgId, (await body(req, z.object({ loc: id }))).loc);
  if (a === "config" && b === "review-responses") return mt.setReviewResponses(me, orgId, (await body(req, z.object({ on: z.boolean() }))).on);
  if (a === "reviews" && b && c === "respond") return rv.respondReview(me, orgId, b, (await body(req, z.object({ text: z.string().max(600) }))).text);
  if (a === "cases" && !b) return rv.openCase(me, orgId, await body(req, z.object({ type: z.enum(["review_report", "attribution"]), refId: id, reason: z.string().max(120), detail: z.string().max(600).nullable().optional() })));
  if (a === "cases" && b && c === "appeal") return rv.appealCase(me, orgId, b, (await body(req, z.object({ text: z.string().max(600) }))).text);
  // Comunidad (Etapa 6)
  if (a === "community" && b === "images") {
    const len = Number(req.headers.get("content-length") ?? "0");
    if (!len || len > 6 * 1024 * 1024) throw new AccessError("invalid_file", "La imagen tiene que ser JPG, PNG o WebP de hasta 5 MB.", 413);
    const f = (await req.formData()).get("file");
    if (!(f instanceof File)) throw new AccessError("invalid_file", "Elegí una imagen.");
    return cm.uploadMedia(me, { kind: "image", orgId, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  if (a === "community" && b === "posts" && !c) return cm.createPost(me, orgId, await body(req, z.object({ locationId: id.nullable().optional(), type: z.enum(["novedad", "descuento"]), title: z.string().max(120), text: z.string().max(1000).optional(), badge: z.string().max(30).nullable().optional(), imageId: id.nullable().optional(), validUntil: z.string().max(10).nullable().optional() })));
  if (a === "community" && b === "posts" && c) return cm.removePost(me, orgId, c);
  if (a === "community" && b === "challenges" && !c) return cm.createChallenge(me, orgId, await body(req, z.object({ locationId: id.nullable().optional(), title: z.string().max(80), rule: z.string().max(400), unit: z.string().max(4), lowerIsBetter: z.boolean().optional(), category: z.string().max(20), prize: z.string().max(120), endsOn: z.string().max(10) })));
  if (a === "community" && b === "challenges" && c) return cm.removeChallenge(me, orgId, c);
  if (a === "community" && b === "catalog" && !c) return cm.upsertItem(me, orgId, await body(req, z.object({ id: id.nullable().optional(), locationId: id.nullable().optional(), category: z.string().max(30), name: z.string().max(80), priceArs: z.number().int(), promo: z.string().max(40).nullable().optional(), highlighted: z.boolean().optional(), available: z.boolean().optional(), imageId: id.nullable().optional() })));
  if (a === "community" && b === "catalog" && c) return cm.removeItem(me, orgId, c);
  if (a === "community" && b === "hours") { const p = await body(req, z.object({ loc: id, hours: z.string().max(120) })); return cm.setReceptionHours(me, orgId, p.loc, p.hours); }
  if (a === "validations" && b) return cm.decideAttempt(me, orgId, b, await body(req, z.object({ approve: z.boolean(), reason: z.string().max(200).nullable().optional() })));
  if (a === "desk" && b === "verify") return cm.verifyCard(me, orgId, (await body(req, z.object({ token: z.string().max(200) }))).token);
  if (a === "desk" && b === "checkin") { const p = await body(req, z.object({ token: z.string().max(200), loc: id })); return cm.checkIn(me, orgId, p.token, p.loc); }
  if (a === "desk" && b === "prizes" && c) return cm.deliverPrize(me, orgId, c);
  // D146: pantallas del ranking en la sala (crear y revocar).
  if (a === "club" && b === "screens" && !c) return screen.createRankingScreen(me, orgId, (await body(req, z.object({ name: z.string().max(60) }))).name);
  if (a === "club" && b === "screens" && c && path[3] === "revoke") return screen.revokeRankingScreen(me, orgId, c);
  if (a === "club" && (b === "post" || b === "comment") && c) return club.moderateClub(me, orgId, { type: b, id: c, outcome: (await body(req, z.object({ outcome: z.enum(["keep", "remove"]) }))).outcome });
  if (a === "joins" && b) return join.decideJoin(me, orgId, b, await body(req, z.object({ approve: z.boolean(), method: z.string().max(40).optional(), reason: z.string().max(40).optional(), note: z.string().max(300).optional() })));
  if (a === "join-links" && b && c === "regenerate") return join.regenerateJoinLink(me, orgId, b);
  if (a === "join-links" && b && c === "revoke") return join.revokeJoinLink(me, orgId, b);
  if (a === "accesses" && b && (c === "suspend" || c === "end" || c === "reactivate")) return join.setAccess(me, orgId, b, c);
  if (a === "accesses" && b && c === "report") return join.reportNotMember(me, orgId, b);
  if (a === "assistant") { await limit(`assistant:${me}`, 40, 3_600_000); return guide.askOwnerAssistant(me, orgId, (await body(req, z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(20) }))).messages); }
  if (a === "library" && !b) return gym.gymCreateExercise(me, orgId, await body(req, z.object({ name: z.string().max(80), group: z.string().max(40), kind: z.string().max(20) })));
  if (a === "alerts" && b && c === "ack") return alerts.ackAlert(me, orgId, b);
  if (a === "access" && b === "policy") return ac.updatePolicy(me, orgId, await body(req, z.object({
    mode: z.enum(["open", "hybrid", "strict"]).optional(), strictActions: z.array(z.enum(["gym.assistance.request", "gym.challenge.attempt"])).max(4).optional(),
    qrTtlSec: z.number().int().optional(), passHours: z.number().int().optional(), geoMode: z.enum(["off", "optional", "required"]).optional(),
  })));
  if (a === "access" && b === "locations" && c) return ac.setLocationGeo(me, orgId, c, (await body(req, z.object({ geo: z.object({ lat: z.number(), lng: z.number(), radiusM: z.number().int() }).nullable() }))).geo);
  if (a === "access" && b === "displays" && !c) { const p = await body(req, z.object({ loc: id, name: z.string().max(60) })); return ac.createDisplay(me, orgId, p.loc, p.name); }
  if (a === "access" && b === "displays" && c) return ac.revokeDisplay(me, orgId, c);
  if (a === "access" && b === "checkins" && !c) { const p = await body(req, z.object({ gymMemberId: id, loc: id, note: z.string().max(200).nullable().optional() })); return ac.staffCheckin(me, orgId, { gymMemberId: p.gymMemberId, locationId: p.loc, note: p.note }); }
  if (a === "access" && b === "checkins" && c) return ac.revokePass(me, orgId, c);
  if (a === "accesses" && b && c === "until") return ac.setAccessUntil(me, orgId, b, (await body(req, z.object({ until: z.string().max(10).nullable() }))).until);
  if (a === "connect" && b === "availability") return connect.setAvailability(me, orgId, (await body(req, z.object({ availability: z.enum(["available", "busy"]) }))).availability);
  if (a === "connect" && b === "tasks" && c) {
    const p = await body(req, z.object({
      action: z.enum(["take", "start", "note", "follow_up", "transfer", "accept", "decline", "resolve", "cancel"]),
      note: z.string().max(500).nullable().optional(), memberNote: z.string().max(500).nullable().optional(), toUserId: id.nullable().optional(),
      dueAt: z.string().max(40).nullable().optional(), done: z.string().max(200).nullable().optional(), pending: z.string().max(200).nullable().optional(),
      next: z.string().max(200).nullable().optional(), forShift: z.boolean().optional(),
    }));
    return connect.staffAct(me, orgId, c, p.action, p);
  }
  if (a === "cases" && b && c === "resolve") return rv.resolveCase(me, orgId, b, await body(req, z.object({ outcome: z.enum(["keep", "remove", "edit", "fix", "reject"]), note: z.string().max(300).nullable().optional(), fixToUserId: id.nullable().optional() })));
  throw NF();
});
