import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminApp } from "@/components/admin/AdminApp";
import { requiresTwoFactor } from "@repi/domain";
import { requireUser } from "@/server/access/guard";
import "@/styles/coach.css";
import "@/styles/method-editor.css";
import "@/styles/gym.css";
import "@/styles/sales.css";
import "@/styles/doc-transitions.css";

export const metadata: Metadata = { title: "REPI Admin" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

export default async function AdminHome({ searchParams }: { searchParams: SP }) {
  const { user } = await requireUser("/admin");
  if (user.platformRole !== "admin") notFound();
  if (requiresTwoFactor({ platformAdmin: true }) && !user.twoFactorEnabled) redirect("/acceso?step=twofaSetup&next=%2Fadmin");
  const sp = await searchParams;
  return <AdminApp me={{ name: user.name }} initial={{ s: one(sp.s), tab: one(sp.tab), deal: one(sp.deal), rep: one(sp.rep) }} />;
}
