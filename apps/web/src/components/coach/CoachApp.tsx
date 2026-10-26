"use client";
// REPI Coach desktop. Estructura, jerarquía y textos de handoff/.../REPI Desktop Coach.dc.html; datos reales de /api/coach.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Wordmark } from "@/components/access/Wordmark";
import { CoachDash } from "./CoachDash";
import { CoachClients } from "./CoachClients";
import { ProgramBuilder } from "./ProgramBuilder";
import { InviteModal } from "./InviteModal";
import { ConditionsScreen } from "@/components/gym/Access";
import { CoachInbox } from "./CoachInbox";
import { ChatPane } from "@/components/messages/ChatPane";
import { initials, type Overview, type Screen } from "./types";

const IC = {
  home: "M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z",
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 010 7.5M22 21c0-3-1.7-5-4.5-5.8",
  build: "M4 6h16M4 12h10M4 18h7M17 15l4 4-4 4",
  msg: "M4 5h16v11H9l-5 4z",
  inbox: "M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6H4z",
  money: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
};

// Cobros del coach a sus alumnos: Etapa 7 (flujo separado del cobro de REPI al coach, anexo §10).
const NAV: [Screen, string, string, string | null][] = [
  ["dash", "Panel", IC.home, null], ["clients", "Clientes", IC.users, null], ["builder", "Programas", IC.build, null],
  ["msgs", "Mensajes", IC.msg, null], ["inbox", "Solicitudes", IC.inbox, null], ["pay", "Cobros a alumnos", IC.money, "Etapa 7"],
  ["terms", "Condiciones REPI", IC.receipt, null],
];

export function CoachApp({ orgId, me, initial }: { orgId: string; me: { name: string }; initial: { s?: string; c?: string; p?: string } }) {
  const [screen, setScreen] = useState<Screen>(NAV.some((n) => n[0] === initial.s) ? (initial.s as Screen) : "dash");
  const [sel, setSel] = useState<string | null>(initial.c ?? null);
  const [pid, setPid] = useState<string | null>(initial.p ?? null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [invite, setInvite] = useState(false);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((t: string) => { clearTimeout(tt.current); setToast(t); tt.current = setTimeout(() => setToast(null), 3000); }, []);
  const reload = useCallback(() => api<Overview>(`/api/coach/${orgId}/overview`).then(setOv).catch((e) => setErr(e.message)), [orgId]);
  useEffect(() => { reload(); }, [reload]);

  // Estado de navegación en la URL: recargar conserva pantalla, cliente y programa (lectura inicial desde el servidor).
  useEffect(() => {
    const q = new URLSearchParams();
    if (screen !== "dash") q.set("s", screen);
    if (sel && screen === "clients") q.set("c", sel);
    if (pid && screen === "builder") q.set("p", pid);
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [screen, sel, pid]);

  const go = (s: Screen, extra?: { sel?: string; pid?: string | null }) => {
    setScreen(s); setDrawer(false);
    if (extra?.sel !== undefined) setSel(extra.sel);
    if (extra?.pid !== undefined) setPid(extra.pid);
    requestAnimationFrame(() => { mainRef.current?.querySelector("h1")?.focus(); window.scrollTo(0, 0); });
  };
  const newProgram = async () => {
    try { const r = await api<{ id: string }>(`/api/coach/${orgId}/programs`, { body: {} }); go("builder", { pid: r.id }); flash("Programa en blanco creado."); }
    catch (e) { flash((e as Error).message); }
  };
  const first = me.name.split(" ")[0];
  const orgName = ov?.org.name ?? "";

  return (
    <div className="co" data-drawer={drawer ? "1" : "0"}>
      <aside className="co-side" aria-label="Navegación">
        <div className="co-brand">
          <Wordmark width={58} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="co-rail-icon" src="/brand/repi_icon.png" alt="repi" />
          <span className="tag">Coach</span>
        </div>
        <a className="co-ws" href="/acceso?step=workspace" aria-label="Cambiar espacio de trabajo">
          <span className="co-ini">{initials(orgName || "R")}</span>
          <span className="co-ws-txt"><b>{orgName}</b><small>Coach independiente</small></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 10l4-4 4 4M8 14l4 4 4-4" /></svg>
        </a>
        <nav className="co-nav" aria-label="Principal">
          {NAV.map(([k, l, ic, soon]) => (
            <button key={k} type="button" title={l} aria-current={screen === k ? "page" : undefined} onClick={() => go(k)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d={ic} /></svg>
              <span className="lbl">{l}</span>{soon && <span className="soon">{soon}</span>}
              {k === "inbox" && !!ov?.inbox && <span className="nbadge" aria-label={`${ov.inbox} sin ver`}>{ov.inbox}</span>}
              {k === "msgs" && !!ov?.msgs && <span className="nbadge" aria-label={`${ov.msgs} conversaciones sin leer`}>{ov.msgs}</span>}
            </button>
          ))}
        </nav>
        <div className="co-me">
          <span className="av">{initials(me.name)}</span>
          <span><b>{me.name}</b><small><button type="button" onClick={async () => { await authClient.signOut(); window.location.href = "/acceso"; }} style={{ border: 0, background: "none", color: "inherit", padding: 0, font: "inherit", cursor: "pointer" }}>Cerrar sesión</button></small></span>
        </div>
      </aside>
      {drawer && <div className="co-scrim" onClick={() => setDrawer(false)} />}
      <main className="co-main">
        <div className="co-topbar">
          <button type="button" aria-label="Abrir menú" onClick={() => setDrawer(true)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F8FAFC" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
          <Wordmark width={50} />
        </div>
        <div className="co-content" ref={mainRef}>
          {err && <p role="alert" className="err-box">{err}</p>}
          {!ov ? <p className="muted">Cargando…</p> : (
            <>
              {screen === "dash" && <CoachDash ov={ov} first={first} onInvite={() => setInvite(true)} onNewProgram={newProgram} go={go} />}
              {screen === "clients" && <CoachClients orgId={orgId} ov={ov} sel={sel} setSel={setSel} onInvite={() => setInvite(true)} go={go} flash={flash} />}
              {screen === "builder" && <ProgramBuilder orgId={orgId} ov={ov} pid={pid} setPid={setPid} flash={flash} onNewProgram={newProgram} onAssigned={reload} />}
              {screen === "inbox" && <CoachInbox orgId={orgId} flash={flash} go={go} onChanged={reload} />}
              {screen === "msgs" && <ChatPane listUrl={`/api/coach/${orgId}/messages`} kicker="Conversaciones privadas entre vos y cada cliente" emptyText="Todavía no tenés clientes. Las conversaciones aparecen cuando aceptan tu invitación."
                initial={sel} onSeen={reload} profile={(t) => <button type="button" className="btn sm" onClick={() => go("clients", { sel: t.relId })}>Ver perfil →</button>} />}
              {screen === "pay" && <Pending screen={screen} />}
              {screen === "terms" && <ConditionsScreen orgId={orgId} flash={flash} unit="alumnos" />}
            </>
          )}
        </div>
      </main>
      {invite && <InviteModal orgId={orgId} onClose={() => { setInvite(false); reload(); }} />}
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <div className="co-toast" aria-hidden="true">{toast}</div>}
    </div>
  );
}

function Pending({ screen }: { screen: Screen }) {
  const t = { pay: ["Cobros a alumnos", "Los cobros manuales a tus alumnos se construyen en la Etapa 7. Son independientes de lo que REPI te factura a vos (ver Condiciones REPI)."] }[screen as "pay"];
  return (
    <>
      <div className="co-head"><div><h1 tabIndex={-1}>{t[0]}</h1></div></div>
      <div className="empty">{t[1]}</div>
    </>
  );
}
