"use client";
// D217 · Formulario breve contextual del perfil de entrenamiento. Antes de crear la primera rutina, subir una, entrenar por tu
// cuenta o pedir la rutina de «No vino el profe», si al perfil le falta algo esencial (objetivo, experiencia, días o minutos)
// y en ese lugar todavía no se ofreció, pregunta SÓLO lo que falta (nunca lo ya declarado). Nunca bloquea: «Ahora no», cerrar
// la hoja, estar sin conexión o un error de la API siguen con la acción original sin perder nada. Se ofrece una sola vez por
// lugar (completado u omitido: POST { asked }). No se usa para registrar entrenamientos a mano ni en altas, invitaciones o QR.
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { ProfileField, TrainingWishes } from "@repi/domain";
import { ApiError } from "@/lib/api";
import { Reveal } from "@/components/motion/Skeleton";
import { Ic } from "@/components/ui/Ic";
import { Sheet } from "./Sheet";
import { DaysField, EquipmentField, ExperienceField, GoalField, LimitsField, MinutesField, SplitField, WeekdaysField } from "./ProfileFields";
import { loadProfile, markAsked, peekProfile, saveProfilePatch, useProfileView, type GateWhere, type ProfileView } from "./profile-store";

type Req = { where: GateWhere; view: ProfileView; then: () => void };
let host: ((r: Req) => boolean) | null = null;
let deciding = false;
const WAIT_MS = 2500;

const TITLE: Record<GateWhere, string> = {
  onboarding: "Contale a REPI qué buscás",
  routines: "Antes de armar tu rutina",
  import: "Antes de subir tu rutina",
  solo: "Antes de entrenar por tu cuenta",
  coach_absent: "Antes de armar tu rutina de hoy",
  brain: "Contale a REPI qué buscás",
};
/** Opcionales que se pueden sumar desde el formulario breve (los de listas de ejercicios quedan para Perfil). */
const GATE_OPTIONAL: readonly ProfileField[] = ["weekdays", "split", "equipment", "limits"];
const isSet = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && !v.length);

/**
 * `gate(where, then)`: si corresponde, abre el formulario breve y, al cerrarse (guardado, omitido o descartado), sigue con
 * `then()`. Si no corresponde (perfil completo, ya ofrecido ahí, sin conexión, sin respuesta o error), llama `then()` enseguida.
 */
export function useProfileGate() {
  return useCallback((where: GateWhere, then: () => void) => { void runGate(where, then); }, []);
}

async function runGate(where: GateWhere, then: () => void) {
  if (deciding) return; // un doble toque mientras se decide no dispara dos veces la acción
  if (!host || (typeof navigator !== "undefined" && !navigator.onLine)) { then(); return; }
  let v = peekProfile();
  if (!v) {
    deciding = true;
    try { v = await Promise.race([loadProfile(), new Promise<null>((r) => setTimeout(() => r(null), WAIT_MS))]); } catch { v = null; }
    finally { deciding = false; }
  }
  if (!v || v.status === "complete" || v.asked[where] || !v.missing.length || !host) { then(); return; }
  if (!host({ where, view: v, then })) then();
}

/** Se monta una vez en la app del alumno: lee el perfil al abrir y muestra el formulario breve cuando `gate` lo pide. */
export function ProfileGateHost() {
  const [req, setReq] = useState<Req | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    const open = (r: Req) => { if (busy.current) return false; busy.current = true; setReq(r); return true; };
    host = open;
    if (navigator.onLine) loadProfile().catch(() => {});
    return () => { if (host === open) host = null; };
  }, []);
  if (!req) return null;
  return <ProfileGateSheet where={req.where} view={req.view} onDone={() => {
    busy.current = false;
    setReq(null);
    setTimeout(req.then, 0); // la hoja ya se cerró (foco devuelto) antes de seguir con la acción original
  }} />;
}

function ProfileGateSheet({ where, view, onDone }: { where: GateWhere; view: ProfileView; onDone: () => void }) {
  // Lo que se pregunta queda fijo al abrir: un campo no desaparece mientras se completa.
  const [ask] = useState(() => view.missing);
  const [optional] = useState(() => GATE_OPTIONAL.filter((f) => !isSet(view.profile?.[f as keyof TrainingWishes])));
  const [p, setP] = useState<Partial<TrainingWishes>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const done = useRef(false);
  const set = (x: Partial<TrainingWishes>) => { setWarn(null); setP((cur) => ({ ...cur, ...x })); };
  const finish = () => { if (done.current) return; done.current = true; onDone(); };
  const skip = () => { if (busy) return; void markAsked(where); finish(); };
  const save = async () => {
    if (busy) return;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      const val = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v;
      if (isSet(val)) patch[k] = val;
    }
    setBusy(true); setWarn(null);
    try {
      if (Object.keys(patch).length) await saveProfilePatch(patch as Partial<TrainingWishes>, where);
      await markAsked(where);
      finish();
    } catch (e) {
      setWarn(e instanceof ApiError && e.status < 500 ? e.message : "No pudimos guardar. Revisá tu conexión o tocá «Ahora no» para seguir.");
    } finally { setBusy(false); }
  };
  const asks = (f: ProfileField) => ask.includes(f);
  return (
    <Sheet title={TITLE[where]} onClose={skip}
      sub="Así REPI ajusta sus sugerencias a vos. Si no completás, igual podés seguir: las sugerencias no van a estar personalizadas.">
      <div className="pg wishes">
        {asks("goal") && <GoalField value={p.goal} age={view.age} onChange={(goal) => set({ goal })} />}
        {asks("experience") && <ExperienceField value={p.experience} onChange={(experience) => set({ experience })} />}
        {(asks("daysPerWeek") || asks("minutes")) && (
          <div className="tp-row">
            {asks("daysPerWeek") && <DaysField value={p.daysPerWeek} onChange={(daysPerWeek) => set({ daysPerWeek })} />}
            {asks("minutes") && <MinutesField value={p.minutes} onChange={(minutes) => set({ minutes })} />}
          </div>
        )}
        {optional.length > 0 && (
          <button type="button" className="linkbtn pg-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Menos preferencias" : "Más preferencias"}</button>
        )}
        {more && <>
          {optional.includes("weekdays") && <WeekdaysField value={p.weekdays} onChange={(weekdays) => set({ weekdays })} />}
          {optional.includes("split") && <SplitField value={p.split} onChange={(split) => set({ split })} />}
          {optional.includes("equipment") && <EquipmentField value={p.equipment} onChange={(equipment) => set({ equipment })} />}
          {optional.includes("limits") && <LimitsField value={p.limits} onChange={(limits) => set({ limits })} />}
        </>}
        <p className="tp-note">Sólo te preguntamos lo que falta. Lo cambiás cuando quieras en Perfil. Acá no van datos de salud: para eso está «Molestia».</p>
        {warn && <p className="sheet-warn" role="alert">{warn}</p>}
        <div className="pg-acts">
          <button type="button" className="cta" aria-busy={busy || undefined} disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar y seguir"}</button>
          <button type="button" className="ghost" disabled={busy} onClick={skip}>Ahora no</button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Inicio: tarjeta breve para perfiles nuevos o incompletos («Contale a REPI qué buscás · 1 minuto»). Se ve hasta que se
 * completa u omite (una sola vez); nunca con un entrenamiento abierto ni sin conexión.
 */
export function ProfileNudge({ hidden }: { hidden: boolean }) {
  const { view } = useProfileView({ skip: hidden });
  const gate = useProfileGate();
  const show = !hidden && !!view && view.status !== "complete" && !view.asked.onboarding && view.missing.length > 0;
  return (
    <Reveal on={show}>
      {show && (
        <div className="pg-card">
          <button type="button" className="pg-card-main" onClick={() => gate("onboarding", () => {})}>
            <span><b>Contale a REPI qué buscás · 1 minuto</b><small>Tu objetivo, experiencia, días y tiempo. Así las sugerencias se ajustan a vos.</small></span>
            <em>Empezar</em>
          </button>
          <button type="button" className="pg-card-x" aria-label="Ahora no" onClick={() => void markAsked("onboarding")}><Ic i={X} size={16} /></button>
        </div>
      )}
    </Reveal>
  );
}
