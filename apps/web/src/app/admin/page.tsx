import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminApp } from "@/components/admin/AdminApp";
import { requireUser } from "@/server/access/guard";
import "@/styles/coach.css";
import "@/styles/gym.css";

export const metadata: Metadata = { title: "REPI Admin" };

export default async function AdminHome() {
  const { user } = await requireUser("/admin");
  if (user.platformRole !== "admin") notFound();
  if (!user.twoFactorEnabled) redirect("/acceso?step=twofaSetup&next=%2Fadmin");
  return <AdminApp me={{ name: user.name }} />;
}
