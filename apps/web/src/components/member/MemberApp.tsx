"use client";
// App del alumno (PWA móvil). Estructura y jerarquía de handoff/.../REPI App Alumno v4.dc.html; datos de /api/me.
// Diferencia documentada (D30): los días del programa no tienen día de semana fijo; se elige el día y se sugiere
// el próximo por rotación. La semana muestra días entrenados reales.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TECHNIQUES, fmtMoney, formatClock, formatRest, formatDayEs, groupLabels, volumeIn, WEEK_LETTERS, type Currency, type WeightUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { signOutSafely } from "@/lib/session-cleanup";
import { allLocal, delLocal, ensureOwner, loadTraining, openLocal, putLocal, saveTraining, setKey, wipeLocal, type LocalSession } from "@/lib/offline/store";
import { enqueue, pendingFor } from "@/lib/offline/queue";
import { ApiError } from "@/lib/api";
import { Wordmark } from "@/components/access/Wordmark";
import { prefersReducedMotion } from "@/lib/motion";
import { Ambient, useReveal } from "@/components/motion/Ambient";
import { Workout } from "./Workout";
import { CheckinSheet, HelpSheet, InjurySheet, PainSheet, ReviewSheet } from "./FollowSheets";
import { MemberMessages } from "./Messages";
import { GymTabView, type GymTab } from "./Gym";
import { ACCESS_ITEMS, INJURY_STATUS, REQUEST_KIND, TASK_CATEGORY, type InjuryStatus, type RequestKind } from "@repi/domain";
import { kg, metaTxt, prevTxt, type ProgramUpdate, type Training } from "./types";
import { UnitContext, useUnit } from "./units";
import { Sheet } from "./Sheet";
import { SoloEntry, SoloSheet, type Advice, type Routine } from "./Solo";
import { ConnectCard, ConnectHelpSheet, ConnectPanelSheet, type ConnectContext } from "./Connect";
import { PresenceChip, PresenceSheet, type GymPresence } from "./Presence";
import { FloorNow } from "./FloorNow";
import { BeforeRepi } from "./HistoryImport";
import { Wishes } from "./Wishes";
import { Ic } from "@/components/ui/Ic";
import { Barbell, Bell, ChartLineUp, ChatCircle, Check, CheckCircle, House, Play, Question, Storefront, Warning, type Icon } from "@phosphor-icons/react";
import { featureOn } from "@/lib/features";
import { Ideas } from "./Ideas";
import { OwnRoutines } from "./OwnRoutines";

type Tab = "home" | "train" | "prog" | "msgs" | "gym" | "perfil";
type Inbox = {
  coach: { name: string; org: string } | null; checkinToday: boolean;
  accessRequests: { id: string; item: string; phrase: string; reason: string; from: string }[];
  requests: { id: string; kind: RequestKind; text: string; status: "open" | "done"; unseenResolved: boolean }[];
  gym: { id: string; place: string; connect: boolean } | null;
  gymRequests: { id: string; category: keyof typeof TASK_CATEGORY; label: string; status: "open" | "taken" | "done"; doneBy: string | null; unseen: boolean }[];
  reviewInvites: { id: string; trainer: string; kind: string; place: string }[];
  unreadThreads: number;
  gymUnseen: number;
};
// Centro de notificaciones (F-NT-01, D94). El servidor arma la lista; el aviso de programa se suma acá desde el programa.
type NotifDest = { tab: "home" | "msgs" | "perfil" } | { tab: "gym"; gymTab: "news" | "ch" | "logros" } | { tab: "review"; invite: Inbox["reviewInvites"][number] };
type Notif = { id: string; title: string; body: string; at: string; tone: "cyan" | "turq" | "ok" | "bad" | "mute"; dest: NotifDest; unread: boolean };
type Feed = { items: Notif[]; unread: number; seenAt: string | null };
type SheetState = null | { type: "checkin"; dayId: string } | { type: "pain" } | { type: "help"; kind?: RequestKind; to?: "coach" | "gym" } | { type: "injury" } | { type: "review"; invite: Inbox["reviewInvites"][number] }
  | { type: "connect"; context?: ConnectContext | null } | { type: "connectPanel"; id?: string | null } | { type: "presence"; dayId?: string };
type History = { id: string; dayName: string; endedAt: string; durationSec: number; sets: number; volumeKg: number; rpe: number | null }[];

export function MemberApp({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((["home", "train", "prog", "msgs", "gym", "perfil"] as const).includes(initialTab as Tab) ? (initialTab as Tab) : "home");
  const [t, setT] = useState<Training | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [workout, setWorkout] = useState<string | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((x: string) => { clearTimeout(tt.current); setToast(x); tt.current = setTimeout(() => setToast(null), 2800); }, []);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [privKey, setPrivKey] = useState(0);
  const [solo, setSolo] = useState<"solo" | "coach_absent" | null>(null); // Adaptive Coach fase 1 (D108)
  const [connectTick, setConnectTick] = useState(0); // REPI Connect (D126): recarga la tarjeta de pedidos
  // Control de acceso del gimnasio (D127): estado de la validación de ingreso por gimnasio, siempre desde el servidor.
  const [presence, setPresence] = useState<{ gyms: GymPresence[]; demo: boolean } | null>(null);
  const loadPresence = useCallback(() => api<{ gyms: GymPresence[]; demo: boolean }>("/api/me/gym/presence").then((x) => { setPresence(x); return x; }).catch(() => null), []);
  // Aviso push de un pedido resuelto → /app?pedido=<id> abre su detalle.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pedido");
    if (id) { setSheet({ type: "connectPanel", id: id.slice(0, 64) }); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  const loadInbox = useCallback(() => api<Inbox>("/api/me/inbox").then(setInbox).catch(() => setInbox(null)), []);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [gymTab, setGymTab] = useState<GymTab | undefined>(undefined);
  const loadFeed = useCallback(() => api<Feed>("/api/me/notifications").then(setFeed).catch(() => {}), []);
  const [localOpen, setLocalOpen] = useState<LocalSession | null>(null);
  // Online primero; si no hay red, el programa guardado en el teléfono. Antes de mostrar nada se verifica el dueño.
  const load = useCallback(async () => {
    try {
      const x = await api<Training>("/api/me/training");
      await ensureOwner(x.userId).catch(() => {});
      await saveTraining(x).catch(() => {});
      setT(x); setErr(null); setOfflineAt(null);
      void loadInbox(); void loadFeed(); void loadPresence();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) { await wipeLocal().catch(() => {}); setErr(e.message); return null; }
      const cached = await loadTraining<Training>().catch(() => undefined);
      if (cached) { setT(cached.t); setOfflineAt(cached.at); setErr(null); }
      else setErr("Sin conexión y sin programa guardado en este teléfono.");
    }
    setLocalOpen(await openLocal().catch(() => null));
    // Minimización: sesiones terminadas y ya sincronizadas no se guardan en el teléfono más de un día.
    for (const ls of await allLocal().catch(() => [])) {
      if ((ls.status === "completed" || ls.status === "abandoned") && Date.now() - new Date(ls.updatedAt).getTime() > 86_400_000 && !(await pendingFor(ls.id))) await delLocal(ls.id);
    }
    return null;
  }, [loadInbox, loadPresence]);
  useEffect(() => { load(); }, [load]);
  // QA 29/10 (UX-8): al volver la conexión se recarga; antes «Sin conexión» quedaba fijo hasta que el coach cambiara algo.
  useEffect(() => {
    const on = () => void load();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [load]);
  // D143: cambios del coach en vivo. Mientras la app está a la vista se consulta una marca liviana cada 15 s (y al volver a
  // la app); si cambió, se recarga el programa. Un entrenamiento ya empezado no se toca: muestra un aviso.
  const stamp = useRef<string | null>(null);
  const coachFirstRef = useRef("Tu profe");
  const [changedMidWorkout, setChangedMidWorkout] = useState(false);
  const workoutRef = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const { stamp: k } = await api<{ stamp: string }>("/api/me/training/stamp");
        if (stamp.current == null) { stamp.current = k; return; }
        if (k === stamp.current) return;
        stamp.current = k;
        await load();
        if (workoutRef.current) setChangedMidWorkout(true);
        else flash(`${coachFirstRef.current[0].toUpperCase()}${coachFirstRef.current.slice(1)} actualizó tu rutina.`);
      } catch { /* sin conexión o sesión vencida: se reintenta en la próxima vuelta */ }
    };
    void check();
    const id = setInterval(check, 15_000);
    const vis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const [histErr, setHistErr] = useState(false);
  const loadHist = useCallback(() => { setHistErr(false); api<{ sessions: History }>("/api/me/history").then((r) => setHist(r.sessions)).catch(() => { setHist(null); setHistErr(true); }); }, []);
  useEffect(() => { if (tab === "prog") loadHist(); }, [tab, loadHist]);
  // Service worker sólo en producción (en desarrollo interfiere con la recarga en caliente).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async (reg) => {
      await navigator.serviceWorker.ready;
      const urls = [location.pathname, ...performance.getEntriesByType("resource").map((r) => r.name).filter((u) => u.startsWith(location.origin) && /\/_next\/static\/|\/brand\//.test(u))];
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "cache", urls });
    }).catch(() => {});
  }, []);
  // Cambio de sección (G · Atlética): la barra queda fija, el contenido entra con un fundido de 160 ms (CSS .tab-pane)
  // y cada sección recupera su scroll. Lo no sincronizado vive en IndexedDB y no depende de la pestaña montada.
  const scrolls = useRef<Record<string, number>>({});
  useEffect(() => { window.scrollTo(0, workout ? 0 : scrolls.current[tab] ?? 0); }, [tab, workout]);

  const go = (x: Tab) => { if (!workout) scrolls.current[tab] = window.scrollY; setTab(x); setWorkout(null); setGymTab(undefined); };
  const notifs = withProgramNotice(feed, t);
  const openNotifs = () => {
    setNotifOpen(true);
    if (offlineAt) return;
    // Abrir el centro marca lo listado como leído; la lista se refresca para no mostrar algo viejo.
    void loadFeed().then(() => api("/api/me/notifications/seen", { body: {} })).catch(() => {});
  };
  const pickNotif = (d: NotifDest) => {
    setNotifOpen(false);
    setFeed((f) => (f ? { ...f, unread: 0, items: f.items.map((x) => ({ ...x, unread: false })), seenAt: new Date().toISOString() } : f));
    if (d.tab === "review") { setSheet({ type: "review", invite: d.invite }); return; }
    go(d.tab);
    if (d.tab === "gym") setGymTab(d.gymTab);
  };
  // Con el programa institucional activo, quien indica es el equipo de sala (D11).
  const coachFirst = t?.relation?.kind === "gym" ? "el equipo de sala" : t?.coach?.name.split(" ")[0] ?? "tu coach";
  const days = t?.program?.days ?? [];
  const selDay = day ?? t?.program?.nextDay ?? 0;
  const openId = localOpen?.id ?? t?.openSession ?? null;
  // Iniciar crea la sesión en el teléfono (con su ID) y la encola: funciona igual con o sin conexión.
  // Antes de entrenar, check-in de 3 toques (saltable). Sin conexión se entra directo.
  // D138: la sugerencia de IA aceptada (cargas, reemplazos y salteos de hoy) se aplica al iniciar ese día, aunque antes pase
  // por el check-in o la validación de ingreso.
  const aiPlan = useRef<Advice | null>(null);
  const start = async (dayId: string, validated = false) => {
    if (openId) { setWorkout(openId); return; }
    // D127: entrenamiento del programa del gimnasio con validación de ingreso. Se consulta al servidor en el momento.
    if (t?.relation?.kind === "gym" && !validated) {
      if (offlineAt) {
        const p = presence?.gyms.find((x) => x.orgId === t.relation!.orgId);
        if (p?.startNeedsCheckin && (!p.pass || new Date(p.pass.expiresAt) <= new Date())) { flash("Para iniciar el entrenamiento presencial necesitás conexión para validar tu ingreso. Tu rutina la ves igual."); return; }
      } else {
        const fresh = await loadPresence();
        const p = fresh?.gyms.find((x) => x.orgId === t.relation!.orgId);
        if (p?.startNeedsCheckin && !p.pass) { setSheet({ type: "presence", dayId }); return; }
      }
    }
    if (!offlineAt && inbox && !inbox.checkinToday) { setSheet({ type: "checkin", dayId }); return; }
    await begin(dayId);
  };
  // D153: rutina de hoy sin programa asignado. Se crea en el servidor (necesita conexión, igual que armarla) y se abre como
  // cualquier entrenamiento. En el gimnasio pide la misma validación de ingreso que un entrenamiento del programa.
  const startRoutine = async (r: Routine) => {
    if (openId) { setWorkout(openId); return; }
    if (offlineAt || !navigator.onLine) { flash("Para empezar la rutina de hoy necesitás conexión."); return; }
    if (t?.relation?.kind === "gym") {
      const fresh = await loadPresence();
      const p = fresh?.gyms.find((x) => x.orgId === t.relation!.orgId);
      if (p?.startNeedsCheckin && !p.pass) { flash("Validá tu ingreso al gimnasio y volvé a tocar «Empezar rutina de hoy»."); setSheet({ type: "presence" }); return; }
    }
    try {
      const s = await api<{ id: string }>("/api/me/solo/routine/start", { body: { id: crypto.randomUUID(), dayName: r.dayName,
        exercises: r.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, restSec: e.restSec, weightKg: e.weightKg, note: e.note || null })) } });
      setWorkout(s.id);
    } catch (e) { flash((e as Error).message); }
  };
  // D158: rutina propia del alumno. Igual que la de REPI: con conexión, validando el ingreso al gym si hace falta.
  const startOwn = async (routineId: string) => {
    if (openId) { setWorkout(openId); return; }
    if (offlineAt || !navigator.onLine) { flash("Para empezar tu rutina necesitás conexión."); return; }
    if (t?.relation?.kind === "gym") {
      const fresh = await loadPresence();
      const p = fresh?.gyms.find((x) => x.orgId === t.relation!.orgId);
      if (p?.startNeedsCheckin && !p.pass) { flash("Validá tu ingreso al gimnasio y volvé a tocar «Empezar»."); setSheet({ type: "presence" }); return; }
    }
    try {
      const s = await api<{ id: string }>(`/api/me/routines/${routineId}/start`, { body: { id: crypto.randomUUID() } });
      setWorkout(s.id);
    } catch (e) { flash((e as Error).message); }
  };
  const begin = async (dayId: string) => {
    setSheet(null);
    const d = t?.program?.days.find((x) => x.id === dayId);
    if (!t || !d) return;
    const nowIso = new Date().toISOString();
    const sets: LocalSession["sets"] = {};
    const ai = aiPlan.current?.dayId === d.id ? aiPlan.current : null;
    aiPlan.current = null;
    const aiOf = (id: string) => ai?.exercises.find((x) => x.id === id) ?? null;
    for (const e of d.exercises) for (let i = 0; i < e.sets; i++) {
      // D134: el plan serie por serie fija peso o repeticiones de esa serie (top set, back-off, drop).
      const plan = e.detail?.setPlan?.[i];
      const a = aiOf(e.id); // D138: sin plan por serie, el peso y las reps sugeridos por la IA para hoy
      // D154: sin plan del profe ni sugerencia del día, la progresión de REPI según la última vez en ese ejercicio.
      const sg = a?.swap || a?.skip ? null : e.suggest ?? null;
      const reps = /^(\d+)/.exec(plan?.reps ?? a?.reps ?? (sg ? String(sg.reps) : e.reps));
      const w = plan?.weightKg ?? a?.weightKg ?? (a?.swap ? a.swap.prev?.weightKg : sg?.weightKg ?? e.prev?.weightKg) ?? 0;
      sets[setKey(e.id, i)] = { id: crypto.randomUUID(), w, r: reps ? Number(reps[1]) : 0, rir: null, done: false, revision: 0, at: null };
    }
    const s: LocalSession = {
      id: crypto.randomUUID(), dayId: d.id, dayName: d.name, note: t.program!.note, startedAt: nowIso, status: "in_progress", activeMs: 0, lastResumedAt: nowIso,
      endedAt: null, rpe: null, sessionNote: null, revision: 1, synced: false, rest: null, updatedAt: nowIso, sets,
      exercises: d.exercises.map((e) => {
        const a = aiOf(e.id);
        const base = { id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: null, prev: e.prev, detail: e.detail ?? null, suggest: e.suggest ?? null };
        if (a?.swap) return { ...base, suggest: null, prev: a.swap.prev ?? null, origPrev: e.prev, change: { kind: "substitute" as const, reason: a.reason ?? "other", substitute: { exerciseId: a.swap.exerciseId, name: a.swap.name } } };
        if (a?.skip) return { ...base, change: { kind: "skip" as const, reason: a.reason ?? "other", substitute: null } };
        return base;
      }),
    };
    try {
      await putLocal(s);
      await enqueue({ key: `start:${s.id}`, kind: "start", sid: s.id });
      for (const e of s.exercises) if (e.change) await enqueue({ key: `exchange:${s.id}:${e.id}`, kind: "exchange", sid: s.id, peId: e.id });
      setWorkout(s.id);
    } catch { flash("Este navegador no permite guardar datos en el teléfono; no se puede entrenar sin conexión."); }
  };

  const tabs = ([["home", "Inicio", House], ["train", "Entrenar", Barbell], ["prog", "Progreso", ChartLineUp], ["msgs", "Mensajes", ChatCircle],
    ...(inbox?.gym ? [["gym", "Gym", Storefront] as const] : [])] as const);

  workoutRef.current = workout;
  coachFirstRef.current = coachFirst;
  const unit: WeightUnit = t?.weightUnit ?? "kg";
  if (workout) return (
    <UnitContext.Provider value={unit}><div className="mb"><div className="mb-col">
      <Workout sessionId={workout} coachFirst={coachFirst} programChanged={changedMidWorkout} onDismissChange={() => setChangedMidWorkout(false)} gym={t?.relation?.kind === "gym"} gymOrgId={t?.relation?.kind === "gym" ? t.relation.orgId : null} demo={!!presence?.demo} connectPlace={t?.relation?.kind === "gym" && inbox?.gym?.connect ? inbox.gym.place : null} flash={flash} onExit={(to) => { setWorkout(null); setChangedMidWorkout(false); setTab(to === "prog" ? "prog" : to === "home" ? "home" : "train"); load(); }} />
    </div><Toast t={toast} /></div></UnitContext.Provider>
  );

  return (
    <UnitContext.Provider value={unit}><div className="mb"><div className="mb-col">
      <main className="mb-scroll">
        {err && <p role="alert" className="mb-err">{err} <button type="button" className="linkbtn" onClick={() => void load()}>Reintentar</button></p>}
        {offlineAt && <p className="offline-bar" role="status">Sin conexión · programa guardado el {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(offlineAt))}</p>}
        {!t ? <p className="mb-muted">Cargando…</p> : (
          <div key={tab} className="tab-pane">
            {tab === "home" && <Home t={{ ...t, openSession: openId, openSessionDay: localOpen?.dayName ?? t.openSessionDay }} coachFirst={coachFirst} onStart={start} go={go}
              bell={{ unread: notifs.filter((x) => x.unread).length, onOpen: openNotifs }}
              inbox={inbox} offline={!!offlineAt} onSheet={setSheet} flash={flash} reloadInbox={loadInbox} onRelation={load} connectTick={connectTick}
              presence={t.relation?.kind === "gym" ? presence?.gyms.find((x) => x.orgId === t.relation!.orgId) ?? null : null} />}
            {tab === "train" && <><RelationPicker t={t} offline={!!offlineAt} busyOpen={!!openId} onChange={load} flash={flash} />
              {t.relation?.kind === "gym" && (() => { const p = presence?.gyms.find((x) => x.orgId === t.relation!.orgId); return p ? <PresenceChip p={p} onValidate={() => setSheet({ type: "presence" })} /> : null; })()}{t.relation?.kind === "gym" && <FloorNow orgId={t.relation.orgId} flash={flash} offline={!!offlineAt} />}<Train t={{ ...t, openSession: openId }} sel={selDay} setSel={setDay} coachFirst={coachFirst} onStart={start} onSolo={setSolo}
              own={t.relation ? <OwnRoutines offline={!!offlineAt} flash={flash} busyOpen={!!openId} onStart={(id) => void startOwn(id)} /> : null} /></>}
            {tab === "prog" && <Progress t={t} hist={hist} err={histErr} retry={loadHist} flash={flash} offline={!!offlineAt} />}
            {tab === "msgs" && <MemberMessages offline={!!offlineAt} onSeen={loadInbox} />}
            {tab === "gym" && <GymTabView key={gymTab ?? "news"} initialTab={gymTab} offline={!!offlineAt} flash={flash} onSeen={loadInbox} />}
            {tab === "perfil" && <Perfil key={privKey} t={t} inbox={inbox} reloadInbox={loadInbox} flash={flash} onInjury={() => setSheet({ type: "injury" })} onSettings={load} offline={!!offlineAt} />}
          </div>
        )}
      </main>
      {/* Barra Cristal flotante: cápsula con indicador interior; los rótulos quedan para lectores de pantalla. */}
      <div className="tabfade" aria-hidden="true" />
      <nav className="tabbar" aria-label="Principal" style={{ ["--n" as string]: tabs.length, ["--i" as string]: tabs.findIndex((x) => x[0] === tab) }}>
        <i className="tab-ind" aria-hidden="true" data-off={tabs.some((x) => x[0] === tab) ? undefined : "1"} />
        {tabs.map(([k, l, d]) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => go(k)} style={{ position: "relative" }}>
            <Ic i={d} size={24} /><span className="tab-lbl">{l}</span>
            {k === "msgs" && !!inbox?.unreadThreads && <span className="tab-badge" aria-label={`${inbox.unreadThreads} conversaciones sin leer`}>{inbox.unreadThreads}</span>}
            {k === "gym" && !!inbox?.gymUnseen && <span className="tab-dot" aria-label={`${inbox.gymUnseen} ${inbox.gymUnseen === 1 ? "aviso" : "avisos"} del gym`} />}
          </button>
        ))}
      </nav>
      {sheet?.type === "checkin" && <CheckinSheet flash={flash} standalone={!sheet.dayId}
        onDone={() => { setInbox((x) => (x ? { ...x, checkinToday: true } : x)); if (sheet.dayId) void begin(sheet.dayId); else setSheet(null); }}
        onSkip={() => (sheet.dayId ? void begin(sheet.dayId) : setSheet(null))} />}
      {sheet?.type === "pain" && <PainSheet flash={flash} onClose={() => setSheet(null)} />}
      {solo && <SoloSheet variant={solo} onClose={() => setSolo(null)} onStart={(dayId, ai) => { aiPlan.current = ai ?? null; void start(dayId); }} onStartRoutine={(r) => void startRoutine(r)} onContinue={() => openId && setWorkout(openId)}
        onHelp={() => setSheet({ type: "help", kind: "tecnica", to: t?.relation?.kind === "gym" ? "gym" : undefined })} onMessage={() => go("msgs")} />}
      {sheet?.type === "help" && (inbox?.gym?.connect && (sheet.to ?? (t?.relation?.kind === "gym" || !inbox.coach ? "gym" : "coach")) === "gym"
        ? <ConnectHelpSheet place={inbox.gym.place} coachName={inbox.coach?.name ?? null} onCoach={() => setSheet({ type: "help", kind: sheet.kind, to: "coach" })} flash={flash}
            onSent={() => setConnectTick((x) => x + 1)} onClose={() => { setSheet(null); void loadInbox(); }} />
        : <HelpSheet initialKind={sheet.kind} initialTo={sheet.to ?? (t?.relation?.kind === "gym" ? "gym" : undefined)} coachName={inbox?.coach?.name ?? null} gymPlace={inbox?.gym?.place ?? null}
            onGym={inbox?.gym?.connect ? () => setSheet({ type: "help", kind: sheet.kind, to: "gym" }) : undefined} flash={flash} onClose={() => { setSheet(null); void loadInbox(); }} />)}
      {sheet?.type === "connect" && inbox?.gym && <ConnectHelpSheet place={inbox.gym.place} context={sheet.context} flash={flash} onSent={() => setConnectTick((x) => x + 1)} onClose={() => setSheet(null)} />}
      {sheet?.type === "connectPanel" && <ConnectPanelSheet initialId={sheet.id} flash={flash} onNew={() => setSheet({ type: "help", to: "gym" })}
        onClose={() => { setSheet(null); setConnectTick((x) => x + 1); void loadInbox(); }} />}
      {sheet?.type === "review" && <ReviewSheet invite={sheet.invite} flash={flash} onClose={() => { setSheet(null); void loadInbox(); }} />}
      {notifOpen && <NotifSheet items={notifs} offline={!!offlineAt} loaded={!!feed} onPick={pickNotif} onClose={() => {
        setNotifOpen(false); setFeed((f) => (f ? { ...f, unread: 0, items: f.items.map((x) => ({ ...x, unread: false })), seenAt: new Date().toISOString() } : f));
      }} />}
      {sheet?.type === "presence" && <PresenceSheet orgId={t?.relation?.orgId} demo={!!presence?.demo} flash={flash} onClose={() => setSheet(null)}
        onValidated={() => { const d = sheet.dayId; setSheet(null); void loadPresence(); if (d) void start(d, true); }} />}
      {sheet?.type === "injury" && <InjurySheet flash={flash} onClose={() => setSheet(null)} onSaved={() => setPrivKey((k) => k + 1)} />}
    </div>
    {/* A11Y-1: el aviso queda fuera de .mb-col, que se vuelve inert con una hoja abierta (si no, el lector no lo anuncia). */}
    <Toast t={toast} /></div></UnitContext.Provider>
  );
}

function Toast({ t }: { t: string | null }) {
  return <><div aria-live="polite" className="sr-only">{t}</div>{t && <div className="mb-toast" aria-hidden="true">{t}</div>}</>;
}

function Head({ t, go, bell }: { t: Training; go?: (x: Tab) => void; bell?: { unread: number; onOpen: () => void } }) {
  return (
    <div className="mb-top">
      <Wordmark width={58} />
      <span style={{ display: "flex", gap: 2, alignItems: "center" }}>
        <button type="button" className="mb-icon" aria-label="Perfil" onClick={() => go?.("perfil")}><span className="mb-av">{(t.firstName[0] ?? "R").toUpperCase()}</span></button>
        {bell && (
          <button type="button" className="mb-icon" style={{ position: "relative" }} onClick={bell.onOpen}
            aria-label={bell.unread ? `Notificaciones, ${bell.unread} sin leer` : "Notificaciones"}>
            <Ic i={Bell} size={22} />{bell.unread > 0 && <span className="bell-dot" aria-hidden="true" />}
          </button>
        )}
      </span>
    </div>
  );
}

/** Suma el aviso de programa nuevo/actualizado (F-CL-14) a la lista del servidor, con la misma marca de leído. */
function withProgramNotice(feed: Feed | null, t: Training | null): Notif[] {
  const items = feed?.items ?? [];
  const u = t?.program?.update;
  if (!u || !t?.program || Date.now() - new Date(u.at).getTime() > 30 * 86_400_000) return items;
  const who = u.author?.split(" ")[0] ?? "Tu coach";
  const seen = feed?.seenAt ? new Date(feed.seenAt) : null;
  const n: Notif = {
    id: `prog:${u.key}`, at: u.at, tone: "cyan", dest: { tab: "home" }, unread: !seen || new Date(u.at) > seen,
    title: u.kind === "new" ? `${who} te asignó «${t.program.name}»` : `${who} actualizó tu programa`,
    body: u.kind === "new" ? "Ya podés entrenarlo desde Inicio." : `Versión ${t.program.version}${u.reason ? ` · ${u.reason}` : ""}`,
  };
  return [n, ...items].sort((a, b) => b.at.localeCompare(a.at));
}

const TONE: Record<Notif["tone"], string> = { cyan: "#00D1FF", turq: "#5DE6D8", ok: "#10B981", bad: "#EF4444", mute: "#2D3B4F" };
function whenTxt(at: string) {
  const d = new Date(at), mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return mins <= 1 ? "Ahora" : `${mins} min`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h`;
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(d);
}
function NotifSheet({ items, offline, loaded, onPick, onClose }: { items: Notif[]; offline: boolean; loaded: boolean; onPick: (d: NotifDest) => void; onClose: () => void }) {
  return (
    <Sheet title="Notificaciones" onClose={onClose}>
      {offline && <p className="mb-muted" role="status" style={{ margin: 0, fontSize: 14 }}>Sin conexión: se actualizan cuando vuelvas a tener señal.</p>}
      {!loaded && !offline ? <p className="mb-muted" style={{ margin: 0 }}>Cargando…</p> : !items.length ? (
        <p className="mb-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>No tenés notificaciones de los últimos 30 días.</p>
      ) : (
        <ul className="notif-list" aria-label="Notificaciones de los últimos 30 días">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className="notif" onClick={() => onPick(n.dest)}>
                <span className="notif-dot" style={{ background: TONE[n.tone] }} aria-hidden="true" />
                <span className="notif-txt"><b>{n.title}</b><small>{n.body}</small></span>
                <span className="notif-at">{n.unread && <span className="sr-only">Sin leer · </span>}{whenTxt(n.at)}{n.unread && <i className="notif-new" aria-hidden="true" />}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function WeekStrip({ t }: { t: Training }) {
  return (
    <div className="week" aria-label="Semana actual">
      {t.week.map((d, i) => {
        const done = t.stats.doneDates.includes(d), today = d === t.today;
        return (
          <div key={d} aria-label={`${formatDayEs(d)}${done ? ", entrenaste" : ""}`}>
            <span className={`wl${today ? " is-today" : done ? " done" : ""}`}>{WEEK_LETTERS[i]}</span>
            <span className="wn">{Number(d.slice(8))}</span>
            <span className={`wdot${done ? " on" : ""}`} />
          </div>
        );
      })}
    </div>
  );
}

function Home({ t, coachFirst, onStart, go, bell, inbox, offline, onSheet, flash, reloadInbox, onRelation, connectTick, presence }: {
  t: Training; coachFirst: string; onStart: (dayId: string) => void; go: (x: Tab) => void; bell: { unread: number; onOpen: () => void }; inbox: Inbox | null; offline: boolean;
  onSheet: (s: SheetState) => void; flash: (x: string) => void; reloadInbox: () => void; onRelation: () => void; connectTick: number; presence: GymPresence | null;
}) {
  const connect = !!inbox?.gym?.connect;
  const gymRel = t.relation?.kind === "gym";
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const next = t.program?.days[t.program.nextDay];
  const v = t.stats.volumeLastWeek ? Math.round(((t.stats.volumeThisWeek - t.stats.volumeLastWeek) / t.stats.volumeLastWeek) * 100) : null;
  const askProgram = async () => {
    try {
      const r = await api<{ duplicate: boolean }>(gymRel ? "/api/me/gym/requests" : "/api/me/requests", { body: { kind: "programa", text: "Quiero que me armen un programa." } });
      const to = gymRel ? "al equipo de sala" : `a ${coachFirst}`; // «a el» no va (F-15)
      flash(r.duplicate ? `Ya le pediste tu programa ${to}.` : `Pedido enviado ${to}.`);
      reloadInbox();
    } catch (e) { flash((e as Error).message); }
  };
  const pendingProgram = gymRel ? inbox?.gymRequests.some((r) => r.category === "programa_nuevo" && r.status !== "done") : inbox?.requests.some((r) => r.kind === "programa" && r.status === "open");
  const QUICK: [string, Icon, () => void][] = [
    ["Pedir ayuda", Question, () => onSheet({ type: "help" })],
    ["Molestia", Warning, () => onSheet({ type: "pain" })],
    ["Check-in", CheckCircle, () => (inbox?.checkinToday ? flash("Ya hiciste el check-in de hoy.") : next ? onSheet({ type: "checkin", dayId: "" }) : flash("Sin programa no hay entrenamiento para iniciar."))],
  ];
  return (
    <>
      <Head t={t} go={go} bell={bell} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 tabIndex={-1}>Hola, {t.firstName}</h1>
        <span className="mb-muted" style={{ fontSize: 15 }}>{t.openSession ? "Tenés un entrenamiento en curso." : "Hoy es un gran día para entrenar."}</span>
      </div>
      <RelationPicker t={t} offline={offline} busyOpen={!!t.openSession} onChange={onRelation} flash={flash} />
      {presence && !offline && <PresenceChip p={presence} onValidate={() => onSheet({ type: "presence" })} />}
      {/* Un entrenamiento abierto siempre se puede retomar, aunque el programa ya no esté disponible (p. ej. acceso pausado):
          ahí se ve qué pasó con su sincronización y se decide qué hacer con lo guardado en el teléfono. */}
      {t.openSession && !(t.state === "ready" && next) && (
        <button type="button" className="cta" onClick={() => onStart("")}><Ic i={Play} size={18} weight="fill" color="#0B0F14" />Continuar entrenamiento en curso</button>
      )}
      {t.state === "ready" && next ? (
        <div style={{ position: "relative" }}>
          <button type="button" className="today" onClick={() => (t.openSession ? onStart(next.id) : go("train"))} aria-label={t.openSession ? `Continuar ${t.openSessionDay}` : `Ver ${next.name}`}>
            <span className="today-art" aria-hidden="true" />
            <span className="today-txt"><small>{t.openSession ? "Entrenamiento en curso" : "Próximo entrenamiento"}</small><strong>{t.openSessionDay ?? next.name}</strong><span>{t.openSession ? "Tocá para continuar donde lo dejaste" : `${next.exercises.length} ejercicios · ${next.exercises.reduce((a, e) => a + e.sets, 0)} series`}</span></span>
          </button>
          <button type="button" className="play" aria-label={t.openSession ? "Continuar entrenamiento" : "Comenzar entrenamiento"} onClick={() => onStart(next.id)}><Ic i={Play} size={20} weight="fill" color="#F8FAFC" /></button>
        </div>
      ) : t.state === "scheduled" ? (
        <div className="dashed-card"><strong>Tu programa empieza el {formatDayEs(t.startsOn!)}</strong><span>{cap(coachFirst)} ya te lo asignó. Ese día lo vas a ver acá.</span></div>
      ) : (
        <div className="dashed-card"><strong>Todavía no tenés programa</strong>
          <span>{t.relation ? (pendingProgram ? `Ya se lo pediste ${gymRel ? "al equipo de sala" : `a ${coachFirst}`}. Te avisamos cuando lo asigne.` : `${cap(coachFirst)} todavía no te asignó un programa. Podés pedírselo.`) : "Todavía no tenés coach ni gym en REPI."}</span>
          {t.relation && !pendingProgram && !offline && <button type="button" className="cta sm" onClick={askProgram}>Pedir mi programa</button>}
          {t.relation && <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => go("train")}>¿Tenés tu propia rutina? Cargala y registrá tus entrenamientos</button>}
        </div>
      )}
      {/* D156: a la vista en la primera pantalla, debajo del entrenamiento de hoy. */}
      {!offline && <Ideas offline={offline} flash={flash} />}
      {!offline && <NextAppointment flash={flash} />}
      {t.state === "ready" && t.program?.update && <ProgramNotice u={t.program.update} version={t.program.version} name={t.program.name} offline={offline} flash={flash} />}
      {inbox?.accessRequests.map((a) => (
        <button key={a.id} type="button" className="hbanner cyan" onClick={() => go("perfil")}>
          <span className="dot" style={{ width: 8, height: 8, borderRadius: 4, background: "#00D1FF", flex: "none" }} />
          <span><b>{a.from.split(" ")[0]} pidió ver tu {a.phrase}</b><small>Vos decidís. Podés revocarlo cuando quieras.</small></span><em>Revisar</em>
        </button>
      ))}
      {inbox?.requests.filter((r) => r.unseenResolved).map((r) => (
        <button key={r.id} type="button" className="hbanner" onClick={async () => { await api(`/api/me/requests/${r.id}/seen`, { body: {} }).catch(() => {}); reloadInbox(); }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "#10B981", flex: "none" }} />
          <span><b>Tu pedido fue resuelto</b><small>{REQUEST_KIND[r.kind]} · {inbox.coach?.name.split(" ")[0] ?? "tu coach"}</small></span><em>Ok</em>
        </button>
      ))}
      {!offline && connect && <ConnectCard refresh={connectTick} onOpen={(id) => onSheet({ type: "connectPanel", id })} />}
      {!connect && inbox?.gymRequests.filter((r) => r.unseen).map((r) => (
        <button key={r.id} type="button" className="hbanner" onClick={async () => { await api(`/api/me/gym/requests/${r.id}/seen`, { body: {} }).catch(() => {}); reloadInbox(); }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "#10B981", flex: "none" }} />
          <span><b>El equipo de sala resolvió tu pedido</b><small>{r.label}{r.doneBy ? ` · ${r.doneBy.split(" ")[0]}` : ""}</small></span><em>Ok</em>
        </button>
      ))}
      {!offline && inbox?.reviewInvites.map((i) => (
        <div key={i.id} className="hbanner" style={{ flexWrap: "wrap" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "#5DE6D8", flex: "none" }} />
          <span><b>¿Cómo te atendió {i.trainer.split(" ")[0]}?</b><small>Opcional · por {i.kind.toLowerCase()}</small></span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="cta sm" style={{ height: 36 }} onClick={() => onSheet({ type: "review", invite: i })}>Opinar</button>
            <button type="button" className="ghost sm" style={{ height: 36 }} onClick={async () => { await api(`/api/me/gym/reviews/${i.id}/dismiss`, { body: {} }).catch(() => {}); flash("Listo, no te volveremos a preguntar por esta atención."); reloadInbox(); }}>Ahora no</button>
          </span>
        </div>
      ))}
      {!offline && (
        <div className="quick">{QUICK.map(([l, d, fn]) => (
          <button key={l} type="button" onClick={fn}><Ic i={d} size={20} color="#5DE6D8" />{l}</button>
        ))}</div>
      )}
      {!offline && connect && <button type="button" className="linkbtn cx-mine" onClick={() => onSheet({ type: "connectPanel" })}>Mis pedidos al equipo de sala</button>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><h2>Semana</h2><WeekStrip t={t} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>Tu progreso</h2>
        <div className="tiles">
          <button type="button" className="tile" onClick={() => go("prog")}><div><strong>{t.stats.weekDone}</strong><span>Entrenamientos<br />esta semana</span></div><div className="bars" aria-hidden="true">{[8, 14, 20, 28].map((h, i) => <i key={i} style={{ height: h, opacity: i < t.stats.weekDone ? 1 : .25 }} />)}</div></button>
          <button type="button" className="tile" onClick={() => go("prog")}><div><strong>{v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`}</strong><span>Volumen<br />vs. semana anterior</span></div></button>
        </div>
      </div>
    </>
  );
}

/** Selector de relación activa (D11/GAP-24, propuesta): sólo si la persona tiene coach privado y gym. */
function RelationPicker({ t, offline, busyOpen, onChange, flash }: { t: Training; offline: boolean; busyOpen: boolean; onChange: () => void; flash: (x: string) => void }) {
  if (t.relations.length < 2) return null;
  const pick = async (id: string) => {
    if (id === t.relation?.id) return;
    if (offline) { flash("Necesitás conexión para cambiar de programa."); return; }
    if (busyOpen) { flash("Terminá el entrenamiento en curso antes de cambiar de programa."); return; }
    try { await api("/api/me/relation", { body: { relationId: id } }); onChange(); } catch (e) { flash((e as Error).message); }
  };
  return (
    <div className="relpick" role="radiogroup" aria-label="Programa con el que entrenás">
      {t.relations.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={r.id === t.relation?.id} onClick={() => pick(r.id)}
          aria-label={`${r.kind === "gym" ? r.org : `Coach ${r.name}`}: ${r.hasProgram ? "con programa" : "sin programa"}`}>
          <b>{r.kind === "gym" ? r.org.split(" · ")[0] : `Coach ${r.name.split(" ")[0]}`}</b><small>{r.hasProgram ? "Con programa" : "Sin programa"}</small>
        </button>
      ))}
    </div>
  );
}

function Train({ t, sel, setSel, coachFirst, onStart, onSolo, own }: { t: Training; sel: number; setSel: (i: number) => void; coachFirst: string; onStart: (dayId: string) => void; onSolo: (v: "solo" | "coach_absent") => void; own: React.ReactNode }) {
  if (t.state !== "ready" || !t.program) return (
    <>
      <h1 tabIndex={-1} style={{ marginTop: 6 }}>Entrenar</h1>
      <WeekStrip t={t} />
      {t.openSession && (
        <button type="button" className="cta" onClick={() => onStart("")}><Ic i={Play} size={18} weight="fill" color="#0B0F14" />Continuar entrenamiento en curso</button>
      )}
      {own}
      {t.relation && featureOn("adaptive") && <SoloEntry onOpen={onSolo} prefetch={false} />}
      <div className="restday"><span style={{ fontSize: 22, fontWeight: 600 }}>{t.state === "scheduled" ? `Empieza el ${formatDayEs(t.startsOn!)}` : "Sin programa asignado"}</span><span className="mb-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Cuando {coachFirst} te asigne un programa, sus días aparecen acá.</span></div>
    </>
  );
  const d = t.program.days[sel] ?? t.program.days[0];
  return (
    <>
      <h1 tabIndex={-1} style={{ marginTop: 6 }}>Entrenar</h1>
      {featureOn("adaptive") && <SoloEntry onOpen={onSolo} />}
      <DayTabs t={t} sel={sel} setSel={setSel} />
      <DayDetail t={t} d={d} coachFirst={coachFirst} />
      {d.exercises.length > 0 && (
        <button type="button" className="cta" onClick={() => onStart(d.id)}>
          <Ic i={Play} size={18} weight="fill" color="#0B0F14" />{t.openSession ? "Continuar entrenamiento en curso" : "Comenzar entrenamiento"}
        </button>
      )}
      {own}
    </>
  );
}

type Day = NonNullable<Training["program"]>["days"][number];

/**
 * M01 (motion.md): la superficie de selección se transfiere al día elegido en 200 ms con cubic-bezier(.2,0,0,1)
 * y retargetea desde su posición actual ante toques rápidos (transición CSS, sin cola). Elegir no inicia la sesión.
 */
function DayTabs({ t, sel, setSel }: { t: Training; sel: number; setSel: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const b = box.current?.querySelectorAll<HTMLElement>(".daytab")[sel];
    if (!b) return;
    setInd({ x: b.offsetLeft, w: b.offsetWidth, h: b.offsetHeight });
    b.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [sel, t.program?.days.length]);
  const days = t.program!.days;
  const key = (e: React.KeyboardEvent) => {
    const n = e.key === "ArrowRight" ? sel + 1 : e.key === "ArrowLeft" ? sel - 1 : e.key === "Home" ? 0 : e.key === "End" ? days.length - 1 : null;
    if (n == null) return;
    e.preventDefault();
    const i = (n + days.length) % days.length;
    setSel(i);
    box.current?.querySelectorAll<HTMLElement>(".daytab")[i]?.focus();
  };
  return (
    <div className="daytabs" role="tablist" aria-label={`Días de ${t.program!.name}`} ref={box} onKeyDown={key}>
      {ind && <i className="daytab-ind" aria-hidden="true" style={{ transform: `translateX(${ind.x}px)`, width: ind.w, height: ind.h }} />}
      {days.map((x, i) => (
        <button key={x.id} type="button" role="tab" className="daytab" aria-selected={i === sel} tabIndex={i === sel ? 0 : -1} aria-controls="day-detail" onClick={() => setSel(i)}
          aria-label={`Día ${i + 1}: ${x.name}${i === t.program!.nextDay ? " (próximo)" : ""}`}>
          <small>Día {i + 1}</small><b>{x.name}</b>{i === t.program!.nextDay && <span className="nxt">Próximo</span>}
          <span className="daytab-ck" aria-hidden="true"><Ic i={Check} size={12} /></span>
        </button>
      ))}
    </div>
  );
}

/**
 * M01: el detalle anterior se retira en 100 ms mientras el nuevo entra a los 50 ms (150 ms, opacidad y 4 px vertical).
 * La copia saliente es inerte y oculta a lectores de pantalla: no duplica foco ni anuncios. Movimiento reducido: cambio inmediato.
 */
function DayDetail({ t, d, coachFirst }: { t: Training; d: Day; coachFirst: string }) {
  const [ghost, setGhost] = useState<{ d: Day; n: number } | null>(null);
  const prev = useRef(d);
  const n = useRef(0);
  useLayoutEffect(() => {
    if (prev.current.id === d.id) return;
    const old = prev.current;
    prev.current = d;
    if (prefersReducedMotion()) return;
    const k = ++n.current;
    setGhost({ d: old, n: k });
    const tm = setTimeout(() => setGhost((g) => (g?.n === k ? null : g)), 160);
    return () => clearTimeout(tm);
  }, [d]);
  return (
    <div className="daydetail" id="day-detail" role="tabpanel" aria-label={d.name}>
      {ghost && <div className="daydetail-out" key={`g${ghost.n}`} aria-hidden="true" inert><DayBody t={t} d={ghost.d} coachFirst={coachFirst} /></div>}
      <div className={ghost ? "daydetail-in" : undefined} key={d.id}><DayBody t={t} d={d} coachFirst={coachFirst} /></div>
    </div>
  );
}

function DayBody({ t, d, coachFirst }: { t: Training; d: Day; coachFirst: string }) {
  const unit = useUnit();
  const labels = groupLabels(d.exercises); // D137: A1, A2 en la vista previa
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="kick">{t.program!.name} · versión {t.program!.version}</span>
        <span className="dayname">{d.name}</span>
        <span className="mb-muted" style={{ fontSize: 14 }}>{d.exercises.length} ejercicios · {d.exercises.reduce((a, e) => a + e.sets, 0)} series</span>
      </div>
      {t.program!.note && (
        <div className="coachnote"><span className="av32" aria-hidden="true">{(t.relation?.kind === "gym" ? "Equipo Sala" : t.coach?.name ?? "C").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span><small>{t.relation?.kind === "gym" ? "Indicación del equipo de sala" : `Indicación de ${coachFirst}`}</small><p>{t.program!.note}</p></span></div>
      )}
      <div className="exlist">
        {d.exercises.map((e, i) => (
          <div key={e.id} className="exitem"><span className="thumb" aria-hidden="true">{labels[i] ?? "foto"}</span>
            <span><b>{e.name}</b>{e.detail && (labels[i] || e.detail.technique !== "straight") && <small className="ex-combo">{[labels[i] ? `${labels[i]} · ${e.detail.groupKind === "circuit" ? "circuito" : "combinado, sin descanso entre medio"}` : null, e.detail.technique !== "straight" ? TECHNIQUES[e.detail.technique].label : null].filter(Boolean).join(" · ")}</small>}<small>{metaTxt(e)}{e.rir != null ? ` · RIR ${e.rir}` : ""}</small><em>Anterior: {prevTxt(e.prev, unit)}</em></span>
            {e.suggest && <small className="ex-suggest" aria-label={`REPI sugiere hoy ${e.suggest.text}`}>Hoy: {e.suggest.weightKg != null ? `${kg(e.suggest.weightKg, unit)} × ` : ""}{e.suggest.reps}</small>}
            <span className="mb-muted" style={{ fontSize: 13, paddingRight: 4 }} aria-label={`Descanso ${formatRest(e.restSec)}`}>{formatRest(e.restSec)}</span>
          </div>
        ))}
        {!d.exercises.length && <span className="mb-muted">Este día no tiene ejercicios todavía.</span>}
      </div>
    </div>
  );
}

function Progress({ t, hist, err, retry, flash, offline }: { t: Training; hist: History | null; err: boolean; retry: () => void; flash: (t: string) => void; offline?: boolean }) {
  const unit = useUnit();
  const rv = useReveal(!!hist || err);
  // Volumen por semana de las últimas sesiones registradas (Σ peso × reps). Sin datos, sin gráfico.
  const weeks = new Map<string, number>();
  for (const s of hist ?? []) {
    const d = new Date(s.endedAt); const k = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short" }).format(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000));
    weeks.set(k, (weeks.get(k) ?? 0) + s.volumeKg);
  }
  const entries = [...weeks.entries()].reverse().slice(-8);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <>
      <h1 tabIndex={-1} style={{ marginTop: 6 }}>Progreso</h1>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>Volumen por semana</h2>
        {entries.length < 2 ? <span className="mb-muted" style={{ fontSize: 14 }}>Datos insuficientes: hacen falta al menos dos semanas con sesiones registradas.</span> : (
          <div className="volbars" role="img" aria-label={`Volumen semanal: ${entries.map(([k, v]) => `${k} ${volumeIn(v, unit).toLocaleString("es-AR")} ${unit}`).join(", ")}`}>
            {entries.map(([k, v]) => <div key={k}><i style={{ height: `${(v / max) * 100}%` }} /><span>{k}</span></div>)}
          </div>
        )}
        <span className="mb-muted" style={{ fontSize: 12 }}>Volumen = series completadas × peso × repeticiones.</span>
      </section>
      <MyGoals />
      <BeforeRepi flash={flash} offline={offline} />
      <a className="ghost" href="/app/informe" style={{ display: "grid", placeItems: "center" }}>Informe mensual</a>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2>Historial</h2>
        {err ? <span className="mb-muted" style={{ fontSize: 14 }}>No pudimos cargar tu historial (necesita conexión). <button type="button" className="linkbtn" onClick={retry}>Reintentar</button></span>
          : !hist ? (rv.ambient ? <Ambient label="Cargando tu historial" /> : null)
          : !hist.length ? <span className="mb-muted" style={{ fontSize: 14 }}>Todavía no completaste entrenamientos.</span> : (
          <div className={`hist${rv.leaving ? " m03-in" : ""}`} style={{ position: "relative" }}>{rv.leaving && <Ambient label="Cargando tu historial" leaving />}{hist.map((s) => (
            <div key={s.id}><span><b>{s.dayName}</b><br /><small className="mb-muted">{new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(s.endedAt))} · {formatClock(s.durationSec)}{s.rpe ? ` · RPE ${s.rpe}` : ""}</small></span><span className="mb-muted">{s.sets} series · {volumeIn(s.volumeKg, unit).toLocaleString("es-AR")} {unit}</span></div>
          ))}</div>
        )}
      </section>
      {t.stats.weekDone === 0 && <span className="mb-muted" style={{ fontSize: 13 }}>Fuerza, constancia y medidas se agregan en la Etapa 4.</span>}
    </>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <><h1 tabIndex={-1} style={{ marginTop: 6 }}>{title}</h1><div className="dashed-card"><span>{text}</span></div></>;
}

type Privacy = {
  coach: { name: string; org: string } | null;
  items: { key: string; title: string; desc: string; locked: boolean; on: boolean; restricted: boolean }[];
  history: { action: string; item: string; label: string; actor: string; at: string }[];
  injuries: { id: string; zone: string; detail: string | null; status: InjuryStatus; since: string | null; createdAt: string }[];
};
const HIST: Record<string, string> = { requested: "pidió ver", read: "vio" };
const MINE: Record<string, string> = { granted: "Compartiste", denied: "Rechazaste compartir", revoked: "Dejaste de compartir" };
const CYCLE: Record<InjuryStatus, InjuryStatus> = { active: "monitoring", monitoring: "resolved", resolved: "active" };

function Perfil({ t, inbox, reloadInbox, flash, onInjury, onSettings, offline }: {
  t: Training; inbox: Inbox | null; reloadInbox: () => void; flash: (x: string) => void; onInjury: () => void; onSettings: () => void; offline: boolean;
}) {
  const [p, setP] = useState<Privacy | null>(null);
  const [perr, setPerr] = useState<string | null>(null);
  const load = useCallback(() => api<Privacy>("/api/me/privacy").then(setP).catch((e) => setPerr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const coach = (p?.coach?.name ?? t.coach?.name ?? "tu coach").split(" ")[0];
  const decide = async (id: string, approve: boolean) => {
    try { await api(`/api/me/access/${id}`, { body: { approve } }); flash(approve ? "Acceso concedido. Podés revocarlo cuando quieras." : "Solicitud rechazada."); reloadInbox(); load(); }
    catch (e) { flash((e as Error).message); }
  };
  const toggle = async (key: string, on: boolean) => {
    try { await api("/api/me/privacy", { body: { item: key, on } }); flash(on ? "Ahora lo comparte." : `${coach} dejó de ver este dato.`); load(); reloadInbox(); }
    catch (e) { flash((e as Error).message); }
  };
  const injury = async (id: string, body: { status?: InjuryStatus; delete?: boolean }) => {
    try { await api(`/api/me/injuries/${id}`, { body }); load(); } catch (e) { flash((e as Error).message); }
  };
  const logout = async () => {
    try { if (!await signOutSafely()) return; }
    catch (e) { flash(e instanceof Error ? e.message : "No pudimos cerrar la sesión."); return; }
    window.location.href = "/acceso";
  };
  const health = p?.items.find((i) => i.key === "health");
  return (
    <>
      <h1 tabIndex={-1} style={{ marginTop: 6 }}>Perfil</h1>
      <div className="coachnote"><span className="av32">{coach[0]?.toUpperCase() ?? "C"}</span><span><small>Tu coach</small><p>{p?.coach ? `${p.coach.name} · ${p.coach.org}` : t.coach ? `${t.coach.name} · ${t.coach.org}` : "Sin coach asignado"}</p></span></div>
      {perr && <p className="mb-err" role="alert">{perr}</p>}
      {!!inbox?.accessRequests.length && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2>Solicitudes de acceso</h2>
          {inbox.accessRequests.map((a) => (
            <div key={a.id} className="areq">
              <span><strong>{a.from}</strong> quiere ver tu {a.phrase}. {a.reason}</span>
              <div><button type="button" className="cta" style={{ height: 40, fontSize: 15 }} onClick={() => decide(a.id, true)}>Permitir</button><button type="button" className="ghost" style={{ height: 40, fontSize: 14 }} onClick={() => decide(a.id, false)}>Rechazar</button></div>
            </div>
          ))}
        </section>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2>Salud</h2><button type="button" className="linkbtn" style={{ height: 36 }} onClick={onInjury}>+ Agregar lesión</button></div>
        <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{health?.on ? `La ve ${coach} porque compartiste tu salud.` : "Sólo la ves vos. Compartila en Privacidad si querés que tu coach la tenga en cuenta."}</span>
        <div className="panel">
          {p?.injuries.map((i) => (
            <div key={i.id}>
              <span><span style={{ fontSize: 15, fontWeight: 500 }}>{i.zone}</span><small>{i.detail ?? "Sin detalle"}{i.since ? ` · desde ${i.since}` : ""}</small></span>
              <button type="button" className={`st-pill st-${i.status}`} aria-label={`Estado: ${INJURY_STATUS[i.status]}. Cambiar`} onClick={() => injury(i.id, { status: CYCLE[i.status] })}>{INJURY_STATUS[i.status]}</button>
              <button type="button" className="linkbtn" aria-label={`Borrar ${i.zone}`} onClick={() => window.confirm("¿Borrar esta lesión de tu perfil?") && injury(i.id, { delete: true })}>Borrar</button>
            </div>
          ))}
          {p && !p.injuries.length && <div><span className="mb-muted" style={{ fontSize: 14 }}>Sin lesiones ni antecedentes cargados.</span></div>}
        </div>
      </section>
      {p?.coach && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2>Privacidad y permisos</h2>
          <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Elegí qué puede ver {coach}. Tus entrenamientos siempre se comparten porque son parte del plan.</span>
          <div className="panel">
            {p.items.map((i) => {
              const disabled = i.locked || (i.restricted && !i.on);
              return (
                <button key={i.key} type="button" className="prow-dark" role="switch" aria-checked={i.on} aria-disabled={disabled || undefined}
                  onClick={() => (i.locked ? flash("Tus entrenamientos siempre se comparten: son parte del plan.") : disabled ? flash("Se habilita cuando tu adulto responsable lo autorice.") : toggle(i.key, !i.on))}>
                  <span><span style={{ fontSize: 15, fontWeight: 500 }}>{i.title}</span><small>{i.locked ? "Siempre: son parte del plan." : i.restricted && !i.on ? "Necesita autorización de tu adulto responsable." : i.on ? `Lo ve ${coach}` : "No compartido"}</small></span>
                  <span className="track" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={{ fontSize: 16 }}>Historial de accesos</h2>
        {!p?.history.length ? <span className="mb-muted" style={{ fontSize: 14 }}>Sin movimientos todavía.</span> : p.history.map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #1A2433", fontSize: 14, gap: 12 }}>
            <span>{h.actor === "Vos" ? `${MINE[h.action] ?? h.action} ${h.label.toLowerCase()} con ${coach}` : `${h.actor} ${HIST[h.action] ?? h.action} tu ${(ACCESS_ITEMS as Record<string, { phrase: string }>)[h.item]?.phrase ?? h.label}`}</span>
            <span className="mb-muted" style={{ fontSize: 12, flex: "none" }}>{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(h.at))}</span>
          </div>
        ))}
      </section>
      <MyCharges />
      <Wishes offline={offline} flash={flash} />
      <Settings unit={t.weightUnit ?? "kg"} offline={offline} flash={flash} onChanged={onSettings} />
      <MyData flash={flash} />
      <a className="ghost" href="/instalar" style={{ display: "grid", placeItems: "center" }}>Cómo agregar Repi a inicio</a>
      <a className="ghost" href="/cuenta?desde=/app" style={{ display: "grid", placeItems: "center" }}>Mi cuenta y seguridad</a>
      <a className="ghost" href="/ayuda?desde=/app" style={{ display: "grid", placeItems: "center" }}>Ayuda y soporte</a>
      <a className="ghost" href="/acceso?step=workspace" style={{ display: "grid", placeItems: "center" }}>Cambiar de espacio</a>
      <button type="button" className="ghost" onClick={logout}>Cerrar sesión</button>
    </>
  );
}

// Próxima sesión con el coach (F-HX-07, D98): confirmar, avisar que no puede o agregarla al calendario (.ics). Muestra la
// próxima agendada de los siguientes 14 días y las canceladas de los últimos 3 días, para que se entere.
type Appt = { id: string; startsAt: string; date: string; time: string; durationMin: number; modality: "presencial" | "online"; place: string | null; note: string | null;
  status: "scheduled" | "cancelled" | "done" | "no_show"; clientResponse: "pending" | "confirmed" | "declined"; cancelReason: string | null; coach: string };
function NextAppointment({ flash }: { flash: (m: string) => void }) {
  const [list, setList] = useState<Appt[] | null>(null);
  const load = useCallback(() => api<Appt[]>("/api/me/agenda").then(setList).catch(() => setList(null)), []);
  useEffect(() => { void load(); }, [load]);
  if (!list) return null;
  const now = Date.now();
  const show = list.filter((a) => (a.status === "scheduled" && new Date(a.startsAt).getTime() + a.durationMin * 60_000 > now && new Date(a.startsAt).getTime() - now < 14 * 86_400_000)
    || (a.status === "cancelled" && now - new Date(a.startsAt).getTime() < 3 * 86_400_000 && new Date(a.startsAt).getTime() > now - 86_400_000)).slice(0, 2);
  const when = (a: Appt) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" }).format(new Date(a.startsAt));
  const answer = async (a: Appt, response: "confirmed" | "declined") => {
    try { await api(`/api/me/agenda/${a.id}`, { body: { response } }); flash(response === "confirmed" ? "Confirmaste la sesión." : `Le avisamos a ${a.coach.split(" ")[0]} que no podés.`); void load(); }
    catch (e) { flash((e as Error).message); }
  };
  return (
    <>
      {show.map((a) => (
        <div key={a.id} className={`hbanner${a.status === "scheduled" ? " cyan" : ""}`} style={{ flexWrap: "wrap", cursor: "default" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: a.status === "cancelled" ? "#EF4444" : "#00D1FF", flex: "none" }} />
          <span>
            <b>{a.status === "cancelled" ? `Cancelada: sesión con ${a.coach.split(" ")[0]}` : `Sesión con ${a.coach.split(" ")[0]}`}</b>
            <small style={{ textTransform: "none" }}>{when(a)} · {a.durationMin} min · {a.modality === "online" ? "Online" : "Presencial"}{a.place ? ` · ${a.place}` : ""}</small>
            {a.status === "cancelled" && a.cancelReason && <small>Motivo: {a.cancelReason}</small>}
            {a.status === "scheduled" && a.clientResponse !== "pending" && <small>{a.clientResponse === "confirmed" ? "Confirmaste." : "Avisaste que no podés."}</small>}
          </span>
          {a.status === "scheduled" && (
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap", flexBasis: "100%", paddingLeft: 20 }}>
              {a.clientResponse !== "confirmed" && <button type="button" className="cta sm" style={{ height: 36 }} onClick={() => answer(a, "confirmed")}>Confirmar</button>}
              {a.clientResponse !== "declined" && <button type="button" className="ghost sm" style={{ height: 36 }} onClick={() => answer(a, "declined")}>No puedo</button>}
              <a className="ghost sm" style={{ height: 36, display: "inline-grid", placeItems: "center", padding: "0 12px" }} href={`/api/agenda/${a.id}/ics`}>Agregar al calendario</a>
            </span>
          )}
        </div>
      ))}
    </>
  );
}

// Objetivos acordados con el coach (F-HX-02, D97): sólo lectura, mismo cálculo que ve el coach. Sin objetivos, no se muestra
// nada inventado. Sin conexión no hay lista (se calcula en el servidor).
type MyGoal = { id: string; title: string; unit: string; target: number; baseline: number | null; current: number | null; progress: number | null;
  source: string; dueOn: string | null; status: "active" | "achieved" | "cancelled"; by: string; manualAt: string | null };
function MyGoals() {
  const [g, setG] = useState<MyGoal[] | null>(null);
  useEffect(() => { api<MyGoal[]>("/api/me/goals").then(setG).catch(() => setG(null)); }, []);
  if (!g?.length) return null;
  const n = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2>Objetivos</h2>
      {g.map((x) => {
        const pct = x.progress == null ? null : Math.round(x.progress * 100);
        return (
          <div key={x.id} className="goal">
            <span className="goal-top"><b>{x.title}</b>{x.status === "achieved" ? <span className="pill-cyan">Logrado</span> : x.status === "cancelled" ? <small className="mb-muted">Cancelado</small> : null}</span>
            <span className="goal-bar" role="img" aria-label={pct == null ? "Sin datos para calcular el avance" : `Avance ${pct}%`}><i style={{ width: `${pct ?? 0}%` }} /></span>
            <small className="mb-muted">{x.current == null ? "Datos insuficientes todavía" : `${n(x.current)} de ${n(x.target)} ${x.unit} · ${pct}%`}{x.baseline != null ? ` · desde ${n(x.baseline)}` : ""}{x.dueOn ? ` · plazo ${day(x.dueOn)}` : ""}</small>
            <small className="mb-muted">Acordado con {x.by.split(" ")[0]}. {x.source}</small>
          </div>
        );
      })}
    </section>
  );
}

// Configuración (F-HX-23, D95): unidad de peso. Sólo cambia cómo se ve y se carga; lo registrado sigue igual (en kg).
function Settings({ unit, offline, flash, onChanged }: { unit: WeightUnit; offline: boolean; flash: (m: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const pick = async (u: WeightUnit) => {
    if (u === unit || busy) return;
    if (offline) { flash("Necesitás conexión para cambiar la unidad."); return; }
    setBusy(true);
    try { await api("/api/me/settings", { body: { weightUnit: u } }); flash(u === "kg" ? "Ahora ves los pesos en kilos." : "Ahora ves los pesos en libras."); onChanged(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 16 }}>Configuración</h2>
      <div className="unitseg" role="radiogroup" aria-label="Unidad de peso" aria-busy={busy || undefined}>
        {(["kg", "lb"] as const).map((u) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => pick(u)}>{u === "kg" ? "Kilos (kg)" : "Libras (lb)"}</button>
        ))}
      </div>
      <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Cambia cómo ves y cargás los pesos. Tus registros no se modifican; tu coach los sigue viendo en kg.</span>
    </section>
  );
}

// Derechos sobre los datos propios (F-PR-02, D75): copia descargable y pedido de eliminación que REPI revisa.
type PrivacyReq = { id: string; status: "pending" | "done" | "rejected" | "cancelled"; createdAt: string; resolution: string | null };
function MyData({ flash }: { flash: (m: string) => void }) {
  const [reqs, setReqs] = useState<PrivacyReq[] | null>(null);
  const load = useCallback(() => api<PrivacyReq[]>("/api/me/deletion").then(setReqs).catch(() => setReqs([])), []);
  useEffect(() => { void load(); }, [load]);
  const pending = reqs?.find((r) => r.status === "pending");
  const ask = async () => {
    if (!window.confirm("¿Pedir que eliminen tu cuenta? REPI lo revisa antes de borrar y algunos registros pueden conservarse el tiempo que exija la ley. Podés cancelarlo mientras esté pendiente.")) return;
    try { await api("/api/me/deletion", { body: {} }); flash("Pedido registrado. REPI lo revisa y te avisa."); void load(); } catch (e) { flash((e as Error).message); }
  };
  const cancel = async (id: string) => {
    try { await api(`/api/me/deletion/${id}`, { method: "DELETE" }); flash("Cancelaste el pedido de eliminación."); void load(); } catch (e) { flash((e as Error).message); }
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 16 }}>Tus datos</h2>
      <span className="mb-muted" style={{ fontSize: 14, lineHeight: 1.45 }}>Descargá una copia de lo que cargaste y de lo que se registró sobre vos.</span>
      <a className="ghost" href="/api/me/export" download style={{ display: "grid", placeItems: "center" }}>Descargar mis datos</a>
      {pending ? (
        <>
          <span className="mb-muted" role="status" style={{ fontSize: 14, lineHeight: 1.45 }}>
            Pediste eliminar tu cuenta el {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(new Date(pending.createdAt))}. REPI lo revisa; mientras tanto podés seguir usando la app.
          </span>
          <button type="button" className="ghost" onClick={() => cancel(pending.id)}>Cancelar el pedido</button>
        </>
      ) : reqs && <button type="button" className="ghost" onClick={ask}>Pedir que eliminen mi cuenta</button>}
    </section>
  );
}

// F-CL-14: aviso de programa nuevo o actualizado, con autor; la versión anterior queda consultable.
// Visto por versión en este teléfono (no es un dato de salud ni privado de otra persona).
type PrevVersion = { number: number; name: string; createdAt: string; days: { name: string; exercises: { name: string; sets: number; reps: string; rir: number | null; restSec: number }[] }[] };
function ProgramNotice({ u, version, name, offline, flash }: { u: ProgramUpdate; version: number; name: string; offline: boolean; flash: (m: string) => void }) {
  const key = `repi_prog_seen:${u.key}`;
  const [seen, setSeen] = useState(true);
  const [prev, setPrev] = useState<PrevVersion | null>(null);
  useEffect(() => { try { setSeen(localStorage.getItem(key) === "1"); } catch { setSeen(false); } }, [key]);
  const done = () => { try { localStorage.setItem(key, "1"); } catch { /* */ } setSeen(true); };
  const open = async () => { try { setPrev(await api<PrevVersion>("/api/me/training/previous")); } catch (e) { flash((e as Error).message); } };
  if (seen && !prev) return null;
  const who = u.author?.split(" ")[0] ?? "Tu coach";
  const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(u.at));
  return (
    <>
      {!seen && (
        <div className="hbanner cyan" style={{ flexWrap: "wrap" }} role="status">
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "#00D1FF", flex: "none" }} />
          <span><b>{u.kind === "new" ? `${who} te asignó «${name}»` : `${who} actualizó tu programa`}</b>
            <small>{u.kind === "new" ? when : `Versión ${version} · ${when}${u.reason ? ` · ${u.reason}` : ""}`}</small></span>
          <span style={{ display: "flex", gap: 6 }}>
            {u.kind === "updated" && u.hasPrevious && !offline && <button type="button" className="ghost sm" style={{ height: 36 }} onClick={open}>Ver anterior</button>}
            <button type="button" className="cta sm" style={{ height: 36 }} onClick={done}>Ok</button>
          </span>
        </div>
      )}
      {prev && (
        <Sheet title={`Versión ${prev.number} · ${prev.name}`} sub={`Hasta el ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(new Date(u.at))}. Sólo para consultar: entrenás con la versión ${version}.`} onClose={() => setPrev(null)}>
          {prev.days.map((d) => (
            <div key={d.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b style={{ fontSize: 15 }}>{d.name}</b>
              {d.exercises.map((e, i) => <span key={i} className="mb-muted" style={{ fontSize: 14 }}>{e.name} · {e.sets} × {e.reps}{e.rir != null ? ` · RIR ${e.rir}` : ""}</span>)}
            </div>
          ))}
        </Sheet>
      )}
    </>
  );
}

// F-HX-06: lo que tu coach registró que le pagaste o le debés. Registro manual del coach; REPI no cobra.
type MyCharge = { id: string; concept: string; amountMinor: number; currency: string; dueOn: string; status: "pending" | "paid" | "void"; overdue: boolean; paidOn: string | null };
function MyCharges() {
  const [d, setD] = useState<{ coaches: { coach: string; charges: MyCharge[] }[] } | null>(null);
  useEffect(() => { api<{ coaches: { coach: string; charges: MyCharge[] }[] }>("/api/me/charges").then(setD).catch(() => setD(null)); }, []);
  if (!d?.coaches.length) return null;
  const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 16 }}>Pagos con tu coach</h2>
      <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Lo registra tu coach. REPI no cobra ni procesa estos pagos.</span>
      {d.coaches.map((c) => c.charges.map((x) => (
        <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #1A2433", fontSize: 14 }}>
          <span>{x.concept}<small className="mb-muted" style={{ display: "block", fontSize: 12 }}>{c.coach} · vence {day(x.dueOn)}</small></span>
          <span style={{ textAlign: "right", flex: "none" }}>{fmtMoney(x.amountMinor, x.currency as Currency)}
            <small style={{ display: "block", fontSize: 12, color: x.status === "paid" ? "#5DE6D8" : x.status === "void" ? "#8A9BB0" : x.overdue ? "#FCA5A5" : "#F59E0B" }}>
              {x.status === "paid" ? `Pagado${x.paidOn ? ` ${day(x.paidOn)}` : ""}` : x.status === "void" ? "Anulado" : x.overdue ? "Vencido" : "Pendiente"}</small></span>
        </div>
      )))}
    </section>
  );
}
