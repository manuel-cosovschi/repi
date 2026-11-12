"use client";
// Experience 4.0 · «Una sala. Todo conectado.» (WOW 6, firma «señal conectada»). La sala 3D deja de ser fondo: es el mapa.
// Cuatro zonas (recepción, sala, entrenadores y oficina) con lo que REPI hace en cada una. Se recorre de tres maneras, todas
// equivalentes: bajando (cada tramo es una zona y la cámara viaja hasta ella), tocando una zona sobre la sala (botones reales
// ubicados sobre cada zona) o con las pestañas (teclado: flechas, Inicio y Fin). Elegir una zona lleva al tramo de esa zona,
// así lo que se ve y la posición de la página dicen siempre lo mismo.
// En cada zona pasa algo real en la sala: en recepción se enciende la pantalla de REPI Control; en la sala, la serie de
// Valentina deja un pulso; en entrenadores, el pedido «Que venga alguien» de Julián cruza hasta el equipo, vuelve el «Voy» y
// Sofía camina hasta él; en la oficina, lo registrado viaja por la red hasta la pantalla del dueño.
// Lo que dice cada tarjeta existe en la app (contenido de `content/conoce.ts`, verificado contra el código en
// docs/comercial/EXPERIENCE_4.md §11). Movimiento reducido o pantalla baja: las pestañas y las tarjetas, sin escena fijada;
// la sala (plano SVG) igual encuadra la zona elegida.
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { track } from "@/lib/site-track";
import type { DemoRole } from "@/content/conoce";
import { COACH_SCREEN, JULIAN, KIOSK, OFFICE_SCREEN, VALENTINA, zoneById, type ShotId, type ZoneId } from "../sala/model";
import { pings, stage } from "../sala/store";
import { DemoButton } from "../DemoButton";
import { pickMode } from "../interest";
import { gsap, PIN_MQ, ScrollTrigger, useGSAP, whenIdle, reduced } from "../x3/gsap";
import { Say } from "../x3/Say";

type Spot = { id: ZoneId; shot: ShotId; tab: string; who: string; title: string; text: string; points: string[]; demo: DemoRole; demoLabel: string; mode?: boolean };
const SPOTS: Spot[] = [
  { id: "recepcion", shot: "zRecepcion", tab: "Recepción", who: "El ingreso · Recepción", title: "Altas sin papeles y la pantalla del gimnasio.",
    text: "La persona escanea el QR de la sede, pide acceso y tu equipo confirma quién es socio. Con REPI Control, además, la rutina se consulta y se registra en una pantalla del gimnasio.",
    points: ["Un QR por sede; recepción, gerencia o sala aprueban", "REPI Control: código de socio y PIN en la pantalla, sin instalar nada"], demo: "control", demoLabel: "Probar la pantalla", mode: true },
  { id: "racks", shot: "zRacks", tab: "Sala", who: "El socio · Sala", title: "Cada serie con su objetivo.",
    text: "Training Intelligence compara con el historial y propone carga y repeticiones, con la razón a la vista. El socio registra con un toque y la próxima serie se ajusta.",
    points: ["Anterior, recomendado y real en cada serie", "Lo que indicó el profe siempre manda"], demo: "member", demoLabel: "Probar como socio" },
  { id: "box", shot: "zBox", tab: "Equipo de sala", who: "Entrenadores", title: "Sabe a quién atender.",
    text: "Un socio toca «Que venga alguien» desde su serie. El pedido llega a la bandeja de sala, quien lo toma responde «Voy» y queda registrado.",
    points: ["Bandeja de sala y traspaso de turno", "Programas, fichas y seguimiento de cada socio"], demo: "floor", demoLabel: "Probar como entrenador de sala" },
  { id: "oficina", shot: "zOficina", tab: "Oficina", who: "El dueño · Oficina", title: "Ve lo que pasa en su sala.",
    text: "El tablero por sede junta lo que el equipo y los socios ya registraron: quiénes entrenan con REPI, cuánto se entrena y qué quedó pendiente.",
    points: ["Tablero por sede, con permisos por rol", "Servicio del equipo: pedidos, tiempos y pendientes"], demo: "owner", demoLabel: "Probar como gimnasio" },
];
/** Tramo de la vista general (0–OVER del recorrido); después, un tramo igual por zona. */
const OVER = 0.2, EACH = (1 - OVER) / SPOTS.length;
const where = (i: number) => (i < 0 ? OVER * 0.4 : OVER + (i + 0.5) * EACH);

export function Connected() {
  const root = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  /** -1: toda la sala. */
  const [active, setActive] = useState(-1);
  const [pinned, setPinned] = useState(false);
  const [spots, setSpots] = useState<{ x: number; y: number; hide?: boolean }[] | null>(null);
  const [inView, setInView] = useState(false);
  /** La escena está fijada (ocupa la pantalla): recién ahí los botones sobre la sala coinciden con sus zonas. */
  const [stuck, setStuck] = useState(false);

  useGSAP(() => {
    const sec = root.current!, track = sec.querySelector<HTMLElement>(".x4-con-track")!;
    // Mientras la escena está a la vista manda sobre la sala (foco, pantalla, red); al salir, la suelta.
    const view = ScrollTrigger.create({ trigger: sec, start: "top 70%", end: "bottom 30%", onToggle: (s) => { setInView(s.isActive); if (!s.isActive) stage.set({ focus: null, kiosk: 0, flow: 0, request: null, walk: 0, explore: null }); } });
    const mm = gsap.matchMedia();
    mm.add(PIN_MQ, () => {
      setPinned(true);
      let last = -2;
      const measure = () => {
        // Dónde queda cada zona en la pantalla con la toma general (para los botones sobre la sala).
        // Nunca fuera de la pantalla, debajo de la cabecera ni encima de la tarjeta, y sin pisarse entre ellos: un botón que no
        // se puede tocar no sirve. El que no entra (pantallas muy chicas) no se muestra: la zona sigue en las pestañas.
        const vw = window.innerWidth, vh = window.innerHeight, narrow = vw < 760;
        const card = sec.querySelector<HTMLElement>(".x4-con-card")?.getBoundingClientRect(), pinTop = sec.querySelector<HTMLElement>(".x4-con-pin")?.getBoundingClientRect().top ?? 0;
        // La tarjeta, en coordenadas de la escena fijada (cuando se mide, la escena puede no estar todavía arriba de todo).
        const c = card ? { l: card.left - 14, r: card.right + 14, t: card.top - pinTop - 14, b: card.bottom - pinTop + 14 } : null;
        const maxY = narrow && c ? c.t - 12 : vh - 40;
        const placed: { x: number; y: number; hide?: boolean }[] = [];
        SPOTS.map((s, i) => { const z = zoneById(s.id), q = stage.project(z.x, z.z, "connected"); return { i, x: Math.min(vw - 86, Math.max(86, q.x)), y: Math.max(112, q.y) }; })
          .sort((a, b) => a.y - b.y)
          .forEach((q) => {
            let { x, y } = q;
            if (!narrow && c && x > c.l - 70 && x < c.r + 70 && y > c.t && y < c.b) x = Math.min(vw - 86, c.r + 80);
            for (let k = 0; k < 6; k++) { const hit = placed.find((o) => o && !o.hide && Math.abs(o.x - x) < 170 && Math.abs(o.y - y) < 48); if (!hit) break; y = hit.y + 48; }
            placed[q.i] = { x, y, hide: y > maxY };
          });
        setSpots(placed);
      };
      let trig: ScrollTrigger | null = null;
      const idle = whenIdle(() => {
        trig = ScrollTrigger.create({ trigger: track, start: "top top", end: "bottom bottom", onRefresh: measure, onToggle: (s) => setStuck(s.isActive),
          onUpdate: (s) => { const p = s.progress, i = p < OVER ? -1 : Math.min(SPOTS.length - 1, Math.floor((p - OVER) / EACH)); if (i !== last) { last = i; setActive(i); } } });
        measure();
      });
      const off = stage.subscribe(() => { if (stage.get().gl !== glNow) { glNow = stage.get().gl; measure(); } });
      let glNow = stage.get().gl;
      window.addEventListener("resize", measure);
      return () => { idle(); trig?.kill(); off(); window.removeEventListener("resize", measure); setPinned(false); setStuck(false); setSpots(null); };
    });
    return () => { view.kill(); mm.revert(); stage.set({ focus: null, kiosk: 0, flow: 0, request: null, walk: 0, explore: null }); };
  }, { scope: root });

  // Lo que pasa en la sala con cada zona.
  useEffect(() => {
    if (!inView) return;
    const s = SPOTS[active];
    stage.set({ focus: s?.id ?? null, kiosk: s?.id === "recepcion" ? 1 : 0, flow: !s ? 0.6 : s.id === "oficina" ? 1 : s.id === "racks" ? 0.35 : 0, request: null, walk: 0, ...(pinned ? {} : { explore: s?.shot ?? null }) });
    if (!s || reduced()) return;
    const timers: number[] = [];
    let tw: gsap.core.Tween | null = null;
    if (s.id === "recepcion") timers.push(window.setTimeout(() => pings.fire(KIOSK[0], KIOSK[1], "data"), 900));
    if (s.id === "racks") timers.push(window.setTimeout(() => pings.fire(VALENTINA[0], VALENTINA[1], "member"), 1100), window.setTimeout(() => pings.fire(VALENTINA[0], VALENTINA[1], "data"), 3200));
    if (s.id === "oficina") timers.push(window.setTimeout(() => pings.fire(OFFICE_SCREEN[0], OFFICE_SCREEN[1], "staff"), 1500));
    if (s.id === "box") {
      // El pedido de Julián cruza hasta el equipo, vuelve el «Voy» y Sofía camina hasta él (una vez, al llegar a la zona).
      const o = { u: 0 };
      pings.fire(JULIAN[0], JULIAN[1], "member");
      tw = gsap.to(o, { u: 1, duration: 4.2, delay: 0.7, ease: "none", onUpdate: () => {
        const r = Math.min(1, o.u / 0.55), w = Math.min(1, Math.max(0, (o.u - 0.5) / 0.5));
        stage.set({ request: +r.toFixed(3), walk: +w.toFixed(3) });
      }, onComplete: () => { stage.set({ request: null }); pings.fire(COACH_SCREEN[0], COACH_SCREEN[1], "staff"); } });
    }
    return () => { timers.forEach((t) => clearTimeout(t)); tw?.kill(); };
  }, [active, pinned, inView]);

  /** Ir a una zona: con la escena fijada, lleva la página al tramo de esa zona (el scroll elige); sin fijar, la elige acá. */
  const go = (i: number, from: "tab" | "sala") => {
    track("feature_click", { target: `sala-${i < 0 ? "todo" : SPOTS[i].id}${from === "sala" ? "-3d" : ""}` });
    const tr = root.current?.querySelector<HTMLElement>(".x4-con-track");
    if (!pinned || !tr) { setActive(i); return; }
    const r = tr.getBoundingClientRect(), top = r.top + window.scrollY + where(i) * (r.height - window.innerHeight);
    window.scrollTo({ top, behavior: reduced() || stage.get().paused ? "auto" : "smooth" });
  };
  const onKey = (e: React.KeyboardEvent, k: number) => {
    const n = SPOTS.length + 1;
    const j = e.key === "ArrowRight" || e.key === "ArrowDown" ? (k + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (k - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); go(j - 1, "tab"); tabs.current[j]?.focus({ preventScroll: true });
  };
  const s = SPOTS[active];
  return (
    <section ref={root} id="sala" className="x4-con" data-shot="connected" aria-labelledby="cn-con">
      <div className="x3-wrap x4-con-head">
        <Say id="cn-con" className="x3-h2" text="Una sala. *Todo conectado.*" />
        <p className="x3-lead">Lo que el socio registra llega a quien lo necesita: su entrenador, el equipo de sala y el dueño. Recorré la sala y mirá qué pasa en cada lugar.</p>
      </div>
      <div className="x4-con-track">
        {SPOTS.map((z, i) => <i key={z.id} className="x4-cue" data-shot={z.shot} data-span="0.3" style={{ "--at": OVER + i * EACH - 0.015 } as React.CSSProperties} aria-hidden="true" />)}
        <div className="x4-con-pin">
          {/* Botones sobre la sala (vista general): cada zona se elige tocándola. Con la zona elegida, se ocultan. */}
          {pinned && spots && (
            <div className="x4-con-spots" data-on={active < 0 && stuck ? "1" : undefined}>
              {SPOTS.map((z, i) => !spots[i].hide && (
                <button key={z.id} type="button" className="x4-spot" style={{ left: spots[i].x, top: spots[i].y }} tabIndex={active < 0 && stuck ? 0 : -1} aria-hidden={active < 0 && stuck ? undefined : true}
                  onClick={() => go(i, "sala")} onPointerEnter={() => stage.set({ preview: z.id })} onPointerLeave={() => stage.set({ preview: null })} onFocus={() => stage.set({ preview: z.id })} onBlur={() => stage.set({ preview: null })}>
                  <i aria-hidden="true" /><span>{z.tab}</span>
                </button>
              ))}
            </div>
          )}
          <div className="x3-wrap x4-con-in">
            <div className="x4-con-card">
              <div className="x4-con-tabs" role="tablist" aria-label="Zonas de la sala">
                {[{ id: "todo", tab: "Toda la sala" }, ...SPOTS].map((z, k) => (
                  <button key={z.id} ref={(b) => { tabs.current[k] = b; }} type="button" role="tab" id={`con-tab-${z.id}`} aria-selected={k - 1 === active} aria-controls="con-panel" tabIndex={k - 1 === active ? 0 : -1}
                    onClick={() => go(k - 1, "tab")} onKeyDown={(e) => onKey(e, k)}>{z.tab}</button>
                ))}
              </div>
              <div role="tabpanel" id="con-panel" aria-labelledby={`con-tab-${s?.id ?? "todo"}`} className="x4-con-panel" key={s?.id ?? "todo"}>
                {s ? (
                  <>
                    <p className="x4-con-who">{s.who}</p>
                    <h3>{s.title}</h3>
                    <p className="x4-con-text">{s.text}</p>
                    <ul>{s.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
                    <div className="x4-con-act">
                      <DemoButton role={s.demo} label={s.demoLabel} className="x3-btn ghost sm" target={`sala-${s.id}`} />
                      {s.mode && <a className="x3-btn text sm" href="#modos" onClick={() => { pickMode("control"); track("feature_click", { profile: "gimnasios", target: "sala-modo-control" }); }}>Ver REPI Control<ArrowRight size={14} weight="bold" aria-hidden="true" /></a>}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="x4-con-who">La sala completa</p>
                    <h3>Cuatro lugares, un mismo sistema.</h3>
                    <p className="x4-con-text">Recepción, sala, entrenadores y oficina trabajan con los mismos datos. {pinned ? "Tocá una zona sobre la sala, elegila acá arriba o seguí bajando." : "Elegí una zona acá arriba."}</p>
                    <ol className="x4-con-chain">
                      <li><b>El socio</b> registra su serie.</li>
                      <li><b>El equipo</b> ve quién necesita ayuda y cómo viene cada uno.</li>
                      <li><b>El dueño</b> ve su sala sin pedir un informe.</li>
                    </ol>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
