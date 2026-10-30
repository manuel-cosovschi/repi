// Socio: pedidos al equipo de sala (D41), reseñas (F-RV-01/06), comunidad del gym y Repi Club (Etapa 6).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as gym from "@/server/gym/services";
import * as rv from "@/server/gym/reviews";
import * as cm from "@/server/community/services";
import * as club from "@/server/community/club";
import * as join from "@/server/join/services";
import * as connect from "@/server/gym/connect";
import * as ac from "@/server/gym/access-control";
import { demoQr } from "@/server/sandbox/services";
import * as floor from "@/server/gym/floor-now";
import { communityNudges } from "@/server/community/nudges";

type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const id = z.string().min(1).max(64);
const org = (req: Request) => { const o = new URL(req.url).searchParams.get("org"); if (!o) throw NF(); return o.slice(0, 64); };

export const GET = handle<Ctx>(async (req, { params }) => {
  const [a, b, c] = (await params).path ?? [];
  const me = await sessionUserId();
  const u = new URL(req.url);
  if (a === "requests") return gym.myGymTasks(me);
  if (a === "presence") return ac.myPresence(me); // control de acceso (D127)
  if (a === "floor") return floor.myFloor(me); // profesores en sala y con quién entreno hoy (D131)
  if (a === "connect" && !b) return connect.memberBoard(me); // REPI Connect (D126)
  if (a === "connect" && b) return connect.memberDetail(me, b);
  if (a === "joins") return join.myJoinRequests(me); // solicitudes de acceso por QR (anexo §5)
  if (a === "reviews") return { invites: await rv.myReviewInvites(me), given: await rv.myGivenReviews(me) };
  if (a === "home") return cm.myGymHome(me, u.searchParams.get("org"));
  if (a === "nudges") return communityNudges(me); // D168: invitaciones a rankings, desafíos y trofeos
  if (a === "card") return cm.myCard(me, u.searchParams.get("org"));
  if (a === "ranking" && b) return cm.challengeRanking(me, b, u.searchParams.get("f") ?? "all");
  if (a === "club" && !b) return club.clubState(me, org(req));
  if (a === "club" && b === "feed") return club.feed(me, org(req), u.searchParams.get("before"));
  if (a === "club" && b === "ranking") return club.clubRankingFor(me, org(req));
  if (a === "club" && b === "lifts") return club.clubLiftRanking(me, org(req), u.searchParams.get("ex"));
  if (a === "club" && b === "exercises") return { exercises: await club.myExercises(me, org(req)), sessions: await club.shareableSessions(me, org(req)) };
  if (a === "club" && b === "evolution" && c) return club.exerciseEvolution(me, org(req), c);
  if (a === "club" && b === "profile" && !c) return club.myClubProfile(me, org(req));
  if (a === "club" && b === "profile" && c) return club.viewClubProfile(me, org(req), c);
  throw NF();
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const [a, b, c, d] = (await params).path ?? [];
  const me = await sessionUserId();
  if (a === "requests" && !b) return gym.createMemberTask(me, await body(req, z.object({ kind: z.enum(["rutina", "tecnica", "consulta", "programa"]), text: z.string().max(1000), videoId: z.string().max(64).nullable().optional(), gymMemberId: z.string().max(64).nullable().optional() })));
  if (a === "requests" && b && c === "seen") { await gym.markGymTaskSeen(me, b); return { ok: true }; }
  if (a === "connect" && !b) {
    await limit("connect-create", 20);
    return connect.memberCreate(me, await body(req, z.object({
      reason: z.string().max(30), comment: z.string().max(300).nullable().optional(), clientKey: z.string().max(64).nullable().optional(), gymMemberId: id.nullable().optional(),
      context: z.object({ sessionId: id.nullable().optional(), programExerciseId: id.nullable().optional(), exerciseId: id.nullable().optional(), setIndex: z.number().int().nullable().optional() }).nullable().optional(),
    })));
  }
  if (a === "checkin") {
    await limit("gym-checkin", 20);
    return ac.memberCheckin(me, await body(req, z.object({
      token: z.string().max(600), geo: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number(), ageSec: z.number() }).nullable().optional(),
    })));
  }
  if (a === "floor") { const p = await body(req, z.object({ gymMemberId: id, trainerId: id.nullable() })); return floor.pickFloorTrainer(me, p.gymMemberId, p.trainerId); }
  if (a === "demo-qr") return demoQr(me, (await body(req, z.object({ gym: z.enum(["own", "other"]) }))).gym); // sólo cuentas de la demo
  if (a === "connect" && b && c === "cancel") return connect.memberCancel(me, b);
  if (a === "connect" && b && c === "comment") return connect.memberComment(me, b, (await body(req, z.object({ text: z.string().max(300) }))).text);
  if (a === "connect" && b && c === "feedback") return connect.memberFeedback(me, b, (await body(req, z.object({ helpful: z.boolean() }))).helpful);
  if (a === "reviews" && b && c === "dismiss") return rv.dismissInvite(me, b);
  if (a === "reviews" && b) return rv.submitReview(me, b, await body(req, z.object({ stars: z.number().int(), dims: z.array(z.number().int().nullable()).max(3).optional(), text: z.string().max(800).nullable().optional() })));
  if (a === "joins" && b && c === "cancel") return join.cancelRequest(me, b);
  if (a === "notices" && b === "seen") { await cm.markNoticesSeen(me); return { ok: true }; }
  if (a === "attempt-video") {
    await limit("attempt-video", 10);
    const len = Number(req.headers.get("content-length") ?? "0");
    if (!len || len > 81 * 1024 * 1024) throw new AccessError("invalid_file", "El video tiene que ser MP4, MOV o WebM de hasta 80 MB.", 413);
    const f = (await req.formData()).get("file");
    if (!(f instanceof File)) throw new AccessError("invalid_file", "Elegí un video.");
    return cm.uploadMedia(me, { kind: "attempt_video", orgId: org(req), mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  if (a === "attempts") return cm.submitAttempt(me, await body(req, z.object({ challengeId: id, value: z.number(), division: z.enum(["F", "M"]).nullable().optional(), videoId: id.nullable().optional(), inPerson: z.boolean().optional(), confirm: z.boolean() })));
  if (a === "club") {
    const o = org(req);
    if (b === "join") return club.joinClub(me, o, await body(req, z.object({ showName: z.boolean(), inRanking: z.boolean() })));
    if (b === "ranking") return club.optIntoRanking(me, o); // D168: desde una invitación de REPI
    if (b === "leave") return club.leaveClub(me, o);
    if (b === "posts" && !c) return club.createClubPost(me, o, await body(req, z.object({ text: z.string().max(600).optional(), achievementId: id.nullable().optional(), progressExerciseId: id.nullable().optional(), sessionId: id.nullable().optional() })));
    if (b === "profile") return club.setClubProfile(me, o, await body(req, z.object({ bio: z.string().max(200).optional(), showLevel: z.boolean().optional(), showcase: z.array(id).max(10).optional() })));
    if (b === "posts" && c && d === "applause") return club.toggleApplause(me, o, c);
    if (b === "posts" && c && d === "comments") return club.commentPost(me, o, c, (await body(req, z.object({ text: z.string().max(400) }))).text);
    if (b === "report") return club.report(me, o, await body(req, z.object({ type: z.enum(["post", "comment"]), id, reason: z.string().max(120) })));
    if (b === "block" && c) return club.blockUser(me, o, c);
    if (b === "delete" && (c === "post" || c === "comment") && d) return club.deleteOwn(me, o, c, d);
  }
  throw NF();
});
