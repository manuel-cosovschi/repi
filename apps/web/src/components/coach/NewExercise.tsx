"use client";
// «¿No está? Crealo» (D129): coach o equipo de sala suman un ejercicio propio a la biblioteca de su espacio y lo agregan al día.
// Si ya existe con ese nombre (sin importar tildes ni mayúsculas), el servidor devuelve el existente y no duplica.
import { useState } from "react";
import { EXERCISE_GROUPS, EXERCISE_KIND_LABEL, exerciseKey, type ExerciseKind } from "@repi/domain";
import { api } from "@/lib/api";

export type CreatedExercise = { id: string; name: string; group: string; kind: string; own: boolean; existed: boolean };

export function NewExercise({ url, query, known, disabled, onCreated, flash }: {
  url: string; query: string; known: { name: string }[]; disabled?: boolean; onCreated: (e: CreatedExercise) => void; flash: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>("");
  const [kind, setKind] = useState<ExerciseKind>("load_reps");
  const [busy, setBusy] = useState(false);
  const q = query.trim();
  const exact = q.length >= 2 && known.some((k) => exerciseKey(k.name) === exerciseKey(q));
  if (!open) {
    if (exact) return null;
    return (
      <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={disabled} onClick={() => { setName(q); setOpen(true); }}>
        {q.length >= 2 ? `¿No está? Crear «${q.slice(0, 40)}»` : "+ Crear ejercicio propio"}
      </button>
    );
  }
  const save = async () => {
    if (name.trim().length < 2) return flash("Escribí el nombre del ejercicio.");
    if (!group) return flash("Elegí el grupo muscular.");
    setBusy(true);
    try {
      const e = await api<CreatedExercise>(url, { body: { name, group, kind } });
      flash(e.existed ? `«${e.name}» ya estaba en la biblioteca: lo agregamos.` : `«${e.name}» quedó en tu biblioteca.`);
      onCreated(e); setOpen(false); setName(""); setGroup("");
    } catch (err) { flash((err as Error).message); } finally { setBusy(false); }
  };
  const sel = { height: 38, borderRadius: 10, border: "1px solid #C9D2DD", padding: "0 10px", font: "500 14px var(--font-ui)", background: "#fff" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "#F4FBFD", border: "1px solid #CDEFF7" }}>
      <b style={{ fontSize: 13 }}>Ejercicio propio</b>
      <label className="field">Nombre<input value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ej.: Remo gorila" /></label>
      <label className="field">Grupo muscular
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={sel}>
          <option value="">Elegí…</option>
          {EXERCISE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select></label>
      <label className="field">Cómo se registra
        <select value={kind} onChange={(e) => setKind(e.target.value as ExerciseKind)} style={sel}>
          {(Object.keys(EXERCISE_KIND_LABEL) as ExerciseKind[]).map((k) => <option key={k} value={k}>{EXERCISE_KIND_LABEL[k]}</option>)}
        </select></label>
      <small className="muted">Queda sólo en la biblioteca de tu espacio. Revisá que el nombre sea claro: lo ven tus alumnos o socios.</small>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn pri sm" aria-busy={busy || undefined} onClick={() => void save()}>Crear y agregar</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}
