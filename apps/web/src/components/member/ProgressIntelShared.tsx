"use client";
// D217 · Progress Intelligence 2.0 (cliente): tipos y ayudas compartidas por las tarjetas, las metas y el análisis de REPI.
// Los datos llegan en kg desde GET /api/me/progress/exercises/:id/insight; acá sólo se muestran en la unidad elegida.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { kgTo, type WeightUnit } from "@repi/domain";
import type { ExerciseInsight } from "@/server/progress/insight";

export type PI = ExerciseInsight;

export const dayTxt = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
export const n1 = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
export const secTxt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);
/** Kilos guardados → texto en la unidad elegida («72,5 kg», «159,8 lb»). */
export const wFmt = (unit: WeightUnit) => (kg: number) => `${n1(kgTo(kg, unit))} ${unit}`;

/** Procedencia de un dato: importado y/o con fecha aproximada (nunca se esconde). */
export function SourceBadges({ source, approx }: { source?: "session" | "import" | null; approx?: boolean | null }) {
  if (source !== "import" && !approx) return null;
  return (
    <span className="pgi-badges">
      {source === "import" && <span className="hx-chip">Importado</span>}
      {approx && <span className="hx-chip bad">Fecha aproximada</span>}
    </span>
  );
}

/** «¿Cómo se calcula?» y similares: un botón que despliega una explicación en el lugar (sin ventanas). */
export function Explain({ label = "¿Cómo se calcula?", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="linkbtn pgi-how" aria-expanded={open} onClick={() => setOpen((x) => !x)}>{open ? "Ocultar" : label}</button>
      {open && <div className="pgi-why">{children}</div>}
    </>
  );
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Lleva a una tarjeta (por id), la enfoca y la marca un instante (sin animación con «reducir movimiento»). */
export function goTo(id: string) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  el.focus({ preventScroll: true });
  el.classList.remove("pgi-flash");
  void el.offsetWidth;
  el.classList.add("pgi-flash");
  setTimeout(() => el.classList.remove("pgi-flash"), 1400);
}

const DISMISS_KEY = "repi:progress-insights-dismissed";
/**
 * Mensajes de REPI que la persona marcó «Entendido», por ejercicio y código. Sólo una comodidad de este navegador: si el
 * almacenamiento no está disponible (modo privado, bloqueado), la página funciona igual y el mensaje vuelve a aparecer.
 */
export function useDismissed() {
  const [set, setSet] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const xs = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(xs)) setSet(new Set(xs.filter((x): x is string => typeof x === "string")));
    } catch { /* sin almacenamiento: no se recuerda */ }
  }, []);
  const dismiss = useCallback((key: string) => {
    setSet((s) => {
      const n = new Set(s).add(key);
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...n].slice(-200))); } catch { /* sin almacenamiento */ }
      return n;
    });
  }, []);
  return { has: (k: string) => set.has(k), dismiss };
}
