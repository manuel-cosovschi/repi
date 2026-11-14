"use client";
// Bienvenida a Nutrición (D221): dos pasos como máximo y se puede saltar. Qué podés hacer, qué se guarda, que es privado y
// un objetivo general opcional (ninguno elegido de antemano; nunca se fuerza bajar de peso). Entrenar funciona igual aunque
// nunca la uses.
import { useEffect, useRef, useState } from "react";
import { NOT_MEDICAL } from "@repi/domain";
import { api } from "@/lib/api";
import { BASE, errText, type Goal, type Profile } from "./lib";
import { GoalChips } from "./NutritionSettings";

export function NutritionOnboarding({ online, onDone }: { online: boolean; onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step === 2) head.current?.focus(); }, [step]);
  const finish = async (withGoal: boolean) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { onDone(await api<Profile>(`${BASE}/profile`, { body: { onboarded: true, ...(withGoal && goal ? { goal } : {}) } })); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <section className="pp-card nu-onb" aria-labelledby="nu-onb-h">
      <p className="nu-step" aria-hidden="true">Paso {step} de 2</p>
      {step === 1 ? (
        <>
          <h2 id="nu-onb-h">Nutrición, a tu ritmo</h2>
          <ul className="nu-howto">
            <li><b>Qué podés hacer:</b> registrar lo que comés buscando alimentos, escribiéndolo como lo dirías, con el código de barras, tus recetas o tus comidas favoritas. Ves energía, proteínas, carbohidratos y grasas del día y tu progreso.</li>
            <li><b>Qué se guarda:</b> los alimentos, cantidades y comidas que registres, y los ajustes que elijas. Nada más.</li>
            <li><b>Es privado:</b> tu gimnasio, el personal de sala, recepción, el dueño y REPI Admin nunca lo ven. Tu coach personal, sólo si lo compartís vos desde Perfil → Privacidad, eligiendo entre el resumen o el diario completo.</li>
            <li>Tus entrenamientos funcionan igual aunque nunca uses Nutrición.</li>
          </ul>
          <p className="nu-small mb-muted">{NOT_MEDICAL}</p>
          <button type="button" className="cta" onClick={() => setStep(2)}>Siguiente</button>
          <button type="button" className="ghost" disabled={busy || !online} onClick={() => void finish(false)}>Saltar y empezar</button>
        </>
      ) : (
        <>
          <h2 id="nu-onb-h" ref={head} tabIndex={-1}>¿Para qué querés usarla?</h2>
          <p className="nu-small">Es opcional y lo cambiás cuando quieras en Ajustes. No vamos a decirte qué comer ni a pedirte bajar de peso.</p>
          <GoalChips value={goal} onPick={setGoal} />
          {err && <p className="mb-err" role="alert">{err}</p>}
          <button type="button" className="cta" disabled={busy || !online} aria-busy={busy || undefined} onClick={() => void finish(true)}>{busy ? "Un momento…" : "Empezar a registrar"}</button>
          <button type="button" className="ghost" onClick={() => setStep(1)}>Volver</button>
        </>
      )}
      {!online && <p className="nu-small mb-muted" role="status">Sin conexión: la bienvenida se guarda cuando vuelva la red.</p>}
    </section>
  );
}
