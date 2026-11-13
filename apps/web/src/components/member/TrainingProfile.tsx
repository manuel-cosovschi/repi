"use client";
// D217 · «Tu perfil de entrenamiento» (Perfil). Reemplaza a «Lo que buscás entrenando» (D139): misma fuente (`user_pref.wishes`)
// y además experiencia declarada, días preferidos, distribución, equipamiento, ejercicios preferidos y que no te gustan y
// restricciones que no son de salud. Muestra el estado (completo, parcial o sin información) y qué falta, en palabras. Guarda
// sólo lo que cambió (cambio parcial con origen «profile»): el servidor registra por dónde y cuándo se declaró cada dato y sube
// la versión. Nada de salud: para dolores y lesiones está «Molestia».
import { useId, useState } from "react";
import { CaretDown, X } from "@phosphor-icons/react";
import { FIELD_TEXT, PROFILE_LIST_MAX, TRAINING_PROFILE_FIELDS, emptyWishes, type ExerciseNameRef, type ProfileField, type ProfileStatus, type TrainingWishes } from "@repi/domain";
import { Reveal } from "@/components/motion/Skeleton";
import { Ic } from "@/components/ui/Ic";
import { DaysField, EquipmentField, ExperienceField, Field, GoalField, LimitsField, MinutesField, SplitField, TextField, WeekdaysField } from "./ProfileFields";
import { Picker } from "./OwnRoutines";
import { saveProfilePatch, useProfileView } from "./profile-store";

export const STATUS_CHIP: Record<ProfileStatus, string> = { complete: "Completo", partial: "Parcial", none: "Sin información" };
/** «a», «a y b», «a, b y c». */
export const listText = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const OPTIONAL: readonly ProfileField[] = ["weekdays", "split", "equipment", "favorites", "dislikes", "likes", "avoid", "limits"];

/** Valor comparable/guardable: textos sin espacios de más (vacío = sin dato), listas vacías = sin dato. */
function norm(f: ProfileField, v: unknown): unknown {
  if (f === "shareWithTrainers") return v === true;
  if (typeof v === "string") { const t = v.replace(/\s+/g, " ").trim(); return t || null; }
  if (Array.isArray(v)) return v.length ? v : null;
  return v ?? null;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const filledOf = (w: TrainingWishes, f: ProfileField) => norm(f, (w as Record<string, unknown>)[f]) != null;

export function TrainingProfile({ offline, flash }: { offline: boolean; flash: (m: string) => void }) {
  const { view, err, reload } = useProfileView({ revalidate: true, skip: offline });
  const [draft, setDraft] = useState<TrainingWishes | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const moreId = useId();
  if (!view) {
    if (!err && !offline) return <Reveal on={false} />; // M06: entra con alto 0 → real cuando llega
    return (
      <section className="tp wishes" aria-labelledby="tp-h">
        <h2 id="tp-h" className="tp-h">Tu perfil de entrenamiento</h2>
        <p className="mb-muted tp-p">{offline ? "Sin conexión no podemos mostrar tu perfil. Volvé a intentar cuando tengas señal." : err}</p>
        {!offline && <button type="button" className="ghost sm" onClick={() => void reload()}>Reintentar</button>}
      </section>
    );
  }
  const base: TrainingWishes = { ...emptyWishes(), ...(view.profile ?? {}) };
  const d = draft ?? base;
  const set = (p: Partial<TrainingWishes>) => setDraft({ ...d, ...p });
  const changed = TRAINING_PROFILE_FIELDS.filter((f) => !same(norm(f, (d as Record<string, unknown>)[f]), norm(f, (base as Record<string, unknown>)[f])));
  const save = async () => {
    if (busy || !changed.length) return;
    if (offline) { flash("Necesitás conexión para guardar."); return; }
    setBusy(true);
    try {
      const patch = Object.fromEntries(changed.map((f) => [f, norm(f, (d as Record<string, unknown>)[f])])) as Partial<TrainingWishes>;
      await saveProfilePatch(patch, "profile");
      setDraft(null);
      flash("Listo: REPI lo tiene en cuenta en tus sugerencias.");
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const optCount = OPTIONAL.filter((f) => filledOf(d, f)).length;
  const missing = view.missing.map((f) => FIELD_TEXT[f]);
  const when = view.updatedAt ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(view.updatedAt)) : null;
  return (
    <Reveal on>
      <section className="tp wishes" aria-labelledby="tp-h">
        <div className="tp-head">
          <h2 id="tp-h" className="tp-h" tabIndex={-1}>Tu perfil de entrenamiento</h2>
          <span className={`tp-status tp-${view.status}`}>{STATUS_CHIP[view.status]}</span>
        </div>
        <p className="tp-p">
          {view.status === "complete" ? "REPI ya puede personalizar sus sugerencias con tu perfil." : <>Para que las sugerencias sean personalizadas falta {listText(missing)}.</>}
          {" "}<span className="mb-muted">Lo usan REPI, «No vino el profe» y tus rutinas. Tu programa no cambia solo.</span>
        </p>

        <GoalField value={d.goal} age={view.age} onChange={(goal) => set({ goal })} />
        <ExperienceField value={d.experience} onChange={(experience) => set({ experience })} />
        <div className="tp-row">
          <DaysField value={d.daysPerWeek} onChange={(daysPerWeek) => set({ daysPerWeek })} />
          <MinutesField value={d.minutes} onChange={(minutes) => set({ minutes })} />
        </div>

        <button type="button" className="tp-more" aria-expanded={more} aria-controls={moreId} onClick={() => setMore(!more)}>
          <span>Más preferencias (opcional){optCount ? <small> · {optCount} {optCount === 1 ? "completada" : "completadas"}</small> : null}</span>
          <Ic i={CaretDown} size={16} />
        </button>
        <div id={moreId} className="tp-more-body" hidden={!more}>
          {more && <>
            <WeekdaysField value={d.weekdays} onChange={(weekdays) => set({ weekdays })} />
            <SplitField value={d.split} onChange={(split) => set({ split })} />
            <EquipmentField value={d.equipment} onChange={(equipment) => set({ equipment })} />
            <ExerciseListField label="Ejercicios preferidos" hint="REPI los tiene en cuenta cuando sugiere." value={d.favorites}
              onChange={(favorites, dislikes) => set(dislikes === undefined ? { favorites } : { favorites, dislikes })} other={d.dislikes} otherName="los que no te gustan" />
            <ExerciseListField label="Ejercicios que no te gustan" hint="REPI trata de no sugerirlos." value={d.dislikes}
              onChange={(dislikes, favorites) => set(favorites === undefined ? { dislikes } : { dislikes, favorites })} other={d.favorites} otherName="tus preferidos" />
            <TextField label="Cómo te gusta entrenar" value={d.likes} onChange={(likes) => set({ likes })} placeholder="Ej.: peso libre, circuitos, entrenar piernas" />
            <TextField label="Qué preferís evitar" value={d.avoid} onChange={(avoid) => set({ avoid })} placeholder="Ej.: cardio largo, máquinas muy concurridas" />
            <LimitsField value={d.limits} onChange={(limits) => set({ limits })} />
          </>}
        </div>

        <label className="sheet-check tp-share">
          <input type="checkbox" checked={d.shareWithTrainers === true} onChange={(e) => set({ shareWithTrainers: e.target.checked })} />
          <span>Que lo vea quien arma mi rutina (mi coach o el equipo del gym que me arma el programa).</span>
        </label>
        <p className="tp-note" role="note">Acá no van datos de salud. Si algo te duele o tenés una lesión, avisalo con «Molestia».</p>

        {changed.length > 0 && (
          <div className="tp-save">
            <button type="button" className="cta" aria-busy={busy || undefined} disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar cambios"}</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setDraft(null)}>Descartar</button>
          </div>
        )}
        {when && <p className="tp-foot">Actualizado el {when} · versión {view.version}</p>}
      </section>
    </Reveal>
  );
}

/** Ejercicios elegidos de la biblioteca visible (la misma búsqueda de «Mis rutinas»). Hasta 12, se quitan con un toque. */
export function ExerciseListField({ label, hint, value, onChange, other, otherName }: {
  label: string; hint?: string; value: ExerciseNameRef[] | null | undefined;
  /** `other` llega sólo si también cambió la otra lista (en un solo cambio, para no pisar uno con otro). */
  onChange: (v: ExerciseNameRef[] | null, other?: ExerciseNameRef[] | null) => void;
  /** La otra lista (preferidos ↔ no me gustan): un ejercicio no puede estar en las dos. */
  other?: ExerciseNameRef[] | null; otherName?: string;
}) {
  const id = useId();
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const cur = value ?? [];
  const full = cur.length >= PROFILE_LIST_MAX;
  const add = (e: { id: string; name: string }) => {
    setPicking(false);
    if (cur.some((x) => x.id === e.id)) { setNote(`${e.name} ya está en la lista.`); return; }
    if (full) { setNote(`Hasta ${PROFILE_LIST_MAX} ejercicios.`); return; }
    const next = [...cur, { id: e.id, name: e.name }];
    if (other?.some((x) => x.id === e.id)) {
      const rest = other.filter((x) => x.id !== e.id);
      onChange(next, rest.length ? rest : null);
      setNote(`Sacamos ${e.name} de ${otherName ?? "la otra lista"}.`);
    } else { onChange(next); setNote(null); }
  };
  const remove = (x: ExerciseNameRef) => { const rest = cur.filter((y) => y.id !== x.id); onChange(rest.length ? rest : null); setNote(null); };
  return (
    <Field label={label} hint={hint} id={id}>
      <div className="tp-exlist" role="group" aria-labelledby={id}>
        {cur.length ? (
          <ul className="tp-exs">
            {cur.map((x) => (
              <li key={x.id}><span>{x.name}</span>
                <button type="button" className="tp-x" aria-label={`Quitar ${x.name}`} onClick={() => remove(x)}><Ic i={X} size={14} /></button></li>
            ))}
          </ul>
        ) : <span className="tp-empty">Ninguno todavía.</span>}
        {note && <span className="tp-hint" role="status">{note}</span>}
        {picking
          ? <Picker onPick={add} onCancel={() => setPicking(false)} taken={new Set(cur.map((x) => x.id))} />
          : !full && <button type="button" className="linkbtn tp-add" onClick={() => setPicking(true)} aria-label={`Agregar a ${label.toLowerCase()}`}>+ Agregar ejercicio</button>}
        {full && !picking && <span className="tp-hint">Llegaste al máximo de {PROFILE_LIST_MAX}. Quitá uno para sumar otro.</span>}
      </div>
    </Field>
  );
}
