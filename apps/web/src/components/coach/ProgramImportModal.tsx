"use client";
// SI2: importar un programa que ya existe (foto, PDF, planilla o texto) desde el constructor del coach o el editor del programa de
// un socio en Gym. Misma lectura y revisión que el alumno (components/shared/ProgramImport). No es un segundo constructor: el
// resultado entra al editor de siempre. Coach: se crea como programa nuevo sin asignar. Gym: reemplaza el borrador del editor
// (con confirmación) y se guarda recién con «Guardar revisión».
import { useMemo, useState } from "react";
import { matchesExerciseQuery, type ProgramDoc } from "@repi/domain";
import { Modal } from "@/components/ui/Modal";
import { ImportReview, ImportStart, focusExercise, readDraft, readiness, reviewFrom, toProgramDoc, useImportReader, useReview, type Lib, type Preview, type ReviewState } from "@/components/shared/ProgramImport";
import { NewExercise } from "./NewExercise";

export type ImportUse = { doc: ProgramDoc; opId: string; source: Preview["source"]; file: Preview["file"] };

function StaffPicker({ library, query, taken, onPick, onCancel, createUrl, flash, onCreated }: {
  library: Lib[]; query: string; taken: Set<string>; onPick: (x: Lib) => void; onCancel: () => void; createUrl: string; flash: (t: string) => void; onCreated: (x: Lib) => void;
}) {
  const [q, setQ] = useState(query);
  const found = useMemo(() => library.filter((x) => !taken.has(x.id) && matchesExerciseQuery(x.name, q)).slice(0, 12), [library, q, taken]);
  return (
    <div className="pi-picker">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la biblioteca" aria-label="Buscar ejercicio" />
      <ul>{found.map((x) => <li key={x.id}><button type="button" onClick={() => onPick(x)}><span>{x.name}</span><small>{x.group}</small></button></li>)}</ul>
      {!found.length && <small className="pi-muted">Sin resultados.</small>}
      <NewExercise url={createUrl} query={q} known={library} flash={flash} onCreated={(e) => { const x = { id: e.id, name: e.name, group: e.group, kind: e.kind }; onCreated(x); onPick(x); }} />
      <button type="button" className="pi-btn" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

export function ProgramImportModal({ title, scope, previewUrl, createUrl, library, flash, useLabel, onClose, onUse, defaultName }: {
  title: string; scope: string; previewUrl: string; createUrl: string; library: Lib[]; flash: (t: string) => void;
  useLabel: string; onClose: () => void; onUse: (u: ImportUse) => Promise<boolean | void> | boolean | void; defaultName: string;
}) {
  const reader = useImportReader(previewUrl);
  const review = useReview(scope);
  const [extra, setExtra] = useState<Lib[]>([]);
  const [name, setName] = useState(defaultName);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ReviewState | null>(() => (typeof window === "undefined" ? null : readDraft(scope)));
  const lib = useMemo(() => [...library, ...extra], [library, extra]);
  const open = (p: Preview) => {
    setErr(null); setDraft(null);
    const s = reviewFrom(p, 0, "kg");
    review.start(s);
    if (!defaultName && p.variants[0]?.name && p.variants[0].name !== "Rutina") setName(p.variants[0].name);
  };
  const s = review.state;
  const maxDays = s?.preview.limits.days ?? 14;
  const ready = s ? readiness(s, "program", "kg", { maxDays, capacityText: `Un programa tiene hasta ${maxDays} días y hay ${s.days.length}. Quitá los que no correspondan o importalos en otro programa.` }) : null;
  const use = async () => {
    if (!s || !ready) return;
    if (!ready.ok) { setErr(ready.why); if (ready.k) focusExercise(review.setState, ready.k); return; }
    if (busy) return;
    setBusy(true); setErr(null);
    // `false`: quien recibe lo canceló (por ejemplo, no confirmó reemplazar el borrador): la revisión sigue abierta.
    try { if ((await onUse({ doc: toProgramDoc(s, "kg", name), opId: s.opId, source: s.preview.source, file: s.preview.file })) !== false) review.clear(); }
    catch (e) { setErr((e as Error).message || "No pudimos usar la importación. Probá de nuevo: no se duplica."); }
    finally { setBusy(false); }
  };
  return (
    <Modal label={title} onClose={onClose} wide>
      <div className="mhead"><h2>{title}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {!s ? (
        <ImportStart reader={reader} onPreview={open} who="staff"
          resume={draft ? { at: draft.at, onResume: () => { review.start(draft); setDraft(null); }, onDiscard: () => { review.clear(); setDraft(null); } } : null} />
      ) : (
        <>
          <label className="pi-field">Nombre del programa<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Programa importado" /></label>
          <ImportReview state={s} setState={review.setState} unit="kg" mode="program"
            renderPicker={(p) => <StaffPicker library={lib} {...p} createUrl={createUrl} flash={flash} onCreated={(x) => setExtra((xs) => [...xs, x])} />} />
          {err && <p className="pi-error" role="alert">{err}</p>}
          <div className="pi-footer">
            <button type="button" className="pi-btn" disabled={busy} onClick={() => { if (window.confirm("¿Descartar esta revisión y subir otro archivo?")) { review.clear(); setErr(null); } }}>Descartar y subir otro</button>
            <button type="button" className="pi-btn pri" aria-busy={busy || undefined} aria-disabled={!ready?.ok || undefined} onClick={() => void use()}>{busy ? "Guardando…" : useLabel}</button>
          </div>
          {ready && !ready.ok && <small className="pi-muted" role="status">{ready.why}</small>}
        </>
      )}
    </Modal>
  );
}
