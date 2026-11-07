"use client";
// Escena 05 · Producto. Siete módulos sin grilla de tarjetas: el texto de cada uno pasa con el scroll y un escenario fijo al
// costado se transforma con su demostración (la gráfica de progreso se construye; el pedido «Que venga alguien» viaja del
// socio al entrenador y vuelve «Voy», también en la sala; el descanso corre). Todo lo que se muestra existe en la app; los
// números de la gráfica son de un ejemplo ficticio y lo dice.
import { useEffect, useRef, useState } from "react";
import { FEATURES, STATUS_LABEL, VIDEOS, type DemoRole, type FeatureStatus } from "@/content/conoce";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import { DemoButton } from "../DemoButton";
import { useFilm } from "./FilmPlayer";
import { gsap, reduced } from "./gsap";
import { usePaused } from "./motion";
import { Play } from "@phosphor-icons/react";

type Mod = { id: string; title: string; value: string; points: string[]; status: FeatureStatus; demo: DemoRole; note?: string; video?: string; visual: string };
const f = (id: string) => FEATURES.find((x) => x.id === id)!;
const MODS: Mod[] = [
  { ...pick("intelligence"), title: "Training Intelligence", visual: "ti" },
  { ...pick("registro"), title: "La sesión de entrenamiento", visual: "rest" },
  { ...pick("progreso"), title: "Progreso que se ve", visual: "chart" },
  { id: "coach", title: "El espacio del coach", value: "Alumnos, programas y conversación en un solo lugar.", points: [...f("alumnos").points.slice(0, 1), ...f("programas").points.slice(1, 3), f("mensajes").points[0]], status: "available", demo: "coach", visual: "coach" },
  { id: "gym", title: "La gestión del gimnasio", value: "La sala atendida, las altas sin papeles y el tablero del dueño.", points: [f("sala").points[0], f("altas").points[1], f("tablero").points[0]], status: "per_gym", note: "El seguimiento de sala y el control de ingreso se activan por gimnasio.", demo: "floor", visual: "request" },
  { ...pick("comunidad"), title: "Comunidad y desafíos", visual: "community" },
  { ...pick("cuerpo"), title: "Body Intelligence", visual: "body" },
];
function pick(id: string) { const x = f(id); return { id: x.id, value: x.value, points: x.points, status: x.status, demo: x.demo ?? "member", note: x.note, video: x.video }; }

// Ejemplo ficticio de 8 sesiones de press de banca (la app calcula lo mismo con los registros reales).
const SERIES = { carga: [60, 60, 62.5, 62.5, 65, 65, 67.5, 67.5], reps: [10, 10, 9, 10, 8, 9, 8, 8] };
const METRICS = { carga: { label: "Carga", unit: "kg", v: SERIES.carga }, reps: { label: "Repeticiones", unit: "reps", v: SERIES.reps }, volumen: { label: "Volumen", unit: "kg", v: SERIES.carga.map((c, i) => c * SERIES.reps[i] * 3) } } as const;
type MetricId = keyof typeof METRICS;

/** Selector del indicador. Va dentro del texto del módulo (en el orden del teclado), también en escritorio, donde la gráfica
 *  se ve en el escenario fijo del costado. */
function MetricSwitch({ m, setM }: { m: MetricId; setM: (k: MetricId) => void }) {
  return (
    <div className="x3-chart-tabs" role="group" aria-label="Indicador de la gráfica">
      {(Object.keys(METRICS) as MetricId[]).map((k) => <button key={k} type="button" aria-pressed={k === m} onClick={() => { setM(k); track("feature_click", { target: `progreso-${k}` }); }}>{METRICS[k].label}</button>)}
    </div>
  );
}

function Chart({ on, m }: { on: boolean; m: MetricId }) {
  const path = useRef<SVGPathElement>(null);
  const v = METRICS[m].v, max = Math.max(...v), min = Math.min(...v);
  const pts = v.map((y, i) => [20 + i * (360 / (v.length - 1)), 190 - ((y - min) / (max - min || 1)) * 150] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  useEffect(() => {
    const p = path.current; if (!p || !on) return;
    const len = p.getTotalLength();
    if (reduced()) { p.style.strokeDasharray = "none"; return; }
    gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: "power2.out" });
  }, [on, m]);
  return (
    <div className="x3-chart">
      <svg viewBox="0 0 400 210" role="img" aria-label={`${METRICS[m].label} en 8 sesiones de press de banca (ejemplo ficticio): de ${v[0]} a ${v[v.length - 1]} ${METRICS[m].unit}`}>
        {[40, 90, 140, 190].map((y) => <line key={y} x1={10} x2={390} y1={y} y2={y} className="x3-chart-grid" />)}
        <path ref={path} d={d} className="x3-chart-line" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 6 : 3.5} className={i === pts.length - 1 ? "x3-chart-last" : "x3-chart-dot"} />)}
      </svg>
      <small>Press de banca · 8 sesiones · ejemplo ficticio</small>
    </div>
  );
}

function Rest({ on }: { on: boolean }) {
  const [s, setS] = useState(120);
  const paused = usePaused();
  useEffect(() => { if (on) setS(120); }, [on]);
  useEffect(() => {
    if (!on || reduced() || paused) return; // pausado: el reloj queda donde estaba
    const id = window.setInterval(() => setS((x) => (x <= 75 ? 120 : x - 1)), 1000);
    return () => clearInterval(id);
  }, [on, paused]);
  return (
    <div className="x3-rest">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/conoce/shots/training.webp" alt="Pantalla de entrenamiento en curso en REPI" width={390} height={844} loading="lazy" decoding="async" />
      <span className="x3-rest-ring" style={{ "--p": s / 120 } as React.CSSProperties} aria-hidden="true"><b>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</b><small>descanso</small></span>
    </div>
  );
}

function Request({ on }: { on: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const paused = usePaused();
  useEffect(() => {
    if (!on) { stage.set({ request: null }); return; }
    const q = gsap.utils.selector(root);
    // Movimiento reducido o animaciones pausadas: el pedido y la respuesta quedan a la vista, quietos.
    if (reduced() || paused) { gsap.set(q(".x3-req-a, .x3-req-b"), { opacity: 1, y: 0 }); gsap.set(q(".x3-req-path"), { strokeDashoffset: 0 }); stage.set({ request: null }); return; }
    const o = { v: 0 };
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    tl.set(q(".x3-req-a, .x3-req-b"), { opacity: 0, y: 10 })
      .to(q(".x3-req-a"), { opacity: 1, y: 0, duration: 0.4 })
      .to(o, { v: 0.5, duration: 1.4, ease: "power1.inOut", onUpdate: () => stage.set({ request: o.v }) }, "<")
      .to(q(".x3-req-path"), { strokeDashoffset: 0, duration: 1.4, ease: "power1.inOut" }, "<")
      .to(q(".x3-req-b"), { opacity: 1, y: 0, duration: 0.4 })
      .to(o, { v: 1, duration: 1.2, ease: "power1.inOut", onUpdate: () => stage.set({ request: o.v }) }, "<")
      .set(q(".x3-req-path"), { strokeDashoffset: 300 }, "+=1");
    return () => { tl.kill(); stage.set({ request: null }); };
  }, [on, paused]);
  return (
    <div ref={root} className="x3-req">
      <div className="x3-req-a"><small>Valentina · Press de banca</small><b>Que venga alguien</b></div>
      <svg viewBox="0 0 300 80" aria-hidden="true"><path className="x3-req-path" d="M20,10 C120,10 180,70 280,70" /></svg>
      <div className="x3-req-b"><small>Sofía · Sala</small><b>Voy</b></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/conoce/shots/floor.webp" alt="Turno del entrenador de sala en REPI con los pedidos de los socios" width={390} height={844} loading="lazy" decoding="async" />
    </div>
  );
}

function Visual({ id, on, m }: { id: string; on: boolean; m: MetricId }) {
  const img = (src: string, alt: string) => <img src={src} alt={alt} width={390} height={844} loading="lazy" decoding="async" />; // eslint-disable-line @next/next/no-img-element
  switch (id) {
    case "chart": return <Chart on={on} m={m} />;
    case "rest": return <Rest on={on} />;
    case "request": return <Request on={on} />;
    case "coach": return <div className="x3-layers">{img("/conoce/shots/clients.webp", "Clientes del personal trainer en REPI")}{img("/conoce/shots/programs.webp", "Editor de programas en REPI")}</div>;
    case "ti": return <div className="x3-layers one">{img("/conoce/shots/intelligence.webp", "Serie con Anterior, REPI recomienda y Real")}</div>;
    case "community": return <div className="x3-layers one">{img("/conoce/shots/community.webp", "Comunidad del gimnasio en REPI")}</div>;
    default: return <div className="x3-layers one">{img("/conoce/shots/body.webp", "Objetivo de peso en Mi cuerpo, en REPI")}</div>;
  }
}

/** null hasta medir en el cliente: el contenedor del visual en línea ya ocupa su alto (CSS) desde el HTML del servidor, así
 *  en teléfonos no hay salto cuando aparece. */
function useWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 960px)");
    const upd = () => setWide(mq.matches); upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  return wide;
}

export function Showcase() {
  const [active, setActive] = useState(0);
  const [metric, setMetric] = useState<MetricId>("carga");
  const wide = useWide();
  const blocks = useRef<(HTMLElement | null)[]>([]);
  const film = useFilm();
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i)); }), { rootMargin: "-45% 0px -45% 0px" });
    blocks.current.forEach((b) => b && io.observe(b));
    return () => io.disconnect();
  }, []);
  const m = MODS[active];
  return (
    <section id="funciones" className="x3-sc" data-shot="showcase" aria-labelledby="cn-sc">
      <div className="x3-wrap">
        <h2 id="cn-sc" className="x3-h2">Lo que REPI <em>ya hace.</em></h2>
        <div className="x3-sc-grid">
          <div className="x3-sc-text">
            {MODS.map((x, i) => (
              <article key={x.id} ref={(b) => { blocks.current[i] = b; }} data-i={i} data-on={i === active ? "1" : undefined} className="x3-sc-mod" aria-labelledby={`sc-${x.id}`}>
                <h3 id={`sc-${x.id}`}>{x.title}</h3>
                <p className="x3-sc-value">{x.value}</p>
                <ul>{x.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
                {x.visual === "chart" && <MetricSwitch m={metric} setM={setMetric} />}
                <p className="x3-sc-status" data-s={x.status}>{STATUS_LABEL[x.status]}{x.note ? ` · ${x.note}` : ""}</p>
                <div className="x3-sc-act">
                  <DemoButton role={x.demo} label="Verlo en la demo" className="x3-btn ghost sm" target={`f-${x.id}`} />
                  {x.video && VIDEOS[x.video]?.src && <button type="button" className="x3-btn text sm" onClick={() => film(VIDEOS[x.video!])}><Play size={14} weight="fill" aria-hidden="true" />Video</button>}
                </div>
                <div className="x3-sc-inline" data-v={x.visual}>{wide === false && <Visual id={x.visual} on={i === active} m={metric} />}</div>
              </article>
            ))}
          </div>
          <div className="x3-sc-stage" aria-live="polite">
            <ol className="x3-sc-index" aria-label="Módulos">{MODS.map((x, i) => <li key={x.id} data-on={i === active ? "1" : undefined}>{x.title}</li>)}</ol>
            {wide && <div className="x3-sc-visual" key={m.id}><Visual id={m.visual} on m={metric} /></div>}
          </div>
        </div>
      </div>
    </section>
  );
}
