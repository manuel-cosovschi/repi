"use client";
// REPI Nutrition Intelligence 1.0 (D221) · Progreso › Nutrición. Contenedor: elegibilidad (sólo adultos con fecha de
// nacimiento), bienvenida la primera vez, subvistas Hoy / Progreso / Ajustes y la sincronización de la cola sin conexión.
// Privado: el gimnasio, el personal de sala, recepción, el dueño y REPI Admin nunca lo ven; el coach sólo si la persona lo
// comparte desde Perfil → Privacidad. Entrenar funciona igual aunque nunca se use.
import { useCallback, useEffect, useRef, useState } from "react";
import { ELIGIBILITY_TEXT } from "@repi/domain";
import { api } from "@/lib/api";
import { idbGet, idbPut } from "@/lib/offline/idb";
import { flushNutri } from "@/lib/offline/nutrition";
import { AgeGate } from "../AgeGate";
import { BASE, isNetwork, useOnline, type NutriState, type Profile } from "./lib";
import { NutritionDay } from "./NutritionDay";
import { NutritionProgress } from "./NutritionProgress";
import { NutritionSettings } from "./NutritionSettings";
import { NutritionOnboarding } from "./NutritionOnboarding";

type Sub = "today" | "progress" | "settings";
const SUBS: [Sub, string][] = [["today", "Hoy"], ["progress", "Progreso"], ["settings", "Ajustes"]];
export type Undo = { text: string; undo?: () => void };

export function Nutrition({ state, reloadState, offline }: { state: Extract<NutriState, { enabled: true }>; reloadState: () => void; offline?: boolean }) {
  const online = useOnline(offline);
  const [sub, setSub] = useState<Sub>("today");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState(false);
  const [tick, setTick] = useState(0); // sube con cada cambio en la cola o sincronización: las vistas vuelven a leer
  const [issue, setIssue] = useState<string | null>(null);
  const [toast, setToast] = useState<Undo | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showUndo = useCallback((u: Undo) => { clearTimeout(tt.current); setToast(u); tt.current = setTimeout(() => setToast(null), u.undo ? 6000 : 3000); }, []);
  useEffect(() => () => clearTimeout(tt.current), []);
  // Un solo lugar para los avisos de la sección (con o sin «Deshacer»): nunca dos avisos encimados.
  const flash = useCallback((text: string) => showUndo({ text }), [showUndo]);

  // El perfil queda guardado en el teléfono (para abrir la sección sin conexión) cada vez que el servidor lo confirma.
  const keepProfile = useCallback((p: Profile) => { setProfile(p); void idbPut("kv", p, "nutri:profile").catch(() => undefined); }, []);
  const loadProfile = useCallback(async () => {
    setProfileErr(false);
    try { keepProfile(await api<Profile>(`${BASE}/profile`)); }
    catch (e) {
      const cached = await idbGet<Profile>("kv", "nutri:profile").catch(() => undefined);
      if (cached) setProfile((cur) => cur ?? cached); else if (!isNetwork(e)) setProfileErr(true);
    }
  }, [keepProfile]);
  // Al entrar y al volver la conexión (perderla no vuelve a leer: queda lo que ya se ve).
  useEffect(() => { if (state.eligible && (online || !profile)) void loadProfile(); }, [state.eligible, loadProfile, online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sube la cola: al entrar, al volver la conexión, al volver a la pestaña y después de cada registro.
  const sync = useCallback(async () => {
    setTick((n) => n + 1); // lo pendiente se ve en el acto
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const r = await flushNutri((p, i) => api(p, i)).catch(() => ({ sent: 0, failed: [] as { id: string; message: string }[] }));
    if (r.failed.length) setIssue(r.failed.map((f) => f.message).join(" "));
    setTick((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!state.eligible) return;
    void sync();
    const vis = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", sync); document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", vis); };
  }, [sync, state.eligible]);

  if (!state.eligible) {
    if (state.reason === "age_required") return <AgeGate what="Nutrición" onDone={() => reloadState()} />;
    return <div className="pc-empty" role="note">{ELIGIBILITY_TEXT.minor}</div>;
  }
  if (profileErr) return <p className="mb-err" role="alert">No pudimos abrir Nutrición. <button type="button" className="linkbtn" onClick={() => void loadProfile()}>Reintentar</button></p>;
  if (profile && !profile.onboarded) return <NutritionOnboarding online={online} onDone={keepProfile} />;

  return (
    <div className="nu">
      <div className="nu-sub" role="tablist" aria-label="Secciones de Nutrición">
        {SUBS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)}>{l}</button>)}
      </div>
      {!online && <p className="nu-offline" role="status">Sin conexión. Podés registrar con los alimentos que ya se ven (recientes, favoritas y la última búsqueda); se guardan en el teléfono y se sincronizan solos. Buscar en la biblioteca necesita conexión.</p>}
      {issue && (
        <div className="conflict" role="alert">
          <strong>Un cambio no se pudo aplicar</strong><span>{issue} Te mostramos la versión vigente.</span>
          <div><button type="button" className="ghost sm" onClick={() => { setIssue(null); setTick((n) => n + 1); }}>Entendido</button></div>
        </div>
      )}
      {sub === "today" && <NutritionDay online={online} tick={tick} sync={sync} scan={state.scan} flash={flash} showUndo={showUndo} />}
      {sub === "progress" && <NutritionProgress online={online} tick={tick} />}
      {sub === "settings" && <NutritionSettings online={online} profile={profile} onSaved={(p) => { keepProfile(p); setTick((n) => n + 1); }} flash={flash} />}
      <div aria-live="polite" className="sr-only">{toast?.text ?? ""}</div>
      {toast && (
        <div className="nu-toast">
          <span aria-hidden="true">{toast.text}</span>
          {toast.undo && <button type="button" className="linkbtn" onClick={() => { const u = toast.undo!; setToast(null); u(); }}>Deshacer</button>}
        </div>
      )}
    </div>
  );
}
