"use client";
// D162 → SI2 (Smart Program Import 2.0): el alumno que ya tiene su rutina (foto, captura, PDF, planilla, notas o WhatsApp) la
// sube y queda en «Mis rutinas», un día por rutina. La lectura y la revisión son las compartidas (components/shared/
// ProgramImport): nada se inventa, lo que falta se marca y se completa con un toque. Se guarda todo junto (o nada) con un
// identificador de operación, así un corte de red o un doble toque no duplican ni dejan días sueltos. Después cada día se
// edita, duplica y entrena como cualquier rutina propia, y lo registrado alimenta el historial y el progreso.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ImportBody } from "@/lib/import-file";
import { ImportReview, ImportStart, focusExercise, readDraft, readiness, reviewFrom, saveError, toRoutines, useImportReader, useReview, type Preview } from "@/components/shared/ProgramImport";
import { Sheet } from "./Sheet";
import { Picker } from "./OwnRoutines";
import { useUnit } from "./units";

const SCOPE = "me";

export function RoutineImportSheet({ flash, onClose, onDone, initialBody }: { flash: (t: string) => void; onClose: () => void; onDone: () => void; initialBody?: ImportBody }) {
  const unit = useUnit();
  const reader = useImportReader("/api/me/routines/import");
  const review = useReview(SCOPE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => (typeof window === "undefined" ? null : readDraft(SCOPE)));
  const initialRead = useRef(false);
  const open = (p: Preview) => { setErr(null); setDraft(null); review.start(reviewFrom(p, 0, unit)); };
  useEffect(() => {
    if (!initialBody || initialRead.current) return;
    initialRead.current = true;
    void reader.read(initialBody).then((p) => p && open(p));
  }, [initialBody]); // eslint-disable-line react-hooks/exhaustive-deps -- el cuerpo inicial se lee una vez, también con Strict Mode

  const s = review.state;
  if (!s) return (
    <Sheet title="Subir mi rutina" closeLabel="Cerrar" onClose={onClose}
      sub="Una foto o captura de tu rutina, un PDF, una planilla (Excel, CSV u OpenDocument), tus notas o un mensaje de WhatsApp. Antes de guardar revisás todo; cada día queda como una rutina en «Mis rutinas».">
      <ImportStart reader={reader} onPreview={open} who="member"
        resume={draft ? { at: draft.at, onResume: () => { review.start(draft); setDraft(null); }, onDiscard: () => { review.clear(); setDraft(null); } } : null} />
    </Sheet>
  );

  const free = s.preview.limits.free ?? 30;
  const ready = readiness(s, "routine", unit, { maxDays: free, capacityText: free === 0
    ? `Ya tenés ${s.preview.limits.max ?? 30} rutinas guardadas. Borrá alguna que ya no uses para importar.`
    : `Entran ${free} ${free === 1 ? "rutina" : "rutinas"} más en «Mis rutinas» y hay ${s.days.length} días. Quitá los que no necesites.` });
  const save = async () => {
    if (!ready.ok) { setErr(ready.why); if (ready.k) focusExercise(review.setState, ready.k); return; }
    if (saving) return; // doble toque
    setSaving(true); setErr(null);
    review.flush(); // FSA1: el borrador (con su opId) queda escrito antes de mandar: si se corta, el reintento no duplica
    try {
      const r = await api<{ ids: string[]; replay: boolean }>("/api/me/routines/import/save", { body: { opId: s.opId, source: s.preview.source, file: s.preview.file, routines: toRoutines(s, unit) } });
      review.clear();
      const n = r.ids.length;
      flash(r.replay ? "Ya estaba guardada: no se duplicó." : n === 1 ? "Rutina guardada. Ya la podés empezar." : `${n} rutinas guardadas en orden. Ya las podés empezar.`);
      onDone();
    } catch (e) { setErr(saveError(e)); } finally { setSaving(false); }
  };
  const n = s.days.length;
  return (
    <Sheet title="Revisá tu rutina" closeLabel="Cerrar" onClose={onClose} warn={err}
      sub={`Corregí sólo lo marcado. Se ${n === 1 ? "crea 1 rutina" : `crean ${n} rutinas`} en «Mis rutinas», en este orden; después cada una se edita como cualquier rutina tuya. Lo que dejes a medias queda guardado en este teléfono.`}
      action={{ label: n === 1 ? "Guardar rutina" : `Guardar ${n} rutinas`, ready: ready.ok, busy: saving, onSubmit: () => void save() }}>
      <ImportReview state={s} setState={review.setState} unit={unit} mode="routine" member
        renderPicker={({ query, taken, onPick, onCancel }) => <Picker onPick={(x) => onPick(x)} onCancel={onCancel} taken={taken} initialQuery={query} />} />
      <button type="button" className="ghost" disabled={saving} onClick={() => { if (window.confirm("¿Descartar esta revisión y subir otro archivo?")) { review.clear(); setErr(null); } }}>Descartar y subir otro</button>
    </Sheet>
  );
}
