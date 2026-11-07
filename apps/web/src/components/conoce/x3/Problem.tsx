"use client";
// Escena 02 · «El caos se ordena en REPI» (Motion 2, docs/comercial/EXPERIENCE_3_MOTION_2.md P1). La firma de la página y la
// respuesta al pedido del titular sobre el logo. Sobre la sala fría (velo y personas en acero) flotan los pedazos de un gimnasio
// sin sistema, cada uno sobre su zona. Con el scroll, de cada uno sale un trazo de luz curvo hacia un punto; cada pedazo viaja
// por su trazo y el punto se lo traga. Ese punto es el de la «ı» del logo real: crece hasta su tamaño exacto y las letras se
// abren desde él. En ese cuadro la sala pasa de fría a viva (corte), el titular rueda de «Antes» a «Ahora» («cada» queda quieta)
// y suben las tres pantallas reales (sala, socio y dueño). Todo es una función del progreso del scroll: reversible.
// Sin tiempos muertos: el logo empieza a abrirse mientras «dato en otro lado» todavía sale, y el corte tiñe la sala de cian un
// instante (el único golpe de color de la escena). Un pedazo que no entra sin pisar el texto (pantallas bajas) no se muestra.
// Fijada con position: sticky (CSS). Movimiento reducido o pantalla baja: apilado y quieto (sin pedazos ni velo).
import { useRef } from "react";
import { Wordmark } from "@/components/access/Wordmark";
import { stage } from "../sala/store";
import type { ShotId } from "../sala/model";
import { organic, type Curve } from "./curves";
import { gsap, PIN_MQ, ScrollTrigger, useGSAP, whenIdle } from "./gsap";

/** Cada pedazo flota sobre la zona donde pasa eso en la sala (x, z del mundo). `wide`: sólo en pantallas anchas. */
const FRAGS = [
  { id: "paper", cls: "paper", at: [-4, -4.4], r: -6, body: <><b>Rutina</b><span>Sentadilla 4×8</span><span>Prensa 3×12</span><span className="smudge">Remo ¿?</span></> },
  { id: "sheet", cls: "sheet", at: [14, 9.5], r: 4, wide: true, body: <><b>planilla_socios_v3.xlsx</b><span className="cells">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</span></> },
  { id: "chat", cls: "chat", at: [1.5, 8.5], r: 3, body: <><small>Socio · 19:42</small><span>Profe, ¿qué me toca hoy?</span></> },
  { id: "ask", cls: "chat alt", at: [11.5, -4], r: -3, body: <><small>Socio · 20:05</small><span>¿Cuánto le pongo a la prensa?</span><small className="typing">Escribiendo otra consulta…</small></> },
  { id: "prog", cls: "prog", at: [1.5, -1.5], r: -2, body: <><b>Progreso</b><span className="flat">— sin datos —</span></> },
  { id: "panel", cls: "panel", at: [14, 6.5], r: 2, wide: true, body: <><b>Sala · hoy</b><span>¿Quién entrenó?</span><span>¿Quién necesitó ayuda?</span></> },
  { id: "call", cls: "call", at: [-14.5, -5.5], r: 5, body: <><b>Pedido de ayuda</b><span>Nadie lo vio</span></> },
] as const;

/** Las tres pantallas reales del «después», en el orden en que se ven en el teléfono (socio → sala → dueño). */
const SCREENS = [
  { id: "member", src: "/conoce/shots/member.webp", who: "El socio", does: "sabe qué hacer en cada serie." },
  { id: "floor", src: "/conoce/shots/floor.webp", who: "El entrenador", does: "sabe a quién atender." },
  { id: "owner", src: "/conoce/shots/owner.webp", who: "El dueño", does: "ve lo que pasa en su sala." },
] as const;

const SHOT: ShotId = "problem";
/** Largo del guion brillante del cometa (px). */
const COMET = 52;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const eIn = (x: number) => x * x, eOut = (x: number) => 1 - (1 - x) * (1 - x), eIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Ubica un pedazo lo más cerca posible de su zona sin pisar el texto, el logo ni otro pedazo; null si no hay lugar libre
 *  (pantallas bajas): ese pedazo no se muestra en esa pantalla, nunca se lo pone encima del texto. */
function placeNear(ax: number, ay: number, w: number, h: number, blocks: R[], bounds: R): R | null {
  const fit = (x: number, y: number): R => ({ x: Math.min(Math.max(x, bounds.x), bounds.x + bounds.w - w), y: Math.min(Math.max(y, bounds.y), bounds.y + bounds.h - h), w, h });
  const free = (r: R) => !blocks.some((b) => hit(r, b));
  const cands: R[] = [fit(ax - w / 2, ay - h / 2)];
  for (const b of blocks) cands.push(fit(b.x - w - 10, ay - h / 2), fit(b.x + b.w + 10, ay - h / 2), fit(ax - w / 2, b.y - h - 10), fit(ax - w / 2, b.y + b.h + 10));
  // Si ningún costado de los bloques sirve, se recorre la pantalla en una grilla.
  if (!cands.some(free)) for (let y = bounds.y; y <= bounds.y + bounds.h - h; y += 24) for (let x = bounds.x; x <= bounds.x + bounds.w - w; x += 24) cands.push({ x, y, w, h });
  let best: R | null = null, bd = Infinity;
  for (const c of cands) { if (!free(c)) continue; const d = Math.hypot(c.x + w / 2 - ax, c.y + h / 2 - ay); if (d < bd) { bd = d; best = c; } }
  return best;
}

export function Problem() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(PIN_MQ, () => {
      const q = gsap.utils.selector(root);
      const sec = root.current!, pin = q(".x3-prob-pin")[0] as HTMLElement;
      const frags = q(".x3-frag") as HTMLElement[];
      const comets = q(".x3-prob-lines .cm") as unknown as SVGPathElement[];
      const trails = q(".x3-prob-lines .tr") as unknown as SVGPathElement[];
      const wm = q(".x3-prob-wm .wm")[0] as HTMLElement, img = wm.querySelector("img") as HTMLImageElement, dot = wm.querySelector("i") as HTMLElement;
      const ring = q(".x3-prob-ring")[0] as HTMLElement;
      const slotA = q(".x3-prob-vis .slot .a")[0] as HTMLElement, slotB = q(".x3-prob-vis .slot .b")[0] as HTMLElement;
      const restA = q(".x3-prob-vis .r.a .x3-wi") as HTMLElement[], restB = q(".x3-prob-vis .r.b .x3-wi") as HTMLElement[];
      const keyB = q(".x3-prob-vis .r.b .k .x3-wi")[0] as HTMLElement, under = q(".x3-prob-vis .x3-u")[0] as HTMLElement;
      const para = q(".x3-prob-p")[0] as HTMLElement;
      const phones = q(".x3-prob-scr") as HTMLElement[], shots = q(".x3-prob-push img") as HTMLElement[], roles = q(".x3-prob-roles li") as HTMLElement[];
      let narrow = window.innerWidth < 760;

      // ── Medición (en el refresh de ScrollTrigger y al cambiar de nivel): primero se lee todo, después se escribe. ──
      let curves: (Curve | null)[] = [], centers: [number, number][] = [], dotBox = { x: 0, y: 0, w: 1, h: 1 }, imgBox = { w: 1, h: 1 };
      let order: number[] = [];
      const measure = () => {
        narrow = window.innerWidth < 760;
        const pr = pin.getBoundingClientRect(), W = pr.width, H = pr.height;
        const wr = wm.getBoundingClientRect(), copy = (q(".x3-prob-copy")[0] as HTMLElement).getBoundingClientRect();
        const sizes = frags.map((f) => [f.offsetWidth, f.offsetHeight] as const);
        const shown = frags.map((f) => f.offsetParent !== null);
        const anchors = FRAGS.map((f) => stage.project(f.at[0], f.at[1], SHOT));
        imgBox = { w: img.offsetWidth, h: img.offsetHeight };
        // Punto de la «ı»: mismas proporciones que globals.css (.wm i), medidas sobre la caja sin transformar del logo.
        const ww = wr.width, wh = wr.height, dx = wr.left - pr.left, dy = wr.top - pr.top;
        dotBox = { x: 0.8892 * ww, y: 0.0158 * wh, w: 0.1012 * ww, h: 0.1012 * ww };
        const hub: [number, number] = [dx + dotBox.x + dotBox.w / 2, dy + dotBox.y + dotBox.h / 2];
        const pad = 18, top = 76;
        const blocks: R[] = [
          { x: dx - pad, y: dy - pad, w: ww + pad * 2, h: wh + pad * 2 },
          { x: copy.left - pr.left - pad, y: copy.top - pr.top - pad, w: copy.width + pad * 2, h: copy.height + pad * 2 },
        ];
        const bounds: R = { x: 12, y: top, w: W - 24 - (narrow ? 0 : 60), h: H - top - 12 };
        const placed: (R | null)[] = FRAGS.map((_, i) => {
          if (!shown[i]) return null;
          const r = placeNear(anchors[i].x, anchors[i].y, sizes[i][0], sizes[i][1], blocks, bounds);
          if (r) blocks.push({ x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 });
          return r;
        });
        // Escritura.
        centers = placed.map((r) => (r ? [r.x + r.w / 2, r.y + r.h / 2] : [0, 0]));
        curves = placed.map((r, i) => (r ? organic(centers[i], hub, i % 2 ? 0.3 : -0.3) : null));
        frags.forEach((f, i) => {
          const r = placed[i];
          if (r) { f.style.left = `${r.x.toFixed(1)}px`; f.style.top = `${r.y.toFixed(1)}px`; delete f.dataset.drop; }
          else if (shown[i]) f.dataset.drop = "1";
        });
        curves.forEach((c, i) => {
          for (const el of [comets[i], trails[i]]) { if (c) el.setAttribute("d", c.d); else el.removeAttribute("d"); }
          if (c) { comets[i].style.strokeDasharray = `${COMET} ${(c.length + COMET).toFixed(1)}`; trails[i].style.strokeDasharray = `${c.length.toFixed(1)} ${(c.length + 2).toFixed(1)}`; }
        });
        // Los trazos llegan de a uno: primero el más corto.
        order = curves.map((c, i) => [c ? c.length : Infinity, i] as const).filter(([l]) => l < Infinity).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
        last.p = -1; render();
      };

      // ── Todo el tramo es una función del progreso: bajando o subiendo, el mismo cuadro. ──
      const st = { p: 0, enter: 0 };
      const last = { p: -1, enter: -1 };
      const render = () => {
        const { p, enter } = st;
        if (p === last.p && enter === last.enter) return;
        last.p = p; last.enter = enter;
        // Sala: fría mientras la escena entra y hasta el corte (.52); viva después. En el corte, un golpe de cian que se apaga.
        const cut = p >= 0.52;
        const wash = cut ? 0.16 * (1 - eOut(seg(p, 0.52, 0.64))) : 0;
        stage.set({ tone: +(cut ? 0.45 * (1 - seg(p, 0.52, 0.535)) : 0.45 * enter).toFixed(3), cold: enter > 0.5 && !cut, wash: +wash.toFixed(3) });
        // Caos vivo (0–.10): los pedazos se asientan. Trazos (.06–.34), escalonados. Absorción (.26–.47).
        let absorbed = 0;
        order.forEach((i, rank) => {
          const c = curves[i]!, f = frags[i];
          const settle = eOut(seg(p, 0, 0.1));
          const c0 = 0.06 + rank * 0.024, uc = seg(p, c0, c0 + 0.13);
          const m0 = 0.26 + rank * 0.018, um = seg(p, m0, m0 + 0.09), em = eIn(um);
          const [x, y] = um > 0 ? c.at(em) : centers[i];
          const tx = x - centers[i][0], ty = y - centers[i][1] + (1 - settle) * 26;
          const sc = (0.94 + 0.06 * settle) * (1 - 0.85 * em), rot = FRAGS[i].r * (1 - em);
          f.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
          f.style.opacity = String(+(1 - seg(um, 0.8, 1)).toFixed(3));
          if (um >= 1) absorbed++;
          // Cometa: un guion brillante corto que recorre la curva; estela: la curva que se dibuja detrás y se recoge con el pedazo.
          const L = c.length;
          comets[i].style.strokeDashoffset = (COMET - uc * (L + COMET)).toFixed(1);
          comets[i].style.opacity = uc > 0 && uc < 1 ? "1" : "0";
          trails[i].style.strokeDashoffset = (um > 0 ? -em * L : L * (1 - uc)).toFixed(1);
          trails[i].style.opacity = um >= 1 || uc <= 0 ? "0" : "1";
        });
        const n = order.length || 1;
        // «Antes» sale palabra por palabra hacia arriba; el párrafo se va antes.
        const pOut = seg(p, 0.24, 0.32);
        para.style.opacity = String(+(1 - pOut).toFixed(3));
        para.style.transform = `translateY(${(-16 * pOut).toFixed(1)}px)`;
        restA.forEach((w, j) => { w.style.transform = `translateY(${(-112 * eIn(seg(p, 0.42 + j * 0.014, 0.49 + j * 0.014))).toFixed(1)}%)`; });
        // El punto: aparece en el hub cuando llegan los trazos, crece con cada pedazo que se traga y llega al tamaño exacto del
        // punto de la «ı» (.48). Es el <i> real del logo: no hay entrega entre dos puntos.
        const ds = p < 0.32 ? 0 : p >= 0.48 ? 1 : Math.max(0.2 * eOut(seg(p, 0.32, 0.37)), 0.2 + 0.5 * (absorbed / n) + 0.3 * eOut(seg(p, 0.43, 0.48)) * (absorbed / n));
        dot.style.transform = `scale(${ds.toFixed(3)})`;
        // Nace el logo (.46–.55), mientras «dato en otro lado» todavía sale: las letras se abren desde el punto con un círculo.
        const open = eIO(seg(p, 0.46, 0.55));
        const cx = dotBox.x + dotBox.w / 2, cy = dotBox.y + dotBox.h / 2, R = Math.hypot(Math.max(cx, imgBox.w - cx), Math.max(cy, imgBox.h - cy)) + 2;
        img.style.clipPath = open >= 1 ? "none" : `circle(${(open * R).toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px)`;
        // El corte (.52): un anillo sale una vez desde el logo hacia la sala.
        const rg = seg(p, 0.52, 0.64);
        ring.style.opacity = rg > 0 && rg < 1 ? String(+(0.9 * (1 - rg)).toFixed(3)) : "0";
        ring.style.transform = `scale(${(1 + eOut(rg) * 15).toFixed(3)})`;
        // Ahora (.52–.66): la primera palabra rueda (Antes, → Ahora,), «cada» queda quieta y el resto entra palabra por palabra.
        const sw = eIO(seg(p, 0.52, 0.57));
        slotA.style.transform = `translateY(${(-112 * sw).toFixed(1)}%)`;
        slotB.style.transform = `translateY(${(112 * (1 - sw)).toFixed(1)}%)`;
        restB.forEach((w, j) => { w.style.transform = `translateY(${(112 * (1 - eOut(seg(p, 0.54 + j * 0.016, 0.6 + j * 0.016)))).toFixed(1)}%)`; });
        keyB.style.opacity = String(+(0.42 + 0.58 * seg(p, 0.6, 0.64)).toFixed(3));
        under.style.transform = `scaleX(${eIO(seg(p, 0.62, 0.68)).toFixed(3)})`;
        // Tres pantallas reales (.62–.90): en escritorio suben y quedan asomadas; en el teléfono, una sola que cambia de pantalla.
        if (!narrow) {
          phones.forEach((ph, j) => { const o = [0.04, 0, 0.08][j] ?? 0, u = eOut(seg(p, 0.62 + o, 0.72 + o)); ph.style.transform = `translateY(${(100 * (1 - u)).toFixed(2)}%)`; });
          roles.forEach((r, j) => { const o = [0.04, 0, 0.08][j], u = seg(p, 0.7 + o, 0.78 + o); r.style.opacity = String(+u.toFixed(3)); r.style.transform = `translateY(${(14 * (1 - u)).toFixed(1)}px)`; });
        } else {
          const u = eOut(seg(p, 0.62, 0.7));
          phones.forEach((ph) => { ph.style.transform = `translateY(${(100 * (1 - u)).toFixed(2)}%)`; });
          const idx = eIO(seg(p, 0.74, 0.79)) + eIO(seg(p, 0.84, 0.89));
          shots.forEach((s, j) => { s.style.transform = `translateX(${((j - idx) * 100).toFixed(2)}%)`; });
          roles.forEach((r, j) => { r.style.opacity = String(+(u * clamp01(1 - Math.abs(j - idx))).toFixed(3)); r.style.transform = `translateY(${((j - idx) * 100).toFixed(1)}%)`; });
        }
      };

      // Los disparadores y la primera medición se crean en un momento libre, no en el cuadro de la hidratación (TBT).
      let trig: ScrollTrigger | null = null, enter: ScrollTrigger | null = null;
      const setup = () => {
        trig = ScrollTrigger.create({
          trigger: sec, start: "top top", end: "bottom bottom", scrub: 0.6,
          onRefreshInit: measure,
          onUpdate: (s) => { st.p = s.progress; render(); },
        });
        // La sala se enfría mientras la escena entra (y vuelve a estar viva al subir al hero).
        enter = ScrollTrigger.create({
          trigger: sec, start: "top 85%", end: "top 15%",
          onUpdate: (s) => { st.enter = s.progress; render(); },
          onLeaveBack: () => { st.enter = 0; render(); },
        });
        measure();
      };
      // Las capturas del «después» se decodifican con una pantalla de anticipación (sin trabar el cuadro en que suben).
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        (q(".x3-prob-screens img") as HTMLImageElement[]).filter((im) => im.offsetParent !== null).forEach((im) => { im.loading = "eager"; void im.decode?.().catch(() => {}); });
      }, { rootMargin: "100% 0px" });
      io.observe(sec);
      const idle = whenIdle(setup);
      return () => {
        idle(); trig?.kill(); enter?.kill(); io.disconnect();
        stage.set({ tone: 0, cold: false, wash: 0 });
        for (const el of [...frags, ...shots, ...roles, ...phones, ...restA, ...restB, slotA, slotB, para, dot, ring, under, keyB]) { el.style.transform = ""; el.style.opacity = ""; }
        frags.forEach((f) => { f.style.left = ""; f.style.top = ""; delete f.dataset.drop; });
        img.style.clipPath = "";
      };
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <section ref={root} id="problema" className="x3-prob" data-shot="problem" aria-labelledby="cn-prob">
      <div className="x3-prob-pin">
        <svg className="x3-prob-lines" aria-hidden="true">{FRAGS.map((f) => <g key={f.id}><path className="tr" /><path className="cm" /></g>)}</svg>
        <div className="x3-frags" aria-hidden="true">
          {FRAGS.map((f) => <div key={f.id} className={`x3-frag ${f.cls}`} data-wide={"wide" in f ? "1" : undefined}>{f.body}</div>)}
        </div>
        {/* El logo real (nunca el nombre escrito con otra tipografía): nace del punto donde converge todo. */}
        <div className="x3-prob-wm"><Wordmark width={200} /><span className="x3-prob-ring" aria-hidden="true" /></div>
        <div className="x3-prob-copy">
          <h2 id="cn-prob" className="x3-prob-h">Antes, cada dato <em>en otro lado.</em></h2>
          <p className="x3-prob-now">Ahora, cada persona con <em>el contexto</em> que necesita.</p>
          {/* Copia visual del titular: la primera palabra rueda de «Antes,» a «Ahora,» y «cada» queda en su lugar. */}
          <p className="x3-prob-vis" aria-hidden="true">
            <span className="l1">
              <span className="slot"><span className="x3-w"><span className="x3-wi a">Antes,</span></span><span className="x3-w"><span className="x3-wi b">Ahora,</span></span></span>
              {" "}<span className="x3-w"><span className="x3-wi">cada</span></span>
            </span>
            <span className="rest">
              <span className="r a"><span className="x3-w"><span className="x3-wi">dato</span></span> <span className="x3-w k"><span className="x3-wi">en otro lado.</span></span></span>
              <span className="r b">
                <span className="x3-w"><span className="x3-wi">persona</span></span> <span className="x3-w"><span className="x3-wi">con</span></span>{" "}
                <span className="x3-w k"><span className="x3-wi">el contexto<i className="x3-u" /></span></span>{" "}
                <span className="x3-w"><span className="x3-wi">que</span></span> <span className="x3-w"><span className="x3-wi">necesita.</span></span>
              </span>
            </span>
          </p>
          <p className="x3-prob-p">La rutina en papel, el progreso en una planilla, las consultas en el chat y el dueño sin ver qué pasa en su sala.</p>
        </div>
        <div className="x3-prob-screens">
          <ul className="x3-prob-roles" aria-label="Qué cambia con REPI">{SCREENS.map((s) => <li key={s.id} data-s={s.id}><b>{s.who}</b> {s.does}</li>)}</ul>
          <div className="x3-prob-phones" aria-hidden="true">
            {SCREENS.map((s) => (
              <div key={s.id} className="x3-prob-scr" data-s={s.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" width={390} height={844} loading="lazy" decoding="async" />
              </div>
            ))}
            <div className="x3-prob-scr push">
              <div className="x3-prob-push">
                {SCREENS.map((s) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={s.src} alt="" width={390} height={844} loading="lazy" decoding="async" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
