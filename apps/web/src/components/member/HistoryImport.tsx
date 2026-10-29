"use client";
// «Antes de REPI» (D132): subir el historial de pesos y ejercicios (planilla, texto, foto del cuaderno o PDF), revisar lo que se
// leyó y cargarlo al progreso. Una planilla con columnas claras se lee sin IA; lo demás lo lee un servicio de IA (OpenAI).
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";
import { spreadsheetToCsv } from "@/lib/spreadsheet";

type Preview = {
  id: string; source: "csv" | "ai"; summary: { sessions: number; exercises: number; sets: number; from: string | null; to: string | null };
  exercises: { name: string; matched: string | null; sets: number }[]; sample: { day: string; items: { exercise: string; weightKg: number | null; reps: number | null; seconds: number | null }[] }[];
  notes: string[]; dropped: number; capped: boolean;
};
type Mark = { day: string; weightKg: number | null; reps: number | null; seconds: number | null };
type Mine = { imports: { id: string; fileName: string | null; sessions: number; sets: number; fromDay: string | null; toDay: string | null }[]; evolution: { exercise: string; sessions: number; first: Mark; best: Mark; last: Mark }[] };

const d = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)) : "—");
const mark = (m: Mark) => m.seconds != null && m.weightKg == null ? `${m.seconds} s` : `${m.weightKg != null ? `${m.weightKg.toLocaleString("es-AR")} kg` : "PC"}${m.reps != null ? ` × ${m.reps}` : ""}`;

/** Foto a JPEG de hasta 2000 px: menos datos para subir y suficiente para leer un cuaderno. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}
const asDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

export function BeforeRepi({ flash, offline }: { flash: (t: string) => void; offline?: boolean }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { api<Mine>("/api/me/history-import").then(setMine).catch(() => {}); }, []);
  useEffect(() => { if (!offline) load(); }, [load, offline]);
  const remove = async (id: string) => {
    if (!confirm("¿Quitar esta importación? Se borran esas series del progreso. Lo que registraste en REPI no se toca.")) return;
    try { await api(`/api/me/history-import/${id}/remove`, { body: {} }); flash("Importación quitada."); load(); } catch (e) { flash((e as Error).message); }
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2>Antes de REPI</h2>
      {!mine?.imports.length
        ? <span className="mb-muted" style={{ fontSize: 14 }}>¿Anotabas tus pesos en una planilla, el celular o un cuaderno? Subilo y lo sumamos a tu progreso.</span>
        : (
          <>
            <div className="hist">{mine.evolution.slice(0, 12).map((e) => (
              <div key={e.exercise}><span><b>{e.exercise}</b><br /><small className="mb-muted">{e.sessions} {e.sessions === 1 ? "día" : "días"} · desde {d(e.first.day)}</small></span>
                <span className="mb-muted" style={{ textAlign: "right" }}>{mark(e.first)} → <b style={{ color: "var(--dark-ink)" }}>{mark(e.best)}</b><br /><small>mejor marca</small></span></div>
            ))}</div>
            {mine.imports.map((i) => (
              <span key={i.id} className="mb-muted" style={{ fontSize: 12 }}>{i.fileName || "Historial"} · {i.sessions} días ({d(i.fromDay)} – {d(i.toDay)}) · <button type="button" className="linkbtn" onClick={() => void remove(i.id)}>Quitar</button></span>
            ))}
          </>
        )}
      <button type="button" className="ghost" disabled={offline} onClick={() => setOpen(true)}>Cargar historial anterior</button>
      {open && <ImportSheet flash={flash} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </section>
  );
}

function ImportSheet({ flash, onClose, onDone }: { flash: (t: string) => void; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const send = async (body: { fileName: string; kind: "text" | "image" | "pdf"; text?: string; dataUrl?: string }) => {
    setBusy("read"); setErr(null);
    try { setP(await api<Preview>("/api/me/history-import", { body })); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const name = f.name.toLowerCase();
    try {
      // D140: Excel (.xlsx) y OpenDocument (.ods) se leen acá y viajan como CSV. Numbers y .xls viejos, a exportar.
      if (/\.(xlsx|ods)$/.test(name)) {
        if (f.size > 5_000_000) return setErr("La planilla pesa más de 5 MB. Dejá sólo las hojas del historial.");
        const csv = await spreadsheetToCsv(f);
        if (csv.length > 400_000) return setErr("La planilla es muy grande. Dejá sólo las hojas o filas del historial.");
        return void send({ fileName: f.name, kind: "text", text: csv });
      }
      if (/\.(xls|numbers)$/.test(name)) return setErr(name.endsWith(".numbers") ? "Las planillas de Numbers exportalas a Excel o CSV (Archivo › Exportar a) o subí una captura." : "Ese Excel es de un formato viejo: guardalo como .xlsx o CSV, o subí una captura.");
      if (f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/.test(name)) return void send({ fileName: f.name, kind: "image", dataUrl: await shrinkImage(f) });
      if (f.type === "application/pdf" || name.endsWith(".pdf")) {
        if (f.size > 3_000_000) return setErr("El PDF pesa más de 3 MB. Subí sólo las páginas del historial o una foto.");
        return void send({ fileName: f.name, kind: "pdf", dataUrl: await asDataUrl(f) });
      }
      if (f.size > 400_000) return setErr("El archivo es muy grande. Subí una planilla CSV de hasta 400 KB.");
      return void send({ fileName: f.name, kind: "text", text: await f.text() });
    } catch { setErr("No pudimos abrir ese archivo. Probá con otro formato o una foto."); }
  };
  const confirmIt = async () => {
    if (!p) return;
    setBusy("save");
    try { await api(`/api/me/history-import/${p.id}/confirm`, { body: {} }); flash(`Listo: ${p.summary.sessions} días de historial sumados a tu progreso.`); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const discard = async () => { if (p) await api(`/api/me/history-import/${p.id}/remove`, { body: {} }).catch(() => {}); setP(null); };

  if (p) return (
    <Sheet title="Revisá lo que leímos" sub={`${p.summary.sessions} días de entrenamiento, ${p.summary.exercises} ejercicios y ${p.summary.sets} series, del ${d(p.summary.from)} al ${d(p.summary.to)}.`} closeLabel="Cancelar" onClose={() => { void discard(); onClose(); }}
      action={{ label: "Cargar a mi progreso", ready: true, busy: busy === "save", onSubmit: () => void confirmIt() }}>
      {p.source === "ai" && <p className="sheet-sub">Lo leyó REPI automáticamente: revisá que los pesos y las fechas estén bien antes de cargarlo.</p>}
      {(p.dropped > 0 || p.capped) && <p className="sheet-warn">{p.dropped > 0 ? `${p.dropped} filas no tenían fecha, ejercicio o números válidos y no se cargan. ` : ""}{p.capped ? "Se cargan las primeras 5000 series." : ""}</p>}
      {p.notes.map((n, i) => <p key={i} className="sheet-warn">{n}</p>)}
      <div className="hist">{p.exercises.slice(0, 30).map((e) => (
        <div key={e.name}><span><b>{e.matched ?? e.name}</b>{e.matched && e.matched !== e.name && <><br /><small className="mb-muted">escrito «{e.name}»</small></>}{!e.matched && <><br /><small className="mb-muted">Sin equivalente en la biblioteca: queda con este nombre</small></>}</span><span className="mb-muted">{e.sets} series</span></div>
      ))}</div>
      {p.sample.map((s) => (
        <p key={s.day} className="sheet-sub"><b>{d(s.day)}:</b> {s.items.map((x) => `${x.exercise} ${mark({ day: s.day, ...x })}`).join(" · ")}</p>
      ))}
      <button type="button" className="ghost" onClick={() => void discard()}>Subir otro archivo</button>
    </Sheet>
  );
  return (
    <Sheet title="Cargar historial anterior" sub="Una planilla (Excel, CSV u OpenDocument), una foto de tu cuaderno, una captura o un PDF con fechas, ejercicios, pesos y repeticiones. Antes de guardar te mostramos lo que leímos." closeLabel="Cerrar" onClose={onClose}>
      <input ref={input} type="file" hidden accept=".csv,.txt,.tsv,.pdf,image/*,.xlsx,.ods,.xls,.numbers" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="cta" aria-busy={busy === "read" || undefined} disabled={!!busy} onClick={() => input.current?.click()}>{busy === "read" ? "Leyendo el archivo…" : "Elegir archivo o foto"}</button>
      <label className="sheet-sub" htmlFor="hi-text">O pegá el texto (por ejemplo, tus notas del celular):</label>
      <textarea id="hi-text" className="note" rows={5} maxLength={60_000} value={text} onChange={(e) => setText(e.target.value)} placeholder={"12/03/2024\nSentadilla 3x10 60 kg\nPress banca 4x8 50 kg"} />
      <button type="button" className="ghost" disabled={!!busy || text.trim().length < 10} onClick={() => void send({ fileName: "Texto pegado", kind: "text", text })}>Leer el texto</button>
      {busy === "read" && <p className="sheet-sub" role="status">Puede tardar hasta un minuto con fotos o PDF.</p>}
      {err && <p className="sheet-warn" role="alert">{err}</p>}
      <p className="sheet-sub" style={{ fontSize: 12 }}>Si no es una planilla con columnas Fecha, Ejercicio, Series, Reps y Peso, REPI lo lee automáticamente (con OpenAI) sólo para transcribirlo. No guardamos el archivo: sólo las series que confirmes. Podés quitarlas cuando quieras.</p>
    </Sheet>
  );
}
