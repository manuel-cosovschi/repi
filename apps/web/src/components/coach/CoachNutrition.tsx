"use client";
// D221 · Nutrición en la ficha del coach. Dos permisos que decide el alumno: el resumen (días registrados, promedios de días
// completos, objetivos y consistencia, sin comidas) y el diario (cada registro de las últimas dos semanas). Cada pedido vuelve
// a comprobar el permiso en el servidor: si el alumno lo revoca, la próxima carga ya no trae nada. Nunca incluye el peso.
import { useCallback, useEffect, useState } from "react";
import { fmtNutrient, isComplete, MEAL_LABEL, type Meal, type NutrientKey, type Nutrients, type Totals } from "@repi/domain";
import { api } from "@/lib/api";
import { LockCard } from "./CoachHealth";
import { fmtDate } from "./types";

type Pack = { days: number; loggedDays: number; completeDays: number; partialDays: number; averages: Record<string, { average: number | null; usableDays: number }>; consistency: Record<string, { met: number; of: number } | null> };
type Data = {
  granted: boolean; summary: boolean; journal: boolean;
  access: Record<string, { status: string; retryAt: string | null }>;
  summaryView?: { week: Pack; month: Pack; targets: Record<string, { value: number; mode: string }>; targetSource: string | null; series: { day: string; status: string; proteinG: number | null; energyKcal: number | null; complete: boolean }[] } | null;
  journalView?: { days: { day: string; status: string; totals: Totals; meals: { meal: Meal; entries: { name: string; quantity: { amount: number; unit: string }; grams: number | null; nutrients: Nutrients }[] }[] }[] } | null;
};
const KEYS: [NutrientKey, string][] = [["proteinG", "Proteína"], ["energyKcal", "Energía"], ["carbsG", "Carbohidratos"], ["fatG", "Grasas"]];
const MODE: Record<string, string> = { min: "mínimo", approx: "aproximado", max: "máximo" };
const dayTxt = (d: string) => fmtDate(`${d}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" });

function Summary({ p, label }: { p: Pack; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <b>{label}</b>
      <span className="muted" style={{ fontSize: 14 }}>Registró comidas en {p.loggedDays} de {p.days} días · {p.completeDays} marcados completos · {p.partialDays} parciales.</span>
      {KEYS.map(([k, l]) => {
        const a = p.averages[k];
        if (!a) return null;
        return <div key={k} className="trow"><span style={{ flex: "0 0 130px" }}>{l}</span><span style={{ flex: 1 }}>{a.average == null ? `Sin promedio: hacen falta 3 días completos (hay ${a.usableDays})` : `${fmtNutrient(k, a.average)} por día · ${a.usableDays} días completos`}</span></div>;
      })}
    </div>
  );
}

export function CoachNutrition({ orgId, relId, name, flash }: { orgId: string; relId: string; name: string; flash: (t: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const first = name.split(" ")[0];
  const load = useCallback(() => api<Data>(`/api/coach/${orgId}/clients/${relId}/nutrition`).then((x) => { setD(x); setErr(null); }).catch((e) => setErr((e as Error).message)), [orgId, relId]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <p role="alert" className="err-box">{err}</p>;
  if (!d) return <p className="muted">Cargando…</p>;
  const st = (k: string) => d.access[k] ?? { status: "none", retryAt: null };
  const s = d.summaryView, j = d.journalView;
  const maxP = Math.max(1, ...(s?.series ?? []).map((x) => x.proteinG ?? 0));
  return (
    <>
      {!d.summary && <LockCard orgId={orgId} relId={relId} item="nutrition" first={first} status={st("nutrition").status} retryAt={st("nutrition").retryAt} onRequested={load} flash={flash} />}
      {s && (
        <section className="card">
          <h2>Nutrición · resumen</h2>
          <span className="muted" style={{ fontSize: 13 }}>Lo que {first} registra en su app. Los promedios usan sólo los días que marcó completos: un día parcial no muestra todo lo que comió. REPI no prescribe dietas: si necesita un plan, derivá a un profesional de la nutrición.</span>
          <Summary p={s.week} label="Últimos 7 días" />
          <Summary p={s.month} label="Últimos 28 días" />
          {Object.keys(s.targets).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b>Objetivos {s.targetSource === "professional" ? "indicados por su profesional" : "que definió"}</b>
              {Object.entries(s.targets).map(([k, t]) => {
                const c = s.month.consistency[k];
                return <div key={k} className="trow"><span style={{ flex: "0 0 130px" }}>{KEYS.find(([x]) => x === k)?.[1] ?? k}</span><span style={{ flex: 1 }}>{fmtNutrient(k as NutrientKey, t.value)} ({MODE[t.mode] ?? t.mode}){c ? ` · cumplido en ${c.met} de ${c.of} días completos` : " · sin días completos para comparar"}</span></div>;
              })}
            </div>
          )}
          <div>
            <b>Proteína registrada por día (28 días)</b>
            <div className="bars10" role="img" aria-label={`Proteína registrada por día: ${s.series.filter((x) => x.proteinG != null).map((x) => `${dayTxt(x.day)} ${fmtNutrient("proteinG", x.proteinG)}${x.complete ? "" : " (parcial)"}`).join(", ") || "sin registros"}`} style={{ height: 90, marginTop: 8 }}>
              {s.series.map((x) => <div key={x.day} title={`${dayTxt(x.day)} · ${x.proteinG == null ? "sin registro" : fmtNutrient("proteinG", x.proteinG)}${x.complete ? "" : " · parcial"}`}><i style={{ height: x.proteinG == null ? 0 : `${Math.max(4, (x.proteinG / maxP) * 100)}%`, background: x.complete ? "var(--ui-accent-2)" : "var(--ui-border)" }} /></div>)}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>Barra llena: día completo · gris: día parcial (sólo lo registrado) · vacío: sin registro, no significa que no comió.</span>
          </div>
        </section>
      )}
      {!d.journal && (d.summary || st("nutrition_journal").status !== "none") && <LockCard orgId={orgId} relId={relId} item="nutrition_journal" first={first} status={st("nutrition_journal").status} retryAt={st("nutrition_journal").retryAt} onRequested={load} flash={flash} />}
      {j && (
        <section className="card">
          <h2>Diario de comidas · últimos 14 días</h2>
          {!j.days.length && <span className="muted" style={{ fontSize: 14 }}>{first} no registró comidas en estos días.</span>}
          {j.days.map((day) => (
            <div key={day.day} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <b>{dayTxt(day.day)} <span className={`chip ${day.status === "complete" ? "ok" : "mute"}`}>{day.status === "complete" ? "Completo" : "Parcial"}</span></b>
              {day.meals.map((m) => (
                <div key={m.meal} className="trow" style={{ alignItems: "flex-start" }}>
                  <span style={{ flex: "0 0 110px" }} className="muted">{MEAL_LABEL[m.meal]}</span>
                  <span style={{ flex: 1 }}>{m.entries.map((e) => `${e.name} (${e.grams != null ? `${Math.round(e.grams)} g` : `${e.quantity.amount} ${e.quantity.unit}`})`).join(" · ")}</span>
                </div>
              ))}
              <span className="muted" style={{ fontSize: 13 }}>{KEYS.map(([k, l]) => `${l} ${fmtNutrient(k, day.totals.values[k], !isComplete(day.totals, k))}`).join(" · ")}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
