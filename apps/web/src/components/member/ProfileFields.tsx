"use client";
// D217 · Campos del perfil de entrenamiento, compartidos por Perfil (TrainingProfile) y el formulario breve (ProfileGate).
// Grupos de opción única con el patrón de radio (flechas, Inicio/Fin, una sola parada de tabulación); selección múltiple con
// botones conmutables (aria-pressed). Todo lo declara la persona: nada se completa solo.
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  EXPERIENCE_HELP, EXPERIENCE_LEVELS, GOAL_HELP, PROFILE_EQUIPMENT, SPLIT_PREFS, TRAINING_WISH_GOALS, WEEKDAYS_SHORT, WISH_TEXT_MAX, goalAllowed,
  type Experience, type ProfileEquipment, type SplitPref, type TrainingWishGoal,
} from "@repi/domain";
import { IntInput } from "@/components/ui/IntInput";
import type { AgeBand } from "./profile-store";

const WEEKDAY_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Navegación de radio: flechas mueven el foco y eligen; Inicio y Fin van a los extremos. */
function useRadioKeys<K>(keys: K[], onPick: (k: K) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const n = keys.length;
    const j = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    refs.current[j]?.focus();
    onPick(keys[j]);
  };
  return { refs, onKeyDown };
}

export function Field({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id: string }) {
  return (
    <div className="tp-field">
      <span className="tp-label" id={id}>{label}</span>
      {hint && <span className="tp-hint">{hint}</span>}
      {children}
    </div>
  );
}

/** Opción única en chips. Tocar la elegida la desmarca (queda «sin dato»). */
export function ChipRadios<K extends string>({ label, hint, opts, value, onChange, after }: {
  label: string; hint?: ReactNode; opts: [K, string][]; value: K | null | undefined; onChange: (v: K | null) => void; after?: ReactNode;
}) {
  const id = useId();
  const keys = opts.map(([k]) => k);
  const { refs, onKeyDown } = useRadioKeys(keys, (k) => onChange(k));
  const at = keys.indexOf(value as K);
  return (
    <Field label={label} hint={hint} id={id}>
      <div className="wish-goals" role="radiogroup" aria-labelledby={id}>
        {opts.map(([k, l], i) => (
          <button key={k} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" className="ai-chip tp-chip" aria-checked={value === k}
            tabIndex={i === (at < 0 ? 0 : at) ? 0 : -1} onKeyDown={(e) => onKeyDown(e, i)} onClick={() => onChange(value === k ? null : k)}>{l}</button>
        ))}
      </div>
      {after}
    </Field>
  );
}

/** Selección múltiple en chips (botones conmutables). */
export function ChipMulti<K extends string | number>({ label, hint, opts, value, onChange }: {
  label: string; hint?: ReactNode; opts: [K, string, string?][]; value: K[] | null | undefined; onChange: (v: K[] | null) => void;
}) {
  const id = useId();
  const cur = value ?? [];
  const flip = (k: K) => { const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; onChange(n.length ? n : null); };
  return (
    <Field label={label} hint={hint} id={id}>
      <div className="wish-goals" role="group" aria-labelledby={id}>
        {opts.map(([k, l, aria]) => (
          <button key={String(k)} type="button" className="ai-chip tp-chip" aria-pressed={cur.includes(k)} aria-label={aria} onClick={() => flip(k)}>{l}</button>
        ))}
      </div>
    </Field>
  );
}

export function GoalField({ value, age, onChange }: { value: TrainingWishGoal | null | undefined; age: AgeBand; onChange: (v: TrainingWishGoal | null) => void }) {
  // Política de menores: «Bajar grasa» sólo con edad adulta confirmada.
  const opts = (Object.entries(TRAINING_WISH_GOALS) as [TrainingWishGoal, string][]).filter(([k]) => goalAllowed(k, age));
  const shown = value && goalAllowed(value, age) ? value : null;
  return (
    <ChipRadios label="Tu objetivo principal" opts={opts} value={shown} onChange={onChange}
      after={<span className="tp-hint" aria-live="polite">{shown ? GOAL_HELP[shown] : "Elegí el que más te importa hoy. Lo cambiás cuando quieras."}</span>} />
  );
}

/** Experiencia declarada, con la descripción de cada nivel a la vista (sin jerga). */
export function ExperienceField({ value, onChange }: { value: Experience | null | undefined; onChange: (v: Experience | null) => void }) {
  const id = useId();
  const opts = Object.entries(EXPERIENCE_LEVELS) as [Experience, string][];
  const keys = opts.map(([k]) => k);
  const { refs, onKeyDown } = useRadioKeys(keys, (k) => onChange(k));
  const at = keys.indexOf(value as Experience);
  return (
    <Field label="Tu experiencia entrenando" hint="Lo declarás vos: REPI no lo deduce de tus cargas." id={id}>
      <div className="tp-levels" role="radiogroup" aria-labelledby={id}>
        {opts.map(([k, l], i) => (
          <button key={k} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" className="tp-level" aria-checked={value === k}
            aria-describedby={`${id}-${k}`} tabIndex={i === (at < 0 ? 0 : at) ? 0 : -1} onKeyDown={(e) => onKeyDown(e, i)} onClick={() => onChange(value === k ? null : k)}>
            <b>{l}</b><small id={`${id}-${k}`}>{EXPERIENCE_HELP[k]}</small>
          </button>
        ))}
      </div>
    </Field>
  );
}

export function DaysField({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <label className="tp-num">Días por semana
      <IntInput value={value ?? null} nullable min={1} max={7} onChange={onChange} placeholder="Ej.: 3" />
      <small>De 1 a 7</small>
    </label>
  );
}
export function MinutesField({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <label className="tp-num">Minutos por sesión
      <IntInput value={value ?? null} nullable min={15} max={240} onChange={onChange} placeholder="Ej.: 60" />
      <small>De 15 a 240</small>
    </label>
  );
}

export function WeekdaysField({ value, onChange }: { value: number[] | null | undefined; onChange: (v: number[] | null) => void }) {
  return (
    <ChipMulti label="Qué días preferís entrenar" hint="Opcional. Sirve para ordenar la semana, no es obligatorio cumplirlo."
      opts={WEEKDAYS_SHORT.map((d, i) => [i, d, WEEKDAY_LONG[i]] as [number, string, string])} value={value}
      onChange={(v) => onChange(v ? [...v].sort((a, b) => a - b) : null)} />
  );
}
export function SplitField({ value, onChange }: { value: SplitPref | null | undefined; onChange: (v: SplitPref | null) => void }) {
  return <ChipRadios label="Cómo preferís repartir la semana" opts={Object.entries(SPLIT_PREFS) as [SplitPref, string][]} value={value} onChange={onChange} />;
}
export function EquipmentField({ value, onChange }: { value: ProfileEquipment[] | null | undefined; onChange: (v: ProfileEquipment[] | null) => void }) {
  return <ChipMulti label="Con qué contás para entrenar" hint="Marcá todo lo que tengas a mano." opts={Object.entries(PROFILE_EQUIPMENT) as [ProfileEquipment, string][]} value={value} onChange={onChange} />;
}

export function TextField({ label, value, onChange, placeholder, hint }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; placeholder: string; hint?: string }) {
  return (
    <label className="tp-text">{label}
      <input value={value ?? ""} maxLength={WISH_TEXT_MAX} onChange={(e) => onChange(e.target.value || null)} placeholder={placeholder} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export const LimitsField = ({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) => (
  <TextField label="Restricciones que no son de salud" value={value} onChange={onChange} placeholder="Ej.: los martes no puedo, en mi gym no hay barra"
    hint="Horarios, lugar o equipamiento. Lo que sea de salud va en «Molestia»." />
);
