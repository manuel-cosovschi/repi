"use client";
// D164: «Videos de ejercicios» en el panel del coach y del gimnasio. Por cada ejercicio de la biblioteca se sube un video
// (directo al almacenamiento privado) o se pega un enlace de YouTube, TikTok o Instagram. Sus socios o alumnos lo ven en
// el entrenamiento con «Ver cómo se hace»; si no hay, la app les ofrece buscarlo en YouTube.
import { useCallback, useEffect, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { uploadVideo } from "@/lib/upload";
import { Ic } from "@/components/ui/Ic";

type Media = { kind: "video" | "link"; url: string } | null;
type Row = { id: string; name: string; group: string; media: Media };
type List = { total: number; exercises: Row[] };

export function ExerciseVideos({ orgId, flash }: { orgId: string; flash: (t: string) => void }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const [data, setData] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<{ id: string; p: number | null } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const url = `/api/org/${orgId}/exercise-media`;

  const load = useCallback(() => {
    const p = new URLSearchParams({ q, ...(only ? { only: "1" } : {}) });
    api<List>(`${url}?${p}`).then((d) => { setData(d); setErr(null); }).catch((e) => setErr((e as Error).message));
  }, [url, q, only]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const setRow = (id: string, media: Media) => setData((d) => {
    if (!d) return d;
    const had = !!d.exercises.find((x) => x.id === id)?.media;
    return { total: d.total + Number(!!media) - Number(had), exercises: d.exercises.map((x) => (x.id === id ? { ...x, media } : x)) };
  });

  const upload = async (f: File | undefined) => {
    const id = target.current;
    if (!f || !id) return;
    setBusy({ id, p: 0 });
    try {
      const up = await uploadVideo({ purpose: "exercise_video", orgId, file: f, legacyUrl: `${url}/upload`, onProgress: (p) => setBusy({ id, p }) });
      const r = await api<{ media: Media }>(url, { body: { exerciseId: id, mediaId: up.id } });
      setRow(id, r.media); flash("Video cargado. Ya lo ven en el entrenamiento.");
    } catch (e) { flash((e as Error).message); } finally { setBusy(null); }
  };
  const saveLink = async (id: string) => {
    setBusy({ id, p: null });
    try { const r = await api<{ media: Media }>(url, { body: { exerciseId: id, link } }); setRow(id, r.media); setLinkFor(null); setLink(""); flash("Enlace guardado."); }
    catch (e) { flash((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async (r: Row) => {
    if (!window.confirm(`¿Quitar el video de «${r.name}»?`)) return;
    setBusy({ id: r.id, p: null });
    try { await api(url, { body: { exerciseId: r.id, remove: true } }); setRow(r.id, null); flash("Video quitado."); }
    catch (e) { flash((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <section className="card" style={{ gap: 14 }} aria-labelledby="xv-h">
      <div>
        <h2 id="xv-h" style={{ margin: 0 }}>Videos de ejercicios</h2>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>Subí un video corto de cómo se hace cada ejercicio (MP4, MOV o WebM de hasta 80 MB) o pegá un enlace de YouTube, TikTok o Instagram. Lo ven tus alumnos y socios con «Ver cómo se hace» mientras entrenan. {data ? `Cargados: ${data.total}.` : ""}</p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className="search" style={{ flex: "1 1 240px" }}><Ic i={MagnifyingGlass} size={16} color="#5B6B80" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" /></label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Sólo los que tienen video</label>
      </div>
      <input ref={file} type="file" hidden accept="video/mp4,video/quicktime,video/webm" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p role="alert" className="err-box">{err}</p>}
      {!data && !err && <p className="muted">Cargando…</p>}
      {data && !data.exercises.length && <p className="muted">{only ? "Todavía no cargaste videos." : "No encontramos ejercicios con ese nombre."}</p>}
      <ul className="xv-list">
        {data?.exercises.map((r) => (
          <li key={r.id}>
            <div className="xv-name"><b>{r.name}</b><small className="muted">{r.group}</small></div>
            <span className={`xv-state${r.media ? " on" : ""}`}>{r.media?.kind === "video" ? "Video" : r.media?.kind === "link" ? "Enlace" : "Sin video"}</span>
            <div className="xv-acts">
              {busy?.id === r.id ? <span className="muted" role="status">{busy.p != null ? `Subiendo ${Math.round(busy.p * 100)} %` : "Guardando…"}</span> : <>
                {r.media && <a className="btn" href={r.media.url} target="_blank" rel="noopener noreferrer">Ver</a>}
                <button type="button" className="btn" onClick={() => { target.current = r.id; file.current?.click(); }}>Subir video</button>
                <button type="button" className="btn" aria-expanded={linkFor === r.id} onClick={() => { setLinkFor(linkFor === r.id ? null : r.id); setLink(r.media?.kind === "link" ? r.media.url : ""); }}>Enlace</button>
                {r.media && <button type="button" className="btn danger" onClick={() => void remove(r)}>Quitar</button>}
              </>}
            </div>
            {linkFor === r.id && (
              <div className="xv-link">
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label={`Enlace del video de ${r.name}`} />
                <button type="button" className="btn pri" disabled={!link.trim()} onClick={() => void saveLink(r.id)}>Guardar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data && data.exercises.length >= 80 && <p className="muted" style={{ fontSize: 13 }}>Se muestran los primeros 80: buscá por nombre para encontrar el resto.</p>}
    </section>
  );
}
