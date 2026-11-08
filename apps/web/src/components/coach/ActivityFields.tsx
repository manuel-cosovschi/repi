"use client";
// Ejercicios por tiempo (pedido del titular, 07/11/2026): los campos de una actividad en los editores de rutinas (constructor del
// coach, editor de sala y «Mis rutinas»). Una cinta muestra SÓLO duración (minutos), velocidad (km/h) e inclinación (un número,
// sin «%»); bici, remo, elíptico, escaladora y «sólo duración», los suyos (PROFILE_FIELDS del dominio). La musculación sigue con
// series, repeticiones, carga y RIR. Modelo: la duración sigue en `reps` («10 min») y lo propio de la actividad va en
// `detail.activity`; rangos, pasos y mensajes salen del dominio (ACTIVITY_FIELD_SPEC), así el editor y el servidor dicen lo mismo.
import { useId, useState, type InputHTMLAttributes } from "react";
import {
  ACTIVITY_FIELD_SPEC, ACTIVITY_MAX_SEC, METRICS_PROFILE_HINT, METRICS_PROFILE_LABEL, PROFILE_FIELDS, activityOf, activityValuesText, cleanActivityValues,
  defaultsFor, emptyDetail, fmtSeconds, formatRest, mainSets, matchesExerciseQuery, parseDistance, parseReps, parseRest, profileOf, repsDistance,
  type ActivityDetail, type ActivityField, type ActivityProfile, type ExerciseDetail, type MetricsProfile, type SetMetrics,
} from "@repi/domain";
import { IntInput } from "@/components/ui/IntInput";

/** Lo mínimo de una fila de rutina que necesitan estos campos (programa del coach, de sala o rutina propia). */
type Row = { name: string; sets: number; reps: string; restSec?: number | null; detail?: ExerciseDetail | null };
/** Cambio que devuelven los campos: siempre sin RIR, con la actividad en el detalle. */
export type ActivityPatch = { sets?: number; reps?: string; rir: null; restSec?: number; detail: ExerciseDetail };
type LibInfo = { profile?: string | null; kind?: string | null; group?: string | null } | null | undefined;

/** Detalle con la actividad: conserva la combinación (grupo, vueltas), la variante y la progresión; lo demás no aplica. */
export function withActivity(d: ExerciseDetail | null | undefined, activity: ActivityDetail): ExerciseDetail {
  const b = d ?? emptyDetail();
  const clean = Object.fromEntries(Object.entries(activity).filter(([, v]) => v != null)) as ActivityDetail;
  return { ...emptyDetail(), group: b.group, groupKind: b.groupKind, rounds: b.rounds, variant: b.variant, progression: b.progression, activity: clean };
}

/**
 * Búsqueda en la biblioteca de los editores: por palabras, sin tildes y con sinónimos («cinta caminadora» encuentra «Cinta
 * (caminata)»; antes se buscaba por subcadena y no aparecía), y también por grupo («cardio»).
 */
export const libMatches = (l: { name: string; group: string }, q: string) => !q.trim() || matchesExerciseQuery(l.name, q) || matchesExerciseQuery(`${l.name} ${l.group}`, q);

/** Perfil con que se edita una fila: la actividad indicada; si no, el del ejercicio (biblioteca → catálogo → nombre → tipo). */
export function editorProfile(e: { name: string; detail?: ExerciseDetail | null }, lib?: LibInfo): MetricsProfile {
  const a = activityOf(e.detail);
  if (a) return a.profile;
  return profileOf({ profile: lib?.profile, name: e.name, kind: lib?.kind, group: lib?.group });
}

/**
 * Valores con que se agrega un ejercicio de la biblioteca, según su perfil: una cinta entra como 10 min a 5 km/h e inclinación 0
 * (sin series, RIR ni descanso); un aguante, 3 × 40 s; la musculación, como siempre en cada editor (`strengthReps`).
 */
export function rowDefaults(profile: MetricsProfile, strengthReps = "8-12"): { sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail } {
  const d = defaultsFor(profile);
  if (d.activity) return { sets: d.sets, reps: d.reps, rir: null, restSec: d.restSec, detail: withActivity(null, d.activity) };
  return { sets: d.sets, reps: profile === "hold" ? d.reps : strengthReps, rir: d.rir, restSec: d.restSec };
}

/**
 * «Configurar por duración»: una fila escrita antes como texto («20 min», «3 × 5 min» o «10-12») pasa a ser la actividad de su
 * perfil. Si ya decía un tiempo (o una distancia en el remo) se conserva junto con las vueltas; si no, toma los valores por defecto.
 */
export function toActivityRow(e: Row, profile: ActivityProfile): ActivityPatch {
  const d = defaultsFor(profile);
  const dist = repsDistance(profile, e.reps);
  const t = parseReps(e.reps);
  const keep = (dist != null && dist >= 100) || (t.kind === "time" && t.seconds >= 1 && t.seconds <= ACTIVITY_MAX_SEC);
  const sets = keep ? Math.max(1, Math.min(20, mainSets(e.detail ?? null, e.sets))) : 1;
  return {
    sets, reps: keep ? e.reps.trim() : d.reps, rir: null, restSec: sets > 1 ? e.restSec ?? 0 : 0,
    detail: withActivity(e.detail, { ...d.activity!, ...(keep && dist != null ? { distanceM: dist } : {}) }),
  };
}

const dec = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
/** Número tipeado: «5», «5,5», «-2». Vacío → null; a medio escribir («5,», «-») → undefined; otra cosa → NaN. */
function num(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  if (t === "-" || /^-?\d+\.$/.test(t)) return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

type Key = "dur" | "dist" | "sets" | ActivityField;
type Parsed = { t: "ok"; patch: Omit<ActivityPatch, "rir" | "detail"> & { activity?: Partial<ActivityDetail> } } | { t: "partial" } | { t: "bad"; error: string };

export const FIELD_UI: Record<ActivityField, { label: string; aria: string; mode: InputHTMLAttributes<HTMLInputElement>["inputMode"]; ph?: string }> = {
  speedKmh: { label: "Velocidad (km/h)", aria: "Velocidad en km/h", mode: "decimal" },
  // «text» y no «decimal»: el teclado decimal del iPhone no tiene «-» y una inclinación negativa (-2) no se podía escribir.
  incline: { label: "Inclinación", aria: "Inclinación", mode: "text" },
  level: { label: "Nivel", aria: "Nivel", mode: "numeric" },
  distanceM: { label: "Distancia (m)", aria: "Distancia en metros", mode: "numeric" },
  pace500Sec: { label: "Ritmo /500 m", aria: "Ritmo cada 500 metros", mode: undefined, ph: "2:05" },
  cadenceRpm: { label: "Cadencia (rpm)", aria: "Cadencia en rpm", mode: "numeric" },
};

/**
 * Campos de una actividad. `row`: dentro de la fila del constructor (coach y sala); `sheet`: en la hoja de «Mis rutinas», donde
 * una duración vacía se informa (la hoja avisa «Completá el tiempo» al guardar). Lo que no es válido no se guarda: al salir del
 * campo vuelve el último valor bueno (como los demás campos numéricos de los editores) y queda el aviso de por qué. Con más de una
 * vuelta («3 × 5 min» importado) se ven también las vueltas y el descanso entre ellas.
 */
export function ActivityFields({ e, profile, onChange, variant = "row" }: { e: Row; profile: ActivityProfile; onChange: (p: ActivityPatch) => void; variant?: "row" | "sheet" }) {
  const errId = useId();
  const a: ActivityDetail = activityOf(e.detail) ?? { profile };
  const [drafts, setDrafts] = useState<Partial<Record<Key, string>>>({});
  const [msg, setMsg] = useState<{ k: Key; text: string } | null>(null);
  const dist = profile === "rower" ? parseDistance(e.reps) : null;
  const byDistance = dist != null;
  const emit = (p: Extract<Parsed, { t: "ok" }>["patch"]) => {
    const { activity, ...rest } = p;
    onChange({ ...rest, rir: null, detail: withActivity(e.detail, { ...a, ...activity, profile }) });
  };
  const parse = (k: Key, s: string): Parsed => {
    if (k === "dur") {
      const m = num(s);
      if (m === undefined) return { t: "partial" };
      if (m === null) return variant === "sheet" ? { t: "ok", patch: { reps: "" } } : { t: "bad", error: "Indicá la duración en minutos." };
      if (Number.isNaN(m)) return { t: "bad", error: "Escribí los minutos con números (por ejemplo, 10 o 12,5)." };
      const sec = Math.round(m * 60);
      if (sec < 1 || sec > ACTIVITY_MAX_SEC) return { t: "bad", error: "La duración va hasta 240 minutos (4 horas)." };
      return { t: "ok", patch: { reps: fmtSeconds(sec) } };
    }
    if (k === "dist") {
      const m = num(s);
      if (m === undefined) return { t: "partial" };
      if (m === null || Number.isNaN(m) || !Number.isInteger(m) || m < 100 || m > ACTIVITY_FIELD_SPEC.distanceM.max) return { t: "bad", error: "Indicá la distancia en metros, de 100 a 42195." };
      return { t: "ok", patch: { reps: `${m} m`, activity: { distanceM: m } } };
    }
    if (k === "sets") return { t: "partial" }; // las vueltas van con IntInput
    const f = k;
    const raw = s.trim();
    if (!raw) return { t: "ok", patch: { activity: { [f]: null } } };
    let v: number | null | undefined;
    if (f === "pace500Sec") {
      if (/^\d{1,2}:\d?$/.test(raw)) return { t: "partial" };
      v = parseRest(raw);
      if (v == null) return { t: "bad", error: "Escribí el ritmo como minutos:segundos (por ejemplo, 2:05)." };
    } else {
      v = num(raw);
      if (v === undefined) return { t: "partial" };
    }
    const c = cleanActivityValues(profile, { [f]: v });
    if (!c.ok) return { t: "bad", error: c.error };
    return { t: "ok", patch: { activity: { [f]: c.values[f] ?? null } } };
  };
  const drop = (k: Key) => setDrafts((d) => { const n = { ...d }; delete n[k]; return n; });
  const input = (k: Key, label: string, aria: string, shown: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => {
    const d = drafts[k];
    const bad = d != null && parse(k, d).t === "bad";
    return (
      <label key={k} className="af-cell"><span className="af-lbl">{label}</span>
        <input {...extra} value={d ?? shown} aria-label={`${aria} de ${e.name}`} aria-invalid={bad || undefined} aria-describedby={msg?.k === k ? errId : undefined} autoComplete="off"
          onChange={(ev) => {
            const s = ev.target.value;
            setDrafts((x) => ({ ...x, [k]: s }));
            const r = parse(k, s);
            if (r.t === "ok") { emit(r.patch); if (msg?.k === k) setMsg(null); }
            else if (r.t === "bad" && msg?.k === k) setMsg({ k, text: r.error });
          }}
          onBlur={() => {
            if (d == null) return;
            const r = parse(k, d);
            if (r.t === "bad") setMsg({ k, text: r.error }); else if (msg?.k === k) setMsg(null);
            drop(k); // vuelve el último valor bueno (o el recién guardado, ya con su formato)
          }} />
      </label>
    );
  };
  const fields = PROFILE_FIELDS[profile].filter((f) => f !== "distanceM" || (!byDistance && a.distanceM != null));
  const minutes = (() => { const t = parseReps(e.reps); return t.kind === "time" ? dec(t.seconds / 60) : ""; })();
  const setMode = (distance: boolean) => {
    setDrafts({}); setMsg(null);
    if (distance) { const m = a.distanceM && a.distanceM >= 100 ? a.distanceM : 2000; emit({ reps: `${m} m`, activity: { distanceM: m } }); }
    else emit({ reps: defaultsFor("rower").reps, activity: { distanceM: null } });
  };
  return (
    <div className={variant === "row" ? "af-row" : "or-ex-grid af-grid"} role="group" aria-label={`${METRICS_PROFILE_LABEL[profile]} · ${e.name}`}>
      {profile === "rower" && (
        <span className="af-mode" role="group" aria-label={`Cómo se indica ${e.name}`}>
          <button type="button" aria-pressed={!byDistance} onClick={() => byDistance && setMode(false)}>Por tiempo</button>
          <button type="button" aria-pressed={byDistance} onClick={() => !byDistance && setMode(true)}>Por distancia</button>
        </span>
      )}
      {e.sets > 1 && (
        <label className="af-cell"><span className="af-lbl">Vueltas</span>
          <IntInput min={1} max={20} value={e.sets} aria-label={`Vueltas de ${e.name}`} onChange={(n) => n != null && emit({ sets: n, ...(n === 1 ? { restSec: 0 } : {}) })} /></label>
      )}
      {byDistance
        ? input("dist", "Distancia (m)", "Distancia en metros", String(dist), { inputMode: "numeric", placeholder: "2000" })
        : input("dur", "Duración (min)", "Duración en minutos", minutes, { inputMode: "decimal", placeholder: "10" })}
      {fields.map((f) => input(f, FIELD_UI[f].label, FIELD_UI[f].aria, a[f] == null ? "" : f === "pace500Sec" ? formatRest(a[f]!) : dec(a[f]!),
        { inputMode: FIELD_UI[f].mode, placeholder: FIELD_UI[f].ph ?? (f === "speedKmh" || f === "incline" ? "0" : "—") }))}
      {e.sets > 1 && <RestCell e={e} onRest={(s) => emit({ restSec: s })} />}
      {msg && <small className="af-err" id={errId} role="alert">{msg.text}</small>}
    </div>
  );
}

/** Descanso entre vueltas (sólo con más de una vuelta). */
function RestCell({ e, onRest }: { e: Row; onRest: (sec: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatRest(e.restSec ?? 0);
  const bad = draft != null && (parseRest(draft) == null || parseRest(draft)! > 900);
  return (
    <label className="af-cell"><span className="af-lbl">Descanso</span>
      <input value={shown} placeholder="m:ss" aria-label={`Descanso entre vueltas de ${e.name}`} aria-invalid={bad || undefined}
        onChange={(ev) => { setDraft(ev.target.value); const s = parseRest(ev.target.value); if (s != null && s <= 900) onRest(s); }}
        onBlur={() => setDraft(null)} /></label>
  );
}

/**
 * Aviso en una fila que es una actividad pero está escrita como texto (programas anteriores: «20 min», o «10-12» que dejaba el
 * editor de sala): sigue funcionando como estaba y, con un toque, pasa a configurarse por duración y los campos de su perfil.
 */
export function ConvertToActivity({ name, reps, profile, onConvert }: { name: string; reps: string; profile: ActivityProfile; onConvert: () => void }) {
  const timed = parseReps(reps).kind === "time" || repsDistance(profile, reps) != null;
  return (
    <p className="af-convert" role="note">
      <span>{timed ? "" : "Está indicada como series × repeticiones. "}<b>{METRICS_PROFILE_LABEL[profile]}</b> · {METRICS_PROFILE_HINT[profile]}</span>
      <button type="button" className="btn sm" onClick={onConvert} aria-label={`Configurar por duración: ${name}`}>Configurar por duración</button>
    </p>
  );
}

/** Lo que hizo la persona la última vez en una actividad: «12 min · 5,5 km/h · incl. 4» (en lugar de la carga sugerida). */
export function ActivityLast({ last }: { last?: { at: string; sets: { reps: number | null; metrics?: SetMetrics | null }[] } }) {
  if (!last?.sets.length) return null;
  const txt = last.sets.map((s) => [s.reps ? fmtSeconds(s.reps) : null, activityValuesText(s.metrics)].filter(Boolean).join(" · ")).filter(Boolean);
  if (!txt.length) return null;
  const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(last.at));
  return <span className="ex-sug" role="note"><span>La última vez ({day}): {[...new Set(txt)].length === 1 ? `${txt.length > 1 ? `${txt.length} × ` : ""}${txt[0]}` : txt.join(" / ")}</span></span>;
}
