"use client";
// Lo que buscás entrenando (D139): objetivo, días, minutos, qué te gusta y qué preferís evitar. Lo usa la IA de «No vino el
// profe» para ajustar la sugerencia del día. No es para salud: las molestias se avisan con «Molestia».
import { useEffect, useState } from "react";
import { TRAINING_WISH_GOALS, WISH_TEXT_MAX, emptyWishes, type TrainingWishGoal, type TrainingWishes } from "@repi/domain";
import { api } from "@/lib/api";

export function Wishes({ offline, flash }: { offline: boolean; flash: (m: string) => void }) {
  const [w, setW] = useState<TrainingWishes | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { api<{ wishes: TrainingWishes | null }>("/api/me/settings").then((r) => setW(r.wishes ?? emptyWishes())).catch(() => setW(emptyWishes())); }, []);
  if (!w) return null;
  const set = (p: Partial<TrainingWishes>) => { setW({ ...w, ...p }); setDirty(true); };
  const save = async () => {
    if (offline) { flash("Necesitás conexión para guardar."); return; }
    setBusy(true);
    try { const r = await api<{ wishes: TrainingWishes | null }>("/api/me/settings", { body: { wishes: w } }); setW(r.wishes ?? emptyWishes()); setDirty(false); flash("Listo: la IA lo tiene en cuenta en tus sugerencias."); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <section className="wishes" aria-labelledby="wishes-h">
      <h2 id="wishes-h" style={{ fontSize: 16 }}>Lo que buscás entrenando</h2>
      <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>La IA de «No vino el profe» lo usa para ajustar tu rutina del día. Tu programa no cambia. No pongas datos de salud: para eso está «Molestia».</span>
      <div className="wish-goals" role="radiogroup" aria-label="Objetivo principal">
        {(Object.entries(TRAINING_WISH_GOALS) as [TrainingWishGoal, string][]).map(([k, label]) => (
          <button key={k} type="button" role="radio" className="ai-chip" aria-checked={w.goal === k} aria-pressed={w.goal === k} onClick={() => set({ goal: w.goal === k ? null : k })}>{label}</button>
        ))}
      </div>
      <div className="wish-row">
        <label>Días por semana<input inputMode="numeric" value={w.daysPerWeek ?? ""} onChange={(e) => set({ daysPerWeek: num(e.target.value.replace(/\D/g, "")) })} placeholder="3" maxLength={1} /></label>
        <label>Minutos por día<input inputMode="numeric" value={w.minutes ?? ""} onChange={(e) => set({ minutes: num(e.target.value.replace(/\D/g, "")) })} placeholder="60" maxLength={3} /></label>
      </div>
      <label>Lo que más te gusta<input value={w.likes ?? ""} maxLength={WISH_TEXT_MAX} onChange={(e) => set({ likes: e.target.value || null })} placeholder="Ej.: peso libre, entrenar piernas, circuitos" /></label>
      <label>Lo que preferís evitar<input value={w.avoid ?? ""} maxLength={WISH_TEXT_MAX} onChange={(e) => set({ avoid: e.target.value || null })} placeholder="Ej.: cardio largo, máquinas muy concurridas" /></label>
      {dirty && <button type="button" className="cta" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>}
    </section>
  );
}
