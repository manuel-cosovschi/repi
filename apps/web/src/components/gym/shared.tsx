"use client";
// Piezas comunes del escritorio Gym (REPI Desktop Gym.dc.html): tipos, formato, carga y controles chicos.
import { useCallback, useEffect, useState } from "react";
import { TASK_CATEGORY, TASK_PRIORITY } from "@repi/domain";
import { api } from "@/lib/api";

export type GymScreen =
  | "shift" | "queue" | "members" | "handoff" | "msgs" | "perf"
  | "mdash" | "pc" | "staff" | "tasks" | "reviews" | "shifts" | "engage" | "community" | "validations"
  | "exec" | "locs" | "billing" | "config" | "reception" | "joins" | "accesses" | "notices" | "guide" | "connect";

export type GymCtxView = { org: { id: string; name: string }; name: string; roles: string[]; caps: string[]; locations: { id: string; name: string }[]; afterHoursAccess: boolean; connect?: boolean };
export type Task = {
  id: string; ref: string; member: string | null; gymMemberId: string | null; category: keyof typeof TASK_CATEGORY; priority: keyof typeof TASK_PRIORITY;
  status: "open" | "pending_acceptance" | "in_progress" | "follow_up" | "done" | "cancelled"; source: string; summary?: string; hasVideo?: boolean; videoId?: string | null;
  assignee: { id: string; name: string } | null; completedBy: string | null; completedOffShift: boolean;
  createdAt: string; dueAt: string | null; takenAt: string | null; completedAt: string | null; overdue: boolean; handoffFrom: { name: string; at: string } | null;
};
export type Shell = {
  orgId: string; loc: string | null; ctx: GymCtxView; flash: (t: string) => void; go: (s: GymScreen, extra?: { sel?: string | null }) => void;
  sel: string | null; setSel: (id: string | null) => void; refreshBadges: () => void;
};

export const can = (ctx: GymCtxView, cap: string) => ctx.caps.includes(cap);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const fmt = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", ...opts }).format(new Date(iso)) : "—";
export const when = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short" });
  const same = today.format(d) === today.format(new Date());
  const yest = today.format(d) === today.format(new Date(Date.now() - 86_400_000));
  const hm = fmt(iso, { hour: "2-digit", minute: "2-digit" });
  return same ? `Hoy ${hm}` : yest ? `Ayer ${hm}` : `${fmt(iso, { weekday: "short", day: "numeric", month: "short" })} ${hm}`;
};
export const nf = (n: number | null | undefined, digits = 0) => (n == null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
export const dec = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
export const pct = (n: number | null | undefined) => (n == null ? "Sin datos" : `${n}%`);
export const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
export const PRI_CHIP: Record<string, string> = { alta: "bad", media: "warn", baja: "mute" };
export const SOURCE: Record<string, string> = { app: "Pedido desde la app", sala: "Pedido en sala", traspaso: "Traspaso", gerencia: "Creada por gerencia", recepcion: "Creada por recepción", entrenador: "Creada en sala" };

/** Carga con recarga explícita; los errores se muestran en la pantalla (no se inventan datos). */
export function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!url) return;
    try { setErr(null); setData(await api<T>(url)); } catch (e) { setErr((e as Error).message); }
  }, [url]);
  useEffect(() => { setData(null); void load(); }, [load]);
  return { data, err, reload: load, setData };
}

export function Head({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="co-head">
      <div>{kicker && <span className="co-kicker">{kicker}</span>}<h1 tabIndex={-1}>{title}</h1></div>
      {children && <div className="co-actions">{children}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export function Bars({ data, label, color = "#00D1FF", fmtV = (v: number) => String(v) }: { data: { label: string; n: number | null }[]; label: string; color?: string; fmtV?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.n ?? 0));
  return (
    <div className="bars10" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.n == null ? "sin datos" : fmtV(d.n)}`).join(", ")}`} style={{ height: 120 }}>
      {data.map((d, i) => (
        <div key={d.label + i}><small style={{ fontSize: 10, color: "#5B6B80" }}>{d.n == null ? "" : fmtV(d.n)}</small><i style={{ height: `${d.n ? Math.max(4, (d.n / max) * 100) : 3}%`, background: i === data.length - 1 ? color : "#B7EEF9" }} /><span>{d.label}</span></div>
      ))}
    </div>
  );
}

export function HBar({ label, n, max, note, color = "#00D1FF" }: { label: string; n: number | null; max: number; note?: string | null; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{label}</span><b>{n == null ? "Sin datos" : nf(n)}</b></div>
      <div style={{ height: 8, borderRadius: 4, background: "#EEF2F6", overflow: "hidden" }}><div style={{ width: `${n && max ? Math.min(100, (n / max) * 100) : 0}%`, height: "100%", background: color, borderRadius: 4 }} /></div>
      {note && <small className="muted">{note}</small>}
    </div>
  );
}

export function LocSelect({ shell, allowAll, value, onChange }: { shell: Shell; allowAll?: boolean; value: string | null; onChange: (v: string | null) => void }) {
  const locs = shell.ctx.locations;
  if (locs.length < 2 && !allowAll) return null;
  return (
    <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <span>Sede</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{ height: 38, borderRadius: 10, border: "1px solid #C9D2DD", padding: "0 10px", font: "500 14px var(--font-ui)", background: "#fff" }}>
        {allowAll && <option value="">Todas las sedes</option>}
        {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
}

export function Pending({ title, text }: { title: string; text: string }) {
  return (<><Head title={title} /><div className="empty">{text}</div></>);
}

/** Acción con estado ocupado y mensaje del servidor en el toast. */
export function useAct(flash: (t: string) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string | ((r: unknown) => string)) => {
    setBusy(key);
    try { const r = await fn(); if (ok) flash(typeof ok === "function" ? ok(r) : ok); return r; }
    catch (e) { flash((e as Error).message); return null; }
    finally { setBusy(null); }
  };
  return { busy, run };
}
