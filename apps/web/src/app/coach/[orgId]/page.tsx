import type { Metadata } from "next";
import { CoachApp } from "@/components/coach/CoachApp";
import { requireOrgMember } from "@/server/access/guard";
import "@/styles/coach.css";
import "@/styles/gym.css";

export const metadata: Metadata = { title: "REPI Coach" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

export default async function CoachHome({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: SP }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { user } = await requireOrgMember(orgId, "coach", `/coach/${orgId}`);
  return <CoachApp orgId={orgId} me={{ name: user.name }} initial={{ s: one(sp.s), c: one(sp.c), p: one(sp.p) }} />;
}
