"use client";
// M04 (motion.md): control compacto que se expande a una pista con marcas, relleno, thumb y valor visible.
// Abrir: 200 ms (capa decorativa de la pista 0→1 en X, sin deformar texto ni thumb); etiqueta: 150 ms.
// Arrastre: sigue al dedo sin retardo y sólo cambia estado local; al soltar ajusta al paso más cercano en 180 ms.
// Sin respuesta no hay valor (null nunca se envía como un número por la posición inicial). Teclado: flechas, Home/End, RePág/AvPág.
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label: string; steps: readonly number[]; value: number | null; onChange: (v: number) => void;
  show?: (v: number) => string; ends: [string, string]; collapsed: (v: number | null) => string; startOpen?: boolean; className?: string;
};

export function StepSlider({ label, steps, value, onChange, show = String, ends, collapsed, startOpen = false, className }: Props) {
  const [open, setOpen] = useState(startOpen);
  const [drag, setDrag] = useState<number | null>(null); // índice fraccionario mientras se arrastra
  const opened = useRef(false);
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const lid = useId();
  const n = steps.length - 1;
  const idx = value == null ? null : Math.max(0, steps.indexOf(value));
  const pos = drag ?? idx; // posición visual
  const pct = pos == null ? 0 : (pos / n) * 100;
  const shown = drag != null ? steps[Math.round(drag)] : value;

  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(n, Math.max(0, ((x - r.left) / r.width) * n));
  };
  const commit = (i: number) => { const v = steps[Math.round(i)]; if (v !== value) onChange(v); };
  const key = (e: React.KeyboardEvent) => {
    const cur = idx ?? -1;
    const next = { ArrowRight: cur + 1, ArrowUp: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur - 1, PageUp: cur + 2, PageDown: cur - 2, Home: 0, End: n }[e.key];
    if (next == null) return;
    e.preventDefault();
    commit(Math.min(n, Math.max(0, idx == null ? 0 : next)));
  };

  // Al abrir por acción de la persona, el foco pasa al control (teclado y lector de pantalla siguen el cambio).
  useEffect(() => { if (open && opened.current) thumb.current?.focus({ preventScroll: true }); }, [open]);

  if (!open) return (
    <button type="button" className={`ss-pill${className ? ` ${className}` : ""}`} aria-expanded="false" onClick={() => { opened.current = true; setOpen(true); }}>
      {collapsed(value)}
    </button>
  );
  return (
    <div className={`ss${className ? ` ${className}` : ""}`} data-dragging={drag != null ? "1" : undefined}>
      <div className="ss-head"><span id={lid}>{label}</span><b className="ss-val" aria-hidden="true">{shown == null ? "—" : show(shown)}</b></div>
      <div className="ss-track" ref={track}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(fromX(e.clientX)); thumb.current?.focus({ preventScroll: true }); }}
        onPointerMove={(e) => { if (drag != null) setDrag(fromX(e.clientX)); }}
        onPointerUp={(e) => { if (drag == null) return; const i = fromX(e.clientX); setDrag(null); commit(i); }}
        onPointerCancel={() => setDrag(null)}>
        <i className="ss-rail" aria-hidden="true" />
        {pos != null && <i className="ss-fill" aria-hidden="true" style={{ width: `${pct}%` }} />}
        {steps.map((s, i) => <i key={s} className="ss-tick" aria-hidden="true" data-on={pos != null && i <= Math.round(pos) ? "1" : undefined} style={{ left: `${(i / n) * 100}%` }} />)}
        <div ref={thumb} className="ss-thumb" role="slider" tabIndex={0} aria-labelledby={lid} aria-valuemin={steps[0]} aria-valuemax={steps[n]}
          aria-valuenow={value ?? undefined} aria-valuetext={value == null ? "Sin responder" : show(value)} onKeyDown={key}
          data-empty={pos == null ? "1" : undefined} style={{ left: `${pct}%` }} />
      </div>
      <div className="ss-ends" aria-hidden="true"><span>{ends[0]}</span>{value == null && drag == null && <span>Tocá o arrastrá</span>}<span>{ends[1]}</span></div>
    </div>
  );
}
