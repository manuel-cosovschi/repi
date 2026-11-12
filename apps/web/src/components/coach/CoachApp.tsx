"use client";
// REPI Coach desktop. Estructura, jerarquía y textos de handoff/.../REPI Desktop Coach.dc.html; datos reales de /api/coach.
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { signOutSafely } from "@/lib/session-cleanup";
import { Wordmark } from "@/components/access/Wordmark";
import { CoachDash } from "./CoachDash";
import { CoachPayments } from "./CoachPayments";
import { CoachClients } from "./CoachClients";
import { ProgramBuilder } from "./ProgramBuilder";
import { InviteModal } from "./InviteModal";
import { ConditionsScreen } from "@/components/gym/Access";
import { CoachInbox } from "./CoachInbox";
import { CoachAgenda } from "./CoachAgenda";
import { ChatPane } from "@/components/messages/ChatPane";
import { initials, type Overview, type Screen } from "./types";
import { CoachGuide } from "./CoachGuide";
import { Ic } from "@/components/ui/Ic";
import { BookOpen, CalendarBlank, CaretUpDown, ChatCircle, ClipboardText, House, List, Money, Receipt, Tray, Users, VideoCamera, type Icon } from "@phosphor-icons/react";
import { ExerciseVideos } from "./ExerciseVideos";
import { RepiNews, useRepiNewsUnread } from "@/components/announcements/RepiNews";
import { featureOn } from "@/lib/features";
import { Megaphone } from "@phosphor-icons/react";
import { FlashToast } from "@/components/ui/FlashToast";
import { SectionStage } from "@/components/motion/SectionStage";
import { useDrawer } from "@/components/motion/useDrawer";
import { SlideIndicator } from "@/components/motion/SlideIndicator";
import { Skel } from "@/components/motion/Skeleton";

const IC = { home: House, users: Users, cal: CalendarBlank, build: ClipboardText, msg: ChatCircle, inbox: Tray, money: Money, receipt: Receipt, book: BookOpen, video: VideoCamera };

// Cobros del coach a sus alumnos (F-BL-01, D80): registro manual, separado del cobro de REPI al coach (anexo §10).
const NAV: [Screen, string, Icon, string | null][] = [
  ["dash", "Panel", IC.home, null], ["clients", "Clientes", IC.users, null], ["agenda", "Agenda", IC.cal, null], ["builder", "Programas", IC.build, null], ["videos", "Videos de ejercicios", IC.video, null],
  ["msgs", "Mensajes", IC.msg, null], ["inbox", "Solicitudes", IC.inbox, null], ["pay", "Cobros a alumnos", IC.money, null],
  ["terms", "Condiciones REPI", IC.receipt, null], ["guide", "Guía", IC.book, null],
];
// D202: «Novedades de REPI» sólo con el módulo encendido.
const navItems = () => (featureOn("announcements") ? [...NAV.slice(0, -1), ["repinews", "Novedades de REPI", Megaphone, null] as [Screen, string, Icon, string | null], NAV[NAV.length - 1]] : NAV);

export function CoachApp({ orgId, me, initial }: { orgId: string; me: { name: string }; initial: { s?: string; c?: string; p?: string; from?: string } }) {
  // "client" (ficha sola) se puede recargar con ?s=client&c=…; «Volver» sólo a una pantalla del menú.
  const [screen, setScreen] = useState<Screen>(navItems().some((n) => n[0] === initial.s) || (initial.s === "client" && !!initial.c) ? (initial.s as Screen) : "dash");
  const [from, setFrom] = useState<Screen | null>(initial.s === "client" && navItems().some((n) => n[0] === initial.from) ? (initial.from as Screen) : null);
  const [navSel, setNavSel] = useState<Screen | null>(null);
  // Selección por pantalla: la ficha sola («client») y Clientes guardan el cliente; Mensajes, su conversación. Con una sola
  // selección, «Ver perfil →» dejaba en Mensajes el id del cliente y al volver no quedaba ninguna conversación abierta (QA M06).
  const [sels, setSels] = useState<Partial<Record<Screen, string | null>>>(() => (initial.c ? { [screen]: initial.c } : {}));
  const sel = sels[screen] ?? null;
  const selOf = (k: Screen) => sels[k] ?? null;
  const setSelFor = useMemo(() => {
    const m = new Map<Screen, (id: string | null) => void>();
    return (k: Screen) => { let f = m.get(k); if (!f) { f = (id) => setSels((p) => (p[k] === id ? p : { ...p, [k]: id })); m.set(k, f); } return f; };
  }, []);
  const [pid, setPid] = useState<string | null>(initial.p ?? null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  // M06 (QA r2): foco y teclado del cajón (ítem actual al abrir, Escape, título al volver a tocar la pantalla a la vista).
  const rootRef = useRef<HTMLDivElement>(null);
  const { dismiss } = useDrawer(rootRef, drawer, setDrawer, !!navSel && navSel !== screen);
  const [invite, setInvite] = useState(false);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((t: string) => { clearTimeout(tt.current); setToast(t); tt.current = setTimeout(() => setToast(null), 3000); }, []);
  const reload = useCallback(() => api<Overview>(`/api/coach/${orgId}/overview`).then(setOv).catch((e) => setErr(e.message)), [orgId]);
  useEffect(() => { reload(); }, [reload]);
  // F-BL-05: cambios de condiciones REPI sin «Entendido»; se recalcula al cambiar de pantalla.
  const [termsNew, setTermsNew] = useState(0);
  const termsSeen = useCallback(() => { api<{ unacked: number }>(`/api/conditions/${orgId}`).then((x) => setTermsNew(x.unacked)).catch(() => setTermsNew(0)); }, [orgId]);
  // M06: condiciones y novedades sin ráfaga de pedidos en cada toque: como máximo cada 30 s y al volver a la pestaña
  // (y después de cada acción, como antes).
  const [bucket, setBucket] = useState(0);
  const lastBadges = useRef(0);
  const badgesIfStale = useCallback(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastBadges.current < 30_000) return;
    lastBadges.current = Date.now(); termsSeen(); setBucket((b) => b + 1);
  }, [termsSeen]);
  useEffect(() => {
    lastBadges.current = Date.now(); termsSeen();
    const id = setInterval(badgesIfStale, 30_000);
    document.addEventListener("visibilitychange", badgesIfStale);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", badgesIfStale); };
  }, [termsSeen, badgesIfStale]);
  useEffect(() => { badgesIfStale(); }, [screen, badgesIfStale]);
  const [newsTick, setNewsTick] = useState(0);
  const newsUnread = useRepiNewsUnread("coach", orgId, `${bucket}:${newsTick}`);
  const newsSeen = useCallback(() => setNewsTick((n) => n + 1), []);

  // Estado de navegación en la URL: recargar conserva pantalla, cliente y programa (lectura inicial desde el servidor).
  useEffect(() => {
    const q = new URLSearchParams();
    if (screen !== "dash") q.set("s", screen);
    if (sel && (screen === "clients" || screen === "client")) q.set("c", sel);
    if (screen === "client" && from) q.set("from", from);
    if (pid && screen === "builder") q.set("p", pid);
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [screen, sel, pid, from]);

  // M06: el menú (aria-current e indicador) y el cajón responden en el toque; la pantalla llega con startTransition. El foco
  // y el scroll por pantalla los resuelve SectionStage después del commit.
  const cur = useRef({ screen, from });
  cur.current = { screen, from };
  const pushed = useRef(false);
  // D210: abrir la ficha directo en una pestaña (p. ej. «Rendimiento» desde «Pendientes» con señales de REPI).
  const [ctab, setCtab] = useState<string | null>(null);
  const go = useCallback((s: Screen, extra?: { sel?: string; pid?: string | null; tab?: string }) => {
    setDrawer(false); setNavSel(s);
    if (s !== "client") pushed.current = false;
    startTransition(() => {
      setScreen(s); setCtab(extra?.tab ?? null);
      if (s !== "client") setFrom(null);
      if (extra?.sel !== undefined) setSels((p) => ({ ...p, [s]: extra.sel }));
      if (extra?.pid !== undefined) setPid(extra.pid);
    });
  }, []);
  // «Ver ficha» desde Solicitudes, Mensajes, Cobros o la lista angosta: sólo la ficha de ese cliente, con «Volver».
  const openClient = useCallback((id: string, tab?: string) => {
    const { screen: sc, from: fr } = cur.current;
    const origin = sc === "client" ? fr : sc;
    setFrom(origin);
    if (sc !== "client") {
      const q = new URLSearchParams({ s: "client", c: id });
      if (origin) q.set("from", origin);
      window.history.pushState({ repiClient: true }, "", `?${q}`);
      pushed.current = true;
    }
    go("client", { sel: id, tab });
  }, [go]);
  const back = useCallback(() => { const fr = cur.current.from ?? "clients"; if (pushed.current) window.history.back(); else go(fr); }, [go]);
  useEffect(() => {
    const on = () => {
      const s = (new URLSearchParams(window.location.search).get("s") ?? "dash") as Screen;
      if (s === cur.current.screen) return;
      pushed.current = false;
      go(s, { sel: new URLSearchParams(window.location.search).get("c") ?? undefined });
    };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, [go]);
  const newProgram = async () => {
    try { const r = await api<{ id: string }>(`/api/coach/${orgId}/programs`, { body: {} }); go("builder", { pid: r.id }); flash("Programa en blanco creado."); }
    catch (e) { flash((e as Error).message); }
  };
  const first = me.name.split(" ")[0];
  const navKey = navSel && navSel !== screen ? navSel : screen;
  const orgName = ov?.org.name ?? "";

  return (
    <div ref={rootRef} className="co" data-drawer={drawer ? "1" : "0"}>
      <aside className="co-side ui-dark" aria-label="Navegación">
        <div className="co-brand">
          <Wordmark width={58} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="co-rail-icon" src="/icons/tile-256.png" alt="repi" />
          <span className="tag">Coach</span>
        </div>
        <a className="co-ws" href="/acceso?step=workspace" aria-label="Cambiar espacio de trabajo">
          <span className="co-ini">{initials(orgName || "R")}</span>
          <span className="co-ws-txt"><b>{orgName}</b><small>Coach independiente</small></span>
          <Ic i={CaretUpDown} size={16} color="var(--ui-muted)" />
        </a>
        <nav className="co-nav" aria-label="Principal">
          <SlideIndicator />
          {navItems().map(([k, l, ic, soon]) => (
            <button key={k} type="button" title={l} aria-current={navKey === k || (navKey === "client" && k === "clients") ? "page" : undefined} onClick={() => go(k)}>
              <Ic i={ic} size={20} />
              <span className="lbl">{l}</span>{soon && <span className="soon">{soon}</span>}
              {k === "inbox" && !!ov?.inbox && <span className="nbadge" aria-label={`${ov.inbox} sin ver`}>{ov.inbox}</span>}
              {k === "msgs" && !!ov?.msgs && <span className="nbadge" aria-label={`${ov.msgs} conversaciones sin leer`}>{ov.msgs}</span>}
              {k === "terms" && termsNew > 0 && <span className="nbadge" aria-label={`${termsNew} cambios de condiciones sin revisar`}>{termsNew}</span>}
              {k === "repinews" && newsUnread > 0 && <span className="nbadge" aria-label={`${newsUnread} novedades sin leer`}>{newsUnread}</span>}
            </button>
          ))}
        </nav>
        <div className="co-me">
          <span className="av">{initials(me.name)}</span>
          <span><b>{me.name}</b><small><button type="button" onClick={async () => { if (!await signOutSafely()) return; window.location.href = "/acceso"; }} style={{ border: 0, background: "none", color: "inherit", padding: 0, font: "inherit", cursor: "pointer" }}>Cerrar sesión</button> · <a href="/cuenta" onClick={(e) => { e.preventDefault(); window.location.href = `/cuenta?desde=${encodeURIComponent(window.location.pathname)}`; }} style={{ color: "inherit" }}>Mi cuenta</a> · <a href="/ayuda" onClick={(e) => { e.preventDefault(); window.location.href = `/ayuda?desde=${encodeURIComponent(window.location.pathname)}`; }} style={{ color: "inherit" }}>Ayuda</a></small></span>
        </div>
        {/* D188: apariencia personal (no del gimnasio): la misma en todos los espacios. */}
        <div className="co-theme"><ThemePicker compact /></div>
      </aside>
      <div className="co-scrim" data-open={drawer ? "1" : "0"} aria-hidden="true" onClick={dismiss} />
      <main className="co-main" inert={drawer || undefined}>
        <div className="co-topbar ui-dark">
          <button type="button" aria-label="Abrir menú" aria-expanded={drawer} onClick={() => setDrawer(true)}><Ic i={List} size={22} color="var(--ui-text)" /></button>
          <Wordmark width={50} />
        </div>
        <div className="co-content" ref={mainRef}>
          {err && <p role="alert" className="err-box">{err} <button type="button" className="btn sm" onClick={() => { setErr(null); void reload(); }}>Reintentar</button></p>}
          {/* M06: sin datos todavía, el panel en esqueleto (no un «Cargando…» suelto). Después, pantallas vivas con cambio de
              carril (vertical desde 768 px); la ficha sola de un cliente es profundidad. */}
          {!ov ? <PanelSkeleton /> : (
            <SectionStage active={screen} order={navItems().map((n) => n[0])} axis="auto" focus="title" paneClass="co-pane" top={(k) => k === "client"} render={(k) => <>
              {k === "agenda" && <CoachAgenda orgId={orgId} ov={ov} flash={flash} />}
              {k === "dash" && <CoachDash orgId={orgId} ov={ov} first={first} onInvite={() => setInvite(true)} onNewProgram={newProgram} go={go} openClient={openClient} />}
              {k === "clients" && <CoachClients orgId={orgId} ov={ov} sel={selOf("clients")} setSel={setSelFor("clients")} initialTab={screen === "clients" ? ctab : null} onInvite={() => setInvite(true)} onImported={reload} go={go} flash={flash} onOpen={openClient} />}
              {k === "client" && <CoachClients key={selOf("client") ?? ""} orgId={orgId} ov={ov} sel={selOf("client")} setSel={setSelFor("client")} initialTab={screen === "client" ? ctab : null} onInvite={() => setInvite(true)} onImported={reload} go={go} flash={flash}
                solo={{ back: from ? { label: navItems().find((n) => n[0] === from)?.[1] ?? "Atrás", go: back } : { label: "Clientes", go: () => go("clients") } }} />}
              {k === "videos" && <ExerciseVideos orgId={orgId} flash={flash} />}
              {k === "builder" && <ProgramBuilder orgId={orgId} ov={ov} pid={pid} setPid={setPid} flash={flash} onNewProgram={newProgram} onAssigned={reload} />}
              {k === "inbox" && <CoachInbox orgId={orgId} flash={flash} go={go} openClient={openClient} onChanged={reload} />}
              {k === "msgs" && <ChatPane listUrl={`/api/coach/${orgId}/messages`} kicker="Conversaciones privadas entre vos y cada cliente" emptyText="Todavía no tenés clientes. Las conversaciones aparecen cuando aceptan tu invitación."
                initial={selOf("msgs")} onSeen={reload} profile={(t) => <button type="button" className="btn sm" onClick={() => t.relId && openClient(t.relId)}>Ver perfil →</button>} />}
              {k === "pay" && <CoachPayments orgId={orgId} flash={flash} openClient={openClient} />}
              {k === "terms" && <ConditionsScreen orgId={orgId} flash={flash} unit="alumnos" onSeen={termsSeen} />}
              {k === "guide" && <CoachGuide />}
              {k === "repinews" && <RepiNews area="coach" orgId={orgId} onSeen={newsSeen} onGo={(d) => go(d === "coach.clients" ? "clients" : d === "coach.builder" ? "builder" : "dash")} />}
            </>} />
          )}
        </div>
      </main>
      {invite && <InviteModal orgId={orgId} onClose={() => { setInvite(false); reload(); }} />}
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <FlashToast text={toast} />}
    </div>
  );
}

/** M06: panel del coach en esqueleto mientras llega el resumen (forma de Panel: título, indicadores y lista). */
function PanelSkeleton() {
  return (
    <>
      <span role="status" className="sr-only">Cargando tu panel</span>
      <div className="co-head" aria-hidden="true"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><Skel w={160} h={12} /><Skel w={260} h={30} r={8} /></div></div>
      <div className="grid-kpi" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="stat"><Skel w="55%" h={12} /><Skel w="35%" h={28} style={{ margin: "4px 0" }} /><Skel w="75%" h={11} /></div>)}</div>
      <section className="card" aria-hidden="true" style={{ minHeight: 260, gap: 12 }}><Skel w="28%" h={16} />{[0, 1, 2, 3].map((i) => <Skel key={i} h={14} w={i % 2 ? "80%" : "100%"} />)}</section>
    </>
  );
}
