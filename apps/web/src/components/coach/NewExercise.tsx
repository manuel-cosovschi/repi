"use client";
// «¿No está? Crealo» (D129): coach o equipo de sala suman un ejercicio propio a la biblioteca de su espacio y lo agregan al día.
// Si ya existe con ese nombre (sin importar tildes ni mayúsculas), el servidor devuelve el existente y no duplica.
// Ejercicios por tiempo (07/11/2026): en lugar de «cómo se registra» se elige qué se configura (peso y repeticiones, peso corporal,
// segundos, cinta, bici, remo, elíptico, escaladora o sólo duración). REPI lo propone por el nombre («Cinta caminadora» → cinta) y
// también el grupo muscular; se ve marcado y se cambia con un toque. Un sinónimo del catálogo no se ofrece crear: ya está.
import { useState } from "react";
import {
  EXERCISE_GROUPS, METRICS_PROFILES, METRICS_PROFILE_HINT, METRICS_PROFILE_LABEL, exerciseKey, exerciseSynonyms, guessExerciseGroup, guessExerciseKind, guessMetricsProfile,
  kindOfProfile, type MetricsProfile,
} from "@repi/domain";
import { api } from "@/lib/api";

export type CreatedExercise = { id: string; name: string; group: string; kind: string; own: boolean; existed: boolean; profile?: string | null };

/** Perfil propuesto por el nombre (cinta, bici, remo…, segundos, peso corporal o peso y repeticiones). */
const guessFor = (name: string) => guessMetricsProfile(name, guessExerciseKind(name));
/** Ya está en la biblioteca con ese nombre o con un sinónimo del catálogo («cinta caminadora» es la «Cinta (caminata)»). */
const inLibrary = (known: { name: string }[], q: string) =>
  known.some((k) => exerciseKey(k.name) === exerciseKey(q) || exerciseSynonyms(k.name).some((s) => exerciseKey(s) === exerciseKey(q)));

export function NewExercise({ url, query, known, disabled, onCreated, flash }: {
  url: string; query: string; known: { name: string }[]; disabled?: boolean; onCreated: (e: CreatedExercise) => void; flash: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>("");
  const [profile, setProfile] = useState<MetricsProfile>("strength");
  // Lo que eligió la persona ya no se pisa al seguir escribiendo el nombre.
  const [mine, setMine] = useState({ group: false, profile: false });
  const [busy, setBusy] = useState(false);
  const q = query.trim();
  const exact = q.length >= 2 && inLibrary(known, q);
  const typeName = (nm: string, chosen = mine) => {
    setName(nm);
    if (!chosen.group) setGroup(guessExerciseGroup(nm) ?? "");
    if (!chosen.profile) setProfile(guessFor(nm));
  };
  if (!open) {
    if (exact) return null;
    return (
      <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={disabled}
        onClick={() => { const fresh = { group: false, profile: false }; setMine(fresh); typeName(q, fresh); setOpen(true); }}>
        {q.length >= 2 ? `¿No está? Crear «${q.slice(0, 40)}»` : "+ Crear ejercicio propio"}
      </button>
    );
  }
  const save = async () => {
    if (name.trim().length < 2) return flash("Escribí el nombre del ejercicio.");
    if (!group) return flash("Elegí el grupo muscular.");
    setBusy(true);
    try {
      // `kind` va igual (lo que entiende una versión anterior del servidor); con `profile`, el servidor lo deduce del perfil.
      const e = await api<CreatedExercise>(url, { body: { name, group, kind: kindOfProfile(profile), profile } });
      flash(e.existed ? `«${e.name}» ya estaba en la biblioteca: lo agregamos.` : `«${e.name}» quedó en tu biblioteca.`);
      onCreated({ ...e, profile: e.profile ?? profile }); setOpen(false); setName(""); setGroup("");
    } catch (err) { flash((err as Error).message); } finally { setBusy(false); }
  };
  const sel = { height: 44, borderRadius: 10, border: "1px solid var(--ui-control-border)", padding: "0 10px", font: "500 14px var(--font-ui)", background: "var(--ui-input-bg)", color: "var(--ui-text)" } as const;
  const guessed = !mine.profile && name.trim().length >= 2 && profile !== "strength" && guessFor(name) === profile;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--ui-selection-bg)", border: "1px solid var(--ui-selection-border)" }}>
      <b style={{ fontSize: 13 }}>Ejercicio propio</b>
      <label className="field">Nombre<input value={name} maxLength={60} autoFocus onChange={(e) => typeName(e.target.value)} placeholder="Ej.: Remo gorila" /></label>
      <label className="field">Grupo muscular
        <select value={group} onChange={(e) => { setGroup(e.target.value); setMine((m) => ({ ...m, group: true })); }} style={sel}>
          <option value="">Elegí…</option>
          {EXERCISE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select></label>
      <label className="field">Qué se configura
        <select value={profile} onChange={(e) => { setProfile(e.target.value as MetricsProfile); setMine((m) => ({ ...m, profile: true })); }} style={sel}>
          {METRICS_PROFILES.map((p) => <option key={p} value={p}>{METRICS_PROFILE_LABEL[p]}</option>)}
        </select>
        <small className="muted" style={{ fontWeight: 400 }}>{METRICS_PROFILE_HINT[profile]}{guessed ? " Lo propusimos por el nombre: cambialo si no es." : ""}</small></label>
      <small className="muted">Queda sólo en la biblioteca de tu espacio. Revisá que el nombre sea claro: lo ven tus alumnos o socios.</small>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn pri sm" aria-busy={busy || undefined} onClick={() => void save()}>Crear y agregar</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}
