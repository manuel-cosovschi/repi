"use client";
// Asistente REPI (Adaptive Coaching 3.0, D209) · estado compartido de la familia de componentes. Se monta sobre el árbol de
// MemberApp (por encima de la rama del entrenamiento), así la conversación, el panel y la tarjeta de Inicio sobreviven a un
// entrenamiento abierto y al cambio de pestaña (`.tab-pane` se vuelve a montar). Todo sale del servidor (/api/me/brain/**):
// acá no se decide ni se calcula nada. Sin conexión no se pide nada y se dice «REPI responde cuando vuelva la conexión»; el
// entrenamiento nunca espera a REPI.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { chipsFor, cleanRef, type Chip, type EvidenceVM } from "./presenter";
import type { BrainHome, BrainRef, ConfirmResponse, Draft, MessageResponse, MessageView, Navigate, ProposedAction, Section, ThreadResponse } from "./types";
import { RepiPanel } from "./RepiPanel";
import { RepiWhy } from "./RepiWhy";

export type OpenOpts = {
  section: Section;
  ref?: BrainRef | null;
  /** Qué se está mirando («Press banca»): sólo para el encabezado del panel. */
  subject?: string | null;
  /** Atajos propios de esta pantalla (si no, los de la sección). */
  chips?: Chip[] | null;
  /** Pregunta que se manda al abrir (un toque explícito de la persona, p. ej. «Entender esta rutina»). */
  send?: string | null;
  /** Hay series en la cola sin sincronizar (se le avisa al servidor). */
  offlinePending?: boolean;
};
export type WhyInput = {
  claim: string; evidence: EvidenceVM;
  feedback?: { target: "intervention" | "message"; id: string } | null;
  chat?: OpenOpts | null;
};
/** Lo que el entrenamiento abierto le ofrece a REPI: adoptar un cambio hecho en el servidor y abrir el cambio de ejercicio. */
export type WorkoutHandlers = { sessionChanged: (programExerciseIds: string[]) => void; changeExercise: (programExerciseId: string) => void };

export type ActionState = { status: "busy" | "done" | "failed" | "cancelled" | "details"; text?: string; fields?: string[]; zones?: string[] };
export type Item = MessageView & { local?: { status: "sending" | "failed"; clientId: string; error: string | null; ref: BrainRef | null; section: Section } };

type Panel = { open: boolean; section: Section; ref: BrainRef | null; subject: string | null; chips: Chip[] | null; offlinePending: boolean };

type PublicCtx = {
  enabled: boolean;
  offline: boolean;
  home: BrainHome | null;
  tone: "normal" | "breve";
  reloadHome: (force?: boolean) => void;
  resolve: (id: string, op: "shown" | "accepted" | "dismissed" | "never") => Promise<boolean>;
  open: (o: OpenOpts) => void;
  close: () => void;
  panelOpen: boolean;
  showWhy: (w: WhyInput) => void;
  registerWorkout: (h: WorkoutHandlers | null) => void;
};
export type PanelCtx = PublicCtx & {
  panel: Panel;
  items: Item[];
  threadState: "idle" | "loading" | "ready" | "error";
  loadThread: () => void;
  busy: boolean;
  chips: Chip[];
  draft: string;
  setDraft: (v: string) => void;
  send: (text: string) => void;
  retry: (it: Item) => void;
  act: (a: ProposedAction, op: "confirm" | "cancel", details?: { level?: number; zone?: string }) => Promise<void>;
  actions: Record<string, ActionState>;
  feedback: (messageId: string, value: 1 | -1 | null) => void;
  newThread: () => void;
  announce: string;
};

const Ctx = createContext<PanelCtx | null>(null);
const OFF: PublicCtx = {
  enabled: false, offline: false, home: null, tone: "normal", reloadHome: () => {}, resolve: async () => false, open: () => {}, close: () => {}, panelOpen: false,
  showWhy: () => {}, registerWorkout: () => {},
};
/** Acceso a REPI desde cualquier pantalla del alumno. Fuera del proveedor (o con el módulo apagado) no hace nada. */
export function useBrain(): PublicCtx { return useContext(Ctx) ?? OFF; }
/** Sólo para el panel y sus partes. */
export function usePanel(): PanelCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePanel fuera de BrainProvider");
  return c;
}

const HOME_EVERY_MS = 60_000;
const SESSION_ACTIONS = new Set(["apply_substitution", "apply_short_session"]);

export function BrainProvider({ children, enabled, offline: appOffline, activeKey, onNavigate, onDraft }: {
  children: ReactNode; enabled: boolean; offline: boolean;
  /** Pestaña visible («workout» con un entrenamiento abierto): al volver a Inicio se refresca la tarjeta. */
  activeKey: string;
  onNavigate: (n: Navigate) => void;
  onDraft: (d: Draft) => void;
}) {
  // ── Conexión ──────────────────────────────────────────────────────────────
  const [netOffline, setNetOffline] = useState(false);
  useEffect(() => {
    const on = () => setNetOffline(!navigator.onLine);
    on(); window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  const offline = netOffline || appOffline;

  // ── Inicio ────────────────────────────────────────────────────────────────
  const [home, setHome] = useState<BrainHome | null>(null);
  const lastHome = useRef(0);
  const reloadHome = useCallback((force = false) => {
    if (!enabled || offline) return;
    if (!force && Date.now() - lastHome.current < HOME_EVERY_MS) return;
    lastHome.current = Date.now();
    // Una falla de REPI nunca rompe Inicio: queda lo que había (o nada) sin mensaje de error.
    api<BrainHome>("/api/me/brain").then(setHome).catch(() => {});
  }, [enabled, offline]);
  const prevKey = useRef(activeKey);
  useEffect(() => {
    const from = prevKey.current;
    prevKey.current = activeKey;
    if (activeKey === "home") reloadHome(from === "workout");
  }, [activeKey, reloadHome]);
  useEffect(() => { reloadHome(true); }, [reloadHome]);
  const resolve = useCallback(async (id: string, op: "shown" | "accepted" | "dismissed" | "never") => {
    if (offline) return false;
    try {
      await api("/api/me/brain/intervention", { body: { id, op } });
      if (op !== "shown") setHome((h) => (h ? { ...h, card: h.card?.id === id ? null : h.card, interventions: h.interventions.filter((x) => x.id !== id) } : h));
      return true;
    } catch (e) {
      // Ya resuelto en otro dispositivo: se saca igual (no reaparece).
      if (e instanceof ApiError && (e.status === 409 || e.status === 404) && op !== "shown") { setHome((h) => (h ? { ...h, card: h.card?.id === id ? null : h.card } : h)); return true; }
      return false;
    }
  }, [offline]);

  // ── Panel y conversación ──────────────────────────────────────────────────
  const [panel, setPanel] = useState<Panel>({ open: false, section: "home", ref: null, subject: null, chips: null, offlinePending: false });
  const [items, setItems] = useState<Item[]>([]);
  const [threadState, setThreadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [serverChips, setServerChips] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [announce, setAnnounce] = useState("");
  const workout = useRef<WorkoutHandlers | null>(null);
  // Los manejadores de MemberApp cambian en cada render: se leen al momento de usarlos (el contexto no se rehace por eso).
  const navTo = useRef({ onNavigate, onDraft });
  navTo.current = { onNavigate, onDraft };
  const panelRef = useRef(panel);
  panelRef.current = panel;

  const loadThread = useCallback(() => {
    if (offline) return;
    setThreadState("loading");
    api<ThreadResponse>("/api/me/brain/thread?limit=50")
      .then((r) => { setItems((cur) => [...r.messages, ...cur.filter((x) => x.local && !r.messages.some((m) => m.id === x.id))]); setThreadState("ready"); })
      .catch(() => setThreadState("error"));
  }, [offline]);

  const post = useCallback(async (text: string, clientId: string, section: Section, ref: BrainRef | null, offlinePending: boolean) => {
    const body = { text, section, clientId, ...(ref ? { ref } : {}), ...(offlinePending ? { offlinePending: true } : {}) };
    try { return await api<MessageResponse>("/api/me/brain/message", { body }); }
    catch (e) {
      // Una referencia que el servidor todavía no conoce (entrenamiento empezado sin conexión) no impide preguntar: sin ella.
      if (ref && e instanceof ApiError && e.status === 404) return api<MessageResponse>("/api/me/brain/message", { body: { text, section, clientId, ...(offlinePending ? { offlinePending: true } : {}) } });
      throw e;
    }
  }, []);

  const deliver = useCallback(async (text: string, clientId: string, section: Section, ref: BrainRef | null, offlinePending: boolean) => {
    setBusy(true);
    try {
      const r = await post(text, clientId, section, ref, offlinePending);
      setItems((cur) => {
        const rest = cur.filter((x) => x.id !== clientId && x.id !== r.message.id && x.id !== r.reply.id);
        return [...rest, r.message, r.reply];
      });
      setServerChips(r.suggestions?.length ? r.suggestions : null);
      setAnnounce(`REPI: ${r.reply.text}`);
    } catch (e) {
      const msg = e instanceof ApiError && e.status < 500 ? e.message : "No llegó. Revisá la conexión y reintentá.";
      setItems((cur) => cur.map((x) => (x.id === clientId && x.local ? { ...x, local: { ...x.local, status: "failed", error: msg } } : x)));
    } finally { setBusy(false); }
  }, [post]);

  const send = useCallback((raw: string) => {
    const text = raw.trim().slice(0, 1000);
    if (!text || busy) return;
    const p = panelRef.current;
    if (offline) { setDraft(text); return; }
    const clientId = `msg-${crypto.randomUUID()}`;
    const ref = cleanRef(p.ref);
    const temp: Item = {
      id: clientId, threadId: "", role: "user", text, cards: [], actions: [], section: p.section, ref: null, via: null, feedback: null, createdAt: new Date().toISOString(),
      local: { status: "sending", clientId, error: null, ref, section: p.section },
    };
    setItems((cur) => [...cur, temp]);
    setDraft("");
    void deliver(text, clientId, p.section, ref, p.offlinePending);
  }, [busy, offline, deliver]);

  const retry = useCallback((it: Item) => {
    if (!it.local || offline || busy) return;
    setItems((cur) => cur.map((x) => (x.id === it.id && x.local ? { ...x, local: { ...x.local, status: "sending", error: null } } : x)));
    void deliver(it.text, it.local.clientId, it.local.section, it.local.ref, panelRef.current.offlinePending);
  }, [offline, busy, deliver]);

  const pendingSend = useRef<string | null>(null);
  const [sendTick, setSendTick] = useState(0);
  const open = useCallback((o: OpenOpts) => {
    if (!enabled) return;
    setPanel({ open: true, section: o.section, ref: cleanRef(o.ref), subject: o.subject ?? null, chips: o.chips ?? null, offlinePending: !!o.offlinePending });
    setServerChips(null);
    if (o.send) { if (offline) setDraft(o.send); else { pendingSend.current = o.send; setSendTick((n) => n + 1); } }
  }, [enabled, offline]);
  const close = useCallback(() => setPanel((p) => ({ ...p, open: false })), []);
  // La conversación se carga la primera vez que se abre el panel; la pregunta pedida al abrir sale después del historial.
  useEffect(() => {
    if (!panel.open) return;
    if (threadState === "idle" && !offline) { loadThread(); return; }
    if (pendingSend.current && threadState !== "loading" && !busy) { const t = pendingSend.current; pendingSend.current = null; send(t); }
  }, [panel.open, threadState, offline, loadThread, busy, send, sendTick]);

  const feedback = useCallback((messageId: string, value: 1 | -1 | null) => {
    if (offline) return;
    const prev = items.find((x) => x.id === messageId)?.feedback ?? null;
    setItems((cur) => cur.map((x) => (x.id === messageId ? { ...x, feedback: value } : x)));
    api<{ message: MessageView }>("/api/me/brain/feedback", { body: { messageId, value } })
      .catch(() => setItems((cur) => cur.map((x) => (x.id === messageId ? { ...x, feedback: prev } : x))));
  }, [offline, items]);

  const newThread = useCallback(() => {
    if (offline) return;
    api("/api/me/brain/thread/close", { body: {} }).then(() => { setItems([]); setServerChips(null); setActions({}); setAnnounce("Empezaste otra conversación con REPI."); }).catch(() => {});
  }, [offline]);

  const act = useCallback(async (a: ProposedAction, op: "confirm" | "cancel", details?: { level?: number; zone?: string }) => {
    if (offline) return;
    setActions((s) => ({ ...s, [a.key]: { ...s[a.key], status: "busy" } }));
    try {
      if (op === "cancel") {
        await api("/api/me/brain/action", { body: { op: "cancel", key: a.key } });
        setActions((s) => ({ ...s, [a.key]: { status: "cancelled", text: "Cancelado. No se cambió nada." } }));
        return;
      }
      const r = await api<ConfirmResponse>("/api/me/brain/action", { body: { op: "confirm", key: a.key, ...(details && Object.keys(details).length ? { details } : {}) } });
      // «Listo» sólo con la confirmación del servidor: el texto es el del resultado real (o el de la falla).
      setActions((s) => ({ ...s, [a.key]: { status: r.ok ? "done" : "failed", text: r.text || (r.ok ? "" : "No se pudo hacer. No se cambió nada.") } }));
      if (r.text) setAnnounce(r.text);
      if (!r.ok) return;
      const res = r.result ?? {};
      const nav = res.navigate as Navigate | undefined;
      if (nav?.to === "short_session") { send(`Me quedan ${nav.minutes} minutos`); return; }
      if (nav?.to === "change_exercise" && nav.programExerciseId && workout.current) { workout.current.changeExercise(nav.programExerciseId); close(); return; }
      if (nav) { navTo.current.onNavigate(nav); close(); return; }
      if (typeof res.draft === "string") { navTo.current.onDraft({ draft: res.draft, to: (res.to as Draft["to"]) ?? null, exerciseId: (res.exerciseId as string | null) ?? null }); close(); return; }
      if (SESSION_ACTIONS.has(a.kind)) {
        const ids = a.kind === "apply_substitution" ? [a.input.exerciseId] : Array.isArray(a.input.skip) ? a.input.skip : [];
        workout.current?.sessionChanged(ids.filter((x): x is string => typeof x === "string"));
      }
      if (a.kind === "update_prefs" || a.kind === "save_preference" || a.kind === "delete_memory") reloadHome(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "details_required") {
        const d = (e.data ?? {}) as { fields?: string[]; zones?: string[] };
        setActions((s) => ({ ...s, [a.key]: { status: "details", text: e.message, fields: d.fields ?? ["level", "zone"], zones: d.zones } }));
        return;
      }
      const msg = e instanceof ApiError && e.status < 500 ? e.message : "No se pudo hacer: no se cambió nada. Probá de nuevo en un rato.";
      setActions((s) => ({ ...s, [a.key]: { status: "failed", text: msg } }));
    }
  }, [offline, close, send, reloadHome]);

  // ── «¿Por qué?» ───────────────────────────────────────────────────────────
  const [why, setWhy] = useState<WhyInput | null>(null);
  const showWhy = useCallback((w: WhyInput) => setWhy(w), []);

  const registerWorkout = useCallback((h: WorkoutHandlers | null) => { workout.current = h; }, []);
  const tone = home?.prefs.tone ?? "normal";
  const chips = useMemo(() => chipsFor(panel.section, serverChips, panel.chips), [panel.section, serverChips, panel.chips]);

  const value = useMemo<PanelCtx>(() => ({
    enabled, offline, home, tone, reloadHome, resolve, open, close, panelOpen: panel.open, showWhy, registerWorkout,
    panel, items, threadState, loadThread, busy, chips, draft, setDraft, send, retry, act, actions, feedback, newThread, announce,
  }), [enabled, offline, home, tone, reloadHome, resolve, open, close, panel, showWhy, registerWorkout, items, threadState, loadThread, busy, chips, draft, send, retry, act, actions, feedback, newThread, announce]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && panel.open && <RepiPanel />}
      {enabled && why && <RepiWhy w={why} onClose={() => setWhy(null)} />}
    </Ctx.Provider>
  );
}
