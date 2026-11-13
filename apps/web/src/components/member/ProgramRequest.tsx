"use client";
// D206: «Pedir mi programa» con lo que el profe necesita para armarlo. Obligatorio: objetivo, días, minutos, experiencia y
// la decisión sobre lesiones o limitaciones («No tengo» o cuáles). Opcional: qué priorizar, dónde entrena, qué le gusta,
// qué evita y notas. Se precarga con lo último que contó. Sirve para un pedido nuevo y para completar uno anterior.
// 13/11/2026: también para quien pidió sin datos y ya recibió su programa (`mode="late"`): el aviso no desaparece cuando el
// pedido se responde; sigue hasta que la persona completa sus datos o toca «Ahora no» (vuelve a los 14 días).
import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  BRIEF_FOCUS, BRIEF_LEVELS, BRIEF_PLACES, TRAINING_WISH_GOALS, toWhom,
  type BriefFocus, type BriefLevel, type BriefPlace, type TrainingWishGoal,
} from "@repi/domain";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";
import { Sheet } from "./Sheet";

export type BriefForm = {
  goal: TrainingWishGoal | null; daysPerWeek: number | null; minutes: number | null; level: BriefLevel | null;
  hasLimitations: boolean | null; limitationsDetail: string | null; focus: BriefFocus[]; place: BriefPlace | null;
  likes: string | null; avoid: string | null; notes: string | null;
};
export type PendingBrief = { id: string; source: "gym" | "coach"; to: string; createdAt: string };
/** Pedido ya respondido sin datos, con el perfil de entrenamiento todavía incompleto. `snoozed`: tocó «Ahora no» hace poco. */
export type LateBrief = PendingBrief & { snoozed: boolean };
export type ProgramRequestState = { pending: PendingBrief[]; late?: LateBrief | null; prefill: BriefForm };

const MINUTES = [30, 45, 60, 75, 90, 120];
const empty: BriefForm = { goal: null, daysPerWeek: null, minutes: null, level: null, hasLimitations: null, limitationsDetail: null, focus: [], place: null, likes: null, avoid: null, notes: null };

/** Qué falta (en orden). null = listo para enviar. */
function missing(f: BriefForm): string | null {
  if (!f.goal) return "Elegí tu objetivo principal.";
  if (!f.daysPerWeek) return "Elegí cuántos días por semana podés entrenar.";
  if (!f.minutes) return "Elegí cuánto tiempo tenés por entrenamiento.";
  if (!f.level) return "Elegí tu experiencia entrenando.";
  if (f.hasLimitations == null) return "Contanos si tenés alguna lesión, molestia o limitación (o elegí «No tengo»).";
  if (f.hasLimitations && (f.limitationsDetail ?? "").trim().length < 3) return "Contá qué lesión, molestia o limitación tenés.";
  return null;
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * `mode="new"`: pedido nuevo a `to` (POST a `url`). `mode="complete"`: completa los pedidos abiertos sin preferencias.
 * `mode="late"`: lo mismo para un pedido que ya respondieron (los datos van al perfil y quedan en ese pedido).
 * `onDone` recibe el mensaje para mostrar.
 */
export function ProgramRequestSheet({ mode, to, url, extra, offline, onClose, onDone }: {
  mode: "new" | "complete" | "late"; to: string; url?: string; extra?: Record<string, unknown>; offline: boolean; onClose: () => void; onDone: (msg: string, duplicate?: boolean) => void;
}) {
  const [f, setF] = useState<BriefForm | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ProgramRequestState>("/api/me/program-request").then((s) => setF({ ...empty, ...s.prefill, focus: s.prefill.focus ?? [] })).catch(() => setF(empty));
  }, []);
  const set = (p: Partial<BriefForm>) => { setF((x) => ({ ...(x ?? empty), ...p })); setWarn(null); };
  const submit = async () => {
    if (!f) return;
    const m = missing(f);
    if (m) { setWarn(m); return; }
    if (offline) { setWarn("Necesitás conexión para enviar el pedido."); return; }
    setBusy(true);
    try {
      if (mode === "late") {
        await api("/api/me/program-request", { body: { brief: f } });
        onDone(`Listo. REPI ya lo tiene en cuenta y ${to} ya puede ver tus datos.`);
      } else if (mode === "complete") {
        await api("/api/me/program-request", { body: { brief: f } });
        onDone(`Listo. ${cap(to)} ya tiene tus datos para armar tu programa.`);
      } else {
        const r = await api<{ duplicate: boolean }>(url!, { body: { kind: "programa", text: "Quiero que me armen un programa.", ...extra, brief: f } });
        onDone(r.duplicate ? `Actualizamos tu pedido con tus datos.` : `Pedido enviado ${toWhom(to)}, con todo lo que necesita para armarlo.`, r.duplicate);
      }
    } catch (e) { setWarn((e as Error).message); } finally { setBusy(false); }
  };
  if (!f) return null;
  const ready = !missing(f);
  return (
    <Sheet
      title={mode === "late" ? "Contale a REPI qué buscás" : mode === "complete" ? "Completá tu pedido de programa" : "Pedí tu programa"}
      sub={mode === "late"
        ? `Cuando pediste tu programa todavía no se podían cargar estos datos. Con ellos REPI ajusta sus sugerencias a vos y ${to} puede revisar tu rutina. Lo marcado con * es obligatorio. Lo ve sólo quien atendió tu pedido (en el gimnasio, el equipo de sala de tu sede).`
        : `Contale ${toWhom(to)} lo que necesita para armarlo. Lo marcado con * es obligatorio. Lo ve sólo quien atiende tu pedido (en el gimnasio, el equipo de sala de tu sede).`}
      onClose={onClose}
      groups={[
        { label: "Objetivo principal *", opts: Object.entries(TRAINING_WISH_GOALS) as [string, string][], value: f.goal, onPick: (v) => set({ goal: v as TrainingWishGoal }) },
        { label: "Días por semana que podés entrenar *", minW: 44, opts: [1, 2, 3, 4, 5, 6, 7].map((n) => [n, String(n)] as [number, string]), value: f.daysPerWeek, onPick: (v) => set({ daysPerWeek: v as number }) },
        { label: "Tiempo por entrenamiento *", opts: MINUTES.map((n) => [n, n === 120 ? "2 h" : `${n} min`] as [number, string]), value: f.minutes, onPick: (v) => set({ minutes: v as number }) },
        { label: "Experiencia entrenando *", opts: Object.entries(BRIEF_LEVELS) as [string, string][], value: f.level, onPick: (v) => set({ level: v as BriefLevel }) },
        { label: "¿Tenés alguna lesión, molestia o limitación? *", opts: [["no", "No tengo"], ["si", "Sí, tengo"]], value: f.hasLimitations == null ? null : f.hasLimitations ? "si" : "no", onPick: (v) => set({ hasLimitations: v === "si" }) },
      ]}
      warn={warn}
      action={{ label: mode === "new" ? "Enviar pedido" : "Enviar mis datos", ready, busy, onSubmit: submit }}
    >
      <div className="wishes">
        {f.hasLimitations && (
          <label>Contá cuál y desde cuándo *
            <textarea rows={2} maxLength={500} value={f.limitationsDetail ?? ""} onChange={(e) => set({ limitationsDetail: e.target.value })}
              placeholder="Ej.: me operaron la rodilla derecha en 2023; me molesta el hombro al levantar por encima de la cabeza" />
          </label>
        )}
        <fieldset className="sheet-group"><legend>Qué te gustaría priorizar (opcional, hasta 5)</legend>
          <div>{(Object.entries(BRIEF_FOCUS) as [BriefFocus, string][]).map(([k, l]) => {
            const on = f.focus.includes(k);
            return <button key={k} type="button" aria-pressed={on} onClick={() => set({ focus: on ? f.focus.filter((x) => x !== k) : f.focus.length >= 5 ? f.focus : [...f.focus, k] })}>{l}</button>;
          })}</div>
        </fieldset>
        <fieldset className="sheet-group"><legend>Dónde vas a entrenar (opcional)</legend>
          <div>{(Object.entries(BRIEF_PLACES) as [BriefPlace, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={f.place === k} onClick={() => set({ place: f.place === k ? null : k })}>{l}</button>)}</div>
        </fieldset>
        <label>Ejercicios que te gustan (opcional)<input value={f.likes ?? ""} maxLength={300} onChange={(e) => set({ likes: e.target.value || null })} placeholder="Ej.: sentadilla, hip thrust, remo" /></label>
        <label>Lo que preferís evitar (opcional)<input value={f.avoid ?? ""} maxLength={300} onChange={(e) => set({ avoid: e.target.value || null })} placeholder="Ej.: cardio largo, saltos" /></label>
        <label>Algo más que tu profe deba saber (opcional)<textarea rows={2} maxLength={300} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} placeholder="Ej.: juego al fútbol los sábados; quiero llegar en forma a marzo" /></label>
      </div>
    </Sheet>
  );
}

/** Aviso en Inicio cuando hay pedidos de programa esperando tus datos (incluye los anteriores a D206). */
export function PendingBriefBanner({ pending, onOpen }: { pending: PendingBrief[]; onOpen: () => void }) {
  if (!pending.length) return null;
  const to = pending[0].to;
  return (
    <button type="button" className="hbanner cyan" onClick={onOpen} style={{ textAlign: "left" }}>
      <span className="dot" style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ui-accent)", flex: "none" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <b>Completá tu pedido de programa</b>
        <span style={{ fontSize: 13 }}>{`${cap(to)} necesita tu objetivo, tus días y si tenés alguna lesión para armarlo.`}</span>
      </span>
    </button>
  );
}

/**
 * Aviso en Inicio para quien pidió su programa sin datos y ya lo recibió: «Contale a REPI qué buscás». No es urgente (ya
 * tiene rutina), así que se puede dejar para después: «Ahora no» lo esconde 14 días y vuelve mientras falten los datos.
 */
export function LateBriefCard({ late, onOpen, onLater }: { late: LateBrief | null | undefined; onOpen: () => void; onLater: () => void }) {
  if (!late || late.snoozed) return null;
  return (
    <div className="pg-card" data-late-brief>
      <button type="button" className="pg-card-main" onClick={onOpen}>
        <span><b>Contale a REPI qué buscás · 1 minuto</b><small>{`Tu pedido de programa salió sin tu objetivo, tus días ni tu experiencia. Cargalos para que REPI y ${late.to} los tengan en cuenta.`}</small></span>
        <em>Completar</em>
      </button>
      <button type="button" className="pg-card-x" aria-label="Ahora no: recordármelo más adelante" onClick={onLater}><Ic i={X} size={16} /></button>
    </div>
  );
}
