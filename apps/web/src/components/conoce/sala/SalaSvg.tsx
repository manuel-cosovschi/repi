"use client";
// La sala en SVG: nivel «low» (sin WebGL, ahorro de datos, equipos modestos o movimiento reducido) y primer pintado mientras
// carga el 3D. Mismo modelo y mismas tomas (`svg`: centro x, z y zoom) con transformaciones CSS; el encuadre corrido hacia el
// lado libre del texto (`lensPx`) es un desplazamiento del <svg> entero. Con movimiento reducido las personas quedan quietas y
// el cambio de toma es un corte. El bucle de las personas sólo corre mientras se anima (no en «low», ni con el 3D a la vista,
// ni con la sala tapada o las animaciones pausadas); lo que piden las escenas (encendido, pedido, vuelta al punto) se dibuja
// igual, con cada cambio de la tienda. En el encendido del hero, el contorno de cada zona se dibuja cuando la luz lo
// alcanza y los equipos se aclaran al pasar el frente. Con el mouse (escritorio), las personas cerca del puntero se agrandan
// y la zona de abajo se marca.
import { useEffect, useRef } from "react";
import { BESIDE_JULIAN, COACH_SCREEN, FLOOR, GEAR, JULIAN, KIOSK, LINKS, OFFICE_SCREEN, PEOPLE, QR_SPOT, SHOTS, SVG_D, SVG_S, SVG_W, ZONES, along, gatherGrow, lensPx, placePerson, svgFit, svgProject, svgX, svgZ, type ZoneId } from "./model";
import { pings, pointer, stage } from "./store";

const X = svgX, Z = svgZ;
/** Radio de las personas en px de pantalla (no crece con el zoom: siempre son puntos). */
const R_MEMBER = 7, R_STAFF = 8;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
/** Curva del pedido sobre el piso (Julián → donde está Sofía), en unidades del viewBox. */
export function requestPath(to: [number, number]) {
  const a = [X(JULIAN[0]), Z(JULIAN[1])], b = [X(to[0]), Z(to[1])];
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
  const c = [mx - (dz / len) * len * 0.35, mz + (dx / len) * len * 0.35];
  return `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
}

export function SalaSvg({ animate, still }: { animate: boolean; still: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const view = useRef<SVGGElement>(null);
  const plan = useRef<SVGGElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const ring = useRef<SVGCircleElement>(null);
  const zones = useRef<(SVGRectElement | null)[]>([]);
  const gear = useRef<(SVGRectElement | null)[]>([]);
  const req = useRef<SVGPathElement>(null);
  const links = useRef<SVGGElement>(null), kiosk = useRef<SVGRectElement>(null), screens = useRef<SVGGElement>(null), pingLayer = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    let vw = window.innerWidth, vh = window.innerHeight, fit = svgFit(vw, vh);
    // Publica la proyección del SVG (para que las escenas ubiquen fragmentos, el impacto del punto, etc. sobre la sala).
    const unpublish = stage.publish("svg", (x, z, shot) => svgProject(x, z, shot, vw, vh));
    let zoomNow = 1, lens: [number, number] = [0, 0], cxNow = 0, czNow = 0;
    let clock = 0, last = 0;
    let reqTo: [number, number] | null = null;
    const last$ = { view: "", lens: "", op: "", plan: "", cold: "", flow: "", kiosk: "" };
    /** Coloca las personas (recorridos + pedido + vuelta al punto) y su tamaño constante en pantalla. */
    // Cada atributo se escribe sólo si cambió (el encendido del hero y el scroll llaman seguido; casi nada cambia).
    const memo = new Map<Element, Record<string, string>>();
    const put = (el: Element, k: string, v: string) => { let m = memo.get(el); if (!m) memo.set(el, (m = {})); if (m[k] !== v) { m[k] = v; el.setAttribute(k, v); } };
    /** Píxeles de pantalla de un punto del viewBox con el encuadre actual (sin la transición CSS: alcanza para el encendido y
     *  el puntero). */
    const sx = (ux: number) => fit.ox + (SVG_W / 2 + zoomNow * (ux - X(cxNow))) * fit.s0 + lens[0];
    const sy = (uz: number) => fit.oy + (SVG_D / 2 + zoomNow * (uz - Z(czNow))) * fit.s0 + lens[1];
    const place = () => {
      const s = stage.get();
      const base = 1 / (zoomNow * fit.s0);
      const rv = s.reveal;
      const allIn = s.gather >= 0.985;
      const pt = pointer.on && s.gather === 0;
      PEOPLE.forEach((p, i) => {
        const c = dots.current[i]; if (!c) return;
        const [x, z] = placePerson(i, clock, s);
        const ux = X(x), uz = Z(z);
        put(c, "cx", ux.toFixed(1)); put(c, "cy", uz.toFixed(1));
        let k = 1;
        if (rv || pt) {
          const px = sx(ux), py = sy(uz);
          // Encendido del hero: cada persona aparece cuando la luz que se expande desde el impacto la alcanza.
          if (rv) k = smooth((rv.r - Math.hypot(px - rv.x, py - rv.y)) / 70 + 1);
          // El mouse cerca: un poco más grande (hasta 1,6×), con caída suave.
          if (pt) { const v = Math.max(0, 1 - Math.hypot(px - pointer.x, py - pointer.y) / 150); k *= 1 + 0.6 * v * v; }
        }
        // Al final de la vuelta al punto todas están en el mismo lugar: queda un solo punto, el de Valentina (cian), que
        // crece con todo lo que se tragó.
        const hide = (allIn && i > 0) || (s.dotOut && i === 0);
        if (i === 0 && s.gather > 0) k *= gatherGrow(s.gather);
        put(c, "r", hide || k <= 0.01 ? "0" : ((p.kind === "member" ? R_MEMBER : R_STAFF) * base * k).toFixed(2));
        if (i === 0 && ring.current) {
          put(ring.current, "cx", ux.toFixed(1)); put(ring.current, "cy", uz.toFixed(1)); put(ring.current, "r", (15 * base).toFixed(2));
          put(ring.current, "opacity", hide || s.gather > 0.3 || s.cold ? "0" : k.toFixed(2));
        }
      });
    };
    const apply = () => {
      const s = stage.get();
      // 4.0 · Si la persona eligió una zona al explorar la sala (`explore`), esa toma manda sobre la del scroll.
      const a = s.explore ?? s.a, b = s.explore ?? s.b;
      const A = SHOTS[a].svg, B = SHOTS[b].svg, t = clamp01(s.t), k = still ? (t < 0.5 ? 0 : 1) : t;
      cxNow = A[0] + (B[0] - A[0]) * k; czNow = A[1] + (B[1] - A[1]) * k; zoomNow = A[2] + (B[2] - A[2]) * k;
      const la = lensPx(a, vw, vh), lb = lensPx(b, vw, vh);
      lens = [la[0] + (lb[0] - la[0]) * k, la[1] + (lb[1] - la[1]) * k];
      const v = `translate(${SVG_W / 2}px, ${SVG_D / 2}px) scale(${zoomNow.toFixed(4)}) translate(${-X(cxNow)}px, ${-Z(czNow)}px)`;
      if (v !== last$.view && view.current) { view.current.style.transform = v; last$.view = v; }
      const l = `${lens[0].toFixed(1)}px ${lens[1].toFixed(1)}px`;
      if (l !== last$.lens && root.current) { root.current.style.translate = l; last$.lens = l; }
      const op = String(+(0.25 + 0.75 * s.lit).toFixed(3));
      if (op !== last$.op && root.current) { root.current.style.opacity = op; last$.op = op; }
      const cold = s.cold ? "1" : "0";
      if (cold !== last$.cold && root.current) { root.current.dataset.cold = cold; last$.cold = cold; }
      // Vuelta al punto (cierre): el plano (piso, grilla, zonas y equipos) se encoge hacia el origen y se apaga.
      const g = smooth(s.gather / 0.9);
      const pl = g > 0 ? `${(1 - g).toFixed(4)}|${X(s.origin[0])}|${Z(s.origin[1])}` : "";
      if (pl !== last$.plan && plan.current) {
        last$.plan = pl;
        if (!pl) { plan.current.style.transform = ""; plan.current.style.opacity = ""; }
        else { const ox = X(s.origin[0]), oz = Z(s.origin[1]); plan.current.style.transform = `translate(${ox}px, ${oz}px) scale(${Math.max(0.02, 1 - 0.95 * g).toFixed(4)}) translate(${-ox}px, ${-oz}px)`; plan.current.style.opacity = String(+(1 - g).toFixed(3)); }
      }
      lightZones();
      // 4.0 · La red de la sala (por dónde viaja lo que se registra), las pantallas a las que llega y la de REPI Control.
      const fl = String(+(s.flow * (1 - g)).toFixed(2));
      if (fl !== last$.flow) { last$.flow = fl; if (links.current) { links.current.style.opacity = fl; links.current.dataset.on = s.flow > 0.01 ? "1" : "0"; } if (screens.current) screens.current.dataset.on = s.flow > 0.5 ? "1" : "0"; }
      const ko = Math.max(s.kiosk, s.focus === "recepcion" ? 1 : 0, b === "control" || b === "zRecepcion" ? k : 0, a === "control" || a === "zRecepcion" ? 1 - k : 0) > 0.5 ? "1" : "0";
      if (ko !== last$.kiosk && kiosk.current) { last$.kiosk = ko; kiosk.current.dataset.on = ko; }
      // Pedido «Que venga alguien»: un cometa cian sobre el piso, de Julián a Sofía (y de vuelta, en turquesa, el «Voy»).
      if (req.current) {
        // Sólo en la toma del pedido y nunca durante la vuelta al punto (aunque un disparador tardío deje `request` escrito).
        if (s.request == null || s.gather > 0 || ![a, b].some((x) => x === "pedido" || x === "zBox")) { req.current.style.opacity = "0"; reqTo = null; }
        else {
          if (!reqTo) { const sofia = PEOPLE.findIndex((p) => p.id === "sofia"); reqTo = along(PEOPLE[sofia], clock); req.current.setAttribute("d", requestPath(reqTo)); }
          const u = s.request;
          req.current.style.opacity = "1";
          req.current.style.strokeDashoffset = String(+(u < 0.5 ? 1 - u * 2 : 0).toFixed(4));
          req.current.dataset.back = u >= 0.5 ? "1" : "0";
        }
      }
      place();
    };
    /** Zonas y equipos: foco (blanco), zona pre-iluminada (perfiles o el puntero) y, durante el encendido del hero, el frente
     *  de luz: el contorno de cada zona se dibuja desde que la luz toca su punto más cercano hasta que pasa el más lejano, y
     *  los equipos se aclaran mientras el frente los cruza. */
    let wasReveal = false;
    const lightZones = () => {
      const s = stage.get(), rv = s.reveal;
      let near: ZoneId | null = null;
      if (pointer.on && s.gather === 0) {
        // Inversa del encuadre: del píxel del puntero al viewBox, y de ahí al mundo.
        const ux = (pointer.x - lens[0] - fit.ox) / fit.s0, uz = (pointer.y - lens[1] - fit.oy) / fit.s0;
        const wx = (X(cxNow) + (ux - SVG_W / 2) / zoomNow) / S - FLOOR.w / 2, wz = (Z(czNow) + (uz - SVG_D / 2) / zoomNow) / S - FLOOR.d / 2;
        near = ZONES.find((z) => Math.abs(wx - z.x) <= z.w / 2 && Math.abs(wz - z.z) <= z.d / 2)?.id ?? null;
      }
      ZONES.forEach((z, i) => {
        const r = zones.current[i]; if (!r) return;
        let front = false;
        if (rv) {
          const xs = [sx(X(z.x - z.w / 2)), sx(X(z.x + z.w / 2))], ys = [sy(Z(z.z - z.d / 2)), sy(Z(z.z + z.d / 2))];
          const nx = Math.min(Math.max(rv.x, xs[0]), xs[1]), ny = Math.min(Math.max(rv.y, ys[0]), ys[1]);
          const dn = Math.hypot(nx - rv.x, ny - rv.y), df = Math.max(...xs.flatMap((x) => ys.map((y) => Math.hypot(x - rv.x, y - rv.y))));
          const u = clamp01((rv.r - dn) / Math.max(1, df - dn)), P = 2 * (z.w + z.d) * S;
          put(r, "stroke-dasharray", `${P} ${P}`); put(r, "stroke-dashoffset", (P * (1 - u)).toFixed(1));
          front = u > 0 && u < 1;
        } else if (wasReveal) { r.removeAttribute("stroke-dasharray"); r.removeAttribute("stroke-dashoffset"); memo.delete(r); }
        put(r, "data-on", s.focus === z.id ? "1" : front || s.preview === z.id || near === z.id ? "pre" : "0");
      });
      if (rv || wasReveal) GEAR.forEach(([x, z], i) => {
        const g = gear.current[i]; if (!g) return;
        put(g, "data-lit", rv && Math.abs(rv.r - Math.hypot(sx(X(x)) - rv.x, sy(Z(z)) - rv.y)) < 90 ? "1" : "0");
      });
      wasReveal = !!rv;
    };
    // Tiempo propio que sólo avanza mientras se anima: al pausar o tapar la sala, las personas quedan donde estaban.
    const running = () => { const s = stage.get(); return animate && !s.hidden && !s.paused && !document.hidden; };
    const tick = (now: number) => {
      if (!running()) { raf = 0; return; }
      clock += Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
      place();
      raf = requestAnimationFrame(tick);
    };
    const wake = () => { if (!raf && running()) { last = 0; raf = requestAnimationFrame(tick); } };
    const off = stage.subscribe(() => { apply(); wake(); });
    // El puntero sólo cambia personas y zonas (no el encuadre): sin el bucle (nivel «low» o pausa), se dibuja acá.
    const offPt = pointer.subscribe(() => { lightZones(); if (!raf) place(); });
    // 4.0 · Pulsos de evento: un anillo que se abre desde un punto del plano (animación CSS; se retira al terminar).
    const offPing = pings.subscribe(() => {
      const p = pings.list[pings.list.length - 1], layer = pingLayer.current;
      if (!p || !layer || still) return;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", X(p.x).toFixed(1)); c.setAttribute("cy", Z(p.z).toFixed(1)); c.setAttribute("r", "34"); c.setAttribute("class", `sala-ping ${p.kind}`);
      c.addEventListener("animationend", () => c.remove(), { once: true });
      layer.appendChild(c);
      window.setTimeout(() => c.remove(), 1600);
    });
    const onResize = () => { vw = window.innerWidth; vh = window.innerHeight; fit = svgFit(vw, vh); last$.lens = ""; apply(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("resize", onResize);
    // El primer encuadre se aplica sin transición (el HTML del servidor ya llega con la toma del hero).
    view.current?.classList.add("snap");
    root.current?.classList.add("snap");
    apply(); wake();
    const id = requestAnimationFrame(() => { view.current?.classList.remove("snap"); root.current?.classList.remove("snap"); });
    return () => { off(); offPt(); offPing(); unpublish(); cancelAnimationFrame(id); document.removeEventListener("visibilitychange", wake); window.removeEventListener("resize", onResize); cancelAnimationFrame(raf); };
  }, [animate, still]);
  const W = SVG_W, D = SVG_D, S = SVG_S;
  return (
    <svg ref={root} className="sala-svg" viewBox={`0 0 ${W} ${D}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g ref={view} className={animate ? "sala-view" : "sala-view still"}>
        <g ref={plan} className="sala-plan">
          {/* El piso sigue más allá del plano: el encuadre corrido nunca deja ver un borde. */}
          <rect x={-W} y={-D} width={W * 3} height={D * 3} className="sala-floor" />
          <g className="sala-grid">{Array.from({ length: FLOOR.w / 2 + 1 }, (_, i) => <line key={`v${i}`} x1={i * 2 * S} y1={0} x2={i * 2 * S} y2={D} />)}
            {Array.from({ length: FLOOR.d / 2 + 1 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 2 * S} x2={W} y2={i * 2 * S} />)}</g>
          {ZONES.map((z, i) => <rect key={z.id} ref={(r) => { zones.current[i] = r; }} className="sala-zone" x={X(z.x - z.w / 2)} y={Z(z.z - z.d / 2)} width={z.w * S} height={z.d * S} rx={6} />)}
          {GEAR.map(([x, z, w, d], i) => <rect key={i} ref={(r) => { gear.current[i] = r; }} className="sala-gear" x={X(x - w / 2)} y={Z(z - d / 2)} width={w * S} height={d * S} rx={3} />)}
          <rect className="sala-qr" x={X(QR_SPOT[0]) - 11} y={Z(QR_SPOT[1]) - 11} width={22} height={22} rx={3} />
          {/* 4.0 · La pantalla de REPI Control (recepción), las pantallas del equipo y de la oficina, y la red de la sala. */}
          <rect ref={kiosk} className="sala-kiosk" x={X(KIOSK[0]) - 9} y={Z(KIOSK[1]) - 6} width={18} height={12} rx={2} />
          <g ref={screens} className="sala-screens">{[OFFICE_SCREEN, COACH_SCREEN].map(([x, z]) => <rect key={x} x={X(x) - 9} y={Z(z) - 3} width={18} height={6} rx={2} />)}</g>
          <g ref={links} className="sala-links">{LINKS.map((path, i) => <polyline key={i} points={path.map(([x, z]) => `${X(x).toFixed(0)},${Z(z).toFixed(0)}`).join(" ")} pathLength={1} />)}</g>
        </g>
        <g ref={pingLayer} />
        <path ref={req} className="sala-req" pathLength={1} d={requestPath(BESIDE_JULIAN)} />
        <circle ref={ring} className="sala-ring" cx={X(PEOPLE[0].path[0][0])} cy={Z(PEOPLE[0].path[0][1])} r={15} />
        {PEOPLE.map((p, i) => { const [x, z] = along(p, 0); return <circle key={i} ref={(c) => { dots.current[i] = c; }} cx={X(x)} cy={Z(z)} r={p.kind === "member" ? 4 : 4.5} className={p.kind === "member" ? "sala-member" : "sala-staff"} />; })}
      </g>
    </svg>
  );
}
