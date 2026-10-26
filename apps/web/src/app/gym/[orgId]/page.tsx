import type { Metadata } from "next";
import { GymApp } from "@/components/gym/GymApp";
import { requireOrgMember } from "@/server/access/guard";
import "@/styles/coach.css";
import "@/styles/gym.css";

export const metadata: Metadata = { title: "REPI Gym" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

export default async function GymHome({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: SP }) {
  const { orgId } = await params;
  const sp = await searchParams;
  await requireOrgMember(orgId, "gym", `/gym/${orgId}`);
  return <GymApp orgId={orgId} initial={{ s: one(sp.s), sel: one(sp.sel), loc: one(sp.loc) }} />;
}
