"use client";
// D192 · Tipos de serie personalizados del profe («Load Set», «Serie de control»). El nombre es lo que ve el alumno; cómo
// funciona la serie (conteo, métricas, Training Intelligence) lo define el tipo real de REPI que se elige al crearlo. La lista
// es privada de cada profe en su organización. Renombrar o quitar un tipo no cambia programas ni registros anteriores: el
// plan guarda su propia copia del nombre.
import { useCallback, useEffect, useState } from "react";
import { SET_KIND_LABEL, SET_LABEL_PRESETS, STAGE_KINDS, cleanSetLabel, labelKey, type SetKind } from "@repi/domain";
import { api } from "@/lib/api";

export type SetTypeRow = { id: string; name: string; kind: SetKind; kindLabel: string; defaults: { reps?: string | null; rir?: number | null; rpe?: number | null; restSec?: number | null } };
/** Dónde vive la lista: coach independiente o sede del gimnasio (mismas reglas; distintas rutas). */
export type SetTypesApi = { kind: "coach" | "gym"; orgId: string };
export type SetTypesState = {
  list: SetTypeRow[]; available: boolean; loaded: boolean;
  create: (p: { name: string; kind: SetKind; defaults?: SetTypeRow["defaults"] }) => Promise<SetTypeRow>;
  rename: (id: string, name: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
};

const base = (a: SetTypesApi) => (a.kind === "coach" ? `/api/coach/${a.orgId}/set-types` : `/api/gym/${a.orgId}/set-types`);

export function useSetTypes(a: SetTypesApi | null): SetTypesState | null {
  const [list, setList] = useState<SetTypeRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const url = a ? base(a) : null;
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<{ available: boolean; types: SetTypeRow[] }>(url).then((r) => { if (live) { setList(r.types); setAvailable(r.available); setLoaded(true); } }).catch(() => { if (live) { setAvailable(false); setLoaded(true); } });
    return () => { live = false; };
  }, [url]);
  const create = useCallback(async (p: { name: string; kind: SetKind; defaults?: SetTypeRow["defaults"] }) => {
    const r = await api<SetTypeRow>(url!, { body: p });
    setList((xs) => [...xs.filter((x) => x.id !== r.id), r].sort((x, y) => x.name.localeCompare(y.name, "es")));
    return r;
  }, [url]);
  const rename = useCallback(async (id: string, name: string) => {
    const r = await api<SetTypeRow>(`${url}/${id}`, { method: a?.kind === "coach" ? "PATCH" : "POST", body: { name } });
    setList((xs) => xs.map((x) => (x.id === id ? r : x)).sort((x, y) => x.name.localeCompare(y.name, "es")));
  }, [url, a?.kind]);
  const archive = useCallback(async (id: string) => {
    if (a?.kind === "coach") await api(`${url}/${id}`, { method: "DELETE" });
    else await api(`${url}/${id}/archive`, { body: {} });
    setList((xs) => xs.filter((x) => x.id !== id));
  }, [url, a?.kind]);
  if (!a) return null;
  return { list, available, loaded, create, rename, archive };
}

/** Valor del selector de tipo de una fila: tipo de REPI (`k:`), etiqueta de REPI (`p:`), tipo propio (`t:`) o etiqueta del plan (`l:`). */
export function typeValue(row: { kind: SetKind; label?: string | null; typeId?: string | null }, types: SetTypeRow[]) {
  if (!row.label) return `k:${row.kind}`;
  // El plan manda: si el tipo se renombró después, la fila sigue mostrando el nombre con el que se programó.
  if (row.typeId && types.some((t) => t.id === row.typeId && labelKey(t.name) === labelKey(row.label) && t.kind === row.kind)) return `t:${row.typeId}`;
  const preset = SET_LABEL_PRESETS.find((p) => labelKey(p.label) === labelKey(row.label) && p.kind === row.kind);
  return preset ? `p:${preset.key}` : `l:${row.label}`;
}

/** Opciones del selector para una fila (las etapas conectadas sólo admiten tipos de etapa). */
export function TypeOptions({ stage, types, current, canCreate }: { stage: boolean; types: SetTypeRow[]; current: { kind: SetKind; label?: string | null }; canCreate: boolean }) {
  const ok = (k: SetKind) => !stage || STAGE_KINDS.includes(k);
  const kinds = (Object.keys(SET_KIND_LABEL) as SetKind[]).filter(ok);
  const v = typeValue(current, types);
  return (
    <>
      <optgroup label="Tipos de REPI">
        {kinds.map((k) => <option key={k} value={`k:${k}`}>{stage && k === "rest_pause" ? "Mini serie" : stage && k === "cluster" ? "Bloque de cluster" : SET_KIND_LABEL[k]}</option>)}
      </optgroup>
      <optgroup label="Con nombre propio">
        {SET_LABEL_PRESETS.filter((p) => ok(p.kind)).map((p) => <option key={p.key} value={`p:${p.key}`}>{p.label} ({SET_KIND_LABEL[p.kind].toLowerCase()})</option>)}
        {types.filter((t) => ok(t.kind)).map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name} ({t.kindLabel.toLowerCase()})</option>)}
        {v.startsWith("l:") && <option value={v}>{current.label} (en este plan · {SET_KIND_LABEL[current.kind].toLowerCase()})</option>}
      </optgroup>
      {canCreate && <option value="new">+ Crear tipo personalizado…</option>}
    </>
  );
}

const SEMANTIC: SetKind[] = ["work", "top", "backoff", "warmup", "amrap", "failure", "drop", "rest_pause", "cluster"];
const KIND_WHAT: Partial<Record<SetKind, string>> = {
  work: "Cuenta como serie efectiva, con su propia carga.", top: "La serie más pesada; las back-off se calculan desde ella.", backoff: "Más liviana que el top set; nunca hereda su carga.",
  warmup: "No cuenta como serie de trabajo ni para progresar.", amrap: "Todas las repeticiones posibles.", failure: "Serie efectiva hasta el fallo.",
  drop: "Etapa conectada a la serie de arriba, con menos carga.", rest_pause: "Mini serie conectada, misma carga.", cluster: "Bloque de una serie partida.",
};

/** Alta de un tipo propio, dentro del editor (sin abrir otra ventana). */
export function NewSetTypeForm({ types, stage, onCreated, onCancel }: { types: SetTypesState; stage: boolean; onCreated: (t: SetTypeRow) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SetKind>(stage ? "drop" : "work");
  const [rir, setRir] = useState("");
  const [rest, setRest] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const l = cleanSetLabel(name);
    if (!l.ok) return setErr(l.error);
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
    setBusy(true); setErr(null);
    try { onCreated(await types.create({ name: l.label, kind, defaults: { rir: num(rir), restSec: num(rest) } })); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="dx-newtype" role="group" aria-label="Crear tipo personalizado">
      <b>Nuevo tipo de serie</b>
      <small className="muted">El nombre es lo que ve el alumno. «Funciona como» define cómo cuenta en métricas y en Training Intelligence. No se comparte con otros profes ni con otras organizaciones.</small>
      <div className="dx-grid">
        <label className="field">Nombre<input value={name} maxLength={30} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ej.: Serie de control" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} /></label>
        <label className="field">Funciona como<select className="dx-sel" value={kind} onChange={(e) => setKind(e.target.value as SetKind)}>
          {SEMANTIC.filter((k) => !stage || STAGE_KINDS.includes(k)).map((k) => <option key={k} value={k}>{SET_KIND_LABEL[k]}</option>)}</select></label>
        <label className="field">RIR por defecto<input inputMode="numeric" value={rir} onChange={(e) => setRir(e.target.value)} placeholder="—" /></label>
        <label className="field">Descanso (s)<input inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} placeholder="—" /></label>
      </div>
      <small className="muted">{KIND_WHAT[kind]}</small>
      {err && <p className="err-box" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn sm pri" aria-busy={busy || undefined} onClick={() => void save()}>Guardar tipo</button>
        <button type="button" className="btn sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

/** Mis tipos: renombrar o quitar de la lista (lo ya programado conserva su nombre). */
export function SetTypesManager({ types, onClose }: { types: SetTypesState; onClose: () => void }) {
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setErr(null); try { await fn(); setEdit(null); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="dx-newtype" role="group" aria-label="Mis tipos de serie">
      <div className="dx-set-h"><b>Mis tipos de serie</b><button type="button" className="linkbtn" style={{ marginLeft: "auto" }} onClick={onClose}>Cerrar</button></div>
      <small className="muted">Renombrar o quitar un tipo cambia sólo los usos nuevos: los programas y entrenamientos anteriores conservan su nombre.</small>
      {!types.list.length && <span className="muted">Todavía no creaste tipos propios. Elegí «+ Crear tipo personalizado…» en el tipo de una serie.</span>}
      {types.list.map((t) => (
        <div key={t.id} className="dx-typerow">
          {edit?.id === t.id ? (
            <>
              <input aria-label={`Nuevo nombre de ${t.name}`} value={edit.name} maxLength={30} autoFocus onChange={(e) => setEdit({ id: t.id, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(() => types.rename(t.id, edit.name)); } if (e.key === "Escape") setEdit(null); }} />
              <button type="button" className="btn sm pri" onClick={() => void run(() => types.rename(t.id, edit.name))}>Guardar</button>
              <button type="button" className="btn sm" onClick={() => setEdit(null)}>Cancelar</button>
            </>
          ) : (
            <>
              <span><b>{t.name}</b> <small className="muted">funciona como {t.kindLabel.toLowerCase()}</small></span>
              <button type="button" className="btn sm" onClick={() => setEdit({ id: t.id, name: t.name })} aria-label={`Renombrar ${t.name}`}>Renombrar</button>
              <button type="button" className="btn sm" onClick={() => { if (window.confirm(`¿Quitar «${t.name}» de tu lista? Los programas que ya lo usan no cambian.`)) void run(() => types.archive(t.id)); }} aria-label={`Quitar ${t.name}`}>Quitar</button>
            </>
          )}
        </div>
      ))}
      {err && <p className="err-box" role="alert" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}
