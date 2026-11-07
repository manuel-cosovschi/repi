// REPI Ventas (D207): panel privado del vendedor. Sin relación de vendedor → 404 (no revela que el área existe).
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SalesApp } from "@/components/sales/SalesApp";
import { requireUser } from "@/server/access/guard";
import { salesEnabled } from "@/server/sales/core";
import { db, schema } from "@/db";
import "@/styles/coach.css";
import "@/styles/gym.css";
import "@/styles/sales.css";

export const metadata: Metadata = { title: "REPI Ventas" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

export default async function SalesHome({ searchParams }: { searchParams: SP }) {
  if (!salesEnabled()) notFound();
  const { user } = await requireUser("/ventas");
  const [rep] = await db.select().from(schema.salesRep).where(eq(schema.salesRep.userId, user.id));
  if (!rep || rep.status === "invited" || rep.status === "pending_acceptance") notFound();
  const sp = await searchParams;
  return <SalesApp me={{ name: rep.name, status: rep.status, canSellCoaches: rep.canSellCoaches, profileDone: !!rep.profileCompletedAt }} initial={{ s: one(sp.s), p: one(sp.p), b: one(sp.b), deal: one(sp.deal) }} />;
}
