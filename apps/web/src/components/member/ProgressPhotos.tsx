"use client";
// PP1 (D200) · Progreso › Fotos: galería privada para comparar a mano, sin IA ni análisis. Sólo la ve la persona.
// - Antes de subir, el teléfono la achica (lado mayor ≤ 2048 px) y la vuelve a codificar en JPEG: eso descarta EXIF y
//   ubicación. El servidor igual valida el tipo real y quita metadatos.
// - Necesita conexión: la foto aparece en la galería recién cuando el servidor confirmó que quedó guardada.
// - Comparador lado a lado o con deslizador (arrastre, toque o teclado). Las fotos no se deforman (object-fit: contain) y
//   no se modifican.
import { useCallback, useEffect, useRef, useState } from "react";
import { PROGRESS_POSES, localDate, type ProgressPose } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";
import { AgeGate } from "./AgeGate";
import { Loading, Skel, SkelCard } from "@/components/motion/Skeleton";

type Photo = { id: string; day: string; pose: ProgressPose | null; width: number; height: number; createdAt: string };
const src = (id: string) => `/api/me/photo-file/${encodeURIComponent(id)}`;
const dayTxt = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const MAX_SIDE = 2048;

/** Achica y re-codifica en el teléfono (sin metadatos). Si el navegador no puede, manda el original (el servidor lo limpia). */
async function prepare(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
    return out ?? file;
  } catch { return file; }
}

export function ProgressPhotos({ flash, offline }: { flash: (t: string) => void; offline?: boolean }) {
  const [list, setList] = useState<{ photos: Photo[]; limit: number; canUpload: boolean; eligibility: "adult" | "minor" | "unknown" } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [view, setView] = useState<Photo | null>(null);
  const [cmp, setCmp] = useState(false);
  const [up, setUp] = useState<{ file: File; day: string; pose: ProgressPose | "" } | null>(null);
  const load = useCallback(() => api<{ photos: Photo[]; limit: number; canUpload: boolean; eligibility: "adult" | "minor" | "unknown" }>("/api/me/progress/photos").then((r) => { setList(r); setErr(null); setSel((s) => s.filter((id) => r.photos.some((p) => p.id === id))); }).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { if (!offline) void load(); }, [load, offline]);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));

  if (offline) return <div className="pc-empty" role="status">Sin conexión: las fotos se ven y se suben con conexión, para que nunca figure como guardada una foto que todavía no llegó.</div>;
  if (err) return <p className="mb-err" role="alert">{err} <button type="button" className="linkbtn" onClick={() => void load()}>Reintentar</button></p>;
  if (!list) return <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}><Loading what="tus fotos" /><SkelCard h={96} lines={2} /><div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{[0, 1, 2].map((i) => <Skel key={i} h={120} r={12} />)}</div></div>;
  const photos = list.photos;
  const pair = sel.map((id) => photos.find((p) => p.id === id)!).filter(Boolean).sort((a, b) => a.day.localeCompare(b.day));
  return (
    <>
      <p className="mb-muted" role="note" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>Privadas: sólo las ves vos. No se comparten con tu coach, tu gimnasio ni la comunidad, y REPI no las analiza.</p>
      <section className="pp-card" aria-labelledby="ph-h">
        <div className="pp-head"><h2 id="ph-h">Fotos de progreso</h2><span className="mb-muted" style={{ fontSize: 12 }}>{photos.length} de {list.limit}</span></div>
        {list.canUpload ? (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setUp({ file: f, day: localDate(new Date()), pose: "" }); }} />
            <button type="button" className="cta" disabled={photos.length >= list.limit} onClick={() => fileRef.current?.click()}>Agregar foto</button>
          </>
        ) : list.eligibility === "unknown" ? <AgeGate what="Subir fotos de progreso" onDone={() => void load()} />
          : <div className="pc-empty" role="note">Las fotos de progreso no están disponibles para menores de 18 años.</div>}
        {!photos.length ? <span className="mb-muted" style={{ fontSize: 14 }}>Todavía no subiste fotos. No hace falta hacer todos los ángulos: subí las que quieras, cuando quieras.</span> : (
          <>
            <span className="mb-muted" style={{ fontSize: 13 }}>{sel.length < 2 ? "Elegí dos fotos para compararlas, o abrí una para verla." : "Listo: compará las dos fotos elegidas."}</span>
            <div className="pp-photos">
              {photos.map((p) => (
                <button key={p.id} type="button" className="pp-photo" aria-pressed={sel.includes(p.id)} aria-label={`Foto del ${dayTxt(p.day)}${p.pose ? `, ${PROGRESS_POSES[p.pose]}` : ""}${sel.includes(p.id) ? ", elegida para comparar" : ""}`} onClick={() => toggle(p.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(p.id)} alt="" loading="lazy" decoding="async" />
                  <span>{dayTxt(p.day)}{p.pose ? ` · ${PROGRESS_POSES[p.pose]}` : ""}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="cta sm" disabled={sel.length !== 2} onClick={() => setCmp(true)}>Comparar</button>
              <button type="button" className="ghost sm" disabled={sel.length !== 1} onClick={() => setView(photos.find((p) => p.id === sel[0]) ?? null)}>Abrir</button>
              {sel.length > 0 && <button type="button" className="linkbtn" onClick={() => setSel([])}>Quitar selección</button>}
            </div>
          </>
        )}
      </section>
      {up && <UploadSheet up={up} setUp={setUp} onClose={() => setUp(null)} onDone={async () => { setUp(null); flash("Foto guardada en tu cuenta. Sólo la ves vos."); await load(); }} />}
      {view && <ViewSheet p={view} onClose={() => setView(null)} onChanged={async (m) => { setView(null); flash(m); await load(); }} />}
      {cmp && pair.length === 2 && <CompareSheet a={pair[0]} b={pair[1]} onClose={() => setCmp(false)} />}
    </>
  );
}

function UploadSheet({ up, setUp, onClose, onDone }: { up: { file: File; day: string; pose: ProgressPose | "" }; setUp: (u: typeof up) => void; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview] = useState(() => URL.createObjectURL(up.file));
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);
  const send = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const blob = await prepare(up.file);
      const fd = new FormData();
      fd.append("file", new File([blob], "foto.jpg", { type: blob.type || up.file.type }));
      const q = new URLSearchParams({ day: up.day, ...(up.pose ? { pose: up.pose } : {}) });
      const r = await fetch(`/api/me/progress/photos?${q}`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No pudimos guardar la foto.");
      onDone();
    } catch (e) { setErr(`${(e as Error).message} No se guardó: podés reintentar.`); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Nueva foto de progreso" onClose={busy ? () => {} : onClose} closeLabel="Cancelar">
      <div className="pp-form">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Vista previa de la foto elegida" style={{ width: "100%", maxHeight: "40vh", objectFit: "contain", borderRadius: 12, background: "var(--ui-page-2)" }} />
        <div className="pp-row2">
          <label>Fecha<input type="date" value={up.day} max={localDate(new Date())} onChange={(e) => setUp({ ...up, day: e.target.value })} /></label>
          <label>Categoría (opcional)<select value={up.pose} onChange={(e) => setUp({ ...up, pose: e.target.value as ProgressPose | "" })}>
            <option value="">Sin categoría</option>{(Object.keys(PROGRESS_POSES) as ProgressPose[]).map((k) => <option key={k} value={k}>{PROGRESS_POSES[k]}</option>)}
          </select></label>
        </div>
        <small className="mb-muted">Se achica en tu teléfono y se le quitan los datos de ubicación y del dispositivo antes de guardarla.</small>
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={() => void send()}>{busy ? "Subiendo…" : "Guardar foto"}</button>
      </div>
    </Sheet>
  );
}

function ViewSheet({ p, onClose, onChanged }: { p: Photo; onClose: () => void; onChanged: (m: string) => void }) {
  const [pose, setPose] = useState<ProgressPose | "">(p.pose ?? "");
  const [day, setDay] = useState(p.day);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/me/progress/photos/${p.id}`, { body: { day, pose: pose || null } }); onChanged("Foto actualizada."); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const del = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/me/progress/photos/${p.id}`, { method: "DELETE" }); onChanged("Foto eliminada de tu cuenta."); }
    catch (e) { setErr(`${(e as Error).message} Podés reintentar.`); setBusy(false); }
  };
  return (
    <Sheet title={dayTxt(p.day)} sub={p.pose ? PROGRESS_POSES[p.pose] : undefined} onClose={onClose}>
      <div className="pp-viewer pp-form">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src(p.id)} alt={`Tu foto de progreso del ${dayTxt(p.day)}`} />
        <div className="pp-row2">
          <label>Fecha<input type="date" value={day} max={localDate(new Date())} onChange={(e) => setDay(e.target.value)} /></label>
          <label>Categoría<select value={pose} onChange={(e) => setPose(e.target.value as ProgressPose | "")}>
            <option value="">Sin categoría</option>{(Object.keys(PROGRESS_POSES) as ProgressPose[]).map((k) => <option key={k} value={k}>{PROGRESS_POSES[k]}</option>)}
          </select></label>
        </div>
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy || (day === p.day && (pose || null) === p.pose)} onClick={() => void save()}>Guardar cambios</button>
        <a className="ghost" href={src(p.id)} download={`repi-progreso-${p.day}.jpg`} style={{ display: "grid", placeItems: "center" }}>Descargar</a>
        {!ask ? <button type="button" className="ghost hx-danger" disabled={busy} onClick={() => setAsk(true)}>Eliminar foto</button> : (
          <div className="conflict" role="alert"><strong>¿Eliminar esta foto?</strong><span>Se borra de tu cuenta y del almacenamiento. No se puede deshacer.</span>
            <div style={{ display: "flex", gap: 8 }}><button type="button" className="cta sm" disabled={busy} onClick={() => void del()}>Eliminar</button><button type="button" className="ghost sm" onClick={() => setAsk(false)}>No</button></div></div>
        )}
      </div>
    </Sheet>
  );
}

function CompareSheet({ a, b, onClose }: { a: Photo; b: Photo; onClose: () => void }) {
  const [mode, setMode] = useState<"side" | "slide">("side");
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const at = (clientX: number) => { const r = box.current?.getBoundingClientRect(); if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))); };
  return (
    <Sheet title="Comparar fotos" sub={`${dayTxt(a.day)} → ${dayTxt(b.day)}`} onClose={onClose}>
      <div className="pp-form">
        <div className="pp-ranges" role="group" aria-label="Modo de comparación">
          <button type="button" aria-pressed={mode === "side"} onClick={() => setMode("side")}>Lado a lado</button>
          <button type="button" aria-pressed={mode === "slide"} onClick={() => setMode("slide")}>Deslizador</button>
        </div>
        {mode === "side" ? (
          <div className="pp-cmp">
            {[a, b].map((p) => (
              <figure key={p.id}><div className="frame">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src(p.id)} alt={`Foto del ${dayTxt(p.day)}`} /></div>
                <figcaption>{dayTxt(p.day)}{p.pose ? ` · ${PROGRESS_POSES[p.pose]}` : ""}</figcaption></figure>
            ))}
          </div>
        ) : (
          <>
            <div ref={box} className="pp-slider" onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); at(e.clientX); }}
              onPointerMove={(e) => { if (drag.current) at(e.clientX); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(b.id)} alt={`Foto del ${dayTxt(b.day)}`} />
              <div className="top" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src(a.id)} alt={`Foto del ${dayTxt(a.day)}`} /></div>
              <span className="tag" style={{ left: 8 }}>{dayTxt(a.day)}</span><span className="tag" style={{ right: 8 }}>{dayTxt(b.day)}</span>
              <i className="bar" style={{ left: `${pos}%` }} /><i className="knob" style={{ left: `${pos}%` }} aria-hidden="true">↔</i>
            </div>
            <label>Deslizar entre {dayTxt(a.day)} y {dayTxt(b.day)}
              <input type="range" min={0} max={100} step={1} value={Math.round(pos)} onChange={(e) => setPos(Number(e.target.value))} aria-valuetext={`${Math.round(pos)} % de la foto del ${dayTxt(a.day)}`} style={{ height: 32, padding: 0 }} /></label>
          </>
        )}
        <small className="mb-muted">Las fotos se muestran tal como las subiste, sin recortes ni cambios. Si el encuadre es distinto, la comparación lo refleja.</small>
      </div>
    </Sheet>
  );
}
