"use client";
// REPI Gym desktop por rol (REPI Desktop Gym.dc.html). Cada persona ve la navegación de sus roles en esta organización;
// la autorización real la resuelve el servidor por capacidad y sede.
import { useCallback, useEffect, useRef, useState } from "react";
import { GYM_ROLE_LABEL, type GymRole } from "@repi/domain";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { signOutSafely } from "@/lib/session-cleanup";
import { Wordmark } from "@/components/access/Wordmark";
import { ChatPane } from "@/components/messages/ChatPane";
import { HandoffScreen, NewTaskModal, QueueScreen, ShiftScreen } from "./Floor";
import { MembersScreen } from "./Members";
import { MyPerfScreen, PerfCenterScreen } from "./Perf";
import { EngageScreen, PanelScreen, ShiftsScreen, TasksScreen, TeamScreen } from "./Manage";
import { ConfigScreen, ExecScreen, LocsScreen, ReviewsScreen } from "./Owner";
import { CommunityScreen, DeskCard, ValidationsScreen } from "./Community";
import { AccessesScreen, ConditionsScreen, JoinsScreen } from "./Access";
import { NoticesScreen } from "./Notices";
import { GymGuide } from "./GymGuide";
import { ConnectQueueScreen, ConnectReportScreen } from "./Connect";
import { AccessControlScreen, AccessDesk, ManualCheckin } from "./AccessControl";
import { FloorNowCard } from "./FloorNow";
import { ExerciseVideos } from "@/components/coach/ExerciseVideos";
import { Head, can, initials, type GymCtxView, type GymScreen, type Shell } from "./shared";
import { Ic } from "@/components/ui/Ic";
import { ArrowsLeftRight, Bell, BookOpen, CalendarBlank, CaretUpDown, ChartBar, ChatCircle, CheckCircle, Desk, Door, Gauge, House, Key, List, MapPin, Pulse, QrCode, Queue, Receipt, SlidersHorizontal, Star, Users, VideoCamera, type Icon } from "@phosphor-icons/react";

const IC = {
  home: House, queue: Queue, users: Users, swap: ArrowsLeftRight, chart: ChartBar, gauge: Gauge, check: CheckCircle, star: Star, cal: CalendarBlank,
  pulse: Pulse, pin: MapPin, receipt: Receipt, gear: SlidersHorizontal, msg: ChatCircle, desk: Desk, door: Door, key: Key, bell: Bell, book: BookOpen, qr: QrCode, video: VideoCamera,
};
type NavItem = [GymScreen, string, Icon, string | null];

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
  // REPI Connect (D126): con el módulo activo la cola se llama «Sala» y la gestión suma «Seguimiento de sala».
  if (ctx.connect) {
    const q = out.find((x) => x[0] === "queue");
    if (q) q[1] = "Sala";
    if (can(ctx, "team.read")) out.splice(Math.min(2, out.length), 0, ["connect", "Seguimiento de sala", IC.pulse, null]);
  }
  // Gym Access (D127): con el módulo activo, dueño y gerencia ven «Acceso y presencia» junto a Accesos.
  if (ctx.accessControl && (r.includes("owner") || r.includes("manager"))) {
    const i = out.findIndex((x) => x[0] === "accesses");
    out.splice(i < 0 ? out.length : i + 1, 0, ["presence", "Acceso y presencia", IC.qr, null]);
  }
  if (can(ctx, "members.approve") || can(ctx, "reception.desk")) add(["reception", r.includes("reception") ? "Recepción" : "Mostrador", IC.desk, null]);
  if (can(ctx, "members.approve")) { add(["joins", "Solicitudes de acceso", IC.door, null]); add(["accesses", "Accesos", IC.key, null]); }
  if (can(ctx, "catalog.publish")) add(["community", r.includes("reception") && !can(ctx, "community.publish") ? "Catálogo" : "Comunidad", IC.users, null]);
  // F-HX-26: quien recibe avisos de altas o de sala tiene su bandeja, segunda en la lista.
  if (can(ctx, "floor.work") || can(ctx, "members.approve") || r.some((x) => x === "owner" || x === "manager" || x === "reception")) out.splice(1, 0, ["notices", "Avisos", IC.bell, null]);
  // D164: videos de cómo se hace cada ejercicio: dueño, gerencia y quienes arman programas.
  if (r.includes("owner") || r.includes("manager") || can(ctx, "program.edit")) add(["videos", "Videos de ejercicios", IC.video, null]);
  out.push(["guide", "Guía", IC.book, null]); // D115: cada rol ve su parte
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
  const [badges, setBadges] = useState<{ queue: number; msgs: number; validations: number; joins: number; notices: number; billing: number }>({ queue: 0, msgs: 0, validations: 0, joins: 0, notices: 0, billing: 0 });
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
    if (ctx && navFor(ctx).some((n) => n[0] === "notices")) api<{ unread: number }>(`/api/gym/${orgId}/notices`).then((x) => setBadges((b) => ({ ...b, notices: x.unread }))).catch(() => {});
    if (ctx?.roles.includes("owner")) api<{ unacked: number }>(`/api/conditions/${orgId}`).then((x) => setBadges((b) => ({ ...b, billing: x.unacked }))).catch(() => {});
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
  // QA 29/10 (UX-9): si la primera carga falla (red), se ofrece reintentar en vez de dejar la pantalla trabada.
  if (err) return <main className="co-content"><p role="alert" className="err-box">{err} <button type="button" className="btn sm" onClick={() => window.location.reload()}>Reintentar</button></p></main>;
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
          <img className="co-rail-icon" src="/icons/tile-256.png" alt="repi" />
          <span className="tag">Gym</span>
        </div>
        <a className="co-ws" href="/acceso?step=workspace" aria-label="Cambiar espacio de trabajo">
          <span className="co-ini">{initials(ctx.org.name)}</span>
          <span className="co-ws-txt"><b>{ctx.org.name} · {locName}</b><small>{roleTxt}</small></span>
          <Ic i={CaretUpDown} size={16} color="#94A3B8" />
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
              <Ic i={ic} size={20} />
              <span className="lbl">{l}</span>{soon && <span className="soon">{soon}</span>}
              {k === "billing" && badges.billing > 0 && <span className="nbadge" aria-label={`${badges.billing} cambios de condiciones sin revisar`}>{badges.billing}</span>}
              {k === "notices" && badges.notices > 0 && <span className="nbadge" aria-label={`${badges.notices} avisos sin leer`}>{badges.notices}</span>}
              {k === "queue" && badges.queue > 0 && <span className="nbadge" aria-label={`${badges.queue} pendientes`}>{badges.queue}</span>}
              {k === "msgs" && badges.msgs > 0 && <span className="nbadge" aria-label={`${badges.msgs} conversaciones sin leer`}>{badges.msgs}</span>}
              {k === "joins" && badges.joins > 0 && <span className="nbadge" aria-label={`${badges.joins} solicitudes pendientes`}>{badges.joins}</span>}
              {k === "validations" && badges.validations > 0 && <span className="nbadge" aria-label={`${badges.validations} intentos por validar`}>{badges.validations}</span>}
            </button>
          ))}
        </nav>
        <div className="co-me">
          <span className="av">{initials(ctx.name)}</span>
          <span><b>{ctx.name}</b><small><button type="button" onClick={async () => { if (!await signOutSafely()) return; window.location.href = "/acceso"; }} style={{ border: 0, background: "none", color: "inherit", padding: 0, font: "inherit", cursor: "pointer" }}>Cerrar sesión</button> · <a href="/cuenta" onClick={(e) => { e.preventDefault(); window.location.href = `/cuenta?desde=${encodeURIComponent(window.location.pathname)}`; }} style={{ color: "inherit" }}>Mi cuenta</a> · <a href="/ayuda" onClick={(e) => { e.preventDefault(); window.location.href = `/ayuda?desde=${encodeURIComponent(window.location.pathname)}`; }} style={{ color: "inherit" }}>Ayuda</a></small></span>
        </div>
      </aside>
      {drawer && <div className="co-scrim" onClick={() => setDrawer(false)} />}
      <main className="co-main">
        <div className="co-topbar">
          <button type="button" aria-label="Abrir menú" aria-expanded={drawer} onClick={() => setDrawer(true)}><Ic i={List} size={22} color="#F8FAFC" /></button>
          <Wordmark width={50} />
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#94A3B8" }}>{ctx.org.name}</span>
        </div>
        <div className="co-content" ref={mainRef} key={`${screen}-${loc}`} data-section={screen}>
          {screen === "notices" && <NoticesScreen shell={shell} />}
          {screen === "shift" && <><ShiftScreen shell={shell} />{shell.ctx.accessControl && can(shell.ctx, "members.validate") && !can(shell.ctx, "reception.desk") && <ManualCheckin shell={shell} loc={shell.loc ?? shell.ctx.locations[0]?.id ?? null} />}</>}
          {screen === "queue" && (ctx.connect ? <ConnectQueueScreen shell={shell} /> : <QueueScreen shell={shell} />)}
          {screen === "connect" && <ConnectReportScreen shell={shell} />}
          {screen === "presence" && <AccessControlScreen shell={shell} />}
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
          {screen === "guide" && <GymGuide shell={shell} />}
          {screen === "reception" && <ReceptionScreen shell={shell} />}
          {screen === "community" && <CommunityScreen shell={shell} />}
          {screen === "validations" && <ValidationsScreen shell={shell} />}
          {screen === "videos" && <ExerciseVideos orgId={orgId} flash={shell.flash} />}
          {screen === "billing" && <ConditionsScreen orgId={orgId} flash={flash} unit="socios" onSeen={refreshBadges} />}
          {screen === "joins" && <JoinsScreen shell={shell} />}
          {screen === "accesses" && <AccessesScreen shell={shell} />}
          {(screen === "shift" || screen === "exec" || screen === "mdash" || screen === "reception" || screen === "queue") && <FloorNowCard shell={shell} />}
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
      <AccessDesk shell={shell} />
      {can(shell.ctx, "members.approve") && <div className="gy-incoming"><span style={{ flex: 1 }}>Las solicitudes de socios que escanean el QR llegan a la bandeja compartida con el piso en turno.</span><button type="button" className="btn pri" onClick={() => shell.go("joins")}>Ver solicitudes</button></div>}
      <span className="muted">Recepción no ve fichas, programas, reseñas ni datos de salud.</span>
      {task && loc && <NewTaskModal shell={shell} loc={loc} onClose={() => setTask(false)} />}
    </>
  );
}
