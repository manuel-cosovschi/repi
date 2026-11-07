"use client";
// Mensajes del alumno/socio (SCR-M-17; equipo de sala del gym, D40). Lista de conversaciones por relación y chat.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Conversation, usePoll } from "@/components/messages/ChatPane";
import { RepiAsk } from "@/components/brain/RepiAsk";

type ThreadRow = { id: string; kind: "coach_client" | "gym_member"; title: string; subtitle: string; unread: number; last: { body: string; at: string; mine: boolean } | null };
const ini = (n: string) => n.split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// D209: «Preparar consulta con REPI» deja un borrador en el campo de la conversación; nunca envía nada solo.
const prepare = { section: "messages" as const, send: "Preparar una consulta para mi entrenador", label: "Preparar consulta con REPI", className: "linkbtn rp-ask rp-ask-msgs" };

export function MemberMessages({ offline, onSeen, draft, onDraftUsed }: { offline: boolean; onSeen: () => void; draft?: { text: string; to: "coach" | "gym" | null; n: number } | null; onDraftUsed?: () => void }) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<ThreadRow[]>("/api/messages").then((t) => { setThreads(t); setErr(null); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { if (!offline) void load(); }, [load, offline]);
  usePoll(() => { if (!offline && !sel) void load(); });
  // El borrador de REPI va a la conversación con quien corresponde (coach o equipo de sala).
  useEffect(() => {
    if (!draft || !threads?.length) return;
    const want = draft.to === "gym" ? "gym_member" : draft.to === "coach" ? "coach_client" : null;
    const th = threads.find((x) => x.kind === want) ?? (threads.length === 1 ? threads[0] : null);
    if (th) setSel(th.id);
  }, [draft?.n, threads]); // eslint-disable-line react-hooks/exhaustive-deps
  // Con una sola relación se abre directo la conversación, como en el prototipo.
  const only = threads?.length === 1 ? threads[0] : null;
  const current = threads?.find((t) => t.id === (sel ?? only?.id));
  if (offline) return <><h1 tabIndex={-1} style={{ marginTop: 6 }}>Mensajes</h1><div className="dashed-card"><span>Sin conexión. Los mensajes necesitan conexión para enviarse y recibirse.</span></div></>;
  if (current) return (
    <>
      <div className="mb-chathead">
        {!only && <button type="button" className="linkbtn" aria-label="Volver a conversaciones" onClick={() => { setSel(null); void load(); }}>←</button>}
        <span className="mb-av" aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 22 }}>{ini(current.title)}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 17 }}>{current.title}</b><small className="mb-muted">{current.kind === "gym_member" ? `${current.subtitle} · responde quien esté en turno` : current.subtitle}</small></span>
      </div>
      <RepiAsk {...prepare} />
      <Conversation id={current.id} title={current.kind === "gym_member" ? "el equipo de sala" : current.title} dark onChanged={onSeen} seed={draft} onSeedUsed={onDraftUsed} />
    </>
  );
  return (
    <>
      <h1 tabIndex={-1} style={{ marginTop: 6 }}>Mensajes</h1>
      {err && <p className="mb-err" role="alert">{err}</p>}
      {!threads ? <span className="mb-muted">Cargando…</span> : !threads.length ? <div className="dashed-card"><span>Cuando tengas coach o gym en REPI, vas a poder escribirles acá.</span></div> : (
        <div className="panel">
          {threads.map((t) => (
            <button key={t.id} type="button" className="prow-dark" onClick={() => setSel(t.id)}>
              <span><span style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</span><small>{t.last ? `${t.last.mine ? "Vos: " : ""}${t.last.body}` : t.subtitle}</small></span>
              {t.unread > 0 && <span className="tab-badge" style={{ position: "static" }} aria-label={`${t.unread} sin leer`}>{t.unread}</span>}
            </button>
          ))}
        </div>
      )}
      {!!threads?.length && <RepiAsk {...prepare} />}
      <span className="mb-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>Tu coach y el equipo de sala del gym son conversaciones separadas: uno no ve lo que le escribís al otro.</span>
    </>
  );
}
