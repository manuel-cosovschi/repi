"use client";
// REPI Control (D216): piezas de la pantalla de rutinas para consultar y registrar el entrenamiento.
// - Tres capas siempre separadas y en este orden: OBJETIVO DEL PROFESOR → SUGERENCIA DE REPI → RESULTADO REAL (o la última vez,
//   al consultar). La pantalla no calcula cargas: muestra lo que manda el servidor y, si REPI no tiene base, lo dice.
// - Registrar: lo precargado es un borrador («sugerido») hasta que la persona lo toca o confirma el ejercicio. Cada serie lleva un
//   id propio durante toda su vida en el borrador, para que un reintento después de un corte no duplique nada.
// - Nada de acá cambia la prescripción: ejercicios, series, descansos y cargas indicadas son de sólo lectura.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { renderSVG } from "uqr";
import { fmtSeconds, repsText } from "@repi/domain";
import type { KioskExercise, KioskRow, KioskTarget } from "@/server/gym/kiosk-training";

export type Ex = KioskExercise;
export type Row = KioskRow;
export type WEx = KioskExercise & { skippedToday: boolean };
export type Workout = { id: string; dayName: string; status: string; startedAt: string; outdated: boolean; exercises: WEx[]; done: number; total: number };
type Field = NonNullable<Ex["activity"]>["fields"][number];

// ── Formato ─────────────────────────────────────────────────────────────────
export const nf = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const kg = (n: number) => `${nf(n)} kg`;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
export const restText = (s: number | null) => (s == null ? null : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s} s`);
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const metricText = (f: Pick<Field, "label" | "unit" | "key">, v: number) => (f.key === "pace500Sec" ? `${f.label} ${clock(v)}` : `${f.label} ${nf(v)}${f.unit ? ` ${f.unit}` : ""}`);
const GROUP_KIND: Record<string, string> = { superset: "Superserie", circuit: "Circuito", giant: "Serie gigante", triset: "Triserie" };

/** Lo que indicó el profesor en la fila. */
export function coachText(r: Row, ex?: Ex): string {
  const reps = r.timed ? repsText(r.coach.reps) : r.coach.reps ? `${r.coach.reps} rep.` : "";
  const load = r.coach.weightKg != null ? kg(r.coach.weightKg) : r.coach.pct1rm != null ? `${nf(r.coach.pct1rm)} % 1RM` : null;
  const eff = r.coach.rir != null ? `RIR ${r.coach.rir}` : r.coach.rpe != null ? `RPE ${nf(r.coach.rpe)}` : null;
  const plan = r.timed && ex?.activity ? ex.activity.fields.filter((f) => f.plan != null).map((f) => metricText(f, f.plan!)) : [];
  return [load && reps ? `${load} × ${reps}` : load ?? reps, ...plan, eff].filter(Boolean).join(" · ") || "—";
}
/** Lo que sugiere REPI; null = «Sin referencia suficiente» (nunca se inventa un número). */
export function repiText(t: KioskTarget | null, timed: boolean): string | null {
  if (!t) return null;
  if (!timed && (t.weightKg == null || t.weightKg <= 0)) return null;
  if (!t.text) return null;
  return [t.text, t.rirTarget != null ? `RIR ${t.rirTarget}` : t.rpeTarget != null ? `RPE ${nf(t.rpeTarget)}` : null, t.pending ? "la carga la elegís vos" : null].filter(Boolean).join(" · ");
}
export function lastText(r: Row): string | null {
  const l = r.last;
  if (!l || (l.weightKg == null && l.reps == null)) return null;
  const amount = l.reps == null ? null : r.timed ? fmtSeconds(l.reps) : `${l.reps}`;
  const v = l.weightKg != null && l.weightKg > 0 ? (amount ? `${kg(l.weightKg)} × ${amount}` : kg(l.weightKg)) : amount ? (r.timed ? amount : `${amount} rep.`) : "";
  return `${v} · ${shortDay(l.at)}`;
}
const savedText = (r: Row, ex: Ex) => {
  const l = r.logged!;
  const amount = l.reps == null ? "—" : r.timed ? fmtSeconds(l.reps) : `${l.reps} rep.`;
  const base = l.weightKg != null && l.weightKg > 0 ? `${kg(l.weightKg)} × ${amount}` : r.timed ? amount : `${amount} sin carga`;
  const m = ex.activity && l.metrics ? ex.activity.fields.filter((f) => l.metrics![f.key] != null).map((f) => metricText(f, l.metrics![f.key])) : [];
  return [base, ...m, l.rir != null ? `RIR ${l.rir >= 4 ? "4+" : l.rir}` : null].filter(Boolean).join(" · ");
};
/** Chips de cómo se hace: grupo, método, tempo, variante, descanso. */
export function exChips(e: Ex): string[] {
  return [
    e.group ? `${e.group}${e.groupKind ? ` · ${GROUP_KIND[e.groupKind] ?? "Bloque"}` : ""}${e.rounds ? ` · ${e.rounds} vueltas` : ""}` : null,
    e.method, e.tempo ? `Tempo ${e.tempo}` : null, e.variant, e.unilateral ? "Unilateral" : null, e.emomSec ? `EMOM cada ${restText(e.emomSec)}` : null,
    e.restSec ? `Descanso ${restText(e.restSec)}` : null,
  ].filter((x): x is string => !!x);
}
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

// ── Consulta: las tres capas por serie ──────────────────────────────────────
export function ConsultExercise({ e, i, onTouch }: { e: Ex; i: number; onTouch: () => void }) {
  const diffs = uniq(e.rows.map((r) => r.diff));
  const whys = uniq(e.rows.map((r) => (repiText(r.repi, r.timed) ? r.repi?.why : null)));
  const chips = exChips(e);
  return (
    <li className="kq-ex" style={{ "--i": i } as React.CSSProperties}>
      <span className="kq-n" aria-hidden="true">{e.group ?? String(i + 1).padStart(2, "0")}</span>
      <div className="kq-ex-main">
        <h2>{e.name}</h2>
        <p className="kq-rx">{e.prescription}</p>
        {chips.length > 0 && <p className="kq-chips">{chips.map((c) => <span key={c}>{c}</span>)}</p>}
        {e.note && <p className="kq-exnote"><b>Nota del profe:</b> {e.note}</p>}
        {e.progression && <p className="kq-exnote">Progresión: {e.progression}</p>}
        <ol className="kq-layers" aria-label={`Series de ${e.name}`}>
          {e.rows.map((r) => {
            const rt = repiText(r.repi, r.timed);
            const lt = lastText(r);
            return (
              <li key={r.setIndex}>
                <b className="kq-layers-label">{r.label}</b>
                <span className="kq-cell coach"><small>Profesor</small>{coachText(r, e)}{r.coach.note && <em>{r.coach.note}</em>}</span>
                <span className={`kq-cell repi ${rt ? "" : "none"}`}><small>REPI</small>{rt ?? "Sin referencia suficiente"}</span>
                <span className={`kq-cell last ${lt ? "" : "none"}`}><small>Última vez</small>{lt ?? "Sin registros"}</span>
              </li>
            );
          })}
        </ol>
        {diffs.map((d) => <p key={d} className="kq-diff">{d}</p>)}
        {whys.map((w) => <p key={w} className="kq-why">{w}</p>)}
      </div>
      {e.demo && <Demo d={e.demo} name={e.name} onTouch={onTouch} />}
    </li>
  );
}

/** Demostración del ejercicio: un video del gimnasio se reproduce acá; un enlace externo se abre en el celular con un QR. */
export function Demo({ d, name, onTouch }: { d: { kind: "video" | "link"; url: string }; name: string; onTouch: () => void }) {
  const [open, setOpen] = useState(false);
  const qr = useMemo(() => (d.kind === "link" ? renderSVG(d.url, { border: 1, ecc: "M" }) : ""), [d]);
  return (
    <div className="kq-ex-demo">
      <button type="button" className="kq-ghost" aria-expanded={open} onClick={() => { setOpen((o) => !o); onTouch(); }}>{open ? "Ocultar demostración" : "Ver demostración"}</button>
      {open && (d.kind === "video"
        ? <video src={d.url} controls playsInline muted preload="metadata" aria-label={`Demostración: ${name}`} onPlay={onTouch} />
        : <div className="kq-linkqr"><div aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} /><small>Escaneá para verla en tu celular</small></div>)}
    </div>
  );
}

// ── Registro: borrador por serie ────────────────────────────────────────────
export type RowDraft = {
  /** Id de la serie nueva: uno por fila durante toda su vida en el borrador (reintentos sin duplicar). */
  uid: string;
  w: number | null; r: number | null; rir: number | null; m: Record<string, number | null>;
  /** Peso elegido (también «sin carga»). Una fila sin peso sugerido arranca vacía y la persona tiene que decidir. */
  wSet: boolean;
  skip: boolean;
  /** false = sigue siendo lo sugerido (se ve como borrador). */
  touched: boolean;
  /** Corrigiendo una serie ya guardada. */
  edit: boolean;
};
export function uuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  (c ?? { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } }).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const planMetrics = (ex: Ex) => Object.fromEntries((ex.activity?.fields ?? []).map((f) => [f.key, f.plan ?? null])) as Record<string, number | null>;
export function initRow(row: Row, ex: Ex, uid = uuid()): RowDraft {
  if (row.logged) {
    const l = row.logged;
    return { uid, w: l.weightKg, r: l.reps, rir: l.rir, m: { ...planMetrics(ex), ...(l.metrics ?? {}) }, wSet: true, skip: false, touched: true, edit: false };
  }
  return { uid, w: row.draft?.weightKg ?? null, r: row.draft?.reps ?? null, rir: null, m: planMetrics(ex), wSet: row.draft?.weightKg != null, skip: row.skipped, touched: row.skipped, edit: false };
}
/** Borrador del ejercicio: conserva lo que la persona ya tocó y toma del servidor lo que está guardado. */
export function mergeDrafts(ex: Ex, prev?: RowDraft[]): RowDraft[] {
  return ex.rows.map((row) => {
    const p = prev?.[row.setIndex];
    if (!p) return initRow(row, ex);
    if (row.logged) return p.edit ? p : initRow(row, ex, p.uid);
    return p.touched ? p : initRow(row, ex, p.uid);
  });
}
const pending = (row: Row, d: RowDraft) => !row.logged || d.edit;
export const isActivity = (row: Row, ex: Ex) => row.timed && !!ex.activity;

/** Primer problema que impide confirmar, o null. */
export function problemOf(ex: Ex, ds: RowDraft[]): string | null {
  for (const row of ex.rows) {
    const d = ds[row.setIndex];
    if (!d || !pending(row, d) || d.skip) continue;
    if (row.timed) {
      if (!d.r || d.r < 1) return `Falta la duración de «${row.label}». Usá + o −, o marcala como «No la hice».`;
      continue;
    }
    if (d.r == null || d.r < 1) return `Faltan las repeticiones de «${row.label}». Usá + o −, o marcala como «No la hice».`;
    if (d.w == null && !d.wSet) return `Falta el peso de «${row.label}». Usá + o −, tocá «Sin carga» si fue con tu peso, o marcala como «No la hice».`;
  }
  return null;
}
export type SetInput = { id: string; setIndex: number; skipped?: boolean; weightKg: number | null; reps: number | null; rir: number | null; metrics?: Record<string, number> | null; baseRevision?: number };
export function setsOf(ex: Ex, ds: RowDraft[]): SetInput[] {
  const out: SetInput[] = [];
  for (const row of ex.rows) {
    const d = ds[row.setIndex];
    if (!d || !pending(row, d)) continue;
    if (d.skip && !d.edit) { out.push({ id: d.uid, setIndex: row.setIndex, skipped: true, weightKg: null, reps: null, rir: null }); continue; }
    const act = isActivity(row, ex);
    const metrics = act ? Object.fromEntries(Object.entries(d.m).filter(([, v]) => v != null)) as Record<string, number> : undefined;
    out.push({
      id: d.edit && row.logged ? row.logged.id : d.uid, setIndex: row.setIndex, weightKg: act ? null : d.w, reps: d.r, rir: d.rir,
      ...(act ? { metrics: Object.keys(metrics!).length ? metrics! : null } : {}),
      ...(d.edit && row.logged ? { baseRevision: row.logged.revision } : {}),
    });
  }
  return out;
}

// Pasos: 1 kg hasta 20 kg y 2,5 kg arriba; repeticiones de a 1; tiempo de a 15 s.
const r2 = (n: number) => Math.round(n * 100) / 100;
const wUp = (w: number | null) => (w == null ? 1 : Math.min(1000, r2(w + (w < 20 ? 1 : 2.5))));
const wDown = (w: number | null) => (w == null || w <= 1 ? null : r2(w - (w <= 20 ? 1 : 2.5)));
const toStep = (v: number, step: number) => { const k = Math.round(1 / step); return Math.round(v * k) / k; };

type Pad = { title: string; decimals: boolean; min: number; max: number; apply: (n: number) => void };

// ── Panel de registro de un ejercicio ───────────────────────────────────────
export function RegisterPanel({ ex, drafts, update, setAll, onConfirm, onBack, saving, retry, msg, onTouch }: {
  ex: WEx; drafts: RowDraft[]; update: (i: number, f: (d: RowDraft) => RowDraft) => void; setAll: (f: (ds: RowDraft[]) => RowDraft[]) => void;
  onConfirm: () => void; onBack: () => void; saving: boolean; retry: boolean; msg: { tone: "ok" | "err" | "warn"; text: string } | null; onTouch: () => void;
}) {
  const [pad, setPad] = useState<Pad | null>(null);
  const chips = exChips(ex);
  const diffs = uniq(ex.rows.map((r) => r.diff));
  const toSend = ex.rows.filter((r) => drafts[r.setIndex] && pending(r, drafts[r.setIndex])).length;
  // «Copiar a todas»: de la primera serie que se está cargando a las demás del mismo tipo y etapa.
  const src = ex.rows.find((r) => drafts[r.setIndex] && pending(r, drafts[r.setIndex]) && !drafts[r.setIndex].skip);
  const copyTargets = src ? ex.rows.filter((r) => r !== src && r.kind === src.kind && r.stage === src.stage && drafts[r.setIndex] && pending(r, drafts[r.setIndex])) : [];
  const copy = () => {
    if (!src) return;
    const s = drafts[src.setIndex];
    setAll((ds) => ds.map((d, i) => (copyTargets.some((r) => r.setIndex === i) ? { ...d, w: s.w, wSet: s.wSet || s.w != null, r: s.r, m: { ...s.m }, skip: false, touched: true } : i === src.setIndex ? { ...d, touched: true } : d)));
  };
  return (
    <main className="kq-reg">
      <section className="kq-reg-head">
        <button type="button" className="kq-ghost kq-back" onClick={onBack}>← Volver a la lista</button>
        <div>
          {ex.group && <p className="kq-eyebrow">{ex.group}</p>}
          <h1 tabIndex={-1}>{ex.name}</h1>
          {ex.doing && <p className="kq-today">Hoy: {ex.doing}</p>}
          <p className="kq-rx">{ex.prescription}</p>
          {chips.length > 0 && <p className="kq-chips">{chips.map((c) => <span key={c}>{c}</span>)}</p>}
          {ex.note && <p className="kq-exnote"><b>Nota del profe:</b> {ex.note}</p>}
          {diffs.map((d) => <p key={d} className="kq-diff">{d}</p>)}
        </div>
        {ex.demo && <Demo d={ex.demo} name={ex.name} onTouch={onTouch} />}
      </section>

      <div className="kq-strip" aria-hidden="true"><span /><span>Profesor</span><span>REPI</span><span>Real</span></div>
      <ol className="kq-sets" aria-label={`Series de ${ex.name}`}>
        {ex.rows.map((row) => {
          const d = drafts[row.setIndex];
          if (!d) return null;
          return <SetRow key={row.setIndex} ex={ex} row={row} n={row.setIndex + 1} d={d} up={(f) => update(row.setIndex, f)} openPad={setPad} />;
        })}
      </ol>
      {copyTargets.length > 0 && (
        <button type="button" className="kq-ghost kq-copy" onClick={copy}>Copiar «{src!.label}» a {copyTargets.length === 1 ? "la otra serie" : `las otras ${copyTargets.length}`}</button>
      )}

      <div className="kq-actions">
        <p className={`kq-save ${msg ? msg.tone : ""}`} role="status" aria-live="polite">{saving ? "Guardando…" : msg?.text ?? (toSend ? "Nada se guarda hasta que confirmes." : "Este ejercicio ya está registrado.")}</p>
        {toSend > 0
          ? <button type="button" className="kq-primary" onClick={onConfirm} disabled={saving} aria-busy={saving || undefined}>{saving ? "Guardando…" : retry ? "Reintentar" : "Confirmar ejercicio"}</button>
          : <button type="button" className="kq-primary" onClick={onBack}>Volver a la lista</button>}
      </div>
      {pad && <NumPad pad={pad} onClose={() => setPad(null)} />}
    </main>
  );
}

function SetRow({ ex, row, n, d, up, openPad }: { ex: Ex; row: Row; n: number; d: RowDraft; up: (f: (d: RowDraft) => RowDraft) => void; openPad: (p: Pad) => void }) {
  const rt = repiText(row.repi, row.timed);
  const lt = lastText(row);
  const saved = !!row.logged && !d.edit;
  const act = isActivity(row, ex);
  const t = (f: (d: RowDraft) => RowDraft) => up((x) => ({ ...f(x), touched: true }));
  const state = saved ? "saved" : d.skip ? "skip" : d.touched ? "on" : "draft";
  return (
    <li className={`kq-set ${state}`}>
      <div className="kq-set-label">
        <b>{row.label}</b>
        {state === "draft" && <span className="kq-tag draft">Sugerido</span>}
        {state === "saved" && <span className="kq-tag ok">Guardada{row.logged!.atKiosk ? "" : " en la app"}</span>}
        {state === "skip" && <span className="kq-tag">No la hice</span>}
      </div>
      <div className="kq-cell coach"><small>Profesor</small>{coachText(row, ex)}</div>
      <div className={`kq-cell repi ${rt ? "" : "none"}`}><small>REPI</small>{rt ?? "Sin referencia suficiente"}{lt && <em>Última: {lt}</em>}</div>
      <div className="kq-real">
        <small className="kq-real-label">Real</small>
        {saved ? (
          <div className="kq-saved">
            <span>{savedText(row, ex)}</span>
            <button type="button" className="kq-ghost" onClick={() => up((x) => ({ ...initRow(row, ex, x.uid), edit: true }))}>Corregir</button>
          </div>
        ) : d.skip ? (
          <div className="kq-saved">
            <span>No la hiciste{row.skipped ? " (guardado)" : ""}</span>
            <button type="button" className="kq-ghost" onClick={() => t((x) => ({ ...x, skip: false }))}>La hice</button>
          </div>
        ) : (
          <>
            <div className="kq-steppers">
              {!act && (!row.timed || d.w != null || row.coach.weightKg != null) && (
                <Stepper label={`Peso de la serie ${n}, en kilos`} unit="kg" value={d.w == null ? (d.wSet ? "Sin carga" : "—") : nf(d.w)} draft={!d.touched}
                  onDown={() => t((x) => ({ ...x, w: wDown(x.w), wSet: true }))} onUp={() => t((x) => ({ ...x, w: wUp(x.w), wSet: true }))} canDown={d.w != null}
                  onEdit={() => openPad({ title: `Peso de la serie ${n} (kg)`, decimals: true, min: 0, max: 1000, apply: (v) => t((x) => ({ ...x, w: v > 0 ? v : null, wSet: true })) })} />
              )}
              {row.timed ? (
                <Stepper label={`Tiempo de la serie ${n}, en minutos y segundos`} unit="min" value={d.r == null ? "—" : clock(d.r)} draft={!d.touched}
                  onDown={() => t((x) => ({ ...x, r: x.r == null ? null : Math.max(15, x.r - 15) }))} onUp={() => t((x) => ({ ...x, r: Math.min(4 * 3600, (x.r ?? 0) + 15) }))} canDown={(d.r ?? 0) > 15} />
              ) : (
                <Stepper label={`Repeticiones de la serie ${n}`} unit="rep." value={d.r == null ? "—" : String(d.r)} draft={!d.touched}
                  onDown={() => t((x) => ({ ...x, r: x.r == null ? null : Math.max(1, x.r - 1) }))} onUp={() => t((x) => ({ ...x, r: Math.min(999, (x.r ?? 0) + 1) }))} canDown={(d.r ?? 0) > 1}
                  onEdit={() => openPad({ title: `Repeticiones de la serie ${n}`, decimals: false, min: 1, max: 999, apply: (v) => t((x) => ({ ...x, r: Math.round(v) })) })} />
              )}
              {act && ex.activity!.fields.map((f) => {
                const v = d.m[f.key];
                return (
                  <Stepper key={f.key} label={`${f.label} de la serie ${n}${f.unit ? `, en ${f.unit}` : ""}`} unit={f.unit ?? ""} draft={!d.touched}
                    value={v == null ? "—" : f.key === "pace500Sec" ? clock(v) : nf(v)}
                    onDown={() => t((x) => ({ ...x, m: { ...x.m, [f.key]: x.m[f.key] == null ? null : Math.max(f.min, toStep(x.m[f.key]! - f.step, f.step)) } }))}
                    onUp={() => t((x) => ({ ...x, m: { ...x.m, [f.key]: x.m[f.key] == null ? f.plan ?? f.min : Math.min(f.max, toStep(x.m[f.key]! + f.step, f.step)) } }))}
                    canDown={v != null && v > f.min}
                    onEdit={() => openPad({ title: `${f.label}${f.unit ? ` (${f.unit})` : ""}`, decimals: f.step < 1, min: f.min, max: f.max, apply: (nv) => t((x) => ({ ...x, m: { ...x.m, [f.key]: toStep(nv, f.step) } })) })} />
                );
              })}
            </div>
            <div className="kq-setfoot">
              {!act && (
                <div className="kq-rir" role="group" aria-label={`RIR de la serie ${n} (opcional): repeticiones que te quedaban`}>
                  <span aria-hidden="true">RIR (opcional)</span>
                  {[0, 1, 2, 3, 4].map((v) => (
                    <button key={v} type="button" aria-pressed={d.rir === v} onClick={() => t((x) => ({ ...x, rir: x.rir === v ? null : v }))}>{v === 4 ? "4+" : v}</button>
                  ))}
                </div>
              )}
              {!act && (d.w != null || !d.wSet) && <button type="button" className="kq-mini" onClick={() => t((x) => ({ ...x, w: null, wSet: true }))}>Sin carga</button>}
              {d.edit
                ? <button type="button" className="kq-mini" onClick={() => up((x) => ({ ...initRow(row, ex, x.uid) }))}>Cancelar corrección</button>
                : <button type="button" className="kq-mini" onClick={() => t((x) => ({ ...x, skip: true }))}>No la hice</button>}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function Stepper({ label, unit, value, draft, onDown, onUp, canDown, onEdit }: {
  label: string; unit: string; value: string; draft: boolean; onDown: () => void; onUp: () => void; canDown: boolean; onEdit?: () => void;
}) {
  const hint = value === "—" ? "a completar" : draft ? "sugerido" : unit;
  return (
    <div className={`kq-stepper ${draft ? "draft" : ""}`} role="group" aria-label={label}>
      <HoldButton label="Menos" onStep={onDown} disabled={!canDown}>−</HoldButton>
      {onEdit
        ? <button type="button" className="kq-val" onClick={onEdit} aria-label={`${value} ${unit}. Tocá para escribirlo`}><b>{value}</b><small>{hint}</small></button>
        : <span className="kq-val" aria-live="off"><b>{value}</b><small>{hint}</small></span>}
      <HoldButton label="Más" onStep={onUp}>+</HoldButton>
    </div>
  );
}

/** Botón de paso: un toque suma uno; mantenerlo apretado repite. Con teclado, Enter o Espacio. */
function HoldButton({ label, onStep, disabled, children }: { label: string; onStep: () => void; disabled?: boolean; children: ReactNode }) {
  const t = useRef<number | null>(null);
  const iv = useRef<number | null>(null);
  const stop = () => { if (t.current != null) clearTimeout(t.current); if (iv.current != null) clearInterval(iv.current); t.current = iv.current = null; };
  useEffect(() => stop, []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);
  return (
    <button type="button" className="kq-step" aria-label={label} disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        stop(); onStep();
        window.addEventListener("pointerup", stop, { once: true });
        t.current = window.setTimeout(() => { iv.current = window.setInterval(onStep, 110); }, 450);
      }}
      onPointerLeave={stop} onPointerCancel={stop}
      onClick={(e) => { if (e.detail === 0) onStep(); }}
      onContextMenu={(e) => e.preventDefault()}>{children}</button>
  );
}

/** Teclado numérico para escribir un valor (peso, repeticiones, distancia…). */
function NumPad({ pad, onClose }: { pad: Pad; onClose: () => void }) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // El foco entra al teclado y, al cerrarlo, vuelve al valor que se estaba cambiando.
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
    return () => { if (prev?.isConnected) prev.focus({ preventScroll: true }); };
  }, []);
  const n = v === "" ? null : Number(v.replace(",", "."));
  const ok = n != null && Number.isFinite(n) && n >= pad.min && n <= pad.max;
  const press = (k: string) => setV((s) => {
    if (k === "," ) return !pad.decimals || s.includes(",") ? s : (s || "0") + ",";
    const next = s === "0" ? k : s + k;
    const dec = next.split(",")[1];
    return next.length > 6 || (dec && dec.length > 2) ? s : next;
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "," || e.key === ".") { e.preventDefault(); press(","); }
      else if (e.key === "Backspace") { e.preventDefault(); setV((s) => s.slice(0, -1)); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <div className="kq-overlay" role="dialog" aria-modal="true" aria-labelledby="kq-pad-h" ref={ref}>
      <div className="kq-padbox">
        <h2 id="kq-pad-h" tabIndex={-1}>{pad.title}</h2>
        <output className="kq-padval" aria-live="polite">{v || "—"}</output>
        {!ok && v !== "" && <p className="kq-muted">Va de {nf(pad.min)} a {nf(pad.max)}.</p>}
        <div className="kq-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
          {pad.decimals ? <button type="button" onClick={() => press(",")} aria-label="Coma decimal">,</button> : <button type="button" className="kq-pad-aux" onClick={() => setV("")}>Borrar todo</button>}
          <button type="button" onClick={() => press("0")}>0</button>
          <button type="button" className="kq-pad-aux" onClick={() => setV((s) => s.slice(0, -1))} aria-label="Borrar el último número">Borrar</button>
        </div>
        <div className="kq-row">
          <button type="button" className="kq-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="kq-primary kq-padok" disabled={!ok} onClick={() => { pad.apply(n!); onClose(); }}>Listo</button>
        </div>
      </div>
    </div>
  );
}
