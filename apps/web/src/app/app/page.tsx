import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { MemberApp } from "@/components/member/MemberApp";
import { requireUser } from "@/server/access/guard";
import "@/styles/member.css";

export const metadata: Metadata = { title: "REPI" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MemberHome({ searchParams }: { searchParams: SP }) {
  const { user } = await requireUser("/app");
  const coach = await db.select({ id: schema.coachClient.id }).from(schema.coachClient)
    .where(and(eq(schema.coachClient.userId, user.id), eq(schema.coachClient.status, "active")));
  const gym = await db.select({ id: schema.gymMember.id }).from(schema.gymMember)
    .where(and(eq(schema.gymMember.userId, user.id), eq(schema.gymMember.status, "active")));
  // Sin coach ni gym activos (acceso pendiente, aprobado sin el consentimiento del socio, o terminado): /acceso lo lleva
  // al paso que le toca o a sus espacios, en lugar de un 404.
  if (!coach.length && !gym.length) redirect("/acceso");
  const tab = (await searchParams).t;
  return <MemberApp initialTab={Array.isArray(tab) ? tab[0] : tab} />;
}
