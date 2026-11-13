"use client";
// Experience 4.0 · «El progreso cobra vida» (WOW 5, firma «de la interfaz al dato»). Sigue a la serie de Valentina (03): la
// serie que acaba de registrar sale del banco donde entrena (un punto que nace en su lugar de la sala 3D), cruza la pantalla y
// cae en la gráfica como el punto de hoy; la línea de su historial se dibuja, REPI marca el salto de carga y lo que se
// registró viaja por la red de la sala hasta la pantalla del equipo y la de la oficina.
// Datos: las dos últimas sesiones son las del motor real de la escena de arriba (la última vez y la serie de hoy); las seis
// anteriores son un ejemplo ficticio y está dicho. Nada de porcentajes ni promesas: sólo lo que la gráfica muestra.
// Fijada con sticky y scrub (reversible). Movimiento reducido o pantalla baja: la gráfica completa, quieta.
import { useLayoutEffect, useRef, useState } from "react";
import { COACH_SCREEN, OFFICE_SCREEN, VALENTINA } from "../sala/model";
import { pings, stage } from "../sala/store";
import { quad } from "../x3/curves";
import { kg } from "../x3/EngineScreen";
import { gsap, PIN_MQ, ScrollTrigger, STACK_MQ, useGSAP, whenIdle } from "../x3/gsap";
import { Roll } from "../x3/Roll";
import { Say } from "../x3/Say";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const eOut = (x: number) => 1 - Math.pow(1 - x, 3), eIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const W = 420, H = 240, X0 = 34, X1 = 392, Y0 = 204, Y1 = 34;
/** Momento (0–1 del tramo) en que el punto de hoy llega a la gráfica. */
const LAND = 0.5;

/**
 * El texto del paso se escribe en .8 s, letra entera por letra y en orden de lectura. Antes lo descubría una máscara de 26
 * escalones sobre todo el ancho del párrafo: cada escalón cortaba letras por la mitad y mostraba entero el segundo renglón
 * antes que el primero. El texto no se parte en elementos (cambiaría el espaciado entre letras): se mide dónde termina cada
 * carácter y la máscara salta de un borde al siguiente. Al terminar no queda nada aplicado. Movimiento reducido: quieto.
 */
function Typed({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current, node = el?.firstChild;
    if (!el || !(node instanceof Text) || !node.length || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const box = el.getBoundingClientRect(), r = document.createRange(), W = box.width + 4, H = box.height + 4, B = -4;
    const ends: [number, number, number][] = [];
    for (let i = 0; i < node.length; i++) {
      r.setStart(node, i); r.setEnd(node, i + 1);
      const rs = r.getClientRects(), q = rs[rs.length - 1];
      if (q && q.width > 0) ends.push([q.right - box.left, q.top - box.top, q.bottom - box.top]);
    }
    if (!ends.length) return;
    // Mismo número de vértices en todos los cuadros: lo ya escrito (renglones anteriores enteros y el actual hasta la letra).
    const poly = (x: number, top: number, bottom: number) => `polygon(${B}px ${B}px, ${W}px ${B}px, ${W}px ${top}px, ${x}px ${top}px, ${x}px ${bottom}px, ${B}px ${bottom}px)`;
    const frames: Keyframe[] = [{ offset: 0, clipPath: poly(B, B, B), easing: "steps(1, end)" }];
    ends.forEach(([x, top, bottom], i) => frames.push({ offset: (i + 1) / (ends.length + 1), clipPath: poly(x, top, bottom), easing: "steps(1, end)" }));
    frames.push({ offset: 1, clipPath: poly(W, H, H) });
    const a = el.animate(frames, { duration: 800, fill: "backwards" });
    return () => a.cancel();
  }, [text]);
  return <p ref={ref} className={className}>{text}</p>;
}

export function DataStory({ prev, real }: { prev: { w: number; r: number } | null; real: { w: number; r: number } }) {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  // Ocho sesiones: seis de ejemplo (suben de a 2,5 kg) y las dos del motor: la última vez y hoy.
  const last = prev?.w ?? real.w - 2.5;
  const series = [last - 7.5, last - 5, last - 5, last - 2.5, last - 2.5, last, last, real.w];
  const min = Math.min(...series) - 2.5, max = Math.max(...series) + 2.5;
  const pts = series.map((v, i) => [X0 + (i * (X1 - X0)) / (series.length - 1), Y0 - ((v - min) / (max - min)) * (Y0 - Y1)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const delta = real.w - series[0];
  const STEPS = [
    { k: "La serie que registraste", v: `${kg(real.w)} × ${real.r}`, d: "Un toque al terminar la serie. Queda guardada con su carga, sus repeticiones y cómo se sintió." },
    { k: "Se suma a tu historial", v: `${series.length} sesiones`, d: "Cada sesión de press de banca es un punto. La de hoy es el último." },
    { k: "REPI lee el recorrido", v: `+${String(delta).replace(".", ",")} kg`, d: `De ${kg(series[0])} a ${kg(real.w)} en ${series.length} sesiones: se ve cuándo subiste y cuándo sostuviste la carga.` },
    { k: "Lo ven quienes tienen que verlo", v: "Vos y tu equipo", d: "El socio lo tiene en su progreso por ejercicio; el entrenador, en la ficha de cada alumno." },
  ];
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(STACK_MQ, () => { setStep(3); });
    mm.add(PIN_MQ, () => {
      setStep(0);
      const q = gsap.utils.selector(root);
      const track = root.current!, pin = q(".x4-data-pin")[0] as HTMLElement, chip = q(".x4-chip")[0] as HTMLElement, panel = q(".x4-chart")[0] as HTMLElement;
      const line = q(".x4-chart-line")[0] as unknown as SVGPathElement, dots = q(".x4-chart-pt") as unknown as SVGGElement[], today = q(".x4-chart-today")[0] as unknown as SVGGElement;
      const trend = q(".x4-chart-trend")[0] as unknown as SVGPathElement, tag = q(".x4-chart-tag")[0] as HTMLElement, roles = q(".x4-data-roles li") as HTMLElement[];
      const n = dots.length; // los siete puntos anteriores
      let path = quad([0, 0], [0, 0], [0, 0]), p = 0, lastP = -1, lastStep = -1, fired = 0;
      const measure = () => {
        const pr = pin.getBoundingClientRect(), tr = today.getBoundingClientRect();
        // Fijada, la escena ocupa la pantalla: las coordenadas de la escena son las de la pantalla (menos lo que la cabecera corre).
        const from = stage.project(VALENTINA[0], VALENTINA[1], "dataOut");
        const a: [number, number] = [from.x, from.y - Math.max(0, pr.top > 0 && pr.top < 200 ? pr.top : 0)], b: [number, number] = [tr.left - pr.left + tr.width / 2, tr.top - pr.top + tr.height / 2];
        path = quad(a, [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - Math.max(90, Math.abs(b[0] - a[0]) * 0.22)], b);
        lastP = -1; render();
      };
      const render = () => {
        if (p === lastP) return;
        lastP = p;
        const st = p < 0.3 ? 0 : p < LAND + 0.08 ? 1 : p < 0.8 ? 2 : 3;
        if (st !== lastStep) { lastStep = st; setStep(st); }
        // La gráfica entra de costado, en perspectiva, y queda de frente cuando llega el punto de hoy.
        const turn = 1 - eOut(seg(p, 0.02, LAND));
        panel.style.transform = `perspective(1100px) rotateY(${(-16 * turn).toFixed(2)}deg) rotateX(${(7 * turn).toFixed(2)}deg)`;
        panel.style.opacity = String(+eOut(seg(p, 0, 0.1)).toFixed(3));
        // El historial: los puntos anteriores caen uno por uno y la línea avanza con ellos (.12–.42).
        const f = seg(p, 0.12, 0.42) * (n - 1);
        dots.forEach((g, i) => { const v = eOut(clamp01(f - i + 1)); g.style.opacity = String(+v.toFixed(3)); g.style.transform = `translateY(${(-14 * (1 - v)).toFixed(1)}px)`; });
        const done = seg(p, LAND, LAND + 0.1);
        line.style.strokeDashoffset = String(+(1 - (Math.min(f, n - 1) + eOut(done)) / n).toFixed(4));
        // La serie de hoy: sale del banco de Valentina (en la sala), cruza en arco y cae en su lugar.
        const u = seg(p, 0.3, LAND);
        if (u <= 0 || u >= 1) chip.style.opacity = "0";
        else {
          const [x, y] = path.at(eIO(u)), sc = 1 - 0.62 * eIO(seg(u, 0.55, 1));
          chip.style.opacity = String(+Math.min(1, u * 6).toFixed(3));
          chip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
        }
        today.style.opacity = p >= LAND ? "1" : "0";
        today.style.setProperty("--ring", String(+seg(p, LAND, LAND + 0.14).toFixed(3)));
        // El recorrido (de la primera sesión a hoy) y su etiqueta.
        const tr = seg(p, LAND + 0.1, 0.76);
        trend.style.strokeDashoffset = String(+(1 - eIO(tr)).toFixed(4));
        tag.style.opacity = String(+eOut(seg(p, 0.66, 0.78)).toFixed(3));
        roles.forEach((li, i) => { const v = eOut(seg(p, 0.8 + i * 0.05, 0.9 + i * 0.05)); li.style.opacity = String(+v.toFixed(3)); li.style.transform = `translateY(${(14 * (1 - v)).toFixed(1)}px)`; });
        // En la sala: la red se enciende cuando el dato llega y un pulso entra a cada pantalla (equipo y oficina).
        stage.set({ flow: +eIO(seg(p, LAND - 0.06, LAND + 0.14)).toFixed(3) });
        if (p >= 0.84 && fired === 0) { fired = 1; pings.fire(COACH_SCREEN[0], COACH_SCREEN[1], "staff"); window.setTimeout(() => pings.fire(OFFICE_SCREEN[0], OFFICE_SCREEN[1], "staff"), 260); }
        else if (p < 0.7) fired = 0;
      };
      let trig: ScrollTrigger | null = null;
      const idle = whenIdle(() => {
        trig = ScrollTrigger.create({ trigger: track, start: "top top", end: "bottom bottom", scrub: 0.6, onRefreshInit: measure, onUpdate: (s) => { p = s.progress; render(); }, onLeave: () => stage.set({ flow: 0 }), onLeaveBack: () => stage.set({ flow: 0 }) });
        measure();
      });
      return () => {
        idle(); trig?.kill(); stage.set({ flow: 0 });
        for (const el of [chip, panel, tag, ...roles, ...(dots as unknown as HTMLElement[])]) { el.style.transform = ""; el.style.opacity = ""; }
        line.style.strokeDashoffset = ""; trend.style.strokeDashoffset = ""; today.style.opacity = ""; today.style.removeProperty("--ring");
      };
    });
    return () => mm.revert();
  }, { scope: root });

  const cur = STEPS[step];
  const [tx, ty] = pts[pts.length - 1], [fx, fy] = pts[0];
  return (
    <div ref={root} className="x4-data" data-shot="dataOut" data-span="0.9">
      <div className="x4-data-pin">
        <div className="x3-wrap x4-data-grid">
          <div className="x4-data-room" aria-hidden="true" />
          <div className="x4-data-side">
            <Say as="h3" className="x4-data-h" text="Cada serie *deja un dato.*" />
            {/* Para los lectores de pantalla: los cuatro pasos con sus valores. */}
            <ol className="x3-sr">{STEPS.map((s, i) => <li key={s.k} aria-current={i === step ? "step" : undefined}>{s.k}: {s.v}. {s.d}</li>)}</ol>
            <div className="x4-data-say" aria-hidden="true">
              <p className="x4-data-k"><Roll value={cur.k} /></p>
              <p className="x4-data-v" data-step={step}><Roll value={cur.v} /></p>
              <Typed key={step} className="x4-data-d" text={cur.d} />
            </div>
            <figure className="x4-chart">
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Carga de press de banca en ${series.length} sesiones: de ${kg(series[0])} a ${kg(real.w)}. Las dos últimas son la última vez y la serie de hoy; las anteriores, un ejemplo ficticio.`}>
                {[0, 1, 2, 3].map((i) => <line key={i} className="x4-chart-grid" x1={X0 - 14} x2={X1 + 14} y1={Y1 + (i * (Y0 - Y1)) / 3} y2={Y1 + (i * (Y0 - Y1)) / 3} />)}
                <path className="x4-chart-trend" pathLength={1} d={`M${fx.toFixed(1)},${fy.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`} />
                <path className="x4-chart-line" pathLength={1} d={d} />
                {pts.slice(0, -1).map(([x, y], i) => <g key={i} className="x4-chart-pt"><circle cx={x} cy={y} r={i >= pts.length - 3 ? 5 : 4} data-real={i >= pts.length - 3 ? "1" : undefined} /></g>)}
                <g className="x4-chart-today"><circle className="ring" cx={tx} cy={ty} r={7} /><circle cx={tx} cy={ty} r={7} /></g>
                <text className="x4-chart-ax" x={X0 - 14} y={H - 8}>Hace {series.length - 1} sesiones</text>
                <text className="x4-chart-ax" x={X1 + 14} y={H - 8} textAnchor="end">Hoy</text>
              </svg>
              <span className="x4-chart-tag" aria-hidden="true">{kg(series[0])} → {kg(real.w)}</span>
              <figcaption>Press de banca · carga de la serie más pesada. Los dos últimos puntos son los de la serie de arriba (motor real); los anteriores, un ejemplo ficticio.</figcaption>
            </figure>
            <ul className="x4-data-roles">
              <li><b>El socio</b><span>Progreso por ejercicio, en su teléfono</span></li>
              <li><b>El entrenador</b><span>El rendimiento de cada alumno, sin pedírselo</span></li>
            </ul>
          </div>
        </div>
        {/* La serie de hoy, viajando de la sala a la gráfica. */}
        <span className="x4-chip" aria-hidden="true"><i />{kg(real.w)} × {real.r}</span>
      </div>
    </div>
  );
}
