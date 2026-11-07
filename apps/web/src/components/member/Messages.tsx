"use client";
// Mensajes del alumno/socio (SCR-M-17; equipo de sala del gym, D40). Lista de conversaciones por relación y chat.
import { useState } from "react";
import { ChatSkeleton, Conversation, usePoll } from "@/components/messages/ChatPane";
import { useCached } from "@/lib/cache";
import { Loading, Skel } from "@/components/motion/Skeleton";

// M06: la primera visita muestra el esqueleto del diseño que va a quedar (lista, o chat si la última respuesta de esta
// sesión fue una sola conversación), sin pasar por un diseño intermedio.
let lastSingle = false;

type ThreadRow = { id: string; kind: "coach_client" | "gym_member"; title: string; subtitle: string; unread: number; last: { body: string; at: string; mine: boolean } | null };
const ini = (n: string) => n.split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function MemberMessages({ offline, onSeen }: { offline: boolean; onSeen: () => void }) {
  const list = useCached<ThreadRow[]>(offline ? null : "/api/messages");
  const threads = list.data;
  const err = threads ? null : list.err;
  const load = list.reload;
  const [sel, setSel] = useState<string | null>(null);
  usePoll(() => { if (!offline && !sel) void load(); });
  if (threads) lastSingle = threads.length === 1;
  // Con una sola relación se abre directo la conversación, como en el prototipo.
  const only = threads?.length === 1 ? threads[0] : null;
  const current = threads?.find((t) => t.id === (sel ?? only?.id));
  if (offline) return <><h1 tabIndex={-1} style={{ marginTop: 6 }}>Mensajes</h1><div className="dashed-card"><span>Sin conexión. Los mensajes necesitan conexión para enviarse y recibirse.</span></div></>;
  if (!threads && !err && lastSingle) return (
    <>
      <h1 className="sr-only" tabIndex={-1}>Mensajes</h1>
      <Loading what="tus mensajes" />
      <div className="mb-chathead" aria-hidden="true"><Skel w={44} h={44} r={22} /><span style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}><Skel w="45%" h={16} /><Skel w="70%" h={12} /></span></div>
      <section className="mb-chat" aria-hidden="true"><div className="chat-log"><ChatSkeleton /></div></section>
    </>
  );
  if (current) return (
    <>
      {/* Título para lectores y para el foco al cambiar de sección (el chat abierto no muestra «Mensajes»). */}
      <h1 className="sr-only" tabIndex={-1}>Mensajes</h1>
      <div className="mb-chathead">
        {!only && <button type="button" className="linkbtn" aria-label="Volver a conversaciones" onClick={() => { setSel(null); void load(); }}>←</button>}
        <span className="mb-av" aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 22 }}>{ini(current.title)}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 17 }}>{current.title}</b><small className="mb-muted">{current.kind === "gym_member" ? `${current.subtitle} · responde quien esté en turno` : current.subtitle}</small></span>
      </div>
      <Conversation id={current.id} title={current.kind === "gym_member" ? "el equipo de sala" : current.title} dark onChanged={onSeen} />
    </>
  );
  return (
    <>
      <h1 tabIndex={-1} style={{ marginTop: 6 }}>Mensajes</h1>
      {err && <p className="mb-err" role="alert">{err}</p>}
      {!threads ? (err ? null : <div className="panel" aria-busy="true"><Loading what="tus conversaciones" />{[0, 1, 2].map((i) => <div key={i} className="prow-dark" aria-hidden="true" style={{ display: "flex", padding: "12px 0", gap: 10 }}><span style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}><Skel w={i === 1 ? "38%" : "50%"} h={14} /><Skel w={i === 2 ? "60%" : "82%"} h={11} /></span></div>)}</div>)
        : !threads.length ? <div className="dashed-card"><span>Cuando tengas coach o gym en REPI, vas a poder escribirles acá.</span></div> : (
        <div className="panel">
          {threads.map((t) => (
            <button key={t.id} type="button" className="prow-dark" onClick={() => setSel(t.id)}>
              <span><span style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</span><small>{t.last ? `${t.last.mine ? "Vos: " : ""}${t.last.body}` : t.subtitle}</small></span>
              {t.unread > 0 && <span className="tab-badge" style={{ position: "static" }} aria-label={`${t.unread} sin leer`}>{t.unread}</span>}
            </button>
          ))}
        </div>
      )}
      <span className="mb-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>Tu coach y el equipo de sala del gym son conversaciones separadas: uno no ve lo que le escribís al otro.</span>
    </>
  );
}
