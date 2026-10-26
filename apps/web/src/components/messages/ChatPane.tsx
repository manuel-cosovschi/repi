"use client";
// Mensajes de escritorio (SCR-C-04 coach; equipo de sala, SCR-N-19). Conversaciones reales entre participantes de la relación.
// Sin tiempo real: se actualiza cada 10 s con la pantalla visible. Sin conexión no se envía (no hay cola de mensajes).
import { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_MAX } from "@repi/domain";
import { api } from "@/lib/api";

export type ThreadRow = { id: string; relId?: string; name: string; active: boolean; unread: number; last: { body: string; at: string; mine: boolean } | null };
type Msg = { id: string; body: string; at: string; mine: boolean; sender: string | null; state: string | null; stateLabel: string | null; pending?: boolean; failed?: boolean };
type Thread = { id: string; readOnly: boolean; messages: Msg[] };

const hm = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function usePoll(fn: () => void, ms = 10_000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") ref.current(); }, ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function ChatPane({ listUrl, kicker, emptyText, initial, onSeen, profile }: {
  listUrl: string; kicker: string; emptyText: string; initial?: string | null; onSeen?: () => void; profile?: (t: ThreadRow) => React.ReactNode;
}) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const [err, setErr] = useState<string | null>(null);
  const loadList = useCallback(() => api<ThreadRow[]>(listUrl).then((t) => { setThreads(t); setErr(null); }).catch((e) => setErr(e.message)), [listUrl]);
  useEffect(() => { void loadList(); }, [loadList]);
  usePoll(loadList);
  const current = sel ?? threads?.find((t) => t.last)?.id ?? threads?.[0]?.id ?? null;
  const row = threads?.find((t) => t.id === current);
  return (
    <>
      <div className="co-head"><div><span className="co-kicker">{kicker}</span><h1 tabIndex={-1}>Mensajes</h1></div></div>
      {err && <p role="alert" className="err-box">{err}</p>}
      {threads && !threads.length ? <div className="empty">{emptyText}</div> : (
        <div className="split" style={{ alignItems: "stretch" }}>
          <div className="list-pane" style={{ flex: "1 1 280px", maxWidth: 380 }}>
            {threads?.map((t) => (
              <button key={t.id} type="button" className="crow" aria-current={t.id === current} onClick={() => setSel(t.id)}>
                <span className="av36">{ini(t.name)}</span>
                <span><b>{t.name}</b><small className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last ? `${t.last.mine ? "Vos: " : ""}${t.last.body}` : t.active ? "Sin mensajes todavía" : "Relación en pausa"}</small></span>
                {t.unread > 0 && <span className="nbadge" aria-label={`${t.unread} sin leer`}>{t.unread}</span>}
              </button>
            ))}
            {!threads && <p className="muted">Cargando…</p>}
          </div>
          {current && row && <Conversation key={current} id={current} title={row.name} extra={profile?.(row)} onChanged={() => { void loadList(); onSeen?.(); }} />}
        </div>
      )}
    </>
  );
}

export function Conversation({ id, title, extra, onChanged, dark }: { id: string; title: string; extra?: React.ReactNode; onChanged?: () => void; dark?: boolean }) {
  const [t, setT] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api<Thread>(`/api/messages/${id}`).then((x) => { setT((prev) => ({ ...x, messages: [...x.messages, ...(prev?.messages.filter((m) => m.pending || m.failed) ?? []).filter((m) => !x.messages.some((y) => y.id === m.id))] })); setErr(null); }).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { void load().then(() => onChanged?.()); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  usePoll(load);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on(); window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [t?.messages.length]);
  const send = async (body: string, mid = crypto.randomUUID()) => {
    if (!body.trim()) return;
    setDraft("");
    const tmp: Msg = { id: mid, body: body.trim(), at: new Date().toISOString(), mine: true, sender: null, state: null, stateLabel: "Enviando…", pending: true };
    setT((x) => x && { ...x, messages: [...x.messages.filter((m) => m.id !== mid), tmp] });
    try { await api(`/api/messages/${id}`, { body: { id: mid, body: body.trim() } }); await load(); onChanged?.(); }
    catch (e) { setT((x) => x && { ...x, messages: x.messages.map((m) => m.id === mid ? { ...m, pending: false, failed: true, stateLabel: (e as Error).message } : m) }); }
  };
  const over = draft.length > MESSAGE_MAX;
  return (
    <section className={dark ? "mb-chat" : "card gy-chat"} aria-label={`Conversación con ${title}`}>
      {!dark && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}><h2>{title}</h2>{extra}</div>}
      {err && <p role="alert" className="err-box">{err}</p>}
      <div ref={box} className="chat-log" role="log" aria-live="polite">
        {t?.messages.map((m) => (
          <div key={m.id} className={`chat-msg${m.mine ? " mine" : ""}`}>
            {!m.mine && m.sender && <small className="chat-who">{m.sender}</small>}
            <div className="chat-bubble">{m.body}</div>
            <small className="chat-meta">{hm(m.at)}{m.mine && m.stateLabel ? ` · ${m.stateLabel}` : ""}
              {m.failed && <> · <button type="button" className="chat-retry" onClick={() => send(m.body, m.id)}>Reintentar</button></>}</small>
          </div>
        ))}
        {t && !t.messages.length && <p className={dark ? "mb-muted" : "muted"} style={{ textAlign: "center" }}>Todavía no hay mensajes. Escribí el primero.</p>}
      </div>
      {t?.readOnly ? <p className={dark ? "mb-muted" : "muted"}>Esta relación terminó: la conversación quedó en sólo lectura.</p> : (
        <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); if (online && !over) void send(draft); }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} aria-label="Mensaje" placeholder={online ? `Escribile a ${/^(el|la) /.test(title) ? title : title.split(" ")[0]}…` : "Sin conexión: no se pueden enviar mensajes"} disabled={!online}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (online && !over) void send(draft); } }} maxLength={MESSAGE_MAX + 200} />
          <button type="submit" aria-label="Enviar" disabled={!online || !draft.trim() || over}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0F14" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
        </form>
      )}
      {over && <small className="err-box">Hasta {MESSAGE_MAX} caracteres.</small>}
    </section>
  );
}
