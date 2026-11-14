"use client";
// REPI Exercise Motion 1.0 (D220): la demostración oficial de un ejercicio. Animación vectorial propia (se dibuja en el
// teléfono, sin video), con pausa, velocidad y fases; la técnica escrita; el mapa muscular; y, si el gimnasio o el coach
// cargaron un video, ese video también (nunca se oculta). Respeta «reducir movimiento»: arranca quieta y se reproduce sólo
// si la persona lo pide.
import { useEffect, useMemo, useRef, useState } from "react";
import { Ic } from "@/components/ui/Ic";
import { Pause, Play } from "@phosphor-icons/react";
import { useReducedMotion } from "@/lib/motion";
import type { MotionRef, OrgMedia } from "@/lib/exercise-motion/ref";
import type { Prim } from "@/lib/exercise-motion/types";
import type { MuscleId } from "@/lib/exercise-motion/muscles";

type Bundle = typeof import("@/lib/exercise-motion/bundle");
let loading: Promise<Bundle> | null = null;
/** Carga (una vez) la biblioteca y el dibujo. Se llama también al abrir un entrenamiento para tenerla lista sin conexión. */
export const loadMotion = () => (loading ??= import("@/lib/exercise-motion/bundle").catch((e) => { loading = null; throw e; }));

function useBundle() {
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let on = true; loadMotion().then((m) => on && setB(m), () => on && setErr(true)); return () => { on = false; }; }, []);
  return { b, err };
}

export function PrimSvg({ p }: { p: Prim }) {
  if (p.el === "path") return <path d={p.d} className={p.cls} opacity={p.o} />;
  if (p.el === "circle") return <circle cx={p.cx} cy={p.cy} r={p.r} className={p.cls} opacity={p.o} />;
  return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} className={p.cls} strokeWidth={p.w ?? 1} opacity={p.o} />;
}

/** El escenario animado. */
function Stage({ b, id, title }: { b: Bundle; id: string; title: string }) {
  const entry = b.getMotionEntry(id)!;
  const spec = entry.motion;
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  const [slow, setSlow] = useState(false);
  const [u, setU] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const visible = useRef(true);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  useEffect(() => {
    const el = box.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; }); io.observe(el); return () => io.disconnect();
  }, []);
  const uRef = useRef(u); uRef.current = u;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (visible.current && !document.hidden) {
        acc += dt;
        if (acc >= 1 / 30) { const step = acc / (spec.seconds * (slow ? 2 : 1)); acc = 0; setU((x) => (x + step) % 1); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, slow, spec.seconds]);
  const view = b.framing(spec).viewBox;
  const frame = useMemo(() => b.renderFrame(spec, u, entry.anatomy), [b, spec, u, entry.anatomy]);
  const phases = spec.keys.filter((k) => k.say);
  return (
    <figure className="mo-stage em-stage" ref={box}>
      <svg className="mo-svg" viewBox={view.join(" ")} role="img" aria-label={`Demostración animada: ${title}. ${phases.map((k) => k.say).join(". ")}.`}>
        {spec.camera !== "top" && <line className="mo-floor" x1={view[0]} x2={view[0] + view[2]} y1={0} y2={0} />}
        <g transform={b.frameTransform(spec)}>{frame.prims.map((p, i) => <PrimSvg key={i} p={p} />)}</g>
      </svg>
      <figcaption className="em-phase" aria-hidden="true">{frame.say ?? ""}</figcaption>
      <div className="em-ctrl">
        <button type="button" className="em-btn" aria-pressed={playing} onClick={() => setPlaying((x) => !x)}>
          <Ic i={playing ? Pause : Play} size={16} /> {playing ? "Pausar" : "Reproducir"}</button>
        <button type="button" className="em-btn" aria-pressed={slow} onClick={() => setSlow((x) => !x)}>{slow ? "Velocidad normal" : "Más lento"}</button>
        <span className="em-phases" role="group" aria-label="Ir a una fase">
          {phases.map((k) => <button key={k.t} type="button" className="em-chip" onClick={() => { setPlaying(false); setU(k.t); }}>{k.say}</button>)}
        </span>
      </div>
    </figure>
  );
}

/** Mapa muscular: frente y espalda, principales y secundarios; tocar un músculo lo resalta solo. */
export function MuscleMap({ b, primary, secondary }: { b: Bundle; primary: MuscleId[]; secondary: MuscleId[] }) {
  const [sel, setSel] = useState<MuscleId | null>(null);
  const role = (m: MuscleId) => (primary.includes(m) ? "principal" : secondary.includes(m) ? "secundario" : null);
  const cls = (m: MuscleId) => (sel ? (m === sel ? "mo-sel" : null) : primary.includes(m) ? "mo-hot" : secondary.includes(m) ? "mo-warm" : null);
  const sides = (["front", "back"] as const).filter((s) => b.ZONES.some((z) => z.side === s && cls(z.muscle)));
  const chip = (m: MuscleId) => (
    <button key={m} type="button" className={`em-chip${sel === m ? " on" : ""}`} aria-pressed={sel === m} onClick={() => setSel(sel === m ? null : m)}>{b.MUSCLES[m].label}</button>
  );
  return (
    <div className="em-map">
      <div className="em-map-figs">
        {(sides.length ? sides : (["front"] as const)).map((s) => (
          <figure key={s} className="mo-stage em-map-fig">
            <svg className="mo-svg" viewBox={b.MAP_VIEWBOX.join(" ")} role="img" aria-label={`Vista de ${s === "front" ? "frente" : "espalda"}`}>
              {b.SILHOUETTE.map((p, i) => <PrimSvg key={i} p={p} />)}
              {b.ZONES.filter((z) => z.side === s).map((z, i) => { const c = cls(z.muscle); return c ? <path key={i} d={z.d} className={c} onClick={() => setSel(z.muscle)} /> : null; })}
            </svg>
            <figcaption>{s === "front" ? "Frente" : "Espalda"}</figcaption>
          </figure>
        ))}
      </div>
      <p className="em-map-legend"><span className="em-dot hot" aria-hidden="true" /> Principales <span className="em-dot warm" aria-hidden="true" /> Secundarios</p>
      <div className="em-chips" role="group" aria-label="Músculos principales">{primary.map(chip)}</div>
      {secondary.length > 0 && <div className="em-chips sec" role="group" aria-label="Músculos secundarios">{secondary.map(chip)}</div>}
      <p className="em-map-note" aria-live="polite">{sel ? `${b.MUSCLES[sel].label}: ${role(sel)}.` : "Tocá un músculo para verlo solo."}</p>
    </div>
  );
}

type Tab = "tech" | "map" | "org";
/**
 * La demostración completa. `variant`: «app» (hoja del entrenamiento), «kiosk» (pantalla del gimnasio: sin enlaces que
 * saquen de la pantalla) o «preview» (panel del coach o del gimnasio).
 */
export function ExerciseMotion({ motion, name, org, orgVideo, variant = "app" }: {
  motion: MotionRef; name: string; org?: OrgMedia; orgVideo?: React.ReactNode; variant?: "app" | "kiosk" | "preview";
}) {
  const { b, err } = useBundle();
  const [tab, setTab] = useState<Tab>("tech");
  if (err) return <p className="em-note">No pudimos cargar la demostración. Revisá la conexión y probá de nuevo.</p>;
  if (!b) return <div className="mo-stage em-stage em-loading" aria-busy="true" aria-label="Cargando la demostración" />;
  const e = b.getMotionEntry(motion.id);
  if (!e) return <p className="em-note">Esta demostración ya no está disponible. Actualizá la app.</p>;
  const t = e.technique;
  const tabs: [Tab, string][] = [["tech", "Técnica"], ["map", "Músculos"], ...(org ? [["org", variant === "app" ? "Video de tu gimnasio o coach" : "Video del gimnasio"] as [Tab, string]] : [])];
  return (
    <div className={`em em-${variant}`}>
      {motion.match === "compatible" && (
        <p className="em-variant"><b>Variante compatible.</b> La demostración muestra «{e.title}», no exactamente «{name}». {motion.difference}</p>
      )}
      <Stage b={b} id={e.id} title={e.title} />
      <div className="em-tabs" role="tablist" aria-label={`Cómo se hace: ${e.title}`}>
        {tabs.map(([k, l]) => <button key={k} type="button" role="tab" id={`em-tab-${k}`} aria-selected={tab === k} aria-controls={`em-panel-${k}`} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div role="tabpanel" id={`em-panel-${tab}`} aria-labelledby={`em-tab-${tab}`} className="em-panel">
        {tab === "tech" && (
          <div className="em-tech">
            <h3>Preparación</h3><ul>{t.setup.map((x) => <li key={x}>{x}</li>)}</ul>
            <h3>Ejecución</h3><ol>{t.execution.map((x) => <li key={x}>{x}</li>)}</ol>
            <h3>Claves</h3><ul className="em-cues">{t.cues.map((x) => <li key={x}>{x}</li>)}</ul>
            <h3>Errores comunes</h3><ul>{t.mistakes.map((x) => <li key={x}>{x}</li>)}</ul>
            {t.breathing && <><h3>Respiración</h3><p>{t.breathing}</p></>}
            <p className="em-eq">Equipo: {e.equipment.join(", ")}.</p>
          </div>
        )}
        {tab === "map" && <MuscleMap b={b} primary={e.anatomy.primary} secondary={e.anatomy.secondary} />}
        {tab === "org" && orgVideo}
      </div>
      <p className="em-src">Demostración animada de REPI · revisada por el equipo de REPI{e.review.status === "professional" ? " y un profesional" : ""}. Si tu profesor te indicó otra cosa, seguí su indicación.</p>
    </div>
  );
}
