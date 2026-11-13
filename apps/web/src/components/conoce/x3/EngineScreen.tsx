"use client";
// La pantalla de la serie de Valentina (03 y el módulo Training Intelligence de 05): interfaz real compuesta. Recortes de la
// captura de la sesión (training-piezas.webp) sin ningún número a la vista y el TargetCard real de la app alimentado por el motor
// (@repi/domain/intelligence) con un ejemplo fijo: press de banca 3 × 8–10, RIR 2, con 60 kg × 10 la última vez. Así lo que
// dice el texto y lo que muestra la pantalla es siempre lo mismo, también entre escenas (nunca el «53» de otra captura).
import { useMemo } from "react";
import { adjustAfterSet, recommendExercise, type HistRow } from "@repi/domain/intelligence";
import { TargetCard } from "@/components/member/TargetCard";

// Press de banca 3 × 8–10, RIR 2 (con 4 series el motor ya no sube la carga sobre un historial de 3: se comprobó con un
// script suelto, docs/comercial/EXPERIENCE_3_MOTION_2.md P3; por eso el recorte de la captura deja afuera «4 series»).
const EX = { sets: 3, reps: "8-10", rir: 2, restSec: 120, detail: null };
const hist = (sid: string, at: string, reps: number[], w: number): HistRow[] =>
  reps.map((r, i) => ({ sessionId: sid, at, specId: `r${i}`, kind: "work", stage: 0, reps: "8-10", w, r, rir: 2, feel: null, source: "repi" }));
export const kg = (n: number | null | undefined) => (n == null ? "—" : `${String(n).replace(".", ",")} kg`);

export function useEngine() {
  return useMemo(() => {
    const now = new Date();
    const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const base = recommendExercise({ ex: EX, now, history: [...hist("a", d(3), [10, 10, 10], 60), ...hist("b", d(7), [10, 9, 9], 60)] });
    const real = { w: base[0].weightKg ?? 0, r: 6, rir: 1, feel: "dificil" as const };
    const after = adjustAfterSet({ ex: EX, targets: base, done: [{ index: 0, w: real.w, r: real.r, rir: real.rir, feel: real.feel }], justDone: 0 });
    return { base, real, after };
  }, []);
}
export type Engine = ReturnType<typeof useEngine>;

/** Recortes de la captura real de la sesión (training-piezas.webp, 600 × 1298 px; no se recaptura con el resto), sin ningún número a la vista. Cada uno toma la
 *  pieza entera (sin glifos cortados ni pedazos de los botones vecinos). */
const CROPS = {
  top: { x: 14, y: 26, w: 300, h: 62 },     // ← Torso A
  title: { x: 40, y: 488, w: 250, h: 46 },  // Press de banca (sin los botones de la derecha)
  how: { x: 44, y: 596, w: 380, h: 70 },    // Buscar cómo se hace en YouTube
  feel: { x: 0, y: 916, w: 600, h: 58 },    // Fácil · Bien · Difícil · Al límite · Con molestia
  cta: { x: 22, y: 980, w: 556, h: 100 },   // Completar serie 1
  links: { x: 90, y: 1104, w: 420, h: 46 }, // Discos y entrada en calor · Nota de la serie
};
function Crop({ c, k }: { c: { x: number; y: number; w: number; h: number }; k: string }) {
  const W = 600, H = 1298;
  return <span className={`x3-crop ${k}`} style={{ width: `${(c.w / W) * 100}%`, aspectRatio: `${c.w} / ${c.h}`, backgroundSize: `${(W / c.w) * 100}% auto`, backgroundPosition: `${(c.x / (W - c.w || 1)) * 100}% ${(c.y / (H - c.h)) * 100}%` }} />;
}

/** step: 0 ejercicio · 1 anterior · 2 recomienda · 3 la serie hecha · 4 la serie 2 ajustada (la tarjeta enciende la columna del
 *  paso y en el 4 la pantalla pasa a la serie 2). `reps`: repeticiones registradas hasta ahora (paso 3). */
export function EngineScreen({ engine, step, reps }: { engine: Engine; step: number; reps?: number }) {
  const { base, real, after } = engine;
  const t0 = base[0], next = after.targets[1];
  const realRow = step >= 3 ? { w: real.w, r: reps ?? real.r, rir: real.rir } : null;
  return (
    <div className="x3-phone-screen" data-step={step}>
      <Crop c={CROPS.top} k="top" />
      <div className="x3-phone-card">
        <Crop c={CROPS.title} k="title" />
        <Crop c={CROPS.how} k="how" />
        <div className="x3-phone-sets" data-next={step >= 4 ? "1" : undefined}>
          <div className="x3-phone-set">
            <small className="x3-phone-lbl">Serie 1</small>
            <TargetCard t={t0} unit="kg" label="Serie 1" real={realRow} onUse={() => {}} canUse={false} />
          </div>
          <div className="x3-phone-set">
            <small className="x3-phone-lbl">Serie 2</small>
            {next && <TargetCard t={next} unit="kg" label="Serie 2" real={null} onUse={() => {}} canUse={false} />}
          </div>
        </div>
      </div>
      <div className="x3-phone-foot">
        <Crop c={CROPS.feel} k="feel" />
        <Crop c={CROPS.cta} k="cta" />
        <Crop c={CROPS.links} k="links" />
      </div>
    </div>
  );
}
