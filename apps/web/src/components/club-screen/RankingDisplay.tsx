"use client";
// TV de la sala (D146): muestra el ranking por ejercicio del gimnasio y lo actualiza cada 10 s; rota de ejercicio cada 20 s.
// Quien sube se desliza hacia arriba y se resalta en verde, quien baja en rojo (respeta «reducir movimiento»). El secreto de la
// pantalla queda en este equipo; si el gimnasio la revoca, se borra y explica cómo autorizarla de nuevo.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const KEY = "repi-ranking-display";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };
const POLL_MS = 10_000, ROTATE_MS = 20_000;

type Row = { key: string; name: string; best: number; pos: number; delta: number | null; isNew: boolean };
type Board = { gym: string; metric: string; updatedAt: string; exercises: { id: string; name: string; people: number }[]; exercise: { id: string; name: string } | null; rows: Row[] };

export function RankingDisplay() {
  const [secret, setSecret] = useState<string | null | undefined>(undefined);
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ex, setEx] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, "up" | "down">>({});
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());
  const lastPos = useRef(new Map<string, number>());

  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get("k");
    if (k) { write(k); window.history.replaceState(null, "", "/ranking/pantalla"); }
    setSecret(k ?? read());
  }, []);
  // Pantalla encendida mientras muestra el ranking (si el navegador lo permite).
  useEffect(() => {
    if (!secret) return;
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { lock = null; } };
    void ask();
    const again = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); void lock?.release().catch(() => {}); };
  }, [secret]);

  useEffect(() => {
    if (!secret) return;
    let stop = false;
    const get = async () => {
      try {
        const r = await fetch(`/api/ranking-display${ex ? `?ex=${encodeURIComponent(ex)}` : ""}`, { headers: { "x-repi-display": secret }, cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (stop) return;
        if (!r.ok) { if (r.status === 401) { write(null); setSecret(null); } setErr(j.error ?? "No pudimos cargar el ranking. Revisá la conexión."); return; }
        const b = j as Board;
        const moved: Record<string, "up" | "down"> = {};
        for (const row of b.rows) { const p = lastPos.current.get(row.key); if (p != null && p !== row.pos) moved[row.key] = row.pos < p ? "up" : "down"; }
        lastPos.current = new Map(b.rows.map((row) => [row.key, row.pos]));
        setErr(null); setBoard(b);
        if (Object.keys(moved).length) { setLive(moved); setTimeout(() => !stop && setLive({}), 4000); }
      } catch { if (!stop) setErr("Sin conexión. Seguimos intentando."); }
    };
    void get();
    const t = setInterval(get, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [secret, ex]);
  // Rotación de ejercicio: al cambiar se reinician posiciones (no se animan saltos entre ejercicios distintos).
  useEffect(() => {
    if (!board || board.exercises.length < 2) return;
    const t = setTimeout(() => {
      const i = board.exercises.findIndex((e) => e.id === board.exercise?.id);
      lastPos.current = new Map(); tops.current = new Map();
      setEx(board.exercises[(i + 1) % board.exercises.length].id);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [board?.exercise?.id, board?.exercises]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = list.current; if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (const row of [...el.children] as HTMLElement[]) {
      const k = row.dataset.k; if (!k) continue;
      const top = row.getBoundingClientRect().top, before = tops.current.get(k);
      if (!reduce && before != null && before !== top) row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" });
      tops.current.set(k, top);
    }
  }, [board]);

  if (secret === undefined) return <div className="rs"><p className="rs-small">Cargando…</p></div>;
  if (!secret) return (
    <div className="rs rs-center">
      <span className="rs-brand">REPI</span>
      <h1 className="rs-title">Pantalla del ranking</h1>
      <p className="rs-help">Esta pantalla no está autorizada. En REPI, el dueño o la gerencia entra a <b>Comunidad › Pantalla del ranking</b>, crea una y abre el enlace en esta TV o tablet.</p>
      {err && <p className="rs-small">{err}</p>}
    </div>
  );
  const kg = (v: number) => `${v.toLocaleString("es-AR")} kg`;
  return (
    <div className="rs">
      <header className="rs-head">
        <span className="rs-brand">REPI</span>
        <span className="rs-gym">{board?.gym ?? ""}</span>
        <span className="rs-live"><i aria-hidden="true" />En vivo</span>
      </header>
      <h1 className="rs-ex" key={board?.exercise?.id ?? "none"}>{board?.exercise?.name ?? "Ranking del gimnasio"}</h1>
      <p className="rs-metric">{board?.metric ?? ""} · ▲▼ puestos en la semana</p>
      {err && <p className="rs-err" role="status">{err}</p>}
      {board && !board.rows.length && <p className="rs-help">Todavía no hay marcas. Sumate desde la app: Gym › Repi Club › «Aparecer en el ranking».</p>}
      <ol className="rs-list" ref={list} aria-live="polite">
        {board?.rows.map((x) => (
          <li key={x.key} data-k={x.key} data-live={live[x.key]} data-pos={x.pos <= 3 ? x.pos : undefined}>
            <span className="rs-pos">{x.pos}</span>
            <b className="rs-name">{x.name}</b>
            <small className={x.isNew ? "rs-mv new" : x.delta ? (x.delta > 0 ? "rs-mv up" : "rs-mv down") : "rs-mv"}>{x.isNew ? "NUEVO" : x.delta ? `${x.delta > 0 ? "▲" : "▼"}${Math.abs(x.delta)}` : "="}</small>
            <strong className="rs-val">{kg(x.best)}</strong>
          </li>
        ))}
      </ol>
      {board && board.exercises.length > 1 && (
        <nav className="rs-dots" aria-label="Ejercicios">{board.exercises.map((e) => <i key={e.id} data-on={e.id === board.exercise?.id || undefined} title={e.name} />)}</nav>
      )}
      <p className="rs-foot">Aparece sólo quien eligió «Aparecer en el ranking» en la app.</p>
    </div>
  );
}
