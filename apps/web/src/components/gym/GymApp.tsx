"use client";
// REPI Gym desktop por rol (REPI Desktop Gym.dc.html). Cada persona ve la navegación de sus roles en esta organización;
// la autorización real la resuelve el servidor por capacidad y sede.
import { useCallback, useEffect, useRef, useState } from "react";
import { GYM_ROLE_LABEL, type GymRole } from "@repi/domain";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Wordmark } from "@/components/access/Wordmark";
import { ChatPane } from "@/components/messages/ChatPane";
import { HandoffScreen, NewTaskModal, QueueScreen, ShiftScreen } from "./Floor";
import { MembersScreen } from "./Members";
import { MyPerfScreen, PerfCenterScreen } from "./Perf";
import { EngageScreen, PanelScreen, ShiftsScreen, TasksScreen, TeamScreen } from "./Manage";
import { ConfigScreen, ExecScreen, LocsScreen, ReviewsScreen } from "./Owner";
import { CommunityScreen, DeskCard, ValidationsScreen } from "./Community";
import { AccessesScreen, ConditionsScreen, JoinsScreen } from "./Access";
import { Head, can, initials, type GymCtxView, type GymScreen, type Shell } from "./shared";

const IC = {
  home: "M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z", queue: "M4 6h16M4 12h16M4 18h10",
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 010 7.5M22 21c0-3-1.7-5-4.5-5.7", swap: "M7 7h13l-4-4M17 17H4l4 4",
  chart: "M5 20V11M11 20V5M17 20v-6M3 20h18", gauge: "M12 14l4-4M3.5 17a9 9 0 1117 0", check: "M4 12.5l5 5L20 6.5",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z", cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  pulse: "M3 12h4l3-7 4 14 3-7h4", pin: "M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6", gear: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4", msg: "M4 5h16v11H9l-5 4z",
  desk: "M3 7h18M5 7v12M19 7v12M8 11h8", door: "M5 21V4h10l4 2v15M5 21h14M12 12h.01M15 4v17",
  key: "M15 7a4 4 0 11-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0115 7z",
};
type NavItem = [GymScreen, string, string, string | null];

function navFor(ctx: GymCtxView): NavItem[] {
  const r = ctx.roles;
  const out: NavItem[] = [];
  const add = (x: NavItem) => { if (!out.some((y) => y[0] === x[0])) out.push(x); };
  if (r.includes("owner")) {
    [["exec", "Ejecutivo", IC.home, null], ["locs", "Sedes", IC.pin, null], ["pc", "Equipo y servicio", IC.gauge, null], ["staff", "Equipo", IC.users, null], ["reviews", "Reseñas", IC.star, null],
      ["community", "Comunidad", IC.users, null], ["validations", "Validaciones", IC.check, null], ["joins", "Solicitudes de acceso", IC.door, null], ["accesses", "Accesos y QR", IC.key, null],
      ["billing", "Condiciones REPI", IC.receipt, null], ["config", "Configuración", IC.gear, null]].forEach((x) => add(x as NavItem));
  }
  if (r.includes("manager")) {
    [["mdash", "Panel", IC.home, null], ["pc", "Performance Center", IC.gauge, null], ["staff", "Equipo", IC.users, null], ["tasks", "Tareas", IC.check, null], ["reviews", "Reseñas", IC.star, null],
      ["shifts", "Turnos", IC.cal, null], ["engage", "Participación", IC.pulse, null], ["members", "Socios", IC.users, null], ["community", "Comunidad", IC.users, null], ["validations", "Validaciones", IC.check, null],
      ["joins", "Solicitudes de acceso", IC.door, null], ["accesses", "Accesos y QR", IC.key, null]].forEach((x) => add(x as NavItem));
  }
  if (can(ctx, "floor.work")) {
    [["shift", "Mi turno", IC.home, null], ["queue", "Cola de asistencia", IC.queue, null], ["joins", "Solicitudes de acceso", IC.door, null], ["members", "Socios", IC.users, null], ["handoff", "Traspaso de turno", IC.swap, null], ["msgs", "Mensajes", IC.msg, null], ["perf", "Mi desempeño", IC.chart, null]].forEach((x) => add(x as NavItem));
  }
  if (r.includes("coordinator")) [["staff", "Equipo", IC.users, null], ["pc", "Performance Center", IC.gauge, null], ["tasks", "Tareas", IC.check, null], ["shifts", "Turnos", IC.cal, null]].forEach((x) => add(x as NavItem));
  if (can(ctx, "members.approve") || can(ctx, "reception.desk")) add(["reception", r.includes("reception") ? "Recepción" : "Mostrador", IC.desk, null]);
  if (can(ctx, "members.approve")) { add(["joins", "Solicitudes de acceso", IC.door, null]); add(["accesses", "Accesos", IC.key, null]); }
  if (can(ctx, "catalog.publish")) add(["community", r.includes("reception") && !can(ctx, "community.publish") ? "Catálogo" : "Comunidad", IC.users, null]);
  return out;
}

export function GymApp({ orgId, initial }: { orgId: string; initial: { s?: string; sel?: string; loc?: string } }) {
  const [ctx, setCtx] = useState<GymCtxView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [screen, setScreen] = useState<GymScreen | null>(null);
  const [sel, setSel] = useState<string | null>(initial.sel ?? null);
  const [loc, setLoc] = useState<string | null>(initial.loc ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [badges, setBadges] = useState<{ queue: number; msgs: number; validations: number; joins: number }>({ queue: 0, msgs: 0, validations: 0, joins: 0 });
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);
  const flash = useCallback((t: string) => { clearTimeout(tt.current); setToast(t); tt.current = setTimeout(() => setToast(null), 3500); }, []);

  useEffect(() => {
    api<GymCtxView>(`/api/gym/${orgId}/context`).then((c) => {
      setCtx(c);
      const nav = navFor(c);
      setScreen(nav.some((n) => n[0] === initial.s) ? (initial.s as GymScreen) : nav[0]?.[0] ?? "reception");
      if (!c.roles.includes("owner") && (!initial.loc || !c.locations.some((l) => l.id === initial.loc))) setLoc(c.locations[0]?.id ?? null);
    }).catch((e) => setErr(e.message));
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshBadges = useCallback(() => {
    if (ctx && can(ctx, "challenges.validate")) api<{ pending: unknown[] }>(`/api/gym/${orgId}/validations`).then((v) => setBadges((b) => ({ ...b, validations: v.pending.length }))).catch(() => {});
    if (ctx && (can(ctx, "members.approve") || can(ctx, "members.validate"))) {
      api<{ canActAt: { id: string }[]; requests: { status: string; locationId: string }[] }>(`/api/gym/${orgId}/joins`)
        .then((j) => setBadges((b) => ({ ...b, joins: j.requests.filter((x) => x.status === "pending" && j.canActAt.some((c) => c.id === x.locationId)).length }))).catch(() => {});
    }
    if (!ctx || !can(ctx, "floor.work")) return;
    const l = loc ?? ctx.locations[0]?.id;
    api<{ shared: number; incoming: number }>(`/api/gym/${orgId}/shift?loc=${l}`).then((s) => setBadges((b) => ({ ...b, queue: s.shared + s.incoming }))).catch(() => {});
    api<{ unread: number }[]>(`/api/gym/${orgId}/messages?loc=${l}`).then((t) => setBadges((b) => ({ ...b, msgs: t.filter((x) => x.unread > 0).length }))).catch(() => {});
  }, [ctx, loc, orgId]);
  useEffect(() => { refreshBadges(); }, [refreshBadges, screen]);

  useEffect(() => {
    if (!screen) return;
    const q = new URLSearchParams({ s: screen });
    if (sel) q.set("sel", sel);
    if (loc) q.set("loc", loc);
    window.history.replaceState(null, "", `?${q}`);
  }, [screen, sel, loc]);

  const go = (s: GymScreen, extra?: { sel?: string | null }) => {
    setScreen(s); setDrawer(false); setSel(extra?.sel ?? null);
    requestAnimationFrame(() => { mainRef.current?.querySelector("h1")?.focus(); window.scrollTo(0, 0); });
  };
  if (err) return <main className="co-content"><p role="alert" className="err-box">{err}</p></main>;
  if (!ctx || !screen) return <main className="co-content"><p className="muted">Cargando…</p></main>;
  const nav = navFor(ctx);
  const shell: Shell = { orgId, loc, ctx, flash, go, sel, setSel, refreshBadges };
  const roleTxt = ctx.roles.map((r) => GYM_ROLE_LABEL[r as GymRole] ?? r).join(" · ");
  const locName = ctx.roles.includes("owner") && !loc ? `${ctx.locations.length} sedes` : ctx.locations.find((l) => l.id === (loc ?? ctx.locations[0]?.id))?.name ?? "";
  const multi = ctx.locations.length > 1;

  return (
    <div className="co" data-drawer={drawer ? "1" : "0"}>
      <aside className="co-side" aria-label="Navegación">
        <div className="co-brand">
          <Wordmark width={58} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="co-rail-icon" src="/brand/repi_icon.png" alt="repi" />
          <span className="tag">Gym</span>
        </div>
        <a className="co-ws" href="/acceso?step=workspace" aria-label="Cambiar espacio de trabajo">
          <span className="co-ini">{initials(ctx.org.name)}</span>
          <span className="co-ws-txt"><b>{ctx.org.name} · {locName}</b><small>{roleTxt}</small></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 10l4-4 4 4M8 14l4 4 4-4" /></svg>
        </a>
        {multi && (
          <label className="gy-locpick"><span>Sede</span>
            <select value={loc ?? ""} onChange={(e) => { setLoc(e.target.value || null); setSel(null); }}>
              {ctx.roles.includes("owner") && <option value="">Todas</option>}
              {ctx.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <nav className="co-nav" aria-label="Principal">
          {nav.map(([k, l, ic, soon]) => (
            <button key={k} type="button" title={l} aria-current={screen === k ? "page" : undefined} onClick={() => go(k)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d={ic} /></svg>
              <span className="lbl">{l}</span>{soon && <span className="soon">{soon}</span>}
              {k === "queue" && badges.queue > 0 && <span className="nbadge" aria-label={`${badges.queue} pendientes`}>{badges.queue}</span>}
              {k === "msgs" && badges.msgs > 0 && <span className="nbadge" aria-label={`${badges.msgs} conversaciones sin leer`}>{badges.msgs}</span>}
              {k === "joins" && badges.joins > 0 && <span className="nbadge" aria-label={`${badges.joins} solicitudes pendientes`}>{badges.joins}</span>}
              {k === "validations" && badges.validations > 0 && <span className="nbadge" aria-label={`${badges.validations} intentos por validar`}>{badges.validations}</span>}
            </button>
          ))}
        </nav>
        <div className="co-me">
          <span className="av">{initials(ctx.name)}</span>
          <span><b>{ctx.name}</b><small><button type="button" onClick={async () => { await authClient.signOut(); window.location.href = "/acceso"; }} style={{ border: 0, background: "none", color: "inherit", padding: 0, font: "inherit", cursor: "pointer" }}>Cerrar sesión</button></small></span>
        </div>
      </aside>
      {drawer && <div className="co-scrim" onClick={() => setDrawer(false)} />}
      <main className="co-main">
        <div className="co-topbar">
          <button type="button" aria-label="Abrir menú" onClick={() => setDrawer(true)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F8FAFC" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
          <Wordmark width={50} />
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#94A3B8" }}>{ctx.org.name}</span>
        </div>
        <div className="co-content" ref={mainRef} key={`${screen}-${loc}`}>
          {screen === "shift" && <ShiftScreen shell={shell} />}
          {screen === "queue" && <QueueScreen shell={shell} />}
          {screen === "members" && <MembersScreen shell={shell} />}
          {screen === "handoff" && <HandoffScreen shell={shell} />}
          {screen === "msgs" && <ChatPane listUrl={`/api/gym/${orgId}/messages?loc=${loc ?? ctx.locations[0]?.id}`} kicker="Conversaciones del equipo de sala con socios de la sede. La gerencia no ve su contenido." emptyText="Todavía no hay conversaciones. Se abren cuando un socio escribe o desde su ficha con «Escribir»." initial={sel} onSeen={refreshBadges} />}
          {screen === "perf" && <MyPerfScreen shell={shell} />}
          {screen === "mdash" && <PanelScreen shell={shell} />}
          {screen === "pc" && <PerfCenterScreen shell={shell} />}
          {screen === "staff" && <TeamScreen shell={shell} />}
          {screen === "tasks" && <TasksScreen shell={shell} />}
          {screen === "reviews" && <ReviewsScreen shell={shell} />}
          {screen === "shifts" && <ShiftsScreen shell={shell} />}
          {screen === "engage" && <EngageScreen shell={shell} />}
          {screen === "exec" && <ExecScreen shell={shell} />}
          {screen === "locs" && <LocsScreen shell={shell} />}
          {screen === "config" && <ConfigScreen shell={shell} />}
          {screen === "reception" && <ReceptionScreen shell={shell} />}
          {screen === "community" && <CommunityScreen shell={shell} />}
          {screen === "validations" && <ValidationsScreen shell={shell} />}
          {screen === "billing" && <ConditionsScreen orgId={orgId} flash={flash} unit="socios" />}
          {screen === "joins" && <JoinsScreen shell={shell} />}
          {screen === "accesses" && <AccessesScreen shell={shell} />}
        </div>
      </main>
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <div className="co-toast" aria-hidden="true">{toast}</div>}
    </div>
  );
}

function ReceptionScreen({ shell }: { shell: Shell }) {
  const [task, setTask] = useState(false);
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  return (
    <>
      <Head kicker="Carnet, ingresos y premios; solicitudes de acceso por QR y pedidos a la cola de sala" title="Recepción">
        {can(shell.ctx, "task.create") && <button type="button" className="btn pri" onClick={() => setTask(true)}>Nueva tarea para sala</button>}
      </Head>
      {can(shell.ctx, "reception.desk") && <DeskCard shell={shell} />}
      {can(shell.ctx, "members.approve") && <div className="gy-incoming"><span style={{ flex: 1 }}>Las solicitudes de socios que escanean el QR llegan a la bandeja compartida con el piso en turno.</span><button type="button" className="btn pri" onClick={() => shell.go("joins")}>Ver solicitudes</button></div>}
      <span className="muted">Recepción no ve fichas, programas, reseñas ni datos de salud.</span>
      {task && loc && <NewTaskModal shell={shell} loc={loc} onClose={() => setTask(false)} />}
    </>
  );
}
