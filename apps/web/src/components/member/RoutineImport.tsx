"use client";
// D162: el alumno que ya tiene su rutina (en una foto, una captura, un PDF, una planilla o sus notas) la sube y queda en «Mis
// rutinas», un día por rutina. Una planilla con columnas claras se lee sin IA; lo demás lo transcribe REPI (OpenAI) sin
// cambiar nada. Antes de guardar se revisa: nombres de los días, ejercicios, series, reps y peso, y los ejercicios que no están
// en la biblioteca se eligen a mano, se crean (D163, sólo para la persona) o se quitan. Después cada día se edita como cualquier rutina propia.
import { useRef, useState } from "react";
import { kgTo, parseWeightIn } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";
import { readImportFile, type ImportBody } from "./HistoryImport";
import { Picker, type Lib } from "./OwnRoutines";
import { useUnit } from "./units";

type Ex = { written: string; exerciseId: string | null; name: string | null; group: string | null; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null; w: string };
type Day = { name: string; exercises: Ex[] };
type Preview = { source: "csv" | "ai"; notes: string[]; days: (Omit<Day, "exercises"> & { exercises: Omit<Ex, "w">[] })[] };

export function RoutineImportSheet({ flash, onClose, onDone }: { flash: (t: string) => void; onClose: () => void; onDone: () => void }) {
  const unit = useUnit();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [p, setP] = useState<{ source: Preview["source"]; notes: string[] } | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [picking, setPicking] = useState<{ d: number; e: number } | null>(null);

  const send = async (body: ImportBody) => {
    setBusy("read"); setErr(null);
    try {
      const r = await api<Preview>("/api/me/routines/import", { body });
      setP({ source: r.source, notes: r.notes });
      setDays(r.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, w: e.weightKg == null ? "" : String(kgTo(e.weightKg, unit)).replace(".", ",") })) })));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const b = await readImportFile(f);
    if (typeof b === "string") setErr(b); else void send(b);
  };
  const setEx = (d: number, e: number, patch: Partial<Ex>) => setDays((ds) => ds.map((x, i) => (i !== d ? x : { ...x, exercises: x.exercises.map((y, j) => (j === e ? { ...y, ...patch } : y)) })));
  const removeEx = (d: number, e: number) => setDays((ds) => ds.map((x, i) => (i !== d ? x : { ...x, exercises: x.exercises.filter((_, j) => j !== e) })).filter((x) => x.exercises.length));
  const choose = (x: Lib) => { if (picking) setEx(picking.d, picking.e, { exerciseId: x.id, name: x.name, group: x.group }); setPicking(null); };

  const missing = days.reduce((n, d) => n + d.exercises.filter((e) => !e.exerciseId).length, 0);
  const badW = days.some((d) => d.exercises.some((e) => e.w.trim() !== "" && parseWeightIn(e.w, unit) == null));
  const ready = days.length > 0 && !missing && !badW && days.every((d) => d.name.trim().length >= 2 && d.exercises.every((e) => e.reps.trim()));
  const save = async () => {
    setBusy("save"); setErr(null);
    let saved = 0;
    try {
      // En orden: el orden de carga es el de los días (Día A, Día B…) y define cuál toca después.
      for (const d of days) {
        await api("/api/me/routines", { body: { name: d.name.trim(), exercises: d.exercises.map((e) => ({
          exerciseId: e.exerciseId!, sets: e.sets, reps: e.reps.trim(), weightKg: e.w.trim() ? parseWeightIn(e.w, unit) : null, restSec: e.restSec, note: e.note,
        })) } });
        saved++;
      }
      flash(saved === 1 ? "Rutina guardada. Ya la podés empezar." : `${saved} rutinas guardadas. Ya las podés empezar.`);
      onDone();
    } catch (e) {
      setErr(`${saved ? `Se guardaron ${saved} de ${days.length}. ` : ""}${(e as Error).message}`);
      if (saved) setDays((ds) => ds.slice(saved));
    } finally { setBusy(null); }
  };

  if (p) return (
    <Sheet title="Revisá tu rutina" closeLabel="Cancelar" onClose={onClose} warn={err}
      sub={`${days.length} ${days.length === 1 ? "día" : "días"}. Corregí lo que haga falta antes de guardar; después cada día se edita desde «Mis rutinas».`}
      action={{ label: days.length === 1 ? "Guardar rutina" : `Guardar ${days.length} rutinas`, ready, busy: busy === "save", onSubmit: () => void save() }}>
      {p.source === "ai" && <p className="sheet-sub">La leyó REPI tal como está escrita, sin cambiarla. Revisá series, repeticiones y pesos.</p>}
      {p.notes.map((n, i) => <p key={i} className="sheet-warn">{n}</p>)}
      {missing > 0 && <p className="sheet-warn" role="status">{missing === 1 ? "Un ejercicio no está" : `${missing} ejercicios no están`} en la biblioteca: elegí el más parecido, crealo o quitalo.</p>}
      {days.map((d, di) => (
        <fieldset key={di} className="or-ex">
          <legend>Día {di + 1}</legend>
          <label className="or-field">Nombre<input value={d.name} maxLength={60} onChange={(e) => setDays((ds) => ds.map((x, i) => (i === di ? { ...x, name: e.target.value } : x)))} /></label>
          {d.exercises.map((e, ei) => (
            <div key={ei} className="ri-ex">
              <div className="ri-ex-name">
                {e.name ? <b>{e.name}</b> : <b className="ri-missing">«{e.written}»</b>}
                {e.name && e.name !== e.written && <small className="mb-muted">escrito «{e.written}»</small>}
                {!e.name && <small className="mb-muted">No está en la biblioteca</small>}
              </div>
              <div className="or-ex-grid">
                <label>Series<input inputMode="numeric" value={e.sets} maxLength={2} onChange={(ev) => { const n = Number(ev.target.value.replace(/\D/g, "")); if (n >= 1 && n <= 10) setEx(di, ei, { sets: n }); }} aria-label={`Series de ${e.name ?? e.written}`} /></label>
                <label>Repes<input value={e.reps} maxLength={20} onChange={(ev) => setEx(di, ei, { reps: ev.target.value })} aria-label={`Repeticiones de ${e.name ?? e.written}`} /></label>
                <label>Peso ({unit})<input inputMode="decimal" value={e.w} maxLength={7} placeholder="—" aria-invalid={e.w.trim() !== "" && parseWeightIn(e.w, unit) == null || undefined}
                  onChange={(ev) => setEx(di, ei, { w: ev.target.value.replace(/[^\d.,]/g, "") })} aria-label={`Peso de ${e.name ?? e.written} en ${unit}`} /></label>
              </div>
              {e.note && <small className="mb-muted">{e.note}</small>}
              <div className="or-ex-actions">
                <button type="button" className="linkbtn" onClick={() => setPicking(picking?.d === di && picking.e === ei ? null : { d: di, e: ei })}>{e.name ? "Cambiar" : "Elegir o crear"}</button>
                <button type="button" className="linkbtn" onClick={() => removeEx(di, ei)}>Quitar</button>
              </div>
              {picking?.d === di && picking.e === ei && <Picker onPick={choose} onCancel={() => setPicking(null)} taken={new Set(d.exercises.map((x) => x.exerciseId ?? ""))} initialQuery={e.name ? "" : e.written} />}
            </div>
          ))}
        </fieldset>
      ))}
      <button type="button" className="ghost" disabled={!!busy} onClick={() => { setP(null); setDays([]); setErr(null); }}>Subir otro archivo</button>
    </Sheet>
  );
  return (
    <Sheet title="Subir mi rutina" sub="Una foto o captura de tu rutina, un PDF, una planilla (Excel, CSV u OpenDocument) o tus notas. Cada día queda como una rutina en «Mis rutinas» y antes de guardar revisás todo." closeLabel="Cerrar" onClose={onClose}>
      <input ref={input} type="file" hidden accept=".csv,.txt,.tsv,.pdf,image/*,.xlsx,.ods,.xls,.numbers" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="cta" aria-busy={busy === "read" || undefined} disabled={!!busy} onClick={() => input.current?.click()}>{busy === "read" ? "Leyendo tu rutina…" : "Elegir foto, captura o archivo"}</button>
      <label className="sheet-sub" htmlFor="ri-text">O pegá el texto (por ejemplo, de tus notas del celular):</label>
      <textarea id="ri-text" className="note" rows={5} maxLength={60_000} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Día A\nSentadilla 4x8 60 kg\nPress banca 3x10 40 kg\n\nDía B\nRemo con barra 3x12"} />
      <button type="button" className="ghost" disabled={!!busy || text.trim().length < 8} onClick={() => void send({ fileName: "Texto pegado", kind: "text", text })}>Leer el texto</button>
      {busy === "read" && <p className="sheet-sub" role="status">Puede tardar hasta un minuto con fotos o PDF.</p>}
      {err && <p className="sheet-warn" role="alert">{err}</p>}
      <p className="sheet-sub" style={{ fontSize: 12 }}>Una planilla con columnas Día, Ejercicio, Series, Reps y Peso se lee directo. Lo demás lo lee REPI (con OpenAI) sólo para transcribirlo: no arma ni cambia tu rutina. No guardamos el archivo.</p>
    </Sheet>
  );
}
