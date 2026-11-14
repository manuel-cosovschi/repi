"use client";
// Nutrición › Ajustes (D221): objetivo general (opcional, nunca se fuerza bajar de peso), objetivos diarios propios o de un
// profesional (REPI no los genera), preferencias, privacidad, avisos (apagados por defecto) y fuentes de datos.
import { useState } from "react";
import { NOT_MEDICAL } from "@repi/domain";
import { api } from "@/lib/api";
import { BASE, errText, GOALS, MAIN, MODE_LABEL, num, parseAmount, SHORT, type Goal, type Mode, type Prefs, type Profile, type TargetKey, type Targets } from "./lib";

const UNIT: Record<TargetKey, string> = { energyKcal: "kcal", proteinG: "g", carbsG: "g", fatG: "g" };
const DEF_MODE: Record<TargetKey, Mode> = { energyKcal: "approx", proteinG: "min", carbsG: "approx", fatG: "approx" };
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 40));

export function GoalChips({ value, onPick }: { value: Goal | null; onPick: (g: Goal | null) => void }) {
  return (
    <fieldset className="sheet-group"><legend>Objetivo general (opcional)</legend>
      <div>{GOALS.map(([g, l]) => <button key={g} type="button" aria-pressed={value === g} onClick={() => onPick(value === g ? null : g)}>{l}</button>)}</div>
    </fieldset>
  );
}

export function NutritionSettings({ online, profile, onSaved, flash }: { online: boolean; profile: Profile | null; onSaved: (p: Profile) => void; flash: (t: string) => void }) {
  if (!profile) return <div className="pc-empty" role="status">{online ? "Cargando tus ajustes…" : "Sin conexión: tus ajustes se ven y se guardan con conexión."}</div>;
  return <Form key={profile.revision} online={online} profile={profile} onSaved={onSaved} flash={flash} />;
}

function Form({ online, profile, onSaved, flash }: { online: boolean; profile: Profile; onSaved: (p: Profile) => void; flash: (t: string) => void }) {
  const [goal, setGoal] = useState<Goal | null>(profile.goal);
  const [t, setT] = useState<Record<TargetKey, { value: string; mode: Mode }>>(() => Object.fromEntries(MAIN.map((k) => [k, { value: profile.targets[k] ? num(profile.targets[k]!.value) : "", mode: profile.targets[k]?.mode ?? DEF_MODE[k] }])) as Record<TargetKey, { value: string; mode: Mode }>);
  const [pro, setPro] = useState(profile.targetSource === "professional");
  const p = profile.prefs;
  const [mealsPerDay, setMeals] = useState(p.mealsPerDay ? String(p.mealsPerDay) : "");
  const [cooking, setCooking] = useState<Prefs["cooking"]>(p.cooking ?? null);
  const [budget, setBudget] = useState<Prefs["budget"]>(p.budget ?? null);
  const [likes, setLikes] = useState((p.likes ?? []).join(", "));
  const [avoid, setAvoid] = useState((p.avoid ?? []).join(", "));
  const [choices, setChoices] = useState((p.choices ?? []).join(", "));
  const [schedule, setSchedule] = useState(p.schedule ?? "");
  const [proactive, setProactive] = useState(profile.proactive);
  const [reminders, setReminders] = useState(profile.reminders);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    const targets: Targets = {};
    for (const k of MAIN) {
      const raw = t[k].value.trim();
      if (!raw) continue;
      const v = parseAmount(raw);
      if (v == null) { setErr(`Revisá el objetivo de ${SHORT[k].toLowerCase()}: tiene que ser un número.`); return; }
      targets[k] = { value: v, mode: t[k].mode };
    }
    setBusy(true); setErr(null);
    try {
      const r = await api<Profile>(`${BASE}/profile`, { body: {
        goal, targets: Object.keys(targets).length ? targets : null, targetSource: Object.keys(targets).length ? (pro ? "professional" : "self") : null, proactive, reminders,
        prefs: { ...p, mealsPerDay: mealsPerDay ? Number(mealsPerDay) : null, cooking, budget, likes: list(likes), avoid: list(avoid), choices: list(choices), schedule: schedule.trim().slice(0, 120) || null },
      } });
      onSaved(r); flash("Ajustes guardados.");
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <section className="pp-card" aria-labelledby="nu-s-goal">
        <h3 id="nu-s-goal">Tu objetivo</h3>
        <GoalChips value={goal} onPick={setGoal} />
      </section>

      <section className="pp-card" aria-labelledby="nu-s-t">
        <h3 id="nu-s-t">Objetivos diarios (opcionales)</h3>
        <p className="nu-small mb-muted">REPI no calcula objetivos por vos: cargá los que definiste o los que te indicó un profesional. Se muestran como «X de Y», sin juicios.</p>
        <div className="pp-form">
          {MAIN.map((k) => (
            <div key={k} className="nu-trow">
              <label>{SHORT[k]} ({UNIT[k]})<input inputMode="decimal" value={t[k].value} placeholder="sin objetivo" onChange={(e) => setT({ ...t, [k]: { ...t[k], value: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6) } })} /></label>
              <label>Tipo<select value={t[k].mode} onChange={(e) => setT({ ...t, [k]: { ...t[k], mode: e.target.value as Mode } })}>
                {(["min", "approx", "max"] as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select></label>
            </div>
          ))}
          <label className="nu-check"><input type="checkbox" checked={pro} onChange={(e) => setPro(e.target.checked)} /><span>Estos objetivos me los indicó un profesional de la salud</span></label>
        </div>
      </section>

      <section className="pp-card" aria-labelledby="nu-s-pref">
        <h3 id="nu-s-pref">Preferencias</h3>
        <div className="pp-form">
          <label>Comidas por día<select value={mealsPerDay} onChange={(e) => setMeals(e.target.value)}>
            <option value="">Sin definir</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <fieldset className="sheet-group"><legend>¿Cocinás?</legend>
            <div>{([["none", "Casi nunca"], ["some", "A veces"], ["often", "Seguido"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={cooking === v} onClick={() => setCooking(cooking === v ? null : v)}>{l}</button>)}</div>
          </fieldset>
          <fieldset className="sheet-group"><legend>Presupuesto</legend>
            <div>{([["tight", "Ajustado"], ["medium", "Medio"], ["flexible", "Flexible"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={budget === v} onClick={() => setBudget(budget === v ? null : v)}>{l}</button>)}</div>
          </fieldset>
          <label>Alimentos que te gustan (separados por coma)<input value={likes} maxLength={600} onChange={(e) => setLikes(e.target.value)} /></label>
          <label>Alimentos que preferís evitar (separados por coma)<input value={avoid} maxLength={600} onChange={(e) => setAvoid(e.target.value)} /></label>
          <label>Elecciones alimentarias (ej.: vegetariana; separadas por coma)<input value={choices} maxLength={600} onChange={(e) => setChoices(e.target.value)} /></label>
          <label>Horarios habituales<input value={schedule} maxLength={120} placeholder="Ej.: entreno a las 19, ceno tarde" onChange={(e) => setSchedule(e.target.value)} /></label>
        </div>
      </section>

      <section className="pp-card" aria-labelledby="nu-s-n">
        <h3 id="nu-s-n">Avisos</h3>
        <label className="nu-switch"><input type="checkbox" role="switch" checked={proactive} onChange={(e) => setProactive(e.target.checked)} />
          <span><b>Información nutricional de REPI</b><small>Comentarios breves y descriptivos sobre tus registros. Apagado por defecto.</small></span></label>
        <label className="nu-switch"><input type="checkbox" role="switch" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />
          <span><b>Recordatorios para registrar</b><small>Apagado por defecto.</small></span></label>
      </section>

      {err && <p className="mb-err" role="alert">{err}</p>}
      <button type="button" className="cta" disabled={busy || !online} aria-busy={busy || undefined} onClick={() => void save()}>{busy ? "Guardando…" : online ? "Guardar ajustes" : "Sin conexión"}</button>

      <section className="pp-card" aria-labelledby="nu-s-priv">
        <h3 id="nu-s-priv">Privacidad</h3>
        <p className="nu-small">Tu registro de comidas es privado. Tu gimnasio, el personal de sala, recepción, el dueño y REPI Admin nunca lo ven. Tu coach personal sólo si lo compartís vos desde <b>Perfil → Privacidad</b>, con dos niveles separados: el resumen (días registrados y promedios) o el diario completo. Podés dejar de compartir cuando quieras.</p>
      </section>
      <section className="pp-card" aria-labelledby="nu-s-src">
        <h3 id="nu-s-src">Fuentes de datos y licencias</h3>
        <ul className="nu-howto">
          <li>Biblioteca de alimentos: USDA FoodData Central, SR Legacy (abril 2018), dominio público. REPI no está avalado por el USDA. Algunos nombres locales tienen una coincidencia aproximada y se marcan así.</li>
          <li>Productos por código de barras: Open Food Facts (openfoodfacts.org), base colaborativa bajo licencia ODbL. Revisá siempre la etiqueta del envase.</li>
          <li>Tus alimentos y recetas: los valores que cargaste vos.</li>
        </ul>
        <p className="nu-small mb-muted">{NOT_MEDICAL}</p>
      </section>
    </>
  );
}
