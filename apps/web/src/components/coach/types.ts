import type { ProgramDoc } from "@repi/domain";

export type ClientRow = {
  id: string; name: string; status: "active" | "paused" | "archived" | "ended"; since: string;
  program: { name: string; startsOn: string; days: number | null } | null;
  weekDone: number; adherence: number | null; lastSessionAt: string | null;
};
export type Overview = {
  org: { id: string; name: string; specialty: string | null; modality: string | null; status: string; trialEndsAt: string | null };
  clients: ClientRow[];
  kpis: { active: number; noProgram: number; weekSessions: number; adherence: number | null; pendingInvites: number };
  inbox?: number;
  msgs?: number;
};
export type DocDay = { id?: string; name: string; exercises: (ProgramDoc["days"][number]["exercises"][number] & { id?: string })[] };
export type EditableDoc = { name: string; weeks: number; note: string; days: DocDay[] };
export type ProgramFull = { id: string; kind: "template" | "client_copy"; forClient: string | null; clients: string[]; version: number; locked: boolean; doc: EditableDoc };
export type TemplateRow = { id: string; name: string; weeks: number; version: number; days: number; clients: number };
export type LibEx = { id: string; name: string; group: string; kind: string; own: boolean };
export type Screen = "dash" | "clients" | "agenda" | "builder" | "msgs" | "inbox" | "pay" | "terms" | "guide";

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", ...opts }).format(new Date(iso)) : "—";
export const fmtIsoDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d))); };
export const nf = (n: number) => n.toLocaleString("es-AR");
export function relTime(iso: string | null) {
  if (!iso) return "Sin sesiones";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Hoy" : d === 1 ? "Ayer" : `hace ${d} días`;
}
