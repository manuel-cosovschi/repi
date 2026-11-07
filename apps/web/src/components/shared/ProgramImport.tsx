"use client";
// SI2 · Smart Program Import 2.0 (interfaz compartida). Un único flujo para «Mis rutinas» del alumno, el constructor del coach y
// el editor del programa de un socio en Gym: elegir archivo o pegar texto → lectura con estado y reintento → revisión por días
// → confirmación. La revisión destaca sólo lo que falta o es dudoso; lo demás queda compacto, listo para «Guardar».
//  · Nada se completa solo: series o repeticiones que el documento no dice quedan vacías y marcadas. «Completar con 3 × 10»
//    existe, pero es un toque explícito y queda señalado como sugerido.
//  · El borrador se guarda en este dispositivo mientras se revisa (se recupera si se cierra la app o se corta la conexión) y se
//    borra al guardar o descartar. El archivo original nunca se guarda.
//  · `opId` identifica el guardado: un reintento no duplica.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GROUP_LETTERS, circuitIssues, presetPlan, cleanDecimalDraft, detectGroupWord, emptyDetail, importedDetail, kgTo, methodDetail, parseWeightIn,
  type ExerciseDetail, type GroupKind, type ImportField, type ImportIssue, type ImportedMethod, type ImportOriginExercise, type ImportSetValue, type ProgramDoc, type WeightUnit } from "@repi/domain";
import { ExerciseDetailEditor, detailSummary } from "@/components/coach/ExerciseDetailEditor";
import { ApiError } from "@/lib/api";
import { readImportFile, type ImportBody } from "@/lib/import-file";

export type Lib = { id: string; name: string; group: string; kind: string };
type PEx = {
  written: string; source: string | null; section: string | null; sets: number | null; reps: string | null; weightKg: number | null; perSet: ImportSetValue[] | null;
  restSec: number | null; rir: number | null; rpe: number | null; tempo: string | null; note: string | null; technique: string | null;
  group: string | null; groupKind: GroupKind | null; rounds: number | null; unit: "kg" | "lb" | null; issues: ImportIssue[];
  exerciseId: string | null; name: string | null; group_: string | null; kind: string | null; matchedBy: "library" | "ai" | null; alternatives: Lib[]; method: ImportedMethod | null;
};
export type Preview = {
  source: "sheet" | "text" | "ai"; file: "text" | "sheet" | "image" | "pdf"; notes: string[]; unread: string[];
  variants: { name: string; days: { name: string; exercises: PEx[] }[] }[];
  limits: { exercisesPerDay: number; days?: number; free?: number; max?: number };
};
export type REx = {
  k: string; written: string; source: string | null; section: string | null; note: string | null; technique: string | null;
  exerciseId: string | null; name: string | null; muscle: string | null; kind: string | null; matchedBy: "library" | "ai" | null; alternatives: Lib[];
  sets: number | null; reps: string; w: string; rest: number | null; rir: number | null; rpe: number | null; tempo: string | null;
  per: { reps: string; w: string }[] | null;
  method: ImportedMethod | null; mstate: "applied" | "ask" | "kept" | null; custom: { detail: ExerciseDetail | null; sets: number } | null;
  glabel: { letter: string; order: number } | null; gkind: GroupKind | null; rounds: number | null; gword: { kind: GroupKind; matched: string } | null;
  issues: ImportIssue[]; filled: ImportField[]; suggested: ImportField[]; open: boolean;
  orig: Omit<ImportOriginExercise, "exerciseId" | "completed" | "suggested">;
};
export type RDay = { k: string; name: string; exercises: REx[] };
export type ReviewState = { v: 1; opId: string; preview: Preview; vi: number; days: RDay[]; at: number };
export type Mode = "routine" | "program";

const SUGGEST = { sets: 3, reps: "10", rest: 90 } as const;
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const fmtW = (kg: number | null, unit: WeightUnit) => (kg == null ? "" : String(kgTo(kg, unit)).replace(".", ","));

function toREx(p: PEx, unit: WeightUnit): REx {
  const g = p.group ? /^([A-H])(\d)$/i.exec(p.group) : null;
  const r: REx = {
    k: uid(), written: p.written, source: p.source, section: p.section, note: p.note, technique: p.technique,
    exerciseId: p.exerciseId, name: p.name, muscle: p.group_, kind: p.kind, matchedBy: p.matchedBy, alternatives: p.alternatives ?? [],
    sets: p.sets, reps: p.reps ?? "", w: fmtW(p.weightKg, unit), rest: p.restSec, rir: p.rir, rpe: p.rpe, tempo: p.tempo,
    per: p.perSet ? p.perSet.map((x) => ({ reps: x.reps ?? "", w: fmtW(x.weightKg, unit) })) : null,
    method: p.method, mstate: p.method ? (p.method.confident ? "applied" : "ask") : null, custom: null,
    glabel: g ? { letter: g[1].toUpperCase(), order: Number(g[2]) } : null, gkind: p.groupKind, rounds: p.rounds,
    gword: !g && !p.method ? detectGroupWord(p.technique, p.note) : null,
    issues: p.issues ?? [], filled: [], suggested: [], open: false,
    orig: { written: p.written, sets: p.sets, reps: p.reps, weightKg: p.weightKg, perSet: p.perSet, restSec: p.restSec, rir: p.rir, rpe: p.rpe, tempo: p.tempo, technique: p.technique,
      unknown: (p.issues ?? []).filter((i) => i.kind === "missing").map((i) => i.field) },
  };
  return r;
}
export function reviewFrom(preview: Preview, vi: number, unit: WeightUnit, opId = uid()): ReviewState {
  const days = (preview.variants[vi]?.days ?? []).map((d) => ({ k: uid(), name: d.name, exercises: d.exercises.map((e) => toREx(e, unit)) }));
  for (const d of days) for (const e of d.exercises) e.open = openIssues(e, "routine").length > 0;
  return { v: 1, opId, preview, vi, days, at: Date.now() };
}

/** Lo que falta o hay que revisar en un ejercicio, ahora (cambia a medida que la persona completa). */
export function openIssues(e: REx, mode: Mode, unit: WeightUnit = "kg"): { field: ImportField; kind: "missing" | "unclear"; text: string }[] {
  const out: { field: ImportField; kind: "missing" | "unclear"; text: string }[] = [];
  if (!e.exerciseId) out.push({ field: "name", kind: "missing", text: e.alternatives.length ? "¿Cuál es? Elegí la opción correcta." : "No está en la biblioteca: buscalo o crealo." });
  if (!e.custom) {
    if (e.sets == null) out.push({ field: "sets", kind: "missing", text: "Faltan las series." });
    if (!e.reps.trim()) out.push({ field: "reps", kind: "missing", text: "Faltan las repeticiones." });
  }
  if (mode === "program" && e.rest == null) out.push({ field: "rest", kind: "missing", text: "Falta el descanso." });
  if (e.w.trim() && parseWeightIn(e.w, unit) == null) out.push({ field: "weight", kind: "missing", text: "La carga va en números (por ejemplo 12,5)." });
  if (e.per?.some((r) => r.w.trim() && parseWeightIn(r.w, unit) == null)) out.push({ field: "weight", kind: "missing", text: "Revisá las cargas por serie: van en números." });
  for (const i of e.issues) if (i.kind === "unclear" && !e.filled.includes(i.field) && !out.some((o) => o.field === i.field)) out.push({ field: i.field, kind: "unclear", text: i.text });
  return out;
}

/** Combinados del día: letras del documento (con 2 o más ejercicios) → letras libres; circuitos con sus vueltas. */
function groupMap(d: RDay) {
  const count = new Map<string, number>();
  for (const e of d.exercises) if (e.glabel) count.set(e.glabel.letter, (count.get(e.glabel.letter) ?? 0) + 1);
  const letters = [...count].filter(([, n]) => n >= 2).map(([l]) => l);
  return new Map(letters.map((l, i) => [l, GROUP_LETTERS[i]]));
}

/** Ejercicio revisado → series, repeticiones, carga y detalle (método, por serie, combinado) con las formas del constructor. */
export function buildEx(e: REx, unit: WeightUnit, letter: string | null) {
  const weightKg = e.w.trim() ? parseWeightIn(e.w, unit) : null;
  let detail: ExerciseDetail | null, sets: number;
  if (e.custom) { detail = e.custom.detail; sets = e.custom.sets; }
  else {
    sets = e.sets ?? 0;
    const per = e.per && e.per.length === sets ? e.per.map((r) => ({ reps: r.reps.trim() || e.reps.trim(), weightKg: r.w.trim() ? parseWeightIn(r.w, unit) : null })) : null;
    detail = importedDetail({ sets, reps: e.reps.trim(), weightKg, perSet: per, rir: e.rir, rpe: e.rpe, tempo: e.tempo });
    if (e.method && e.mstate === "applied") { const r = methodDetail(e.method, { sets, reps: e.reps.trim(), weightKg }, detail); detail = r.detail; sets = r.detail.setPlan?.length ?? sets; }
  }
  if (letter) detail = { ...(detail ?? emptyDetail()), group: letter, groupKind: e.gkind ?? "superset", rounds: e.gkind === "circuit" ? e.rounds ?? null : null };
  return { sets, reps: e.reps.trim(), weightKg, detail };
}
const letterOf = (d: RDay, e: REx, map = groupMap(d)) => (e.glabel ? map.get(e.glabel.letter) ?? null : null);

/** Para «Mis rutinas»: un día por rutina, con lo que decía el documento (procedencia). */
export function toRoutines(s: ReviewState, unit: WeightUnit) {
  return s.days.map((d) => {
    const map = groupMap(d);
    return {
      name: d.name.trim(),
      exercises: d.exercises.map((e) => { const b = buildEx(e, unit, letterOf(d, e, map)); return { exerciseId: e.exerciseId!, sets: b.sets, reps: b.reps, weightKg: b.weightKg, restSec: e.rest, note: e.note, detail: b.detail }; }),
      origin: d.exercises.map((e) => ({ ...e.orig, exerciseId: e.exerciseId!, completed: e.filled, suggested: e.suggested })),
    };
  });
}
/** Para un programa (coach o gimnasio): el documento del constructor. */
export function toProgramDoc(s: ReviewState, unit: WeightUnit, name: string): ProgramDoc {
  return { name: name.trim().slice(0, 120) || "Programa importado", weeks: 4, note: "", days: s.days.map((d) => {
    const map = groupMap(d);
    return { name: d.name.trim().slice(0, 60), exercises: d.exercises.map((e) => {
      const b = buildEx(e, unit, letterOf(d, e, map));
      // En un programa la carga vive en el plan (D173: series rectas con peso = N series iguales con esa carga).
      const detail = b.weightKg != null && !b.detail?.setPlan ? { ...(b.detail ?? emptyDetail()), setPlan: presetPlan("straight", { sets: b.sets, reps: b.reps, weightKg: b.weightKg }) } : b.detail;
      return { exerciseId: e.exerciseId!, name: e.name ?? e.written, sets: b.sets, reps: b.reps, rir: e.rir != null ? Math.round(e.rir) : null, restSec: e.rest ?? 0, note: e.note, detail };
    }) };
  }) };
}

// ── Borrador en este dispositivo ────────────────────────────────────────────────────────────────────────────────────────
const KEY = (scope: string) => `repi:import:${scope}`;
const TTL = 3 * 86_400_000;
export function readDraft(scope: string): ReviewState | null {
  try { const d = JSON.parse(localStorage.getItem(KEY(scope)) ?? "null") as ReviewState | null; return d && d.v === 1 && Date.now() - d.at < TTL && d.days?.length ? d : null; } catch { return null; }
}
export function writeDraft(scope: string, s: ReviewState | null) {
  try { if (s) localStorage.setItem(KEY(scope), JSON.stringify({ ...s, at: Date.now() })); else localStorage.removeItem(KEY(scope)); } catch { /* sin almacenamiento: sigue sin borrador */ }
}

// ── Lectura con estado, cancelación y reintento ─────────────────────────────────────────────────────────────────────────
const STAGES = ["Leyendo tu rutina…", "Reconociendo días, series y métodos…", "Buscando cada ejercicio en la biblioteca…", "Sigue leyendo: las fotos y los PDF largos pueden tardar hasta un minuto."];
export function useImportReader(url: string) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef<ImportBody | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const read = async (body: ImportBody): Promise<Preview | null> => {
    last.current = body; setBusy(true); setErr(null); setStage(0);
    const c = new AbortController(); ctl.current = c;
    const t = [setTimeout(() => setStage(1), 4000), setTimeout(() => setStage(2), 12000), setTimeout(() => setStage(3), 30000)];
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", signal: c.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(data.error ?? "No pudimos leer el archivo. Probá de nuevo.", data.code ?? "error", res.status);
      return data as Preview;
    } catch (e) {
      if ((e as Error).name === "AbortError") setErr(null);
      else setErr(e instanceof ApiError ? e.message : "Se cortó la conexión mientras se leía. Tocá «Reintentar».");
      return null;
    } finally { t.forEach(clearTimeout); setBusy(false); ctl.current = null; }
  };
  return { busy, stage: STAGES[stage], err, setErr, read, retry: () => (last.current ? read(last.current) : Promise.resolve(null)), cancel: () => ctl.current?.abort(), canRetry: () => !!last.current };
}

/** Paso 1: elegir archivo o pegar texto. */
export function ImportStart({ reader, onPreview, who, resume }: {
  reader: ReturnType<typeof useImportReader>; onPreview: (p: Preview) => void; who: "member" | "staff";
  resume?: { at: number; onResume: () => void; onDiscard: () => void } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const go = async (b: ImportBody) => { const p = await reader.read(b); if (p) onPreview(p); };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const b = await readImportFile(f);
    if (typeof b === "string") reader.setErr(b); else void go(b);
  };
  return (
    <div className="pi-start">
      {resume && (
        <div className="pi-resume" role="region" aria-label="Revisión sin guardar">
          <span>Tenés una importación sin guardar del {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(resume.at))}.</span>
          <div><button type="button" className="pi-btn pri" onClick={resume.onResume}>Seguir revisando</button><button type="button" className="pi-btn" onClick={resume.onDiscard}>Descartar</button></div>
        </div>
      )}
      <input ref={input} type="file" hidden accept=".csv,.txt,.tsv,.pdf,image/*,.xlsx,.ods,.xls,.numbers" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="pi-btn pri pi-big" aria-busy={reader.busy || undefined} disabled={reader.busy} onClick={() => input.current?.click()}>
        {reader.busy ? "Leyendo…" : "Elegir foto, captura, PDF o planilla"}
      </button>
      <label className="pi-sub" htmlFor="pi-text">O pegá el texto (de las notas, WhatsApp o un correo):</label>
      <textarea id="pi-text" className="pi-text" rows={5} maxLength={400_000} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"Día A\nSentadilla 4x8 60 kg\nPress banca 3x12/10/8 40/45/50 kg\n\nDía B\nRemo con barra 3x12"} />
      <button type="button" className="pi-btn" disabled={reader.busy || text.trim().length < 6} onClick={() => void go({ fileName: "Texto pegado", kind: "text", text })}>Leer el texto</button>
      {reader.busy && (
        <div className="pi-progress" role="status" aria-live="polite">
          <span className="pi-spin" aria-hidden="true" /><span>{reader.stage}</span>
          <button type="button" className="pi-link" onClick={reader.cancel}>Cancelar</button>
        </div>
      )}
      {reader.err && !reader.busy && (
        <div className="pi-error" role="alert"><span>{reader.err}</span>{reader.canRetry() && <button type="button" className="pi-btn" onClick={() => void reader.retry().then((p) => p && onPreview(p))}>Reintentar</button>}</div>
      )}
      <p className="pi-fine">
        Planillas y textos claros se leen directo, sin servicios externos. Fotos, capturas y PDF los transcribe REPI con un servicio externo (OpenAI) sólo para leerlos: no arma ni cambia
        {who === "member" ? " tu rutina" : " el programa"}. No guardamos el archivo. Evitá subir documentos con datos personales que no hagan falta.
      </p>
    </div>
  );
}

// ── Paso 2: revisión ────────────────────────────────────────────────────────────────────────────────────────────────────
type PickerRender = (p: { query: string; taken: Set<string>; onPick: (x: Lib) => void; onCancel: () => void }) => ReactNode;

export function ImportReview({ state, setState, unit, mode, renderPicker, member = false }: {
  state: ReviewState; setState: (fn: (s: ReviewState) => ReviewState) => void; unit: WeightUnit; mode: Mode; renderPicker: PickerRender; member?: boolean;
}) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [tech, setTech] = useState<{ d: number; e: number } | null>(null);
  const [showUnread, setShowUnread] = useState(false);
  const p = state.preview;
  const setDays = (fn: (ds: RDay[]) => RDay[]) => setState((s) => ({ ...s, days: fn(s.days) }));
  const setEx = (di: number, ei: number, patch: Partial<REx> | ((e: REx) => Partial<REx>)) =>
    setDays((ds) => ds.map((d, i) => (i !== di ? d : { ...d, exercises: d.exercises.map((e, j) => (j !== ei ? e : { ...e, ...(typeof patch === "function" ? patch(e) : patch) })) })));
  const fill = (e: REx, f: ImportField): Partial<REx> => ({ filled: e.filled.includes(f) ? e.filled : [...e.filled, f], suggested: e.suggested.filter((x) => x !== f) });
  const move = (di: number, ei: number, dir: -1 | 1) => setDays((ds) => ds.map((d, i) => {
    if (i !== di) return d;
    const j = ei + dir; if (j < 0 || j >= d.exercises.length) return d;
    const xs = [...d.exercises]; [xs[ei], xs[j]] = [xs[j], xs[ei]]; return { ...d, exercises: xs };
  }));
  const counts = useMemo(() => {
    let missing = 0, unclear = 0, ok = 0, total = 0;
    for (const d of state.days) for (const e of d.exercises) { total++; const o = openIssues(e, mode, unit); if (!o.length) ok++; missing += o.filter((x) => x.kind === "missing").length; unclear += o.filter((x) => x.kind === "unclear").length; }
    return { missing, unclear, ok, total };
  }, [state.days, mode, unit]);
  const missingNumbers = state.days.some((d) => d.exercises.some((e) => !e.custom && (e.sets == null || !e.reps.trim() || (mode === "program" && e.rest == null))));
  const suggestAll = () => setDays((ds) => ds.map((d) => ({ ...d, exercises: d.exercises.map((e) => {
    if (e.custom) return e;
    const sug: ImportField[] = [];
    const patch: Partial<REx> = {};
    if (e.sets == null) { patch.sets = e.per?.length || SUGGEST.sets; sug.push("sets"); }
    if (!e.reps.trim()) { patch.reps = SUGGEST.reps; sug.push("reps"); }
    if (mode === "program" && e.rest == null) { patch.rest = SUGGEST.rest; sug.push("rest"); }
    return sug.length ? { ...e, ...patch, suggested: [...new Set([...e.suggested, ...sug])] } : e;
  }) })));
  const changeVariant = (vi: number) => {
    if (vi === state.vi) return;
    if (!window.confirm("¿Cargar la otra opción del archivo? Se pierden los cambios que hiciste en esta revisión.")) return;
    setState((s) => reviewFrom(s.preview, vi, unit, s.opId));
  };
  const sourceText = p.source === "ai" ? "Lo transcribió REPI tal como está escrito, sin cambiarlo." : p.source === "sheet" ? "Leído de la planilla, sin servicios externos." : "Leído del texto, sin servicios externos.";
  const labels = (d: RDay) => { const map = groupMap(d); const n = new Map<string, number>(); return d.exercises.map((e) => { const l = letterOf(d, e, map); if (!l) return null; n.set(l, (n.get(l) ?? 0) + 1); return `${l}${n.get(l)}`; }); };

  return (
    <div className="pi-review">
      <div className="pi-summary" role="status">
        <b>{state.days.length} {state.days.length === 1 ? "día" : "días"} · {counts.total} {counts.total === 1 ? "ejercicio" : "ejercicios"}</b>
        <span className="pi-chips">
          <span className="pi-chip ok">{counts.ok} {counts.ok === 1 ? "listo" : "listos"}</span>
          {counts.missing + counts.unclear > 0 && <span className="pi-chip warn">{counts.missing + counts.unclear} para revisar</span>}
        </span>
        <small>{sourceText}</small>
      </div>
      {p.variants.length > 1 && (
        <label className="pi-field">El archivo tiene {p.variants.length} opciones (programas o semanas). ¿Cuál cargás?
          <select value={state.vi} onChange={(e) => changeVariant(Number(e.target.value))}>{p.variants.map((v, i) => <option key={i} value={i}>{v.name} · {v.days.length} {v.days.length === 1 ? "día" : "días"}</option>)}</select>
        </label>
      )}
      {p.notes.length > 0 && <div className="pi-notes"><b>Del documento</b>{p.notes.map((n, i) => <p key={i}>{n}</p>)}</div>}
      {p.unread.length > 0 && (
        <div className="pi-unread">
          <button type="button" className="pi-link" aria-expanded={showUnread} onClick={() => setShowUnread(!showUnread)}>
            {p.unread.length === 1 ? "1 parte no se pudo leer" : `${p.unread.length} partes no se pudieron leer`} {showUnread ? "▴" : "▾"}
          </button>
          {showUnread && <ul>{p.unread.map((u, i) => <li key={i}>«{u}»</li>)}</ul>}
          <small>No se cargan. Si eran ejercicios, agregalos después desde el editor.</small>
        </div>
      )}
      {(counts.missing + counts.unclear > 0) && (
        <div className="pi-tools">
          <label className="pi-toggle"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Ver sólo lo que falta revisar</label>
          {missingNumbers && <button type="button" className="pi-btn" onClick={suggestAll}>Completar lo que falta con {mode === "program" ? "3 × 10 y 90 s" : "3 × 10"} (sugerido)</button>}
        </div>
      )}
      {state.days.map((d, di) => {
        const lab = labels(d);
        const visible = d.exercises.map((e, ei) => ({ e, ei })).filter(({ e }) => !onlyIssues || openIssues(e, mode, unit).length);
        if (onlyIssues && !visible.length) return null;
        return (
          <fieldset key={d.k} className="pi-day">
            <legend className="pi-sr">Día {di + 1}</legend>
            <div className="pi-day-head">
              <input className="pi-day-name" value={d.name} maxLength={60} aria-label={`Nombre del día ${di + 1}`} aria-invalid={d.name.trim().length < 2 || undefined}
                onChange={(ev) => setDays((ds) => ds.map((x, i) => (i === di ? { ...x, name: ev.target.value } : x)))} />
              <span className="pi-muted">{d.exercises.length}</span>
              <button type="button" className="pi-link" onClick={() => { if (window.confirm(`¿Quitar «${d.name}» de la importación?`)) setDays((ds) => ds.filter((_, i) => i !== di)); }}>Quitar día</button>
            </div>
            {visible.map(({ e, ei }) => {
              const issues = openIssues(e, mode, unit);
              const nm = e.name ?? e.written;
              const sum = [e.custom ? detailSummary({ name: nm, sets: e.custom.sets, reps: e.reps, rir: e.rir, restSec: e.rest ?? 0, detail: e.custom.detail }) : null,
                !e.custom && e.sets != null && e.reps ? `${e.sets} × ${e.reps}` : null, e.w ? `${e.w} ${unit}` : null, e.rest != null ? `${e.rest} s` : null].filter(Boolean).join(" · ");
              const showSection = e.section && e.section !== d.exercises[ei - 1]?.section;
              return (
                <div key={e.k} className="pi-ex" data-state={issues.length ? "issue" : "ok"} id={`pi-${e.k}`}>
                  {showSection && <div className="pi-section">{e.section}</div>}
                  <button type="button" className="pi-ex-head" aria-expanded={e.open} onClick={() => setEx(di, ei, { open: !e.open })}>
                    {lab[ei] && <small className="pi-tag">{lab[ei]}</small>}
                    <span className="pi-ex-title">
                      <b className={e.exerciseId ? undefined : "pi-missing"}>{e.exerciseId ? nm : `«${e.written}»`}</b>
                      <small>{sum || (issues.length ? "Faltan datos" : "")}</small>
                    </span>
                    <span className={`pi-dot ${issues.length ? "warn" : "ok"}`} aria-label={issues.length ? `${issues.length} para revisar` : "Listo"} />
                  </button>
                  {e.open && (
                    <div className="pi-ex-body">
                      {(e.name && e.name !== e.written) && <small className="pi-muted">Escrito «{e.written}»{e.matchedBy === "ai" ? " · REPI lo asoció: confirmá que sea el mismo" : ""}</small>}
                      {e.source && <small className="pi-evidence">Leído de: «{e.source}»</small>}
                      {issues.length > 0 && <ul className="pi-issues">{issues.map((i, k) => (
                        <li key={k} data-kind={i.kind}>{i.text}{i.kind === "unclear" && <button type="button" className="pi-link" onClick={() => setEx(di, ei, (x) => fill(x, i.field))}>Está bien</button>}</li>
                      ))}</ul>}
                      {!e.exerciseId && e.alternatives.length > 0 && (
                        <div className="pi-alts" role="group" aria-label={`Opciones para «${e.written}»`}>
                          {e.alternatives.map((a) => <button key={a.id} type="button" className="pi-chip-btn" onClick={() => setEx(di, ei, { exerciseId: a.id, name: a.name, muscle: a.group, kind: a.kind })}>{a.name}</button>)}
                        </div>
                      )}
                      {!e.custom ? (
                        <div className="pi-grid">
                          <label>Series<input inputMode="numeric" value={e.sets ?? ""} placeholder="—" aria-invalid={e.sets == null || undefined} data-sug={e.suggested.includes("sets") || undefined}
                            onChange={(ev) => { const v = ev.target.value.replace(/\D/g, "").slice(0, 2); const n = v ? Math.min(20, Math.max(1, Number(v))) : null;
                              setEx(di, ei, (x) => ({ ...fill(x, "sets"), sets: n, per: x.per && n ? Array.from({ length: n }, (_, i) => x.per![i] ?? x.per![x.per!.length - 1]) : x.per })); }} /></label>
                          {!e.per && <label>Repes<input value={e.reps} maxLength={20} placeholder="—" aria-invalid={!e.reps.trim() || undefined} data-sug={e.suggested.includes("reps") || undefined}
                            onChange={(ev) => setEx(di, ei, (x) => ({ ...fill(x, "reps"), reps: ev.target.value }))} /></label>}
                          {!e.per && <label>Carga ({unit})<input inputMode="decimal" value={e.w} maxLength={7} placeholder="—"
                            onChange={(ev) => setEx(di, ei, (x) => ({ ...fill(x, "weight"), w: cleanDecimalDraft(ev.target.value) }))} /></label>}
                          <label>Desc. (s)<input inputMode="numeric" value={e.rest ?? ""} placeholder="—" aria-invalid={(mode === "program" && e.rest == null) || undefined} data-sug={e.suggested.includes("rest") || undefined}
                            onChange={(ev) => { const v = ev.target.value.replace(/\D/g, "").slice(0, 3); setEx(di, ei, (x) => ({ ...fill(x, "rest"), rest: v ? Math.min(900, Number(v)) : null })); }} /></label>
                        </div>
                      ) : <small className="pi-muted">Series y método ajustados en «Método y series».</small>}
                      {e.suggested.length > 0 && <small className="pi-sug">Sugerido (no estaba en el documento): {e.suggested.map((f) => ({ sets: "series", reps: "repeticiones", rest: "descanso" } as Record<string, string>)[f] ?? f).join(", ")}. Cambialo si no es así.</small>}
                      {e.per && !e.custom && (
                        <table className="pi-per"><caption className="pi-sr">Valores por serie de {nm}</caption>
                          <thead><tr><th scope="col">Serie</th><th scope="col">Repes</th><th scope="col">Carga ({unit})</th></tr></thead>
                          <tbody>{e.per.map((r, ri) => (
                            <tr key={ri}><th scope="row">{ri + 1}</th>
                              <td><input value={r.reps} maxLength={20} aria-label={`Repeticiones de la serie ${ri + 1}`} onChange={(ev) => setEx(di, ei, (x) => { const per = x.per!.map((y, k) => (k === ri ? { ...y, reps: ev.target.value } : y)); return { ...fill(x, "reps"), per, reps: (per.every((y) => y.reps === per[0].reps) ? per[0].reps : per.map((y) => y.reps || "?").join("-")).slice(0, 20) }; })} /></td>
                              <td><input inputMode="decimal" value={r.w} maxLength={7} placeholder="—" aria-label={`Carga de la serie ${ri + 1}`} onChange={(ev) => setEx(di, ei, (x) => ({ ...fill(x, "weight"), per: x.per!.map((y, k) => (k === ri ? { ...y, w: cleanDecimalDraft(ev.target.value) } : y)) }))} /></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                      {(e.rir != null || e.rpe != null || e.tempo) && <small className="pi-muted">{[e.rir != null ? `RIR ${e.rir}` : null, e.rpe != null ? `RPE ${e.rpe}` : null, e.tempo ? `tempo ${e.tempo}` : null].filter(Boolean).join(" · ")}</small>}
                      {e.note && <small className="pi-muted">Nota: {e.note}</small>}
                      {e.method && e.mstate === "applied" && !e.custom && (
                        <div className="pi-method"><span>Método: <b>{e.method.label}</b>. Leído de «{e.method.matched}».</span>
                          <button type="button" className="pi-link" onClick={() => setEx(di, ei, { mstate: "kept" })}>Dejar como nota</button></div>
                      )}
                      {e.method && e.mstate === "ask" && !e.custom && (
                        <div className="pi-method" data-ask="1" role="group" aria-label={`Método de ${nm}`}><span>Dice «{e.method.matched}». ¿Es <b>{e.method.label}</b>?</span>
                          <span><button type="button" className="pi-link" onClick={() => setEx(di, ei, { mstate: "applied" })}>Sí, aplicar</button><button type="button" className="pi-link" onClick={() => setEx(di, ei, { mstate: "kept" })}>No, dejar como nota</button></span></div>
                      )}
                      {e.gword && !e.glabel && d.exercises[ei + 1] && (
                        <div className="pi-method" data-ask="1" role="group" aria-label={`Combinado de ${nm}`}><span>Dice «{e.gword.matched}». ¿Lo combinás con {d.exercises[ei + 1].name ?? d.exercises[ei + 1].written}?</span>
                          <span><button type="button" className="pi-link" onClick={() => setDays((ds) => ds.map((x, k) => {
                            if (k !== di) return x;
                            const used = new Set(x.exercises.map((y) => y.glabel?.letter).filter(Boolean));
                            const g = GROUP_LETTERS.find((l) => !used.has(l)); if (!g) return x;
                            const kind = e.gword!.kind;
                            return { ...x, exercises: x.exercises.map((y, j) => (j === ei || j === ei + 1 ? { ...y, gword: null, glabel: { letter: g, order: j - ei + 1 }, gkind: kind, rounds: kind === "circuit" ? e.sets : null } : y)) };
                          }))}>Combinar con el siguiente</button><button type="button" className="pi-link" onClick={() => setEx(di, ei, { gword: null })}>No</button></span></div>
                      )}
                      <div className="pi-actions">
                        <button type="button" className="pi-link" disabled={!e.exerciseId || (!e.custom && (e.sets == null || !e.reps.trim()))} onClick={() => setTech({ d: di, e: ei })}>Método y series</button>
                        <button type="button" className="pi-link" aria-expanded={picking === e.k} onClick={() => setPicking(picking === e.k ? null : e.k)}>{e.exerciseId ? "Cambiar ejercicio" : "Buscar o crear"}</button>
                        <button type="button" className="pi-link" aria-label={`Subir ${nm}`} disabled={ei === 0} onClick={() => move(di, ei, -1)}>↑</button>
                        <button type="button" className="pi-link" aria-label={`Bajar ${nm}`} disabled={ei === d.exercises.length - 1} onClick={() => move(di, ei, 1)}>↓</button>
                        <button type="button" className="pi-link" onClick={() => setDays((ds) => ds.map((x, i) => (i !== di ? x : { ...x, exercises: x.exercises.filter((_, j) => j !== ei) })).filter((x) => x.exercises.length))}>Quitar</button>
                      </div>
                      {picking === e.k && renderPicker({ query: e.exerciseId ? "" : e.written, taken: new Set(d.exercises.map((x) => x.exerciseId ?? "")),
                        onPick: (x) => { setEx(di, ei, (y) => ({ ...fill(y, "name"), exerciseId: x.id, name: x.name, muscle: x.group, kind: x.kind, matchedBy: "library" })); setPicking(null); },
                        onCancel: () => setPicking(null) })}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
      {tech && state.days[tech.d]?.exercises[tech.e] && (() => {
        const d = state.days[tech.d], e = d.exercises[tech.e];
        const b = buildEx(e, unit, null);
        return <ExerciseDetailEditor member={member} e={{ name: e.name ?? e.written, sets: b.sets, reps: b.reps, rir: e.rir, restSec: e.rest ?? 90, detail: b.detail }} onClose={() => setTech(null)}
          onSave={(r) => { setEx(tech.d, tech.e, { custom: { detail: r.detail, sets: r.sets }, mstate: e.method ? "applied" : null }); setTech(null); }} />;
      })()}
    </div>
  );
}

/** ¿Se puede guardar? Si no, el motivo (y dónde), para decirlo en lugar de dejar el botón apagado sin explicación. */
export function readiness(s: ReviewState, mode: Mode, unit: WeightUnit, cap: { maxDays: number; capacityText: string }): { ok: true } | { ok: false; why: string; k?: string } {
  if (!s.days.length) return { ok: false, why: "No quedó ningún día para guardar." };
  if (s.days.length > cap.maxDays) return { ok: false, why: cap.capacityText };
  const badName = s.days.find((d) => d.name.trim().length < 2);
  if (badName) return { ok: false, why: "Cada día necesita un nombre (por ejemplo «Día A · piernas»)." };
  for (const d of s.days) for (const e of d.exercises) {
    const o = openIssues(e, mode, unit);
    if (o.length) return { ok: false, why: `${e.name ?? `«${e.written}»`} (${d.name}): ${o[0].text}`, k: e.k };
  }
  for (const d of s.days) {
    const map = groupMap(d);
    const bad = circuitIssues(d.exercises.map((e) => { const b = buildEx(e, unit, letterOf(d, e, map)); return { name: e.name ?? e.written, sets: b.sets, reps: b.reps, rir: e.rir, detail: b.detail }; }))[0];
    if (bad) return { ok: false, why: `${d.name}: el circuito ${bad.group} tiene ${bad.rounds} vueltas, pero ${bad.exercise} tiene ${bad.blocks} series. Igualalas en «Método y series».` };
  }
  return { ok: true };
}

/** Abre y lleva a la vista el ejercicio que falta revisar. */
export function focusExercise(setState: (fn: (s: ReviewState) => ReviewState) => void, k: string) {
  setState((s) => ({ ...s, days: s.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => (e.k === k ? { ...e, open: true } : e)) })) }));
  requestAnimationFrame(() => document.getElementById(`pi-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}

/** Estado de la revisión con su borrador en el dispositivo. */
export function useReview(scope: string) {
  const [state, setStateRaw] = useState<ReviewState | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ReviewState | null>(null); // lo último sin escribir: se escribe también si la hoja se cierra antes
  const setState = (fn: (s: ReviewState) => ReviewState) => setStateRaw((s) => (s ? fn(s) : s));
  useEffect(() => {
    if (!state) return;
    pending.current = state;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => { writeDraft(scope, state); pending.current = null; }, 400);
  }, [scope, state]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); if (pending.current) writeDraft(scope, pending.current); }, [scope]);
  const drop = () => { if (t.current) clearTimeout(t.current); pending.current = null; writeDraft(scope, null); };
  return { state, setState, start: (s: ReviewState | null) => { setStateRaw(s); if (!s) drop(); }, clear: () => { drop(); setStateRaw(null); } };
}

/** Error de guardado entendible: un corte de red se reintenta sin duplicar. */
export const saveError = (e: unknown) => (e instanceof ApiError ? e.message : "Se cortó la conexión al guardar. Tocá de nuevo: si ya se había guardado, no se duplica.");
