"use client";
// Centro de avisos del staff (F-HX-26, D101). Persiste lo que el push intentó avisar: altas pendientes, escalamientos
// y alertas de sala. «Resuelto» sale del origen (cualquiera del equipo pudo resolverlo); «leído» es de cada persona.
import { useState } from "react";
import { api } from "@/lib/api";
import { Head, Seg, fmt, useLoad, type GymScreen, type Shell } from "./shared";

type Notice = { id: string; kind: string; title: string; body: string; at: string; read: boolean; resolved: boolean; resolution: string; go: { s: GymScreen; sel: string } };

export function NoticesScreen({ shell }: { shell: Shell }) {
  const d = useLoad<{ items: Notice[]; unread: number; windowDays: number }>(`/api/gym/${shell.orgId}/notices`);
  const [f, setF] = useState<"open" | "all">("open");
  const read = async (ids: string[] | null) => { await api(`/api/gym/${shell.orgId}/notices/read`, { body: { ids } }).catch(() => {}); shell.refreshBadges(); };
  const open = async (n: Notice) => { if (!n.read) await read([n.id]); shell.go(n.go.s, { sel: n.go.sel }); };
  const items = d.data?.items.filter((n) => f === "all" || !n.resolved) ?? [];
  return (
    <>
      <Head kicker={`Lo que te avisamos en los últimos ${d.data?.windowDays ?? 14} días, llegue o no el push. «Resuelto» lo marca quien atendió.`} title="Avisos">
        {!!d.data?.items.some((n) => !n.read) && <button type="button" className="btn" onClick={async () => { await read(null); d.reload(); }}>Marcar todo como leído</button>}
      </Head>
      <Seg label="Filtro" value={f} onChange={setF} options={[["open", "Sin resolver"], ["all", "Todos"]]} />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !items.length ? <div className="empty">{f === "open" ? "No hay avisos sin resolver." : "No hay avisos."}</div> : (
        <section className="card" style={{ gap: 0 }}>
          {items.map((n) => (
            <button key={n.id} type="button" className="gy-notice" data-unread={!n.read && !n.resolved ? "1" : undefined} onClick={() => open(n)}>
              <span className="dot" style={{ background: n.resolved ? "#CBD5E1" : n.kind === "floor_alert" ? "#F59E0B" : "#00D1FF" }} aria-hidden="true" />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <b>{n.title}{!n.read && !n.resolved && <span className="sr-only"> · sin leer</span>}</b><small className="muted">{n.body}</small>
              </span>
              <span className={`chip ${n.resolved ? "ok" : "warn"}`}>{n.resolution}</span>
              <small className="muted" style={{ flex: "0 0 auto" }}>{fmt(n.at)}</small>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
