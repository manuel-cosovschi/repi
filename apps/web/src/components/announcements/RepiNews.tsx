"use client";
// Novedades de REPI para coach y gimnasio (PP1, D202). Misma lista y mismo estado de lectura que la campanita del alumno
// (una lectura por persona y anuncio): quien tiene varios roles no la ve repetida. Abrir la pantalla las marca leídas.
import { useCallback, useEffect, useRef, useState } from "react";
import { ANNOUNCEMENT_KINDS, type AnnouncementDest, type AnnouncementKind } from "@repi/domain";
import { api } from "@/lib/api";
import { featureOn } from "@/lib/features";

export type RepiNewsItem = { id: string; kind: AnnouncementKind; title: string; summary: string; ctaLabel: string | null; destination: AnnouncementDest; at: string; unread: boolean };
const whenTxt = (at: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(at));

/** Cantidad sin leer para el número del menú (0 con el módulo apagado). */
export function useRepiNewsUnread(area: "coach" | "gym", orgId: string, tick: unknown) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!featureOn("announcements")) return;
    api<{ unread: number }>(`/api/announcements?area=${area}&org=${encodeURIComponent(orgId)}`).then((x) => setN(x.unread)).catch(() => setN(0));
  }, [area, orgId, tick]);
  return n;
}

export function RepiNews({ area, orgId, onGo, onSeen }: { area: "coach" | "gym"; orgId: string; onGo: (dest: AnnouncementDest) => void; onSeen?: () => void }) {
  const [d, setD] = useState<{ items: RepiNewsItem[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seen = useRef(onSeen);
  seen.current = onSeen;
  const load = useCallback(() => api<{ items: RepiNewsItem[] }>(`/api/announcements?area=${area}&org=${encodeURIComponent(orgId)}`).then((x) => {
    setD(x);
    if (x.items.some((i) => i.unread)) void api("/api/announcements", { body: { area, org: orgId } }).then(() => seen.current?.()).catch(() => {});
  }).catch((e) => setErr((e as Error).message)), [area, orgId]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <div className="co-head"><div><span className="co-kicker">Lo nuevo y lo mejorado en REPI, para tu rol</span><h1 tabIndex={-1}>Novedades de REPI</h1></div></div>
      {err && <p role="alert" className="err-box">{err} <button type="button" className="btn sm" onClick={() => void load()}>Reintentar</button></p>}
      {!d && !err && <p className="muted">Cargando…</p>}
      {d && !d.items.length && <p className="muted">No hay novedades por ahora.</p>}
      {d && d.items.length > 0 && (
        <ul className="repinews" aria-label="Novedades de REPI">
          {d.items.map((n) => (
            <li key={n.id} className="card">
              <span className="muted" style={{ fontSize: 12 }}>{ANNOUNCEMENT_KINDS[n.kind]} · {whenTxt(n.at)}{n.unread && <b className="nbadge" style={{ marginLeft: 8, position: "static" }}>Nuevo</b>}</span>
              <h2 style={{ fontSize: 17, margin: "4px 0" }}>{n.title}</h2>
              <p style={{ margin: 0, lineHeight: 1.45 }}>{n.summary}</p>
              {n.destination !== "none" && <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => onGo(n.destination)}>{n.ctaLabel || "Ver"}</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
