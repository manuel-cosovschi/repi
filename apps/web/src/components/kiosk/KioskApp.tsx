"use client";
// REPI Control (D213 · D216): pantalla de rutinas del gimnasio. Bienvenida → código y PIN → elegir: consultar la rutina o registrar
// el entrenamiento → terminar. Consultar muestra el programa con las tres capas (profesor, REPI, última vez); registrar anota lo
// que la persona hizo, ejercicio por ejercicio, en el mismo entrenamiento que ve la app. La prescripción no se cambia desde acá.
// El secreto del equipo llega una vez en el fragmento (#k=…) y queda en este equipo; la consulta de cada persona (token, vista,
// borradores) vive sólo en la memoria de esta página y se borra al terminar, por inactividad, al ocultar la pestaña o cuando el
// servidor la da por vencida. No hay enlaces a otras partes de REPI: la pantalla no sirve para navegar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { ConsultExercise, RegisterPanel, mergeDrafts, problemOf, setsOf, uuid, type Ex, type RowDraft, type Workout, type WEx } from "./KioskTraining";

const KEY = "repi-routine-kiosk";
const DEMO_KEY = "repi-routine-kiosk-demo";
const read = (k: string, s: Storage | null) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const write = (k: string, v: string | null, s: Storage | null) => { try { if (!s) return; if (v) s.setItem(k, v); else s.removeItem(k); } catch { /* sin almacenamiento */ } };
const ls = () => (typeof window === "undefined" ? null : window.localStorage);
const ss = () => (typeof window === "undefined" ? null : window.sessionStorage);

type Hello = { gym: string; location: string; screen: string; idleSec: number; demo: boolean };
type Program = { name: string; note: string | null; weeks: number | null; version: number; updatedAt: string; startsOn: string; canLog: boolean; nextDay: number; days: { name: string; exercises: Ex[] }[] };
type OpenWorkout = { id: string; dayName: string; startedAt: string; sets: number };
type View = { person: { firstName: string; initial: string }; gym: string; expiresAt: string; idleSec: number; workout: OpenWorkout | null; otherOpen: boolean; program: Program | null };
type SaveRes = { results: { setIndex: number; status: "ok" | "conflict" | "skipped" | "not_done"; id?: string; revision?: number }[]; exercise: Ex | null; done: number; total: number };
type DemoPerson = { name: string; code: string; pin: string; note: string };
type Step = "loading" | "unauthorized" | "off" | "welcome" | "code" | "pin" | "choice" | "program" | "days" | "workout" | "exercise" | "bye";
type Res<T> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string };
type Msg = { tone: "ok" | "err" | "warn"; text: string };

/** Pasos con una persona identificada (o identificándose): corre el cierre por inactividad. */
const PERSON: Step[] = ["code", "pin", "choice", "program", "days", "workout", "exercise"];
const IDLE_WARN = 15;
const IDLE_NOTE = "Se cerró por inactividad. Lo que no confirmaste no se guardó.";
const OVER_NOTE = "Tu consulta terminó. Lo que no confirmaste no se guardó: identificate de nuevo para seguir.";
const NET_SAVE = "No se guardó. Revisá la conexión y tocá Reintentar.";
const day = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const loggedCount = (w: Workout) => w.exercises.reduce((n, x) => n + x.rows.filter((r) => r.logged).length, 0);

async function call<T>(path: string, secret: string, init: RequestInit & { token?: string } = {}): Promise<Res<T>> {
  try {
    const r = await fetch(`/api/kiosk/${path}`, {
      method: init.method ?? "GET", cache: "no-store", body: init.body,
      headers: { "x-repi-kiosk": secret, ...(init.token ? { "x-repi-kiosk-session": init.token } : {}), ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, code: j.code ?? String(r.status), error: j.error ?? "No pudimos conectarnos. Probá de nuevo." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, code: "network", error: "Sin conexión. Revisá el wifi de la pantalla y probá de nuevo." };
  }
}

export function KioskApp({ appUrl }: { appUrl: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [hello, setHello] = useState<Hello | null>(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(60);
  const [demo, setDemo] = useState<DemoPerson[]>([]);
  const [bye, setBye] = useState<{ title: string; text: string } | null>(null);
  // Todo lo de la persona (se borra entero en `wipe`).
  const [view, setView] = useState<View | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [pick, setPick] = useState(0);
  const [wk, setWk] = useState<Workout | null>(null);
  const [exId, setExId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft[]>>({});
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(false);
  const [note, setNote] = useState<Msg | null>(null);
  const [panelMsg, setPanelMsg] = useState<Msg | null>(null);
  const [askFinish, setAskFinish] = useState(false);
  const token = useRef<string | null>(null);
  const startOp = useRef<string | null>(null);
  const lastTouch = useRef(Date.now());
  const lastCall = useRef(Date.now());
  const main = useRef<HTMLDivElement>(null);

  // Secreto del equipo: del fragmento (una vez) o de este equipo. Las personas demo, sólo en esta pestaña.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const k = h.get("k");
    const d = h.get("d");
    if (k) write(KEY, k, ls());
    if (d) write(DEMO_KEY, d, ss());
    if (k || d) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const s = k ?? read(KEY, ls());
    const dd = d ?? read(DEMO_KEY, ss());
    if (dd) {
      try { setDemo(JSON.parse(decodeURIComponent(atob(dd))) as DemoPerson[]); } catch { /* demo inválida: se ignora */ }
    }
    setSecret(s);
    if (!s) setStep("unauthorized");
  }, []);

  const loadHello = useCallback(async (s: string) => {
    const r = await call<Hello>("hello", s);
    if (r.ok) { setHello(r.data); setLeft(r.data.idleSec); setStep((x) => (x === "loading" || x === "off" ? "welcome" : x)); return; }
    if (r.status === 401) { write(KEY, null, ls()); setSecret(null); setStep("unauthorized"); return; }
    if (r.code === "kiosk_off") { setStep("off"); setMsg(r.error); return; }
    setMsg(r.error);
    setStep((x) => (x === "loading" ? "off" : x));
  }, []);
  useEffect(() => { if (secret) void loadHello(secret); }, [secret, loadHello]);
  // Si la pantalla quedó sin servicio, vuelve a probar sola cada 30 s.
  useEffect(() => {
    if (step !== "off" || !secret) return;
    const t = setInterval(() => void loadHello(secret), 30_000);
    return () => clearInterval(t);
  }, [step, secret, loadHello]);

  // Pantalla encendida mientras está autorizada.
  useEffect(() => {
    if (!secret) return;
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* no disponible */ } };
    void ask();
    const again = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); void lock?.release().catch(() => {}); };
  }, [secret]);

  /** Borra todo lo de la persona: vista, entrenamiento, borradores, ids, paneles abiertos y la posición de la página. */
  const wipe = useCallback(() => {
    token.current = null; startOp.current = null;
    setView(null); setWk(null); setExId(null); setDrafts({}); setSaving(false); setRetry(false); setNote(null); setPanelMsg(null); setAskFinish(false);
    setCode(""); setPin(""); setDayIdx(0); setPick(0); setBusy(false);
    try { window.scrollTo(0, 0); } catch { /* sin ventana */ }
  }, []);

  /** Cierra la consulta: avisa al servidor (salvo que ya la haya cerrado) y limpia todo lo de la persona. */
  const finish = useCallback(async (reason: "done" | "idle" | "over", o: { note?: string; bye?: { title: string; text: string } } = {}) => {
    const t = token.current;
    wipe();
    setMsg(o.note ?? null);
    setBye(o.bye ?? null);
    if (t && secret && reason !== "over") void call("end", secret, { method: "POST", token: t, body: JSON.stringify({ reason: reason === "idle" ? "idle" : "done" }) });
    setStep(reason === "done" ? "bye" : "welcome");
  }, [secret, wipe]);
  useEffect(() => {
    if (step !== "bye") return;
    const t = setTimeout(() => { setStep("welcome"); setMsg(null); setBye(null); }, bye ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [step, bye]);

  /** Pedido con la consulta abierta. Resuelve acá lo que corta la consulta (pantalla revocada, consulta vencida, kiosco apagado). */
  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<Res<T> & { handled?: boolean }> => {
    if (!secret || !token.current) return { ok: false, status: 401, code: "session_over", error: OVER_NOTE, handled: true };
    lastCall.current = Date.now();
    const r = await call<T>(path, secret, { ...init, token: token.current });
    if (r.ok) return r;
    if (r.status === 401 && r.code === "invalid_kiosk") { wipe(); write(KEY, null, ls()); setSecret(null); setStep("unauthorized"); return { ...r, handled: true }; }
    if (r.status === 401) { void finish("over", { note: OVER_NOTE }); return { ...r, handled: true }; }
    if (r.code === "kiosk_off") { wipe(); setMsg(r.error); setStep("off"); return { ...r, handled: true }; }
    return r;
  }, [secret, wipe, finish]);

  // Inactividad: cualquier toque o tecla reinicia el contador; a los 15 s aparece el aviso y al llegar a 0 se cierra.
  const idleSec = hello?.idleSec ?? 60;
  const touch = useCallback(() => { lastTouch.current = Date.now(); setLeft(idleSec); }, [idleSec]);
  const live = PERSON.includes(step);
  useEffect(() => {
    if (!live) return;
    lastTouch.current = Date.now();
    const t = setInterval(() => {
      const l = Math.max(0, idleSec - Math.floor((Date.now() - lastTouch.current) / 1000));
      setLeft(l);
      if (l <= 0) void finish("idle", { note: token.current ? IDLE_NOTE : "Se cerró por inactividad." });
    }, 500);
    return () => clearInterval(t);
  }, [live, idleSec, finish]);
  useEffect(() => {
    if (!live) return;
    const k = () => touch();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [live, touch]);
  // Mientras la persona usa la pantalla sin pedir nada al servidor (cargando series), la consulta se mantiene viva.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (!token.current || Date.now() - lastCall.current < 150_000 || Date.now() - lastTouch.current > idleSec * 1000) return;
      void api("workout");
    }, 30_000);
    return () => clearInterval(t);
  }, [live, idleSec, api]);
  // Si alguien cambia de pestaña o la pantalla se oculta, la consulta se cierra. Al cerrar la pestaña el token se pierde con la
  // memoria de la página (nunca se guardó) y el servidor la da por vencida a los pocos minutos.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden" && token.current) void finish("idle"); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [finish]);
  // El foco va al título de cada paso (lectores de pantalla y teclado) y la página vuelve arriba.
  useEffect(() => {
    main.current?.querySelector<HTMLElement>("h1")?.focus();
    try { window.scrollTo(0, 0); } catch { /* sin ventana */ }
  }, [step, exId]);

  const identify = async (pinValue = pin) => {
    if (!secret || busy) return;
    setBusy(true); setMsg(null);
    const r = await call<{ token: string; idleSec: number }>("identify", secret, { method: "POST", body: JSON.stringify({ code, pin: pinValue }) });
    if (!r.ok) {
      setBusy(false); setPin("");
      if (r.status === 401 && r.code === "invalid_kiosk") { write(KEY, null, ls()); setSecret(null); setStep("unauthorized"); return; }
      if (r.code === "kiosk_off") { setStep("off"); setMsg(r.error); return; }
      setMsg(r.error);
      if (r.code === "bad_credentials" || r.code === "code_locked") { setCode(""); setStep("code"); }
      return;
    }
    token.current = r.data.token;
    const p = await api<View>("program");
    setBusy(false); setCode(""); setPin("");
    if (!p.ok) { if (!p.handled) { token.current = null; setMsg(p.error); setStep("welcome"); } return; }
    setView(p.data); setDayIdx(p.data.program?.canLog ? p.data.program.nextDay : 0);
    setStep(p.data.program ? "choice" : "program"); touch();
  };

  // Con el sexto número del código pasa sola al PIN; si alguien sigue tocando rápido, esos números ya son del PIN.
  const press = (d: string) => {
    touch(); setMsg(null);
    if (step === "code" && code.length < 6) {
      const v = code + d;
      setCode(v);
      if (v.length === 6) setStep("pin");
    } else if (step === "pin" || step === "code") {
      if (step === "code") setStep("pin");
      setPin((p) => (p + d).slice(0, 6));
    }
  };
  const back = () => { touch(); if (step === "code") setCode((c) => c.slice(0, -1)); else setPin((p) => p.slice(0, -1)); };
  // Teclado físico (monitor con teclado o lector).
  useEffect(() => {
    if (step !== "code" && step !== "pin") return;
    const k = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
      else if (e.key === "Enter" && step === "pin" && pin.length >= 4) { e.preventDefault(); void identify(); }
      else if (e.key === "Escape") { e.preventDefault(); void finish("idle"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // ── Registrar ────────────────────────────────────────────────────────────
  /** Lo que pasa cuando el entrenamiento dejó de estar abierto (terminado en la app, por ejemplo). */
  const closedElsewhere = (text: string) => {
    setWk(null); setExId(null); setDrafts({}); setAskFinish(false);
    setView((v) => v && { ...v, workout: null });
    setNote({ tone: "warn", text }); setStep("choice");
  };
  const openWorkout = (w: Workout) => {
    setWk(w);
    setView((v) => v && { ...v, workout: { id: w.id, dayName: w.dayName, startedAt: w.startedAt, sets: loggedCount(w) }, otherOpen: false });
    setStep("workout");
  };
  const register = async () => {
    if (!view?.program || busy) return;
    setNote(null);
    if (!view.workout) { setPick(view.program.nextDay); setStep("days"); return; }
    setBusy(true);
    const r = await api<{ workout: Workout | null; otherOpen: boolean }>("workout");
    setBusy(false);
    if (!r.ok) { if (!r.handled) setNote({ tone: "err", text: r.error }); return; }
    if (r.data.workout) { openWorkout(r.data.workout); return; }
    setView((v) => v && { ...v, workout: null, otherOpen: r.data.otherOpen });
    if (r.data.otherOpen) { setNote({ tone: "warn", text: "Tenés otro entrenamiento abierto en la app. Terminalo ahí para registrar en esta pantalla." }); return; }
    setPick(view.program.nextDay); setStep("days");
  };
  const start = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    // Un id por intento: si se corta la red y la persona reintenta, el servidor devuelve el mismo entrenamiento.
    startOp.current ??= uuid();
    const r = await api<{ workout: Workout; resumed: boolean }>("workout", { method: "POST", body: JSON.stringify({ opId: startOp.current, dayIndex: pick }) });
    setBusy(false);
    if (!r.ok) {
      if (r.handled) return;
      if (r.code === "other_open") { startOp.current = null; setView((v) => v && { ...v, otherOpen: true }); setNote({ tone: "warn", text: r.error }); setStep("choice"); return; }
      setNote({ tone: "err", text: r.status === 0 ? "No pudimos empezar: revisá la conexión y tocá «Empezar» de nuevo." : r.error });
      return;
    }
    startOp.current = null;
    const chosen = view?.program?.days[pick]?.name;
    if (r.data.resumed && chosen && r.data.workout.dayName !== chosen) setNote({ tone: "warn", text: `Ya tenías abierto «${r.data.workout.dayName}»: seguís con ese.` });
    openWorkout(r.data.workout);
  };
  const curEx: WEx | null = (exId && wk?.exercises.find((x) => x.id === exId)) || null;
  const openEx = (x: WEx) => {
    touch(); setNote(null); setPanelMsg(null); setRetry(false);
    setDrafts((d) => ({ ...d, [x.id]: mergeDrafts(x, d[x.id]) }));
    setExId(x.id); setStep("exercise");
  };
  const update = useCallback((i: number, f: (d: RowDraft) => RowDraft) => {
    setPanelMsg(null);
    setDrafts((all) => { if (!exId || !all[exId]) return all; const rows = all[exId].slice(); rows[i] = f(rows[i]); return { ...all, [exId]: rows }; });
  }, [exId]);
  const setAll = useCallback((f: (ds: RowDraft[]) => RowDraft[]) => {
    setPanelMsg(null);
    setDrafts((all) => (exId && all[exId] ? { ...all, [exId]: f(all[exId]) } : all));
  }, [exId]);
  const confirmEx = async () => {
    if (!wk || !curEx || saving) return;
    const rows = drafts[curEx.id] ?? mergeDrafts(curEx);
    const problem = problemOf(curEx, rows);
    if (problem) { setPanelMsg({ tone: "err", text: problem }); return; }
    const sets = setsOf(curEx, rows);
    if (!sets.length) { setStep("workout"); return; }
    setSaving(true); setPanelMsg(null);
    const r = await api<SaveRes>("workout/sets", { method: "POST", body: JSON.stringify({ sessionId: wk.id, programExerciseId: curEx.id, sets }) });
    setSaving(false);
    if (!r.ok) {
      if (r.handled) return;
      if (r.code === "workout_closed") { closedElsewhere(r.error); return; }
      if (r.status === 0) { setRetry(true); setPanelMsg({ tone: "err", text: NET_SAVE }); return; }
      setPanelMsg({ tone: "err", text: r.error });
      return;
    }
    setRetry(false);
    const res = r.data;
    const nx = res.exercise;
    const conflict = new Set(res.results.filter((x) => x.status === "conflict").map((x) => x.setIndex));
    const notDone = new Set(res.results.filter((x) => x.status === "not_done").map((x) => x.setIndex));
    const ok = res.results.filter((x) => x.status === "ok").length;
    const skipped = res.results.filter((x) => x.status === "skipped" || x.status === "not_done").length;
    if (nx) {
      const fresh = { ...nx, skippedToday: curEx.skippedToday };
      const next = mergeDrafts(fresh, rows.map((d, i) => (conflict.has(i) ? undefined : notDone.has(i) ? d : { ...d, touched: false, edit: false })) as RowDraft[]);
      // Lo que la persona marcó como no hecho se mantiene así en esta pantalla (una serie principal sin hacer no se guarda).
      notDone.forEach((i) => { if (next[i] && !fresh.rows[i]?.logged) next[i] = { ...next[i], skip: true, touched: true }; });
      setDrafts((all) => ({ ...all, [curEx.id]: next }));
      const nw = { ...wk, done: res.done, total: res.total, exercises: wk.exercises.map((x) => (x.id === curEx.id ? fresh : x)) };
      setWk(nw);
      setView((v) => (v?.workout ? { ...v, workout: { ...v.workout, sets: loggedCount(nw) } } : v));
    }
    if (conflict.size) {
      const labels = curEx.rows.filter((x) => conflict.has(x.setIndex)).map((x) => `«${x.label}»`).join(", ");
      setPanelMsg({ tone: "warn", text: `Esta serie cambió desde la app; revisala: ${labels}.${ok ? ` Las demás quedaron guardadas (${plural(ok, "serie", "series")}).` : ""}` });
      return;
    }
    setNote({ tone: "ok", text: ok ? `Guardado ✓ ${plural(ok, "serie", "series")} de ${curEx.name}${skipped ? ` · ${skipped} sin hacer` : ""}.` : `Listo: ${curEx.name} quedó con ${plural(skipped, "serie", "series")} sin hacer.` });
    setExId(null); setStep("workout");
  };
  const finishWorkout = async () => {
    if (!wk || busy) return;
    setBusy(true);
    const r = await api<{ status: string; hadSets: boolean }>("workout/finish", { method: "POST", body: JSON.stringify({ sessionId: wk.id }) });
    setBusy(false);
    if (!r.ok) {
      if (r.handled) return;
      setAskFinish(false);
      if (r.code === "workout_closed") { closedElsewhere(r.error); return; }
      setNote({ tone: "err", text: r.status === 0 ? "No pudimos terminarlo: revisá la conexión y probá de nuevo." : r.error });
      return;
    }
    const n = loggedCount(wk);
    void finish("done", { bye: r.data.hadSets
      ? { title: "Entrenamiento terminado", text: `Guardamos ${plural(n, "serie", "series")} de ${wk.dayName}. Lo ves en tu historial y en la app. La pantalla queda libre.` }
      : { title: "Entrenamiento descartado", text: "No tenía series registradas, así que no quedó en tu historial. La pantalla queda libre." } });
  };
  const leave = () => void finish("done", { bye: { title: "Tu entrenamiento queda abierto", text: "Tu entrenamiento queda abierto: seguí en esta pantalla o en la app. Tu consulta se cerró y la pantalla queda libre." } });
  const toChoice = () => { setNote(null); setExId(null); setStep("choice"); };

  // Avisos que se superponen: el foco va al aviso y, al cerrarlo, vuelve a donde estaba.
  const warn = live && left <= IDLE_WARN;
  const idleBtn = useRef<HTMLButtonElement>(null);
  const finH = useRef<HTMLHeadingElement>(null);
  const before = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (warn) { before.current = document.activeElement as HTMLElement | null; idleBtn.current?.focus({ preventScroll: true }); return; }
    const b = before.current; before.current = null;
    if (b && b.isConnected && document.activeElement === document.body) b.focus({ preventScroll: true });
  }, [warn]);
  useEffect(() => { if (askFinish) finH.current?.focus(); }, [askFinish]);

  const appQr = useMemo(() => renderSVG(`${appUrl}/instalar?src=pantalla`, { border: 1, ecc: "M" }), [appUrl]);
  const cur = view?.program?.days[dayIdx] ?? null;
  const who = view ? `${view.person.firstName} ${view.person.initial}`.trim() : "";

  if (step === "loading") return <div className="kq" aria-busy="true"><p className="kq-muted">Cargando…</p></div>;
  if (step === "unauthorized") return (
    <div className="kq" ref={main}>
      <div className="kq-center">
        <span className="kq-brand">REPI</span>
        <h1 tabIndex={-1}>Pantalla de rutinas</h1>
        <p className="kq-lead">Esta pantalla no está autorizada. En REPI, el dueño o la gerencia del gimnasio entra a <b>Pantalla de rutinas</b>, registra una para esta sede y abre el enlace en este equipo.</p>
        <p className="kq-muted">El enlace se usa una vez por equipo y se puede revocar en cualquier momento.</p>
      </div>
    </div>
  );
  if (step === "off") return (
    <div className="kq" ref={main}>
      <div className="kq-center">
        <span className="kq-brand">REPI</span>
        <h1 tabIndex={-1}>Pantalla no disponible</h1>
        <p className="kq-lead">{msg ?? "La pantalla de rutinas no está disponible en este momento."}</p>
        <p className="kq-muted">Pedí ayuda en recepción. Volvemos a probar solos en unos segundos.</p>
      </div>
    </div>
  );

  return (
    <div className="kq" ref={main} onPointerDown={touch}>
      <header className="kq-top">
        <span className="kq-brand" aria-hidden="true">REPI</span>
        <span className="kq-where">{hello ? `${hello.gym} · ${hello.location}` : ""}</span>
        {hello?.demo && <span className="kq-demo" role="note">Demo · datos ficticios</span>}
        {live && !warn && <span className="kq-idle" aria-live="off">Cierre automático en {left} s</span>}
      </header>

      {step === "welcome" && (
        <main className="kq-welcome">
          <section className="kq-hero">
            <h1 tabIndex={-1}>Tu rutina,<br />tu registro</h1>
            <p className="kq-lead">La planifica el equipo de {hello?.gym ?? "tu gimnasio"}. Consultala y anotá lo que hiciste, sin instalar nada: con tu código de socio y tu PIN.</p>
            {msg && <p className="kq-info" role="status">{msg}</p>}
            <button type="button" className="kq-primary" onClick={() => { setMsg(null); setCode(""); setPin(""); setStep("code"); }}>Empezar</button>
            <p className="kq-muted">¿No tenés código? Pedíselo a recepción.</p>
          </section>
          <div className="kq-side">
          <aside className="kq-app" aria-label="REPI en tu celular (opcional)">
            <div className="kq-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: appQr }} />
            <div>
              <strong>Opcional: tu rutina en el celular</strong>
              <p>Escaneá para usar REPI en tu teléfono. No es el QR de ingreso al gimnasio.</p>
            </div>
          </aside>
          {demo.length > 0 && (
            <aside className="kq-demo-guide" aria-label="Personas de la demo">
              <strong>Probá con estas personas ficticias</strong>
              <ul>{demo.map((p) => <li key={p.code}><b>{p.name}</b> · código <code>{p.code}</code> · PIN <code>{p.pin}</code><small>{p.note}</small></li>)}</ul>
            </aside>
          )}
          </div>
        </main>
      )}

      {(step === "code" || step === "pin") && (
        <main className="kq-id">
          <section className="kq-id-text">
            <h1 tabIndex={-1}>{step === "code" ? "Tu código de socio" : "Tu PIN"}</h1>
            <p className="kq-lead">{step === "code" ? "Son 6 números. Te lo da recepción y lo ves en la app, si la usás." : "Son 4 a 6 números. Nadie más lo ve: se muestran puntos."}</p>
            <div className="kq-digits" aria-live="polite" aria-label={step === "code" ? `Código: ${code.length} de 6 números` : `PIN: ${pin.length} números`}>
              {step === "code"
                ? Array.from({ length: 6 }, (_, i) => <span key={i} className={i < code.length ? "on" : ""}>{code[i] ?? ""}</span>)
                : Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? "on dot" : ""}>{i < pin.length ? "•" : ""}</span>)}
            </div>
            {msg && <p className="kq-err" role="alert">{msg}</p>}
            <div className="kq-row">
              <button type="button" className="kq-ghost" onClick={() => void finish("idle")}>Cancelar</button>
              {step === "pin" && <button type="button" className="kq-ghost" onClick={() => { setPin(""); setStep("code"); }}>Cambiar código</button>}
            </div>
          </section>
          <section className="kq-pad" aria-label="Teclado numérico">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => press(d)} disabled={busy}>{d}</button>)}
            <button type="button" className="kq-pad-aux" onClick={back} disabled={busy} aria-label="Borrar el último número">Borrar</button>
            <button type="button" onClick={() => press("0")} disabled={busy}>0</button>
            {step === "pin"
              ? <button type="button" className="kq-pad-ok" onClick={() => void identify()} disabled={busy || pin.length < 4} aria-busy={busy || undefined}>{busy ? "…" : "Ver"}</button>
              : <button type="button" className="kq-pad-ok" onClick={() => setStep("pin")} disabled={code.length !== 6}>Seguir</button>}
          </section>
        </main>
      )}

      {step === "choice" && view?.program && (
        <main className="kq-choice">
          <section className="kq-prog-head">
            <div>
              <p className="kq-eyebrow">{view.program.name}</p>
              <h1 tabIndex={-1}>Hola, {who}</h1>
              <p className="kq-meta">Planificado por el equipo de {view.gym} · versión {view.program.version}</p>
            </div>
            <button type="button" className="kq-end" onClick={() => void finish("done")}>Terminar</button>
          </section>
          {note && <p className={`kq-note-msg ${note.tone}`} role="status">{note.text}</p>}
          <div className="kq-choices">
            <button type="button" className="kq-choice-btn" onClick={() => { setNote(null); setStep("program"); }}>
              <span className="t">Consultar mi rutina</span>
              <span className="s">Tus días y ejercicios, con lo que indicó tu profe, lo que sugiere REPI y tu última vez.</span>
            </button>
            {view.otherOpen ? (
              <div className="kq-choice-off" role="note">
                <span className="t">Registrar no está disponible acá</span>
                <span className="s">Tenés otro entrenamiento abierto en la app. Terminalo ahí para registrar en esta pantalla. Consultar tu rutina sigue disponible.</span>
              </div>
            ) : !view.program.canLog ? (
              <div className="kq-choice-off" role="note">
                <span className="t">Registrar, desde el {day(`${view.program.startsOn}T12:00:00Z`)}</span>
                <span className="s">Tu programa empieza ese día. Mientras tanto, podés consultarlo.</span>
              </div>
            ) : (
              <button type="button" className="kq-choice-btn live" onClick={() => void register()} disabled={busy} aria-busy={busy || undefined}>
                <span className="t">{view.workout ? "Seguir mi entrenamiento" : "Registrar mi entrenamiento"}</span>
                <span className="s">{view.workout ? `${view.workout.dayName} · ${plural(view.workout.sets, "serie registrada", "series registradas")}` : "Anotá peso y repeticiones de lo que hiciste. Nada se guarda hasta que confirmes."}</span>
              </button>
            )}
          </div>
          <p className="kq-foot">En esta pantalla consultás tu rutina y registrás lo que hiciste. El programa lo cambia sólo el equipo de sala.</p>
        </main>
      )}

      {step === "program" && view && (
        <main className="kq-prog">
          <section className="kq-prog-head">
            <div>
              <p className="kq-eyebrow">Hola, {who}</p>
              <h1 tabIndex={-1}>{view.program ? view.program.name : "Todavía no tenés programa"}</h1>
              {view.program && (
                <p className="kq-meta">Planificado por el equipo de {view.gym} · versión {view.program.version} · actualizado el {day(view.program.updatedAt)}{view.program.weeks ? ` · ${view.program.weeks} semanas` : ""}</p>
              )}
            </div>
            <div className="kq-row kq-head-actions">
              {view.program && <button type="button" className="kq-ghost" onClick={toChoice}>Volver</button>}
              <button type="button" className="kq-end" onClick={() => void finish("done")}>Terminar</button>
            </div>
          </section>
          {!view.program ? (
            <section className="kq-empty">
              <p className="kq-lead">Tu gimnasio todavía no te asignó un programa. Pedíselo al equipo de sala: cuando lo carguen, lo vas a ver acá y en la app.</p>
            </section>
          ) : (
            <>
              {view.program.note && <p className="kq-note"><b>Indicaciones:</b> {view.program.note}</p>}
              <nav className="kq-days" role="tablist" aria-label="Días del programa">
                {view.program.days.map((d, i) => (
                  <button key={i} type="button" role="tab" id={`kq-tab-${i}`} aria-selected={i === dayIdx} aria-controls="kq-day" tabIndex={i === dayIdx ? 0 : -1}
                    onClick={() => { setDayIdx(i); touch(); }}
                    onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = view.program!.days.length; const j = (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n; setDayIdx(j); (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus(); } }}>
                    {d.name}<small>{d.exercises.length} ejercicios</small>
                  </button>
                ))}
              </nav>
              <p className="kq-legend"><span className="coach">Objetivo del profesor</span><span aria-hidden="true">→</span><span className="repi">Sugerencia de REPI</span><span aria-hidden="true">→</span><span className="last">Última vez</span></p>
              <div id="kq-day" role="tabpanel" aria-labelledby={`kq-tab-${dayIdx}`}>
                <ol className="kq-list">
                  {cur?.exercises.map((e, i) => <ConsultExercise key={e.id} e={e} i={i} onTouch={touch} />)}
                </ol>
              </div>
              <p className="kq-foot">Esta pantalla sirve para consultar tu rutina y registrar lo que hiciste. El programa lo cambia sólo el equipo de sala.</p>
            </>
          )}
        </main>
      )}

      {step === "days" && view?.program && (
        <main className="kq-prog">
          <section className="kq-prog-head">
            <div>
              <p className="kq-eyebrow">Registrar · {who}</p>
              <h1 tabIndex={-1}>¿Qué día entrenás hoy?</h1>
              <p className="kq-meta">Te marcamos el que sigue en tu programa. Podés elegir otro.</p>
            </div>
            <button type="button" className="kq-ghost" onClick={toChoice}>Volver</button>
          </section>
          {note && <p className={`kq-note-msg ${note.tone}`} role="status">{note.text}</p>}
          <div className="kq-daypick" role="radiogroup" aria-label="Día del programa">
            {view.program.days.map((d, i) => (
              <button key={i} type="button" role="radio" aria-checked={i === pick} className="kq-daycard" onClick={() => setPick(i)}>
                <span className="t">{d.name}</span>
                <span className="s">{plural(d.exercises.length, "ejercicio", "ejercicios")}{i === view.program!.nextDay ? " · te toca" : ""}</span>
                <span className="x">{d.exercises.map((e) => e.name).join(" · ")}</span>
              </button>
            ))}
          </div>
          <div className="kq-actions">
            <p className="kq-save" aria-live="polite">{busy ? "Empezando…" : ""}</p>
            <button type="button" className="kq-primary" onClick={() => void start()} disabled={busy} aria-busy={busy || undefined}>Empezar {view.program.days[pick]?.name ?? ""}</button>
          </div>
        </main>
      )}

      {step === "workout" && wk && (
        <main className="kq-prog">
          <section className="kq-prog-head">
            <div>
              <p className="kq-eyebrow">Registrando · {who}</p>
              <h1 tabIndex={-1}>{wk.dayName}</h1>
              <p className="kq-meta">{wk.done}/{wk.total} series · {plural(loggedCount(wk), "serie registrada", "series registradas")}</p>
            </div>
            <button type="button" className="kq-ghost" onClick={toChoice}>Inicio</button>
          </section>
          <p className={`kq-note-msg ${note?.tone ?? ""}`} role="status" aria-live="polite" hidden={!note}>{note?.text}</p>
          {wk.outdated && <p className="kq-note">Tu programa cambió después de empezar: registrás sobre la versión con la que empezaste.</p>}
          <ol className="kq-wlist">
            {wk.exercises.map((x, i) => {
              const full = x.total > 0 && x.done >= x.total;
              return (
                <li key={x.id} className={x.skippedToday ? "off" : full ? "full" : ""}>
                  {x.skippedToday ? (
                    <div className="kq-witem">
                      <span className="kq-n" aria-hidden="true">{x.group ?? String(i + 1).padStart(2, "0")}</span>
                      <span className="kq-wname"><b>{x.name}</b><small>Hoy no va (lo marcó tu profe/app)</small></span>
                    </div>
                  ) : (
                    <button type="button" className="kq-witem" onClick={() => openEx(x)}>
                      <span className="kq-n" aria-hidden="true">{x.group ?? String(i + 1).padStart(2, "0")}</span>
                      <span className="kq-wname"><b>{x.name}</b><small>{x.doing ? `Hoy: ${x.doing} · ` : ""}{x.prescription}</small></span>
                      <span className="kq-wprog">{full && <span aria-hidden="true">✓ </span>}{x.done}/{x.total} series{full ? <span className="kq-sr"> completo</span> : null}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="kq-actions kq-wactions">
            <button type="button" className="kq-ghost kq-big" onClick={leave}>Salir y seguir después</button>
            <button type="button" className="kq-primary" onClick={() => { touch(); setAskFinish(true); }}>Terminar entrenamiento</button>
          </div>
          {askFinish && (
            <div className="kq-overlay" role="alertdialog" aria-modal="true" aria-labelledby="kq-fin-h" aria-describedby="kq-fin-d">
              <div className="kq-padbox">
                <h2 id="kq-fin-h" tabIndex={-1} ref={finH}>¿Terminar el entrenamiento?</h2>
                <p id="kq-fin-d" className="kq-lead">{loggedCount(wk)
                  ? `Cerrás ${wk.dayName} con ${plural(loggedCount(wk), "serie registrada", "series registradas")}. Lo que no registraste queda como no hecho.`
                  : "Todavía no registraste ninguna serie: si terminás ahora, el entrenamiento se descarta."}</p>
                <div className="kq-row">
                  <button type="button" className="kq-ghost kq-big" onClick={() => setAskFinish(false)}>Volver</button>
                  <button type="button" className="kq-primary" onClick={() => void finishWorkout()} disabled={busy} aria-busy={busy || undefined}>{busy ? "Terminando…" : "Sí, terminar"}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {step === "exercise" && wk && curEx && drafts[curEx.id] && (
        <RegisterPanel ex={curEx} drafts={drafts[curEx.id]} update={update} setAll={setAll} onConfirm={() => void confirmEx()}
          onBack={() => { setPanelMsg(null); setRetry(false); setExId(null); setStep("workout"); }} saving={saving} retry={retry} msg={panelMsg} onTouch={touch} />
      )}

      {step === "bye" && (
        <main className="kq-center">
          <h1 tabIndex={-1}>{bye?.title ?? "Listo, buen entrenamiento"}</h1>
          <p className="kq-lead">{bye?.text ?? "Tu consulta se cerró. La pantalla queda libre para la próxima persona."}</p>
        </main>
      )}

      {warn && (
        <div className="kq-overlay kq-idlewarn" role="alertdialog" aria-modal="true" aria-labelledby="kq-idle-h" aria-describedby="kq-idle-d">
          <div className="kq-padbox">
            <h2 id="kq-idle-h">¿Seguís ahí?</h2>
            <p id="kq-idle-d" className="kq-lead">Se cierra en {left} s. Lo que no confirmaste no se va a guardar.</p>
            <button type="button" className="kq-primary" ref={idleBtn} onClick={touch}>Seguir</button>
          </div>
        </div>
      )}
    </div>
  );
}
