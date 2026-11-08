"use client";
// Escena 05 · Producto. Siete módulos sin grilla de tarjetas: el texto de cada uno pasa con el scroll y un escenario fijo al
// costado se transforma con su demostración (la gráfica de progreso se construye; el descanso corre). Todo lo que se muestra
// existe en la app; los números de la gráfica son de un ejemplo ficticio y lo dice.
// Motion 2 (P5): cada módulo es una toma de la sala (`data-shot`), el velo queda sólo detrás del texto, el cambio de módulo es
// un barrido (sin desenfoque) y la firma del módulo de gestión es «Que venga alguien → Voy» con el scroll: Julián pide ayuda
// desde su serie, un cometa cruza el piso hasta Sofía, ella responde «Voy» y camina hasta él (los nombres de la demo real).
// El trazo de la pantalla rodea el teléfono por debajo (no cruza la captura) y el de la sala se apaga al salir del módulo
// aunque el scrub todavía esté alcanzando al scroll. Training Intelligence muestra la misma serie que 03 (el TargetCard real
// con el motor), no otra captura con otros números.
import { useEffect, useRef, useState } from "react";
import { Say } from "./Say";
import { ScrollTrigger, useGSAP } from "./gsap";
import { FEATURES, STATUS_LABEL, VIDEOS, type DemoRole, type FeatureStatus } from "@/content/conoce";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import type { ShotId } from "../sala/model";
import { DemoButton } from "../DemoButton";
import { useFilm } from "./FilmPlayer";
import { gsap, reduced } from "./gsap";
import { usePaused } from "./motion";
import { Play } from "@phosphor-icons/react";
import { targetLine } from "@/components/member/TargetCard";
import { EngineScreen, useEngine } from "./EngineScreen";

type Mod = { id: string; title: string; value: string; points: string[]; status: FeatureStatus; demo: DemoRole; note?: string; video?: string; visual: string };
/** Toma de la sala para cada módulo (en orden): el rack, el rack, el plano de progreso, el box, el pedido, la sala abierta y cardio. */
const SHOT_OF: Record<string, ShotId> = { intelligence: "rack", registro: "rack", progreso: "showcase", coach: "box", gym: "pedido", comunidad: "open", cuerpo: "cardio" };
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
  const count = useRef<HTMLElement>(null);
  const v = METRICS[m].v, max = Math.max(...v), min = Math.min(...v);
  const pts = v.map((y, i) => [20 + i * (360 / (v.length - 1)), 190 - ((y - min) / (max - min || 1)) * 150] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  useEffect(() => {
    const p = path.current; if (!p || !on) return;
    const len = p.getTotalLength();
    const vals = METRICS[m].v, fmt = (n: number) => `${String(Math.round(n * 2) / 2).replace(".", ",")} ${METRICS[m].unit}`;
    if (reduced()) { p.style.strokeDasharray = "none"; if (count.current) count.current.textContent = fmt(vals[vals.length - 1]); return; }
    // La línea se dibuja y el número cuenta del primero al último valor del ejemplo, al mismo ritmo.
    const o = { v: vals[0] };
    const tl = gsap.timeline()
      .fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: "power2.out" }, 0)
      .fromTo(o, { v: vals[0] }, { v: vals[vals.length - 1], duration: 1.4, ease: "power2.out", onUpdate: () => { if (count.current) count.current.textContent = fmt(o.v); } }, 0);
    return () => { tl.kill(); };
  }, [on, m]);
  return (
    <div className="x3-chart">
      <svg viewBox="0 0 400 210" role="img" aria-label={`${METRICS[m].label} en 8 sesiones de press de banca (ejemplo ficticio): de ${v[0]} a ${v[v.length - 1]} ${METRICS[m].unit}`}>
        {[40, 90, 140, 190].map((y) => <line key={y} x1={10} x2={390} y1={y} y2={y} className="x3-chart-grid" />)}
        <path ref={path} d={d} className="x3-chart-line" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 6 : 3.5} className={i === pts.length - 1 ? "x3-chart-last" : "x3-chart-dot"} />)}
      </svg>
      <p className="x3-chart-now" aria-hidden="true"><b ref={count}>{`${String(v[v.length - 1]).replace(".", ",")} ${METRICS[m].unit}`}</b><small>Press de banca · 8 sesiones · ejemplo ficticio</small></p>
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

/** Training Intelligence: la misma serie de Valentina que en 03 (press de banca, 60 kg × 10 la última vez), con el TargetCard
 *  real y el motor; la columna «REPI recomienda» encendida. */
function TiPhone() {
  const engine = useEngine();
  const t = engine.base[0];
  const label = `Serie de press de banca en REPI: la última vez ${t.prev ? `${String(t.prev.w).replace(".", ",")} kg × ${t.prev.r}` : "sin referencia"}, REPI recomienda ${targetLine(t, "kg")}, real por registrar`;
  return (
    <div className="x3-sc-phone" role="img" aria-label={label}>
      <div aria-hidden="true"><EngineScreen engine={engine} step={2} /></div>
    </div>
  );
}

/** «Que venga alguien → Voy». Lo mueve el scroll del módulo de gestión (Showcase escribe --rq en `.x3-req`): primero el pedido
 *  de Julián, después el trazo y el «Voy» de Sofía. El trazo va detrás del teléfono y lo rodea por debajo: sale del pedido,
 *  baja por la izquierda, pasa bajo la pantalla y sube hasta el «Voy» (como el pedido que cruza el piso, no un garabato sobre
 *  la interfaz). Movimiento reducido o pausa: todo a la vista, quieto (el CSS por defecto). */
function Request() {
  return (
    <div className="x3-req">
      <div className="x3-req-a"><small>Julián · Sentadilla</small><b>Que venga alguien</b></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="x3-req-path" pathLength={1} vectorEffect="non-scaling-stroke" d="M9,27 C2,48 2,86 20,98 C34,107 66,107 80,98 C90,92 94,86 93,79" /></svg>
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
    case "request": return <Request />;
    case "coach": return <div className="x3-layers">{img("/conoce/shots/clients.webp", "Clientes del personal trainer en REPI")}{img("/conoce/shots/programs.webp", "Editor de programas en REPI")}</div>;
    case "ti": return <TiPhone />;
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
  // «Que venga alguien → Voy» con el scroll del módulo de gestión: el pedido y la respuesta en pantalla (--rq), el cometa que
  // cruza el piso (request) y Sofía que camina hasta Julián (walk). Al salir del módulo hacia abajo, Sofía vuelve a su recorrido.
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const gym = blocks.current[MODS.findIndex((x) => x.visual === "request")];
    if (!gym || reduced()) return;
    let back: gsap.core.Tween | null = null;
    // Afuera del módulo (por abajo) el scrub todavía alcanza al scroll durante medio segundo y llamaría a write() con valores
    // < 1: eso volvía a encender el trazo de la sala después de apagarlo. Afuera no se escribe.
    let out = false;
    const write = (u: number) => {
      // En la sección (se hereda): el visual del pedido puede montarse en cualquier momento y ya llega en su punto.
      root.current?.style.setProperty("--rq", u.toFixed(3));
      const r = Math.min(1, Math.max(0, (u - 0.18) / 0.4)), w = Math.min(1, Math.max(0, (u - 0.6) / 0.32));
      stage.set({ request: u <= 0.18 ? null : +r.toFixed(3), walk: +w.toFixed(3) });
    };
    const st = ScrollTrigger.create({
      trigger: gym, start: "top 75%", end: "bottom 45%", scrub: 0.5,
      onUpdate: (self) => { if (out) return; back?.kill(); back = null; write(self.progress); },
      onEnter: () => { out = false; back?.kill(); back = null; },
      onEnterBack: () => { out = false; back?.kill(); back = null; },
      onLeave: () => {
        // Sigue el scroll hacia abajo: el trazo se apaga y Sofía vuelve sola (o al instante, si la animación está pausada).
        out = true;
        root.current?.style.setProperty("--rq", "1");
        stage.set({ request: null });
        const o = { w: stage.get().walk };
        if (stage.get().paused) { stage.set({ walk: 0 }); return; }
        back = gsap.to(o, { w: 0, duration: 1.4, ease: "power2.inOut", onUpdate: () => stage.set({ walk: +o.w.toFixed(3) }) });
      },
      onLeaveBack: () => { write(0); out = true; },
    });
    return () => { st.kill(); back?.kill(); root.current?.style.removeProperty("--rq"); stage.set({ request: null, walk: 0 }); };
  }, { scope: root, dependencies: [wide] });
  const m = MODS[active];
  return (
    <section ref={root} id="funciones" className="x3-sc" data-shot="showcase" aria-labelledby="cn-sc">
      <div className="x3-wrap">
        <Say id="cn-sc" className="x3-h2" text="Lo que REPI *ya hace.*" />
        <div className="x3-sc-grid">
          <div className="x3-sc-text">
            {MODS.map((x, i) => (
              <article key={x.id} ref={(b) => { blocks.current[i] = b; }} data-i={i} data-on={i === active ? "1" : undefined} data-shot={SHOT_OF[x.id] ?? "showcase"} className="x3-sc-mod" aria-labelledby={`sc-${x.id}`}>
                <Say as="h3" id={`sc-${x.id}`} text={x.title} />
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
