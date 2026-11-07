"use client";
// REPI Gym desktop por rol (REPI Desktop Gym.dc.html). Cada persona ve la navegación de sus roles en esta organización;
// la autorización real la resuelve el servidor por capacidad y sede.
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { GYM_ROLE_LABEL, type GymRole } from "@repi/domain";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { signOutSafely } from "@/lib/session-cleanup";
import { Wordmark } from "@/components/access/Wordmark";
import { ChatPane } from "@/components/messages/ChatPane";
import { HandoffScreen, NewTaskModal, QueueScreen, ShiftScreen } from "./Floor";
import { MemberPage, MembersScreen } from "./Members";
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
import { HoursPrompt } from "./Hours";
import { ExerciseVideos } from "@/components/coach/ExerciseVideos";
import { EquipmentScreen } from "./Equipment";
import { Head, can, initials, type GymCtxView, type GymScreen, type Shell } from "./shared";
import { Ic } from "@/components/ui/Ic";
import { featureOn } from "@/lib/features";
import { RepiNews, useRepiNewsUnread } from "@/components/announcements/RepiNews";
import { ArrowsLeftRight, Barbell, Bell, BookOpen, CalendarBlank, CaretUpDown, ChartBar, ChatCircle, CheckCircle, Desk, Door, Gauge, House, Key, List, MapPin, Pulse, QrCode, Queue, Receipt, SlidersHorizontal, Star, Users, VideoCamera, Megaphone, type Icon } from "@phosphor-icons/react";
import { FlashToast } from "@/components/ui/FlashToast";
import { SectionStage } from "@/components/motion/SectionStage";
import { SlideIndicator } from "@/components/motion/SlideIndicator";
import { Skel } from "@/components/motion/Skeleton";

const IC = {
  home: House, queue: Queue, users: Users, swap: ArrowsLeftRight, chart: ChartBar, gauge: Gauge, check: CheckCircle, star: Star, cal: CalendarBlank,
  pulse: Pulse, pin: MapPin, receipt: Receipt, gear: SlidersHorizontal, msg: ChatCircle, desk: Desk, door: Door, key: Key, bell: Bell, book: BookOpen, qr: QrCode, video: VideoCamera, barbell: Barbell, megaphone: Megaphone,
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
  if (can(ctx, "challenges.witness")) add(["validations", "Validaciones", IC.check, null]); // D165: en sala
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
  // D195: equipamiento de la sede (administran dueño, gerencia y coordinación; consulta quien arma programas).
  if (can(ctx, "equipment.manage") || can(ctx, "program.edit")) add(["equipment", "Equipamiento", IC.barbell, null]);
  // D202: novedades del producto para el equipo (dueño, gerencia, coordinación, sala y recepción), con el módulo encendido.
  if (featureOn("announcements") && r.some((x) => ["owner", "manager", "coordinator", "floor_trainer", "reception"].includes(x))) add(["repinews", "Novedades de REPI", IC.megaphone, null]);
  out.push(["guide", "Guía", IC.book, null]); // D115: cada rol ve su parte
  return out;
}

export function GymApp({ orgId, initial }: { orgId: string; initial: { s?: string; sel?: string; loc?: string; from?: string } }) {
  const [ctx, setCtx] = useState<GymCtxView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [screen, setScreen] = useState<GymScreen | null>(null);
  // Ficha del socio como página propia (pedido del titular, 07/11): se recuerda de qué pantalla vino para «Volver».
  const [from, setFrom] = useState<GymScreen | null>((initial.from as GymScreen | undefined) ?? null);
  const [memberName, setMemberName] = useState<string | null>(null);
  // M06: el menú (aria-current e indicador) y el cajón responden en el toque; la pantalla llega con startTransition.
  const [navSel, setNavSel] = useState<GymScreen | null>(null);
  const [sel, setSel] = useState<string | null>(initial.sel ?? null);
  const [loc, setLoc] = useState<string | null>(initial.loc ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [badges, setBadges] = useState<{ queue: number; msgs: number; validations: number; joins: number; notices: number; billing: number }>({ queue: 0, msgs: 0, validations: 0, joins: 0, notices: 0, billing: 0 });
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);
  const flash = useCallback((t: string) => { clearTimeout(tt.current); setToast(t); tt.current = setTimeout(() => setToast(null), 3500); }, []);
  const [newsTick, setNewsTick] = useState(0);
  // M06: avisos y novedades sin ráfaga de pedidos en cada toque: como máximo cada 30 s, al volver a la pestaña y después de
  // cada acción (refreshBadges), como antes.
  const [bucket, setBucket] = useState(0);
  const newsUnread = useRepiNewsUnread("gym", orgId, `${bucket}:${newsTick}`);

  useEffect(() => {
    api<GymCtxView>(`/api/gym/${orgId}/context`).then((c) => {
      setCtx(c);
      const nav = navFor(c);
      const memberPage = initial.s === "member" && !!initial.sel && nav.some((n) => n[0] === "members");
      setScreen(memberPage || nav.some((n) => n[0] === initial.s) ? (initial.s as GymScreen) : nav[0]?.[0] ?? "reception");
      if (!memberPage || !nav.some((n) => n[0] === initial.from)) setFrom(null); // «Volver a …» sólo a una pantalla del rol
      if (!c.roles.includes("owner") && (!initial.loc || !c.locations.some((l) => l.id === initial.loc))) setLoc(c.locations[0]?.id ?? null);
    }).catch((e) => setErr(e.message));
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshBadges = useCallback(() => {
    if (ctx && navFor(ctx).some((n) => n[0] === "notices")) api<{ unread: number }>(`/api/gym/${orgId}/notices`).then((x) => setBadges((b) => ({ ...b, notices: x.unread }))).catch(() => {});
    if (ctx?.roles.includes("owner")) api<{ unacked: number }>(`/api/conditions/${orgId}`).then((x) => setBadges((b) => ({ ...b, billing: x.unacked }))).catch(() => {});
    // D172: el número de Validaciones suma los intentos y los desafíos propuestos por socios que esperan revisión.
    if (ctx && (can(ctx, "challenges.validate") || can(ctx, "challenges.witness"))) Promise.all([
      api<{ pending: unknown[] }>(`/api/gym/${orgId}/validations`),
      api<{ status: string }[]>(`/api/gym/${orgId}/proposals`).catch(() => []),
    ]).then(([v, p]) => setBadges((b) => ({ ...b, validations: v.pending.length + p.filter((x) => x.status === "proposed").length }))).catch(() => {});
    if (ctx && (can(ctx, "members.approve") || can(ctx, "members.validate"))) {
      api<{ canActAt: { id: string }[]; requests: { status: string; locationId: string }[] }>(`/api/gym/${orgId}/joins`)
        .then((j) => setBadges((b) => ({ ...b, joins: j.requests.filter((x) => x.status === "pending" && j.canActAt.some((c) => c.id === x.locationId)).length }))).catch(() => {});
    }
    if (!ctx || !can(ctx, "floor.work")) return;
    const l = loc ?? ctx.locations[0]?.id;
    api<{ shared: number; incoming: number }>(`/api/gym/${orgId}/shift?loc=${l}`).then((s) => setBadges((b) => ({ ...b, queue: s.shared + s.incoming }))).catch(() => {});
    api<{ unread: number }[]>(`/api/gym/${orgId}/messages?loc=${l}`).then((t) => setBadges((b) => ({ ...b, msgs: t.filter((x) => x.unread > 0).length }))).catch(() => {});
  }, [ctx, loc, orgId]);
  const lastBadges = useRef(0);
  const badgesIfStale = useCallback(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastBadges.current < 30_000) return;
    lastBadges.current = Date.now(); refreshBadges(); setBucket((b) => b + 1);
  }, [refreshBadges]);
  useEffect(() => {
    lastBadges.current = Date.now(); refreshBadges();
    const id = setInterval(badgesIfStale, 30_000);
    document.addEventListener("visibilitychange", badgesIfStale);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", badgesIfStale); };
  }, [refreshBadges, badgesIfStale]);
  useEffect(() => { badgesIfStale(); }, [screen, badgesIfStale]);

  const urlOf = (sc: GymScreen, se: string | null, fr: GymScreen | null) => {
    const q = new URLSearchParams({ s: sc });
    if (se) q.set("sel", se);
    if (sc === "member" && fr) q.set("from", fr);
    if (loc) q.set("loc", loc);
    return `?${q}`;
  };
  useEffect(() => {
    if (!screen) return;
    window.history.replaceState(window.history.state, "", urlOf(screen, sel, from));
  }, [screen, sel, loc, from]); // eslint-disable-line react-hooks/exhaustive-deps

  // go y openMember no cambian de identidad: una respuesta de avisos no vuelve a dibujar la pantalla visible. El foco y el
  // scroll por pantalla los resuelve SectionStage después del commit (antes, un requestAnimationFrame enfocaba el título viejo).
  const cur = useRef({ screen, from });
  cur.current = { screen, from };
  const pushed = useRef(false); // la ficha abierta sumó una entrada al historial: «Volver» y el «atrás» del sistema regresan
  const go = useCallback((s: GymScreen, extra?: { sel?: string | null }) => {
    const { screen: sc, from: fr } = cur.current;
    setDrawer(false); setNavSel(s);
    if (s !== "member") pushed.current = false;
    startTransition(() => {
      setFrom(s === "member" ? (sc === "member" ? fr : sc) : null);
      setScreen(s); setSel(extra?.sel ?? null);
    });
  }, []);
  const openMember = useCallback((id: string, opts?: { name?: string | null }) => {
    const { screen: sc, from: fr } = cur.current;
    const origin = sc === "member" ? fr : sc;
    setMemberName(opts?.name ?? null);
    if (sc !== "member") { window.history.pushState({ repiMember: true }, "", urlOf("member", id, origin)); pushed.current = true; }
    go("member", { sel: id });
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = useCallback((to: GymScreen) => { if (pushed.current) window.history.back(); else go(to); }, [go]);
  // «Atrás» del sistema (gesto de iOS en la PWA, botón de Android): vuelve a la pantalla de la URL anterior.
  useEffect(() => {
    const on = () => {
      const q = new URLSearchParams(window.location.search);
      const s = q.get("s") as GymScreen | null;
      if (!s || s === cur.current.screen) return;
      pushed.current = false;
      go(s, { sel: q.get("sel") });
    };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, [go]);
  // QA 29/10 (UX-9): si la primera carga falla (red), se ofrece reintentar en vez de dejar la pantalla trabada.
  const shell = useMemo<Shell | null>(() => (ctx ? { orgId, loc, ctx, flash, go, sel, setSel, refreshBadges, openMember } : null), [orgId, loc, ctx, flash, go, sel, refreshBadges, openMember]);
  if (err) return <main className="co-content"><p role="alert" className="err-box">{err} <button type="button" className="btn sm" onClick={() => window.location.reload()}>Reintentar</button></p></main>;
  // M06: la primera carga ya dibuja el armazón (lateral navy y contenido en esqueleto): sin «Cargando…» suelto ni salto de color.
  if (!ctx || !screen || !shell) return <GymSkeleton />;
  const nav = navFor(ctx);
  const navKey = navSel === screen || !navSel ? screen : navSel;
  const roleTxt = ctx.roles.map((r) => GYM_ROLE_LABEL[r as GymRole] ?? r).join(" · ");
  const locName = ctx.roles.includes("owner") && !loc ? `${ctx.locations.length} sedes` : ctx.locations.find((l) => l.id === (loc ?? ctx.locations[0]?.id))?.name ?? "";
  const multi = ctx.locations.length > 1;

  return (
    <div className="co" data-drawer={drawer ? "1" : "0"}>
      <aside className="co-side ui-dark" aria-label="Navegación">
        <div className="co-brand">
          <Wordmark width={58} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="co-rail-icon" src="/icons/tile-256.png" alt="repi" />
          <span className="tag">Gym</span>
        </div>
        <a className="co-ws" href="/acceso?step=workspace" aria-label="Cambiar espacio de trabajo">
          <span className="co-ini">{initials(ctx.org.name)}</span>
          <span className="co-ws-txt"><b>{ctx.org.name} · {locName}</b><small>{roleTxt}</small></span>
          <Ic i={CaretUpDown} size={16} color="var(--ui-muted)" />
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
          <SlideIndicator />
          {nav.map(([k, l, ic, soon]) => (
            <button key={k} type="button" title={l} aria-current={navKey === k || (navKey === "member" && k === "members") ? "page" : undefined} onClick={() => go(k)}>
              <Ic i={ic} size={20} />
              <span className="lbl">{l}</span>{soon && <span className="soon">{soon}</span>}
              {k === "billing" && badges.billing > 0 && <span className="nbadge" aria-label={`${badges.billing} cambios de condiciones sin revisar`}>{badges.billing}</span>}
              {k === "repinews" && newsUnread > 0 && <span className="nbadge" aria-label={`${newsUnread} novedades sin leer`}>{newsUnread}</span>}
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
        {/* D188: apariencia personal (no del gimnasio): la misma en todos los espacios. */}
        <div className="co-theme"><ThemePicker compact /></div>
      </aside>
      <div className="co-scrim" data-open={drawer ? "1" : "0"} aria-hidden="true" onClick={() => setDrawer(false)} />
      <main className="co-main">
        <div className="co-topbar ui-dark">
          <button type="button" aria-label="Abrir menú" aria-expanded={drawer} onClick={() => setDrawer(true)}><Ic i={List} size={22} color="var(--ui-text)" /></button>
          <Wordmark width={50} />
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--ui-muted)" }}>{ctx.org.name}</span>
        </div>
        <div className="co-content" ref={mainRef}>
          {/* M06: pantallas vivas (Activity) con cambio de carril; vertical desde 768 px (orden del menú), horizontal debajo.
              La ficha del socio es profundidad (entra «adelante», vuelve «atrás»). Otra sede: todo se desmonta y se recarga. */}
          <SectionStage active={screen} order={nav.map((n) => n[0])} axis="auto" focus="title" paneClass="co-pane" resetKey={loc} top={(k) => k === "member"} render={(k) => <>
            {k === "notices" && <NoticesScreen shell={shell} />}
            {k === "shift" && <><ShiftScreen shell={shell} />{shell.ctx.accessControl && can(shell.ctx, "members.validate") && !can(shell.ctx, "reception.desk") && <ManualCheckin shell={shell} loc={shell.loc ?? shell.ctx.locations[0]?.id ?? null} />}</>}
            {k === "queue" && (ctx.connect ? <ConnectQueueScreen shell={shell} /> : <QueueScreen shell={shell} />)}
            {k === "connect" && <ConnectReportScreen shell={shell} />}
            {k === "presence" && <AccessControlScreen shell={shell} />}
            {k === "members" && <MembersScreen shell={shell} />}
            {k === "member" && <MemberPage shell={shell} name={memberName} back={from && from !== "members" ? { to: from, label: nav.find((n) => n[0] === from)?.[1] ?? "Atrás", go: back } : null} />}
            {k === "handoff" && <HandoffScreen shell={shell} />}
            {k === "msgs" && <ChatPane listUrl={`/api/gym/${orgId}/messages?loc=${loc ?? ctx.locations[0]?.id}`} kicker="Conversaciones del equipo de sala con socios de la sede. La gerencia no ve su contenido." emptyText="Todavía no hay conversaciones. Se abren cuando un socio escribe o desde su ficha con «Escribir»." initial={sel} onSeen={refreshBadges} />}
            {k === "perf" && <MyPerfScreen shell={shell} />}
            {k === "mdash" && <PanelScreen shell={shell} />}
            {k === "pc" && <PerfCenterScreen shell={shell} />}
            {k === "staff" && <TeamScreen shell={shell} />}
            {k === "tasks" && <TasksScreen shell={shell} />}
            {k === "reviews" && <ReviewsScreen shell={shell} />}
            {k === "shifts" && <ShiftsScreen shell={shell} />}
            {k === "engage" && <EngageScreen shell={shell} />}
            {k === "exec" && <ExecScreen shell={shell} />}
            {k === "locs" && <LocsScreen shell={shell} />}
            {k === "config" && <ConfigScreen shell={shell} />}
            {k === "guide" && <GymGuide shell={shell} />}
            {k === "reception" && <ReceptionScreen shell={shell} />}
            {k === "community" && <CommunityScreen shell={shell} />}
            {k === "validations" && <ValidationsScreen shell={shell} />}
            {k === "videos" && <ExerciseVideos orgId={orgId} flash={shell.flash} />}
            {k === "equipment" && <EquipmentScreen shell={shell} />}
            {k === "billing" && <ConditionsScreen orgId={orgId} flash={flash} unit="socios" onSeen={refreshBadges} />}
            {k === "joins" && <JoinsScreen shell={shell} />}
            {k === "accesses" && <AccessesScreen shell={shell} />}
            {k === "repinews" && <RepiNews area="gym" orgId={orgId} onSeen={() => setNewsTick((x) => x + 1)} onGo={(d) => go(d === "gym.equipment" && nav.some((n) => n[0] === "equipment") ? "equipment" : d === "gym.members" && nav.some((n) => n[0] === "members") ? "members" : nav[0][0])} />}
            {(k === "shift" || k === "exec" || k === "mdash" || k === "reception" || k === "queue") && <FloorNowCard shell={shell} />}
          </>} />
        </div>
      </main>
      {can(shell.ctx, "floor.work") && <HoursPrompt shell={shell} />}
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <FlashToast text={toast} />}
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

/** M06: armazón de la primera carga (lateral navy con 6 filas y contenido en esqueleto), en lugar de un «Cargando…» suelto. */
function GymSkeleton() {
  return (
    <div className="co" data-drawer="0" aria-busy="true">
      <aside className="co-side ui-dark" aria-hidden="true">
        <div className="co-brand"><Wordmark width={58} /><span className="tag">Gym</span></div>
        <div className="co-nav">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ height: 40, display: "flex", alignItems: "center", gap: 12, padding: "0 11px" }}><Skel w={20} h={20} r={6} /><Skel w={`${50 + ((i * 17) % 35)}%`} h={12} className="lbl" /></div>)}</div>
      </aside>
      <main className="co-main">
        <div className="co-topbar ui-dark" aria-hidden="true"><Wordmark width={50} /></div>
        <div className="co-content">
          <span role="status" className="sr-only">Cargando</span>
          <div className="co-head" aria-hidden="true"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><Skel w={180} h={12} /><Skel w={240} h={30} r={8} /></div></div>
          <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>{[0, 1, 2].map((i) => <div key={i} className="skel-card" style={{ minHeight: 120 }}><Skel w="40%" h={14} /><Skel w="60%" h={26} /><Skel w="80%" h={12} /></div>)}</div>
          <div className="skel-card" aria-hidden="true" style={{ minHeight: 240 }}><Skel w="30%" h={16} /><Skel h={12} /><Skel h={12} /><Skel w="70%" h={12} /></div>
        </div>
      </main>
    </div>
  );
}
