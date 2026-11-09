"use client";
// «Antes de REPI» (D132): subir el historial de pesos y ejercicios (planilla, texto, foto del cuaderno o PDF), revisar lo que se
// leyó y cargarlo al progreso. Una planilla con columnas claras se lee sin IA; lo demás lo lee un servicio de IA (OpenAI).
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { Reveal } from "@/components/motion/Skeleton";
import { HISTORY_PART_CHARS, HistoryImportReadJob, previewHistoryImport, type HistoryImportProgress } from "@/lib/history-import-stream";
import { Sheet } from "./Sheet";
import { buildHistoryReadParts, fmtWeight, IMPORT_MAX_TEXT_LENGTH, localDate, parseHistoryCsv, parseRoutineNotes, type WeightUnit } from "@repi/domain";
import { useUnit } from "./units";
import { RoutineImportSheet } from "./RoutineImport";

type Preview = {
  id: string; source: "csv" | "notes" | "ai"; summary: { sessions: number; exercises: number; sets: number; from: string | null; to: string | null };
  exercises: { name: string; matched: string | null; sets: number }[]; sample: { day: string; items: { exercise: string; weightKg: number | null; reps: number | null; seconds: number | null }[] }[];
  notes: string[]; dropped: number; capped: boolean;
  duplicateOf?: { fileName: string | null; confirmedAt: string | null } | null; overlap?: { sets: number; days: number; from: string | null; to: string | null };
};
type Mark = { day: string; weightKg: number | null; reps: number | null; seconds: number | null };
type Mine = { imports: { id: string; fileName: string | null; sessions: number; sets: number; fromDay: string | null; toDay: string | null }[]; evolution: { exercise: string; sessions: number; first: Mark; best: Mark; last: Mark }[] };

const ROUTINE_NOT_HISTORY = "Esto parece una rutina, no un historial con fechas. En tu gimnasio las rutinas las planifica el equipo: si querés que la tengan en cuenta, pedíselo al equipo de sala. Acá podés cargar entrenamientos que ya hiciste, con su fecha.";
const textLimitMessage = `El historial supera los ${IMPORT_MAX_TEXT_LENGTH.toLocaleString("es-AR")} caracteres. Dividilo en partes; el texto se conserva completo.`;

const d = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)) : "—");
const mark = (m: Mark, unit: WeightUnit) => m.seconds != null && m.weightKg == null ? `${m.seconds} s` : `${m.weightKg != null ? fmtWeight(m.weightKg, unit) : "PC"}${m.reps != null ? ` × ${m.reps}` : ""}`;

export { readImportFile, type ImportBody } from "@/lib/import-file";
import { readImportFile, type ImportBody } from "@/lib/import-file";

// REPI Control (D213): con `supervised` (gimnasio que planifica todo) se sigue pudiendo cargar el historial pasado, pero unas notas
// que describen una rutina no se ofrecen como rutina propia: se avisa y se sugiere pedírsela al equipo.
export function BeforeRepi({ flash, offline, onChanged, supervised = false }: { flash: (t: string) => void; offline?: boolean; onChanged?: () => void; supervised?: boolean }) {
  const unit = useUnit();
  // M06: caché en memoria; lo importado entra con alto 0 → real (bloque opcional, nunca de golpe).
  const c = useCached<Mine>(offline ? null : "/api/me/history-import");
  const mine = c.data;
  const [open, setOpen] = useState(false);
  const [routineBody, setRoutineBody] = useState<ImportBody | null>(null);
  const load = () => { void c.reload(); };
  const remove = async (id: string) => {
    if (!confirm("¿Quitar esta importación? Se borran esas series del progreso. Lo que registraste en REPI no se toca.")) return;
    try { await api(`/api/me/history-import/${id}/remove`, { body: {} }); flash("Importación quitada."); load(); onChanged?.(); } catch (e) { flash((e as Error).message); }
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2>Antes de REPI</h2>
      {!mine?.imports.length && <span className="mb-muted" style={{ fontSize: 14 }}>¿Anotabas tus pesos en una planilla, el celular o un cuaderno? Subilo y lo sumamos a tu progreso.</span>}
      <Reveal on={!!mine?.imports.length} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!!mine?.imports.length && (
          <>
            <div className="hist">{mine.evolution.slice(0, 12).map((e) => (
              <div key={e.exercise}><span><b>{e.exercise}</b><br /><small className="mb-muted">{e.sessions} {e.sessions === 1 ? "día" : "días"} · desde {d(e.first.day)}</small></span>
                <span className="mb-muted" style={{ textAlign: "right" }}>{mark(e.first, unit)} → <b style={{ color: "var(--ui-text)" }}>{mark(e.best, unit)}</b><br /><small>mejor marca</small></span></div>
            ))}</div>
            {mine.imports.map((i) => (
              <span key={i.id} className="mb-muted" style={{ fontSize: 12 }}>{i.fileName || "Historial"} · {i.sessions} días ({d(i.fromDay)} – {d(i.toDay)}) · <button type="button" className="linkbtn" onClick={() => void remove(i.id)}>Quitar</button></span>
            ))}
          </>
        )}
      </Reveal>
      <button type="button" className="ghost" disabled={offline} onClick={() => setOpen(true)}>Cargar historial anterior</button>
      {routineBody && !supervised && <RoutineImportSheet initialBody={routineBody} flash={flash} onClose={() => setRoutineBody(null)} onDone={() => { setRoutineBody(null); onChanged?.(); }} />}
      {open && <ImportSheet flash={flash} onRoutine={supervised ? null : (body) => { setOpen(false); setRoutineBody(body); }} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); onChanged?.(); }} />}
    </section>
  );
}

function ImportSheet({ flash, onClose, onDone, onRoutine }: { flash: (t: string) => void; onClose: () => void; onDone: () => void; onRoutine: ((body: ImportBody) => void) | null }) {
  const unit = useUnit();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<HistoryImportProgress | null>(null);
  const inFlight = useRef(false);
  const activeRead = useRef<AbortController | null>(null);
  const pendingJob = useRef<HistoryImportReadJob<Preview> | null>(null);
  const [hasPendingJob, setHasPendingJob] = useState(false);
  const closing = useRef(false);
  useEffect(() => () => {
    activeRead.current?.abort();
    void pendingJob.current?.remove().catch(() => {});
  }, []);
  const acceptPreview = (preview: Preview, controller: AbortController) => {
    if (controller.signal.aborted) return;
    pendingJob.current = null; setHasPendingJob(false); setP(preview);
  };
  const read = async (getBody: () => Promise<ImportBody | string>, preparingFile = false) => {
    if (inFlight.current || pendingJob.current) return;
    inFlight.current = true;
    const controller = new AbortController(); activeRead.current = controller;
    setBusy(preparingFile ? "file" : "read"); setErr(null); setProgress(null);
    try {
      const body = await getBody();
      if (controller.signal.aborted) return;
      if (typeof body === "string") { setErr(body); return; }
      if (body.kind === "text" && (body.text ?? "").length > IMPORT_MAX_TEXT_LENGTH) { setErr(textLimitMessage); return; }
      // Las notas sin fechas que describen una rutina van a la revisión editable de «Mis rutinas».
      if (body.kind === "text" && parseRoutineNotes(body.text ?? "")) {
        if (onRoutine) { onRoutine(body); return; }
        setErr(ROUTINE_NOT_HISTORY); return;
      }
      setBusy("read");
      if (body.kind === "text" && (body.text ?? "").length > 24_000 && !parseHistoryCsv(body.text!)) {
        const parts = buildHistoryReadParts(body.text!, localDate(new Date()), HISTORY_PART_CHARS);
        const job = new HistoryImportReadJob<Preview>(body.fileName, parts, body.text!);
        pendingJob.current = job; setHasPendingJob(true); setText(body.text!);
        acceptPreview(await job.read(setProgress, controller.signal), controller);
      } else acceptPreview(await previewHistoryImport<Preview>(body, setProgress, controller.signal), controller);
    } catch (e) { if (!controller.signal.aborted) setErr((e as Error).message); }
    finally { if (activeRead.current === controller) { activeRead.current = null; inFlight.current = false; setBusy(null); } }
  };
  const continueRead = async () => {
    const job = pendingJob.current;
    if (!job || inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController(); activeRead.current = controller;
    setBusy("read"); setErr(null);
    try { acceptPreview(await job.read(setProgress, controller.signal), controller); }
    catch (e) { if (!controller.signal.aborted) setErr((e as Error).message); }
    finally { if (activeRead.current === controller) { activeRead.current = null; inFlight.current = false; setBusy(null); } }
  };
  const resetRead = async (close = false) => {
    if (closing.current) return;
    closing.current = true;
    activeRead.current?.abort(); activeRead.current = null;
    inFlight.current = true; setBusy("cancel");
    try {
      await pendingJob.current?.remove();
      pendingJob.current = null; setHasPendingJob(false); setProgress(null); setErr(null);
      if (close) onClose();
    } catch (e) { setErr(`No pudimos cancelar la lectura. ${(e as Error).message}`); }
    finally { closing.current = false; inFlight.current = false; setBusy(null); }
  };
  const send = (body: ImportBody) => read(async () => body);
  const pick = (f: File | undefined) => f ? read(() => readImportFile(f), true) : undefined;
  const readingLabel = progress?.stage === "matching" ? "Relacionando ejercicios…"
    : progress?.stage === "review" ? "Preparando vista previa…"
    : progress?.total ? `Leyendo historial: ${progress.completed ?? 0} de ${progress.total} partes` : "Leyendo historial…";
  // D182: el mismo archivo ya cargado no se vuelve a cargar; si parte coincide con lo importado antes, se elige qué cargar.
  const confirmIt = async (mode?: "all" | "new_only") => {
    if (!p || inFlight.current || p.capped) return;
    inFlight.current = true;
    setBusy("save"); setErr(null);
    try {
      const r = await api<{ sets: number; duplicate?: boolean; skipped?: number }>(`/api/me/history-import/${p.id}/confirm`, { body: mode ? { mode } : {} });
      flash(r.duplicate ? "Ese historial ya estaba cargado: no se sumó otra vez." : r.skipped ? `Listo: ${r.sets} series nuevas sumadas; ${r.skipped} ya estaban.` : `Listo: ${p.summary.sessions} días de historial sumados a tu progreso.`);
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { inFlight.current = false; setBusy(null); }
  };
  const ov = p?.overlap && p.overlap.sets > 0 && !p.duplicateOf ? p.overlap : null;
  const discard = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("discard");
    try { if (p) await api(`/api/me/history-import/${p.id}/remove`, { body: {} }); setP(null); }
    catch (e) { setErr((e as Error).message); }
    finally { inFlight.current = false; setBusy(null); }
  };

  if (p) return (
    <Sheet title="Revisá lo que leímos" sub={`${p.summary.sessions} días de entrenamiento, ${p.summary.exercises} ejercicios y ${p.summary.sets} series, del ${d(p.summary.from)} al ${d(p.summary.to)}.`} closeLabel="Cancelar" onClose={() => { if (!inFlight.current) { void discard(); onClose(); } }}
      action={{ label: p.duplicateOf ? "Listo" : ov ? "Cargar sólo lo nuevo" : "Cargar a mi progreso", ready: !busy && !p.capped, busy: busy === "save", onSubmit: () => void confirmIt(ov ? "new_only" : undefined) }}>
      {p.duplicateOf && <p className="sheet-warn" role="alert">Este historial ya lo cargaste{p.duplicateOf.fileName ? ` («${p.duplicateOf.fileName}»)` : ""}. No se va a sumar dos veces.</p>}
      {ov && <p className="sheet-warn" role="alert">{ov.sets} de estas series ya están en tu historial importado ({ov.days === 1 ? `el ${d(ov.from)}` : `${ov.days} días, del ${d(ov.from)} al ${d(ov.to)}`}). «Cargar sólo lo nuevo» suma lo que falta sin repetir.
        {" "}<button type="button" className="linkbtn" disabled={!!busy} onClick={() => void confirmIt("all")}>Cargar todo igual</button></p>}
      {p.source === "ai" && <p className="sheet-sub">Lo leyó REPI automáticamente: revisá que los pesos y las fechas estén bien antes de cargarlo.</p>}
      {(p.dropped > 0 || p.capped) && <p className="sheet-warn">{p.dropped > 0 ? `${p.dropped} filas no tenían fecha, ejercicio o números válidos y no se cargan. ` : ""}{p.capped ? "La lectura está incompleta. Volvé a leer el historial completo antes de cargarlo." : ""}</p>}
      {p.notes.map((n, i) => <p key={i} className="sheet-warn">{n}</p>)}
      <div className="hist">{p.exercises.slice(0, 30).map((e) => (
        <div key={e.name}><span><b>{e.matched ?? e.name}</b>{e.matched && e.matched !== e.name && <><br /><small className="mb-muted">escrito «{e.name}»</small></>}{!e.matched && <><br /><small className="mb-muted">Sin equivalente en la biblioteca: queda con este nombre</small></>}</span><span className="mb-muted">{e.sets} series</span></div>
      ))}</div>
      {p.sample.map((s) => (
        <p key={s.day} className="sheet-sub"><b>{d(s.day)}:</b> {s.items.map((x) => `${x.exercise} ${mark({ day: s.day, ...x }, unit)}`).join(" · ")}</p>
      ))}
      {err && <p className="sheet-warn" role="alert">{err}</p>}
      <button type="button" className="ghost" disabled={!!busy} onClick={() => void discard()}>Subir otro archivo</button>
    </Sheet>
  );
  return (
    <Sheet title="Cargar historial anterior" sub="Una planilla (Excel, CSV u OpenDocument), una foto de tu cuaderno, una captura o un PDF con fechas, ejercicios, pesos y repeticiones. Antes de guardar te mostramos lo que leímos." closeLabel={busy || hasPendingJob ? "Cancelar lectura" : "Cerrar"} onClose={() => { if (busy || hasPendingJob) void resetRead(true); else onClose(); }}>
      <input ref={input} type="file" disabled={!!busy || hasPendingJob} hidden accept=".csv,.txt,.tsv,.pdf,image/*,.xlsx,.ods,.xls,.numbers" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="cta" aria-busy={busy === "read" || busy === "file" || undefined} disabled={!!busy || hasPendingJob} onClick={() => input.current?.click()}>{busy === "file" ? "Preparando archivo…" : "Elegir archivo o foto"}</button>
      <label className="sheet-sub" htmlFor="hi-text">O pegá el texto (por ejemplo, tus notas del celular):</label>
      <textarea id="hi-text" className="note" rows={5} disabled={!!busy || hasPendingJob} value={text} onChange={(e) => setText(e.target.value)} placeholder={"12/03/2024\nSentadilla 3x10 60 kg\nPress banca 4x8 50 kg"} />
      <button type="button" className="ghost" disabled={!!busy || !hasPendingJob && text.trim().length < 10} onClick={() => hasPendingJob ? void continueRead() : void send({ fileName: "Texto pegado", kind: "text", text })}>{busy === "read" ? "Leyendo historial…" : hasPendingJob ? "Continuar lectura" : "Leer el texto"}</button>
      {busy && busy !== "save" && <p className="sheet-sub" role="status" aria-live="polite">{busy === "cancel" ? "Cancelando lectura…" : busy === "file" ? "Preparando archivo…" : readingLabel}</p>}
      {hasPendingJob && !busy && <><p className="sheet-sub" role="status">{readingLabel}. Podés continuar desde lo que ya se leyó.</p><button type="button" className="ghost" onClick={() => void resetRead()}>Empezar de nuevo</button></>}
      {err && <p className="sheet-warn" role="alert">{err}</p>}
      <p className="sheet-sub" style={{ fontSize: 12 }}>REPI lee las planillas y las notas con formato claro. Si hace falta lectura automática (con OpenAI), se usa sólo para transcribirlas. No guardamos el archivo: sólo las series que confirmes. Podés quitarlas cuando quieras.</p>
    </Sheet>
  );
}
