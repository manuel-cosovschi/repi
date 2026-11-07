"use client";
// La sala en SVG: nivel «low» (sin WebGL, ahorro de datos, equipos modestos o movimiento reducido) y primer pintado mientras
// carga el 3D. Mismo modelo y mismas tomas (`svg`: centro x, z y zoom) con transformaciones CSS. Con movimiento reducido las
// personas quedan quietas y el cambio de toma es un corte (nunca un zoom que acompaña al scroll). El bucle de las personas
// se detiene cuando el 3D ya se ve, cuando una sección sólida tapa la sala o cuando la persona pausa las animaciones.
import { useEffect, useRef } from "react";
import { FLOOR, GEAR, PEOPLE, QR_SPOT, SHOTS, ZONES, along } from "./model";
import { stage } from "./store";

const S = 20; // px por metro en el viewBox
const W = FLOOR.w * S, D = FLOOR.d * S;
const X = (x: number) => (x + FLOOR.w / 2) * S, Z = (z: number) => (z + FLOOR.d / 2) * S;

export function SalaSvg({ animate, still }: { animate: boolean; still: boolean }) {
  const view = useRef<SVGGElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const zones = useRef<(SVGRectElement | null)[]>([]);
  const root = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const s = stage.get();
      const A = SHOTS[s.a].svg, B = SHOTS[s.b].svg, t = Math.min(1, Math.max(0, s.t)), k = still ? (t < 0.5 ? 0 : 1) : t;
      const cx = A[0] + (B[0] - A[0]) * k, cz = A[1] + (B[1] - A[1]) * k, zoom = A[2] + (B[2] - A[2]) * k;
      if (view.current) view.current.style.transform = `translate(${W / 2}px, ${D / 2}px) scale(${zoom}) translate(${-X(cx)}px, ${-Z(cz)}px)`;
      if (root.current) root.current.style.opacity = String(0.25 + 0.75 * s.lit);
      ZONES.forEach((z, i) => { const r = zones.current[i]; if (r) r.dataset.on = s.focus === z.id ? "1" : "0"; });
    };
    // Tiempo propio que sólo avanza mientras se anima: al pausar o tapar la sala, las personas quedan donde estaban.
    let clock = 0, last = 0;
    const place = () => PEOPLE.forEach((p, i) => { const c = dots.current[i]; if (!c) return; const [x, z] = along(p, clock); c.setAttribute("cx", String(X(x))); c.setAttribute("cy", String(Z(z))); });
    const running = () => { const s = stage.get(); return animate && !s.hidden && !s.paused && !document.hidden; };
    const tick = (now: number) => {
      if (!running()) { raf = 0; return; }
      clock += Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
      place();
      raf = requestAnimationFrame(tick);
    };
    const wake = () => { if (!raf && running()) { last = 0; raf = requestAnimationFrame(tick); } };
    const off = stage.subscribe(() => { apply(); wake(); });
    document.addEventListener("visibilitychange", wake);
    apply(); place(); wake();
    return () => { off(); document.removeEventListener("visibilitychange", wake); cancelAnimationFrame(raf); };
  }, [animate, still]);
  return (
    <svg ref={root} className="sala-svg" viewBox={`0 0 ${W} ${D}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g ref={view} className={animate ? "sala-view" : "sala-view still"}>
        <rect x={0} y={0} width={W} height={D} className="sala-floor" />
        <g className="sala-grid">{Array.from({ length: FLOOR.w / 2 + 1 }, (_, i) => <line key={`v${i}`} x1={i * 2 * S} y1={0} x2={i * 2 * S} y2={D} />)}
          {Array.from({ length: FLOOR.d / 2 + 1 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 2 * S} x2={W} y2={i * 2 * S} />)}</g>
        {ZONES.map((z, i) => <rect key={z.id} ref={(r) => { zones.current[i] = r; }} className="sala-zone" x={X(z.x - z.w / 2)} y={Z(z.z - z.d / 2)} width={z.w * S} height={z.d * S} rx={6} />)}
        {GEAR.map(([x, z, w, d], i) => <rect key={i} className="sala-gear" x={X(x - w / 2)} y={Z(z - d / 2)} width={w * S} height={d * S} rx={3} />)}
        <rect className="sala-qr" x={X(QR_SPOT[0]) - 11} y={Z(QR_SPOT[1]) - 11} width={22} height={22} rx={3} />
        {PEOPLE.map((p, i) => <circle key={i} ref={(c) => { dots.current[i] = c; }} r={p.kind === "member" ? 7 : 8} className={p.kind === "member" ? "sala-member" : "sala-staff"} />)}
      </g>
    </svg>
  );
}
