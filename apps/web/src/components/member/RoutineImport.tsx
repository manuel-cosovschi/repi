"use client";
// D162: el alumno que ya tiene su rutina (en una foto, una captura, un PDF, una planilla o sus notas) la sube y queda en «Mis
// rutinas», un día por rutina. Una planilla con columnas claras se lee sin IA; lo demás lo transcribe REPI (OpenAI) sin
// cambiar nada. Antes de guardar se revisa: nombres de los días, ejercicios, series, reps y peso, y los ejercicios que no están
// en la biblioteca se eligen a mano, se crean (D163, sólo para la persona) o se quitan. Después cada día se edita como cualquier rutina propia.
// D184: los métodos escritos («drop set en la última», «rest-pause», «EMOM», «A1/A2») se interpretan con las mismas reglas que
// el constructor del coach. Lo claro se aplica a la vista y se puede volver a «dejar como nota»; lo ambiguo se pregunta y,
// mientras tanto, queda como estaba escrito (en la nota). Cada ejercicio se puede ajustar en «Método y series» antes de guardar.
import { useRef, useState } from "react";
import { GROUP_LETTERS, circuitIssues, cleanDecimalDraft, emptyDetail, groupLabels, isStraightPlan, kgTo, mainSets, methodDetail, parseWeightIn, resizeBlocks, type DetectedMethod, type ExerciseDetail, type GroupKind, type WeightUnit } from "@repi/domain";
import { ExerciseDetailEditor, detailSummary } from "@/components/coach/ExerciseDetailEditor";
import { IntInput } from "@/components/ui/IntInput";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";
import { readImportFile, type ImportBody } from "./HistoryImport";
import { Picker, type Lib } from "./OwnRoutines";
import { useUnit } from "./units";

type Found = DetectedMethod & { label: string };
type Ex = { written: string; exerciseId: string | null; name: string | null; group: string | null; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null; w: string;
  method: Found | null; groupLabel: { letter: string; order: number } | null; groupWord: { kind: GroupKind; matched: string } | null;
  detail: ExerciseDetail | null; mstate: "applied" | "ask" | "kept" | null; gask: boolean };
type Day = { name: string; exercises: Ex[] };
type Preview = { source: "csv" | "ai"; notes: string[]; days: { name: string; exercises: Omit<Ex, "w" | "detail" | "mstate" | "gask">[] }[] };

/** D184: aplica lo que el archivo dice con claridad (método y combinados A1/A2); lo ambiguo queda para preguntar. */
function interpret(d: Preview["days"][number], unit: WeightUnit): Day {
  // Combinados explícitos: letras del archivo → letras libres del día, sólo si el grupo tiene 2 o más ejercicios.
  const count = new Map<string, number>();
  for (const e of d.exercises) if (e.groupLabel) count.set(e.groupLabel.letter, (count.get(e.groupLabel.letter) ?? 0) + 1);
  const letters = [...count].filter(([, n]) => n >= 2).map(([l]) => l);
  const map = new Map(letters.map((l, i) => [l, GROUP_LETTERS[i]]));
  return { name: d.name, exercises: d.exercises.map((e) => {
    const x: Ex = { ...e, w: e.weightKg == null ? "" : String(kgTo(e.weightKg, unit)).replace(".", ","), detail: null, mstate: null, gask: !!e.groupWord };
    if (e.method?.confident) {
      const r = methodDetail(e.method, { sets: e.sets, reps: e.reps, weightKg: null });
      x.detail = r.detail; x.sets = r.detail.setPlan!.length; x.mstate = "applied";
    } else if (e.method) x.mstate = "ask";
    const g = e.groupLabel ? map.get(e.groupLabel.letter) : undefined;
    if (g) x.detail = { ...(x.detail ?? emptyDetail()), group: g, groupKind: "superset" };
    return x;
  }) };
}

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
      setDays(r.days.map((d) => interpret(d, unit)));
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
  const [tech, setTech] = useState<{ d: number; e: number } | null>(null);
  const asEx = (e: Ex) => ({ name: e.name ?? e.written, sets: e.sets, reps: e.reps.trim() || "10", rir: null, restSec: e.restSec ?? 90, detail: e.detail });
  /** Aplicar el método detectado (o confirmar uno ambiguo) sin tocar el combinado que ya tenga. */
  const applyFound = (d: number, i: number) => {
    const e = days[d].exercises[i];
    if (!e.method) return;
    const keep = e.detail?.group ? { group: e.detail.group, groupKind: e.detail.groupKind, rounds: e.detail.rounds } : {};
    const r = methodDetail(e.method, { sets: mainSets(e.detail, e.sets), reps: e.reps, weightKg: null });
    setEx(d, i, { detail: { ...r.detail, ...keep }, sets: r.detail.setPlan!.length, mstate: "applied" });
  };
  /** Dejar como estaba escrito: series rectas, el texto queda en la nota. El combinado, si había, se conserva. */
  const keepAsNote = (d: number, i: number) => {
    const e = days[d].exercises[i];
    const g = e.detail?.group ? { ...emptyDetail(), group: e.detail.group, groupKind: e.detail.groupKind, rounds: e.detail.rounds } : null;
    setEx(d, i, { detail: g, sets: mainSets(e.detail, e.sets), mstate: "kept" });
  };
  /** «Superserie» sin letras: se combina con el ejercicio siguiente sólo si la persona lo confirma. */
  const pairNext = (d: number, i: number) => setDays((ds) => ds.map((x, k) => {
    if (k !== d || !x.exercises[i + 1]) return x;
    const used = new Set(x.exercises.map((y) => y.detail?.group).filter(Boolean));
    const g = GROUP_LETTERS.find((l) => !used.has(l));
    if (!g) return x;
    const kind = x.exercises[i].groupWord?.kind ?? "superset";
    const rounds = kind === "circuit" ? mainSets(x.exercises[i].detail, x.exercises[i].sets) : null;
    const withG = (y: Ex): Ex => ({ ...y, gask: false, detail: { ...(y.detail ?? emptyDetail()), group: g, groupKind: kind, rounds } });
    return { ...x, exercises: x.exercises.map((y, j) => (j === i || j === i + 1 ? withG(y) : y)) };
  }));

  const missingNames = days.flatMap((d) => d.exercises.filter((e) => !e.exerciseId).map((e) => e.written));
  const missing = missingNames.length;
  const badW = days.some((d) => d.exercises.some((e) => e.w.trim() !== "" && parseWeightIn(e.w, unit) == null));
  const circuitBad = days.map((d) => circuitIssues(d.exercises.map(asEx))[0]).find(Boolean);
  const asks = days.reduce((n, d) => n + d.exercises.filter((e) => e.mstate === "ask" || (e.gask && !e.detail?.group)).length, 0);
  const ready = days.length > 0 && !missing && !badW && !circuitBad && days.every((d) => d.name.trim().length >= 2 && d.exercises.every((e) => e.reps.trim()));
  const save = async () => {
    // D180: el botón se puede tocar aunque falte algo (la hoja sólo lo atenúa). Sin este control se mandaba el ejercicio sin
    // elegir y el servidor respondía «Revisá los datos ingresados», sin decir qué.
    if (!ready) {
      const d = days.findIndex((x) => x.exercises.some((e) => !e.exerciseId));
      if (d >= 0) {
        const e = days[d].exercises.findIndex((x) => !x.exerciseId);
        setErr(`Falta elegir «${days[d].exercises[e].written}»: tocá «Elegir o crear» para buscar el más parecido o crearlo, o «Quitar».`);
        setPicking({ d, e });
        requestAnimationFrame(() => document.getElementById(`ri-${d}-${e}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      } else if (badW) setErr("Revisá los pesos marcados: van en números (por ejemplo 12,5).");
      else if (circuitBad) setErr(`El circuito ${circuitBad.group} tiene ${circuitBad.rounds} vueltas, pero ${circuitBad.exercise} tiene ${circuitBad.blocks} series. Igualalas en «Método y series».`);
      else setErr("Cada día necesita un nombre y las repeticiones de cada ejercicio.");
      return;
    }
    setBusy("save"); setErr(null);
    let saved = 0;
    try {
      // En orden: el orden de carga es el de los días (Día A, Día B…) y define cuál toca después.
      for (const d of days) {
        await api("/api/me/routines", { body: { name: d.name.trim(), exercises: d.exercises.map((e) => ({
          exerciseId: e.exerciseId!, sets: e.sets, reps: e.reps.trim(), weightKg: e.w.trim() ? parseWeightIn(e.w, unit) : null, restSec: e.restSec, note: e.note, detail: e.detail,
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
      {asks > 0 && <p className="sheet-warn" role="status">{asks === 1 ? "Hay 1 método que no está claro" : `Hay ${asks} métodos que no están claros`}: mientras no lo confirmes queda como está escrito, en la nota.</p>}
      {missing > 0 && <p className="sheet-warn" role="status">{missing === 1 ? `«${missingNames[0]}» no está` : `${missing} ejercicios no están`} en la biblioteca: elegí el más parecido, crealo o quitalo. Están marcados abajo.</p>}
      {days.map((d, di) => (
        <fieldset key={di} className="or-ex">
          <legend>Día {di + 1}</legend>
          <label className="or-field">Nombre<input value={d.name} maxLength={60} onChange={(e) => setDays((ds) => ds.map((x, i) => (i === di ? { ...x, name: e.target.value } : x)))} /></label>
          {d.exercises.map((e, ei) => (
            <div key={ei} id={`ri-${di}-${ei}`} className="ri-ex">
              <div className="ri-ex-name">
                {groupLabels(d.exercises.map(asEx))[ei] && <small className="xc-tag">{groupLabels(d.exercises.map(asEx))[ei]}</small>}
                {e.name ? <b>{e.name}</b> : <b className="ri-missing">«{e.written}»</b>}
                {e.name && e.name !== e.written && <small className="mb-muted">escrito «{e.written}»</small>}
                {!e.name && <small className="mb-muted">No está en la biblioteca</small>}
              </div>
              <div className="or-ex-grid">
                <label>Series<IntInput value={mainSets(e.detail, e.sets)} min={1} max={10} disabled={!!e.detail?.setPlan && !isStraightPlan(e.detail)} onChange={(n) => n != null && setEx(di, ei, e.detail?.setPlan ? resizeBlocks(asEx(e), n) : { sets: n })} aria-label={`Series de ${e.name ?? e.written}`} /></label>
                <label>Repes<input value={e.reps} maxLength={20} onChange={(ev) => setEx(di, ei, { reps: ev.target.value })} aria-label={`Repeticiones de ${e.name ?? e.written}`} /></label>
                <label>Peso ({unit})<input inputMode="decimal" value={e.w} maxLength={7} placeholder="—" aria-invalid={e.w.trim() !== "" && parseWeightIn(e.w, unit) == null || undefined}
                  onChange={(ev) => setEx(di, ei, { w: cleanDecimalDraft(ev.target.value) })} aria-label={`Peso de ${e.name ?? e.written} en ${unit}`} /></label>
              </div>
              {e.note && <small className="mb-muted">{e.note}</small>}
              {e.method && e.mstate === "applied" && (
                <div className="ri-method" role="note"><span>Método: <b>{detailSummary(asEx(e)) || e.method.label}</b>. Leído de «{e.method.matched}».</span>
                  <div><button type="button" className="ghost sm" onClick={() => setTech({ d: di, e: ei })}>Ajustar</button><button type="button" className="ghost sm" onClick={() => keepAsNote(di, ei)}>Dejar como nota</button></div></div>
              )}
              {e.method && e.mstate === "ask" && (
                <div className="ri-method" data-ask="1" role="group" aria-label={`Método de ${e.name ?? e.written}`}><span>Dice «{e.method.matched}». ¿Es <b>{e.method.label}</b>?</span>
                  <div><button type="button" className="ghost sm" onClick={() => applyFound(di, ei)}>Sí, aplicar</button><button type="button" className="ghost sm" onClick={() => keepAsNote(di, ei)}>No, dejar como nota</button></div></div>
              )}
              {e.gask && !e.detail?.group && (
                <div className="ri-method" data-ask="1" role="group" aria-label={`Combinado de ${e.name ?? e.written}`}><span>Dice «{e.groupWord?.matched}».{d.exercises[ei + 1] ? ` ¿Lo combinás con ${d.exercises[ei + 1].name ?? d.exercises[ei + 1].written}?` : ""}</span>
                  <div>{d.exercises[ei + 1] && <button type="button" className="ghost sm" onClick={() => pairNext(di, ei)}>Combinar con el siguiente</button>}<button type="button" className="ghost sm" onClick={() => setEx(di, ei, { gask: false })}>No</button></div></div>
              )}
              <div className="or-ex-actions">
                <button type="button" className="linkbtn" onClick={() => setTech({ d: di, e: ei })} aria-label={`Método y series de ${e.name ?? e.written}`}>Método y series</button>
                <button type="button" className="linkbtn" onClick={() => setPicking(picking?.d === di && picking.e === ei ? null : { d: di, e: ei })}>{e.name ? "Cambiar" : "Elegir o crear"}</button>
                <button type="button" className="linkbtn" onClick={() => removeEx(di, ei)}>Quitar</button>
              </div>
              {picking?.d === di && picking.e === ei && <Picker onPick={choose} onCancel={() => setPicking(null)} taken={new Set(d.exercises.map((x) => x.exerciseId ?? ""))} initialQuery={e.name ? "" : e.written} />}
            </div>
          ))}
        </fieldset>
      ))}
      <button type="button" className="ghost" disabled={!!busy} onClick={() => { setP(null); setDays([]); setErr(null); }}>Subir otro archivo</button>
      {tech && days[tech.d]?.exercises[tech.e] && <ExerciseDetailEditor member e={asEx(days[tech.d].exercises[tech.e])} onClose={() => setTech(null)}
        onSave={(r) => { setEx(tech.d, tech.e, { detail: r.detail, sets: r.sets, mstate: days[tech.d].exercises[tech.e].method ? "applied" : null }); setTech(null); }} />}
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
