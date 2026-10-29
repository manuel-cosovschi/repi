"use client";
// Guía con IA del dueño (D135): primeros pasos con datos reales del gimnasio y preguntas libres sobre cómo usar REPI y cómo
// manejar a socios y equipo. La IA recibe la guía y números agregados; nunca datos de personas.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLoad, type GymScreen, type Shell } from "./shared";

type Setup = { steps: { key: string; title: string; detail: string; done: boolean; screen: GymScreen }[]; done: number };
type Msg = { role: "user" | "assistant"; text: string; actions?: { label: string; screen: GymScreen }[] };

const SUGGEST = ["¿Por dónde empiezo?", "¿Cómo invito a mi equipo?", "¿Cómo logro que mis socios usen la app?", "¿Qué hago con las solicitudes de acceso?"];
const KEY = "repi-owner-guide-open";

export function OwnerGuide({ shell }: { shell: Shell }) {
  const s = useLoad<Setup>(`/api/gym/${shell.orgId}/setup`);
  const [open, setOpen] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const v = localStorage.getItem(KEY); setOpen(v == null ? null : v === "1"); } catch { setOpen(null); } }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);
  if (!s.data) return null;
  const all = s.data.done === s.data.steps.length;
  const shown = open ?? !all; // abierta mientras falten pasos; después, a pedido
  const toggle = () => { const v = !shown; setOpen(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: t }];
    setMsgs(next); setQ(""); setBusy(true);
    try {
      const r = await api<{ answer: string; actions: Msg["actions"] }>(`/api/gym/${shell.orgId}/assistant`, { body: { messages: next.map(({ role, text: x }) => ({ role, text: x })) } });
      setMsgs([...next, { role: "assistant", text: r.answer, actions: r.actions }]);
    } catch (e) { setMsgs([...next, { role: "assistant", text: (e as Error).message }]); } finally { setBusy(false); }
  };
  return (
    <section className="card og" aria-label="Tu guía REPI">
      <div className="og-h">
        <div><h2 style={{ margin: 0, fontSize: 18 }}>Tu guía REPI</h2><small className="muted">{all ? "Primeros pasos completos. Preguntá lo que necesites." : `${s.data.done} de ${s.data.steps.length} primeros pasos`}</small></div>
        <button type="button" className="btn sm" aria-expanded={shown} onClick={toggle}>{shown ? "Ocultar" : "Abrir"}</button>
      </div>
      {shown && <>
        <div className="og-bar" aria-hidden="true"><i style={{ width: `${(s.data.done / s.data.steps.length) * 100}%` }} /></div>
        <ol className="og-steps">{s.data.steps.map((st) => (
          <li key={st.key} className={st.done ? "ok" : ""}>
            <span className="og-dot" aria-hidden="true">{st.done ? "✓" : ""}</span>
            <span><b>{st.title}</b><small className="muted">{st.detail}</small></span>
            {!st.done && <button type="button" className="btn sm" onClick={() => shell.go(st.screen)}>Ir</button>}
          </li>
        ))}</ol>
        <div className="og-chat" aria-live="polite">
          {!msgs.length && <small className="muted">Preguntale a la guía cómo usar REPI o cómo manejar a tus socios y tu equipo. REPI responde con su guía y los números de tu gimnasio, sin datos de personas (lo procesa OpenAI).</small>}
          {msgs.map((m, i) => (
            <div key={i} className={`og-msg ${m.role}`}>
              <p>{m.text}</p>
              {m.actions?.length ? <div className="og-acts">{m.actions.map((a) => <button key={a.screen} type="button" className="btn sm pri" onClick={() => shell.go(a.screen)}>{a.label}</button>)}</div> : null}
            </div>
          ))}
          {busy && <div className="og-msg assistant"><p className="muted">Pensando…</p></div>}
          <div ref={end} />
        </div>
        {!msgs.length && <div className="pills">{SUGGEST.map((x) => <button key={x} type="button" className="pill" disabled={busy} onClick={() => void ask(x)}>{x}</button>)}</div>}
        <form className="og-form" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <input value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Escribí tu pregunta…" aria-label="Pregunta para la guía" />
          <button type="submit" className="btn pri" disabled={busy || !q.trim()}>Preguntar</button>
        </form>
      </>}
    </section>
  );
}
