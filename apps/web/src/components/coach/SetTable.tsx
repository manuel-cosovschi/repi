"use client";
// D192 · Tabla rápida de series (pedido de Urko): todas las series a la vista, con tipo, repeticiones, peso, RIR y descanso
// editables en el mismo lugar, sin abrir una ventana por serie. En escritorio es una tabla; en el teléfono, filas compactas
// de dos líneas. Enter / ↓ pasa al mismo campo de la serie siguiente (↑ / Mayús+Enter, a la anterior); al entrar a un campo
// se selecciona su valor para reemplazarlo de una. Los pesos se escriben en kg o lb y se guardan en kg.
// La tabla no decide nada: cada cambio vuelve al editor, que lo guarda en el historial de «Deshacer».
import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { SET_KIND_LABEL, SET_LABEL_PRESETS, kgTo, stageLabel, toKg, type PlanRow, type SetKind, type WeightUnit } from "@repi/domain";
import { TypeOptions, typeValue, type SetTypeRow } from "./SetTypes";

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const show = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

/** Campo numérico que conserva lo tipeado («42,» o «7.») mientras se escribe; lo inválido no se guarda (UX-5). */
export function NumCell({ value, onChange, ...rest }: { value: number | null; onChange: (n: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(show(value));
  const shown = numOrNull(draft) === value || (draft.trim() !== "" && Number.isNaN(numOrNull(draft))) ? draft : show(value);
  return <input {...rest} value={shown} onChange={(ev) => { setDraft(ev.target.value); const n = numOrNull(ev.target.value); if (n === null || Number.isFinite(n)) onChange(n); }} />;
}
/** Peso en la unidad del profe; se guarda en kg (2 decimales). En lb, lo tipeado vuelve igual (100 lb → 45,36 kg → 100 lb). */
export function WeightCell({ kg, unit, onChange, ...rest }: { kg: number | null; unit: WeightUnit; onChange: (kg: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <NumCell {...rest} inputMode="decimal" value={kg == null ? null : kgTo(kg, unit)} onChange={(n) => onChange(n == null ? null : toKg(n, unit))} />;
}

export type TypePick = { kind: SetKind; label: string | null; typeId: string | null; defaults?: SetTypeRow["defaults"] };
/** Lo que significa elegir una opción del selector de tipo. `null` = abrir «crear tipo». */
export function resolvePick(v: string, types: SetTypeRow[]): TypePick | "new" | null {
  if (v === "new") return "new";
  if (v.startsWith("k:")) return { kind: v.slice(2) as SetKind, label: null, typeId: null };
  if (v.startsWith("p:")) { const p = SET_LABEL_PRESETS.find((x) => x.key === v.slice(2)); return p ? { kind: p.kind, label: p.label, typeId: null } : null; }
  if (v.startsWith("t:")) { const t = types.find((x) => x.id === v.slice(2)); return t ? { kind: t.kind, label: t.name, typeId: t.id, defaults: t.defaults } : null; }
  return null; // «l:» = la etiqueta que ya tiene la fila
}
/** Cambio de la fila al elegir un tipo: el tipo real, la etiqueta, y los valores por defecto del tipo sólo donde no había nada. */
export function pickPatch(row: PlanRow, p: TypePick): Partial<PlanRow> {
  const out: Partial<PlanRow> = { kind: p.kind, label: p.label, typeId: p.typeId };
  if (p.kind === "drop" && row.stage > 0) out.restSec = 0;
  if (p.defaults) {
    if (row.rir == null && p.defaults.rir != null) out.rir = p.defaults.rir;
    if (row.rpe == null && p.defaults.rpe != null) out.rpe = p.defaults.rpe;
    if (row.restSec == null && p.defaults.restSec != null) out.restSec = p.defaults.restSec;
  }
  return out;
}

export type Structural = {
  move: (bi: number, dir: -1 | 1) => void; duplicate: (bi: number) => void; insertAfter: (bi: number) => void;
  remove: (bi: number, si: number) => void; addStage: (bi: number) => void; canAddBlock: boolean; canAddStage: (bi: number) => boolean;
};

const COLS = ["kind", "reps", "w", "rir", "rest"] as const;

export function SetTable({ blocks, unit, exRest, types, canCreateType, onCreateType, onRow, structural, highlight, changed, caption, rowText }: {
  blocks: PlanRow[][]; unit: WeightUnit; exRest: number; types: SetTypeRow[]; canCreateType: boolean;
  onCreateType: (bi: number, si: number) => void; onRow: (bi: number, si: number, patch: Partial<PlanRow>) => void;
  structural?: Structural | null; highlight?: ReadonlySet<number>; changed?: ReadonlySet<string>; caption: string; rowText?: (i: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<string | null>(null); // fila con «más campos» abiertos (% 1RM, RPE, nota)
  const nav = (ev: KeyboardEvent<HTMLElement>) => {
    const el = ev.currentTarget;
    const down = (ev.key === "Enter" && !ev.shiftKey) || ev.key === "ArrowDown", up = (ev.key === "Enter" && ev.shiftKey) || ev.key === "ArrowUp";
    if (!down && !up) return;
    if (el.tagName === "SELECT" && ev.key !== "Enter") return; // las flechas cambian la opción del selector
    const row = Number(el.dataset.row), col = el.dataset.col;
    const next = ref.current?.querySelector<HTMLElement>(`[data-col="${col}"][data-row="${row + (down ? 1 : -1)}"]`);
    if (next) { ev.preventDefault(); next.focus(); if (next instanceof HTMLInputElement) next.select(); }
  };
  const cell = (row: number, col: (typeof COLS)[number]) => ({ "data-row": row, "data-col": col, onKeyDown: nav, onFocus: (e: { currentTarget: HTMLElement }) => { if (e.currentTarget instanceof HTMLInputElement) e.currentTarget.select(); } });
  let flat = -1;
  return (
    <div className="dx-table" ref={ref} role="table" aria-label={caption}>
      <div className="dx-tr dx-th" role="row">
        <span role="columnheader">#</span><span role="columnheader">Tipo</span><span role="columnheader">Reps</span>
        <span role="columnheader">Peso ({unit})</span><span role="columnheader">RIR</span><span role="columnheader">Desc. (s)</span><span role="columnheader" className="dx-acts-h" aria-label="Acciones" />
      </div>
      {blocks.map((b, bi) => (
        <div key={b[0].id} className="dx-tbody" role="rowgroup" data-hl={highlight?.has(bi) || undefined}>
          {b.map((s, si) => {
            flat++; const i = flat;
            const name = si ? stageLabel(s.kind, si) ?? `Etapa ${si}` : `Serie ${bi + 1}`;
            const what = `${name}${si ? ` de la serie ${bi + 1}` : ""}`;
            const v = typeValue(s, types);
            return (
              <div key={s.id} className={`dx-tr${si ? " dx-tr-stage" : ""}`} role="row" data-changed={changed?.has(s.id) || undefined}>
                <span className="dx-n" role="cell">{si > 0 && <span aria-hidden="true" className="dx-arrow">↳</span>}<b>{name}</b>{rowText && <small className="muted dx-rowtxt">{rowText(i)}</small>}</span>
                <span className="dx-c-kind" role="cell">
                  <select className="dx-sel" aria-label={`Tipo de ${what}`} value={v} {...cell(i, "kind")}
                    onChange={(ev) => { const p = resolvePick(ev.target.value, types); if (p === "new") onCreateType(bi, si); else if (p) onRow(bi, si, pickPatch(s, p)); }}>
                    <TypeOptions stage={si > 0} types={types} current={s} canCreate={canCreateType} />
                  </select>
                  {s.label && <small className="muted dx-sem">cuenta como {SET_KIND_LABEL[s.kind].toLowerCase()}</small>}
                </span>
                <span className="dx-c-reps" role="cell"><small className="dx-cl" aria-hidden="true">Reps</small>
                  <input aria-label={`Repeticiones de ${what}`} value={s.reps} maxLength={20} placeholder="8-10, AMRAP, 40 s" {...cell(i, "reps")} onChange={(ev) => onRow(bi, si, { reps: ev.target.value })} /></span>
                <span className="dx-c-w" role="cell"><small className="dx-cl" aria-hidden="true">Peso ({unit})</small>
                  <WeightCell aria-label={`Peso de ${what} (${unit})`} kg={s.weightKg} unit={unit} placeholder={si && s.kind === "drop" ? "Lo elige" : "—"} {...cell(i, "w")} onChange={(kg) => onRow(bi, si, { weightKg: kg })} /></span>
                <span className="dx-c-rir" role="cell"><small className="dx-cl" aria-hidden="true">RIR</small>
                  <NumCell aria-label={`RIR de ${what}`} inputMode="numeric" value={s.rir} placeholder="—" {...cell(i, "rir")} onChange={(n) => onRow(bi, si, { rir: n })} /></span>
                <span className="dx-c-rest" role="cell"><small className="dx-cl" aria-hidden="true">{si ? "Pausa (s)" : "Desc. (s)"}</small>
                  <NumCell aria-label={`${si ? "Pausa antes" : "Descanso"} de ${what} (segundos)`} inputMode="numeric" value={s.restSec} placeholder={si ? "0" : String(exRest)} {...cell(i, "rest")} onChange={(n) => onRow(bi, si, { restSec: n })} /></span>
                <span className="dx-acts" role="cell">
                  <button type="button" className="ibtn" aria-expanded={more === s.id} aria-label={`Más campos de ${what}`} title="% 1RM, RPE, nota, subir, bajar y duplicar" onClick={() => setMore(more === s.id ? null : s.id)}>⋯</button>
                  {structural && si === 0 && <button type="button" className="ibtn" aria-label={`Insertar una serie después de la serie ${bi + 1}`} title="Insertar serie después" disabled={!structural.canAddBlock} onClick={() => structural.insertAfter(bi)}>＋</button>}
                  {structural && <button type="button" className="ibtn" aria-label={si ? `Quitar ${name} de la serie ${bi + 1}` : `Quitar serie ${bi + 1}`} disabled={si === 0 && blocks.length <= 1} onClick={() => structural.remove(bi, si)}>×</button>}
                </span>
                {(more === s.id || !!s.note) && (
                  <div className="dx-more dx-grid" role="cell">
                    {/* Reordenar y duplicar: menos usados, quedan acá para que la fila entre entera en pantalla. */}
                    {structural && si === 0 && more === s.id && (
                      <div className="dx-moreacts">
                        <button type="button" className="btn sm" aria-label={`Subir serie ${bi + 1}`} disabled={bi === 0} onClick={() => structural.move(bi, -1)}>↑ Subir</button>
                        <button type="button" className="btn sm" aria-label={`Bajar serie ${bi + 1}`} disabled={bi === blocks.length - 1} onClick={() => structural.move(bi, 1)}>↓ Bajar</button>
                        <button type="button" className="btn sm" aria-label={`Duplicar serie ${bi + 1}`} title="Duplicar con sus etapas" disabled={!structural.canAddBlock} onClick={() => structural.duplicate(bi)}>⧉ Duplicar</button>
                      </div>
                    )}
                    {si === 0 && <label className="field">% 1RM<NumCell inputMode="decimal" value={s.pct1rm} onChange={(n) => onRow(bi, si, { pct1rm: n })} placeholder="—" /></label>}
                    {si === 0 && <label className="field">RPE<NumCell inputMode="decimal" value={s.rpe} onChange={(n) => onRow(bi, si, { rpe: n })} placeholder="—" /></label>}
                    {s.kind === "amrap" && si === 0 && <label className="field">Por tiempo (min)<NumCell inputMode="decimal" value={s.durationSec ? s.durationSec / 60 : null} onChange={(n) => onRow(bi, si, n ? { durationSec: Math.round(n * 60), countUnit: s.countUnit ?? "rounds" } : { durationSec: null, countUnit: null })} placeholder="—" /></label>}
                    <label className="field dx-note">Nota<input value={s.note ?? ""} maxLength={80} onChange={(ev) => onRow(bi, si, { note: ev.target.value || null })} placeholder="Ej.: pausa abajo" /></label>
                  </div>
                )}
              </div>
            );
          })}
          {structural && <button type="button" className="linkbtn dx-add-stage" disabled={!structural.canAddStage(bi)} onClick={() => structural.addStage(bi)}>+ Etapa conectada a la serie {bi + 1}</button>}
        </div>
      ))}
    </div>
  );
}
