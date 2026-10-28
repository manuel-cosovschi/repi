import { handle, sessionUserId } from "@/server/access/http";
import * as fu from "@/server/followup/services";
import * as gym from "@/server/gym/services";
import * as rv from "@/server/gym/reviews";
import { myThreads } from "@/server/messages/services";
import { connectOn } from "@/server/gym/connect";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// Bandeja del alumno/socio: coach (Etapa 4) + equipo de sala (D41), invitaciones a reseñar y mensajes sin leer (D40).
export const GET = handle(async () => {
  const me = await sessionUserId();
  const [base, rels, gymRequests, reviewInvites, threads] = await Promise.all([fu.myInbox(me), gym.myGymRelations(me), gym.myGymTasks(me), rv.myReviewInvites(me), myThreads(me)]);
  return {
    ...base,
    gym: rels.length ? { id: rels[0].m.id, place: `${rels[0].org.name} · ${rels[0].loc.name}`, connect: connectOn(rels[0].org) } : null,
    gymRequests, reviewInvites, unreadThreads: threads.filter((t) => t.unread > 0).length,
    gymUnseen: (await db.select({ n: sql<number>`count(*)::int` }).from(schema.memberNotice).where(and(eq(schema.memberNotice.userId, me), isNull(schema.memberNotice.seenAt))))[0]?.n ?? 0,
  };
});
