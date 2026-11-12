"use client";
// Ejercicios por tiempo (pedido del titular, 07/11/2026) · Lo que se registra de una actividad en el entrenamiento: la duración
// en minutos y los campos de su perfil (cinta: velocidad en km/h e inclinación, un número sin «%»; bici: nivel y cadencia; remo:
// distancia, ritmo cada 500 m y nivel; elíptico: nivel e inclinación; escaladora: nivel), precargados con lo que indicó el profe.
// Sin peso, repeticiones, RIR ni discos. Se guarda como siempre: los segundos en `r` y los valores en `m` (la cola los sincroniza
// y el servidor los vuelve a validar con los mismos rangos del dominio). Los textos y rangos salen de ACTIVITY_FIELD_SPEC.
import { useState } from "react";
import { ACTIVITY_FIELD_SPEC, ACTIVITY_MAX_SEC, PROFILE_FIELDS, formatClock, formatRest, type ActivityField, type ActivityProfile, type SetMetrics } from "@repi/domain";

/** Paso de los botones − y + (el valor escrito puede ser más fino: velocidad 5,7; inclinación 2,5). */
const BTN_STEP: Record<ActivityField, number> = { speedKmh: 0.5, incline: 1, level: 1, distanceM: 50, pace500Sec: 5, cadenceRpm: 5 };
/** Desde dónde arranca un campo vacío al tocar − o + (un valor común, que la persona ajusta). */
const START: Record<ActivityField, number> = { speedKmh: 5, incline: 0, level: 5, distanceM: 1000, pace500Sec: 120, cadenceRpm: 80 };
const SHORT_LABEL: Partial<Record<ActivityField, string>> = { pace500Sec: "Ritmo /500 m" };
/** Campos opcionales de cada perfil (METRICS_PROFILE_HINT): se muestran si tienen valor o si la persona los suma. */
const OPTIONAL: Partial<Record<ActivityProfile, readonly ActivityField[]>> = { bike: ["cadenceRpm"], rower: ["pace500Sec", "level"], elliptical: ["incline"] };

export const fieldLabel = (f: ActivityField) => SHORT_LABEL[f] ?? ACTIVITY_FIELD_SPEC[f].label;
const toStep = (v: number, step: number) => { const k = Math.round(1 / step); return Math.round(v * k) / k; };
const dec = (n: number) => String(n).replace(".", ",");

/** Valor de un campo para mostrar o editar: «5,5», «3», «2:05» (ritmo), «1000». */
export const fieldValueText = (f: ActivityField, v: number | null | undefined) => (v == null ? "" : f === "pace500Sec" ? formatRest(v) : dec(v));
/** Duración para mostrar o editar en minutos: «12» (minutos justos) o «12:30» (minutos y segundos). */
export const minutesText = (sec: number) => (sec % 60 === 0 ? String(sec / 60) : formatClock(sec));

/**
 * Duración escrita en minutos → segundos: «12», «12,5» (12 min 30 s), «12:30». null si no se entiende; fuera de rango (más de
 * 4 horas o 0), también null.
 */
export function parseMinutes(t: string): number | null {
  const s = t.trim().replace(",", ".");
  let m = /^(\d{1,3}):([0-5]\d)$/.exec(s);
  let sec: number | null = null;
  if (m) sec = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^\d{1,3}(\.\d{1,2})?$/.exec(s))) sec = Math.round(Number(s) * 60);
  return sec != null && sec >= 1 && sec <= ACTIVITY_MAX_SEC ? sec : null;
}
/** Valor escrito de un campo → número en rango y redondeado a su paso. `""` = vacío (null). `undefined` = inválido. */
export function parseField(f: ActivityField, t: string): number | null | undefined {
  const s = t.trim().replace(",", ".");
  if (!s) return null;
  let v: number;
  const m = f === "pace500Sec" ? /^(\d{1,2}):([0-5]\d)$/.exec(s) : null;
  if (m) v = Number(m[1]) * 60 + Number(m[2]);
  else if (/^-?\d+(\.\d+)?$/.test(s)) v = Number(s);
  else return undefined;
  const spec = ACTIVITY_FIELD_SPEC[f];
  if (v < spec.min || v > spec.max) return undefined;
  return toStep(v, spec.step);
}
/** Qué se puede tipear en cada campo (la inclinación admite negativos; el ritmo, «2:05»). */
export const cleanFieldDraft = (f: ActivityField | "duration", t: string) =>
  (f === "duration" || f === "pace500Sec" ? t.replace(/[^\d.,:]/g, "") : f === "incline" ? t.replace(/[^\d.,-]/g, "").replace(/(?!^)-/g, "") : t.replace(/[^\d.,]/g, "")).slice(0, 8);

/**
 * Campos de la actividad en curso. `sec` es la duración real (segundos) y `m` sus valores; cada cambio sube con `onChange`. Todo
 * con botones de 44 px y toque para escribir; los rangos inválidos se avisan con el mismo texto que usa el servidor.
 */
export function ActivityInputs({ profile, sec, m, onChange, flash }: {
  profile: ActivityProfile; sec: number; m: SetMetrics | null; onChange: (p: { r?: number; m?: SetMetrics | null }) => void; flash: (t: string) => void;
}) {
  const [more, setMore] = useState(false);
  const optional = OPTIONAL[profile] ?? [];
  const shown = PROFILE_FIELDS[profile].filter((f) => more || !optional.includes(f) || m?.[f] != null);
  const hidden = PROFILE_FIELDS[profile].filter((f) => !shown.includes(f));
  const setField = (f: ActivityField, v: number | null) => {
    const next: SetMetrics = { ...(m ?? {}) };
    if (v == null) delete next[f]; else next[f] = v;
    onChange({ m: Object.keys(next).length ? next : null });
  };
  const stepDur = (dir: 1 | -1) => {
    const base = sec > 0 ? sec : 0;
    const next = base % 60 ? (dir > 0 ? Math.ceil(base / 60) * 60 : Math.floor(base / 60) * 60) : base + dir * 60;
    onChange({ r: Math.min(ACTIVITY_MAX_SEC, Math.max(60, next)) });
  };
  const stepField = (f: ActivityField, dir: 1 | -1) => {
    const spec = ACTIVITY_FIELD_SPEC[f];
    const cur = m?.[f];
    const v = cur == null ? START[f] : toStep(cur + dir * BTN_STEP[f], spec.step);
    setField(f, Math.min(spec.max, Math.max(spec.min, v)));
  };
  return (
    <div className="act-fields" role="group" aria-label="Lo que hiciste">
      <ActRow label="Duración" unit={sec > 0 && sec % 60 ? "min:seg" : "min"} shown={sec > 0 ? minutesText(sec) : ""} draftOf={() => (sec > 0 ? minutesText(sec) : "")}
        kind="duration" onStep={stepDur}
        onType={(t) => { if (!t.trim()) return; const v = parseMinutes(t); if (v == null) flash("La duración va de 1 segundo a 4 horas: escribí los minutos (12, 12,5 o 12:30)."); else onChange({ r: v }); }} />
      {shown.map((f) => (
        <ActRow key={f} label={fieldLabel(f)} unit={ACTIVITY_FIELD_SPEC[f].unit} shown={fieldValueText(f, m?.[f])} draftOf={() => fieldValueText(f, m?.[f])}
          kind={f} onStep={(dir) => stepField(f, dir)}
          onType={(t) => { const v = parseField(f, t); if (v === undefined) flash(ACTIVITY_FIELD_SPEC[f].error); else setField(f, v); }} />
      ))}
      {hidden.length > 0 && <button type="button" className="linkbtn act-more" onClick={() => setMore(true)}>Sumar {hidden.map((f) => fieldLabel(f).toLowerCase()).join(" o ")} (opcional)</button>}
    </div>
  );
}

function ActRow({ label, unit, shown, draftOf, kind, onStep, onType }: {
  label: string; unit: string | null; shown: string; draftOf: () => string; kind: ActivityField | "duration"; onStep: (dir: 1 | -1) => void; onType: (t: string) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const done = () => { if (typing == null) return; onType(typing); setTyping(null); };
  const said = `${label}${unit ? ` (${unit})` : ""}`;
  return (
    <div className="act-row">
      <span className="act-lbl">{label}{unit && <small>{unit}</small>}</span>
      <div className="act-ctl">
        <button type="button" aria-label={`Menos ${label.toLowerCase()}`} onClick={() => onStep(-1)}>−</button>
        {typing != null
          ? <input autoFocus inputMode={kind === "incline" || kind === "pace500Sec" ? "text" : "decimal"} aria-label={said} value={typing} placeholder={shown || "—"} onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setTyping(cleanFieldDraft(kind, e.target.value))}
            onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } if (e.key === "Escape") setTyping(null); }} />
          : <button type="button" className="act-val" aria-label={`${said}: ${shown || "sin dato"}. Tocá para escribir`} onClick={() => setTyping(draftOf())}><strong>{shown || "—"}</strong></button>}
        <button type="button" aria-label={`Más ${label.toLowerCase()}`} onClick={() => onStep(1)}>+</button>
      </div>
    </div>
  );
}
