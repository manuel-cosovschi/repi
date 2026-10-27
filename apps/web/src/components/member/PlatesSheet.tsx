"use client";
// Calculadora de discos y entrada en calor sugerida (F-HX-21, D105). Sólo consulta: no registra series, no cambia la
// prescripción del coach ni el historial. Usa la unidad elegida por la persona; la barra elegida se recuerda en el equipo.
import { useState } from "react";
import { BARS, kgTo, platesFor, warmupFor, type WeightUnit } from "@repi/domain";
import { Sheet } from "./Sheet";

const n = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function PlatesSheet({ kgWeight, unit, onClose }: { kgWeight: number; unit: WeightUnit; onClose: () => void }) {
  const key = `repi:bar:${unit}`;
  const [bar, setBar] = useState<number>(() => { try { const v = Number(localStorage.getItem(key)); return BARS[unit].includes(v) ? v : BARS[unit][0]; } catch { return BARS[unit][0]; } });
  const pick = (v: number) => { setBar(v); try { localStorage.setItem(key, String(v)); } catch { /* sin almacenamiento: vale para esta hoja */ } };
  const work = kgTo(kgWeight, unit);
  const load = platesFor(work, bar, unit);
  const warm = warmupFor(work, bar, unit);
  const sideTxt = (l: NonNullable<typeof load>) => l.perSide.length ? l.perSide.map((p) => `${p.count} × ${n(p.plate)}`).join(" + ") : "Sin discos";
  return (
    <Sheet title="Discos y entrada en calor" sub={`Para ${n(work)} ${unit}. Es una ayuda: no se registra ni cambia lo que indicó tu coach.`} onClose={onClose}
      groups={[{ label: "Barra", minW: 72, opts: BARS[unit].map((b) => [b, `${n(b)} ${unit}`] as [number, string]), value: bar, onPick: (v) => pick(Number(v)) }]}>
      <div className="plates">
        <h3>Por lado</h3>
        {!load ? <p className="mb-muted">El peso es menor que la barra elegida.</p> : <>
          <p className="plates-side"><strong>{sideTxt(load)}</strong>{load.perSide.length > 0 && <span> {unit} en cada lado</span>}</p>
          {!load.exact && <p className="mb-muted">Con discos estándar llegás a {n(load.total)} {unit} (faltan {n(load.missing)}). Si tu gimnasio tiene discos más chicos, sumalos.</p>}
        </>}
        <h3>Entrada en calor sugerida</h3>
        {!warm.length ? <p className="mb-muted">No hace falta: el peso es igual o menor que la barra.</p> : (
          <ol className="plates-warm">
            {warm.map((x) => <li key={x.weight}><span>{x.label}</span><strong>{n(x.weight)} {unit} × {x.reps}</strong></li>)}
          </ol>
        )}
        <p className="mb-muted plates-note">Suponemos discos de {unit === "kg" ? "25, 20, 15, 10, 5, 2,5 y 1,25 kg" : "45, 35, 25, 10, 5 y 2,5 lb"}. Si tu coach te indicó otra entrada en calor, seguí la suya.</p>
      </div>
    </Sheet>
  );
}
