"use client";
// Escena 04b · «Un mismo REPI. Dos formas de entrenar.» (D215). Entre Perspectivas y Producto: dos maneras de implementar REPI
// en un gimnasio, con la misma plataforma y otra política. No son perfiles. Un selector (pestañas ARIA, flechas, Inicio/Fin)
// cambia la escena entera: el texto comercial, las funciones, los beneficios, el escenario con pantallas reales (el teléfono
// del socio en Completo; la pantalla del gimnasio, apaisada, en Control), el film, la demo y el contacto. La cámara de la sala
// cambia de toma con el modo (`data-shot`). Debajo, «Qué cambia y qué no» en una tabla corta.
// Movimiento: sólo CSS (máscaras, opacidad y desplazamiento cortos) disparado al cambiar de modo, más un recorrido breve por
// las pantallas del modo elegido (setTimeout, nunca en bucle). Con movimiento reducido o «Pausar animaciones», el cambio es
// instantáneo y el escenario queda en su pantalla final.
// `?modo=completo|control` (en /conoce o /conoce/<perfil>) lo preselecciona y lleva hasta acá; `#modos` sólo lleva. Elegir
// otro modo deja `?modo=` en la URL (compartible). Mide mode_select (target modo-completo | modo-control); el contacto,
// la demo y WhatsApp miden lo de siempre con ese mismo target. Sin precios: «Pedí una propuesta personalizada».
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChatCircle, Play } from "@phosphor-icons/react";
import { MODES, MODE_IDS, MODE_ROWS, VIDEOS, type ModeId } from "@/content/conoce";
import { waLink } from "@/lib/contact";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import { DemoButton } from "../DemoButton";
import { TrackLink } from "../TrackLink";
import { MODE_EVENT, announceInterest, modeFromUrl } from "../interest";
import { reduced } from "./gsap";
import { Say } from "./Say";
import { useFilm } from "./FilmPlayer";

/** Recorrido corto por las pantallas al elegir un modo; termina en la pantalla por defecto (la última del recorrido). */
const TOUR: Record<ModeId, number[]> = { completo: [0, 1], control: [0, 1, 2] };
const DEFAULT_STEP: Record<ModeId, number> = { completo: 1, control: 2 };
const STEP_MS = 1100;

export function Modes() {
  const [m, setM] = useState<ModeId>("completo");
  /** Hubo un cambio de modo: recién ahí corren las entradas del panel (al cargar, el panel ya está quieto). */
  const [moved, setMoved] = useState(false);
  const [step, setStep] = useState<Record<ModeId, number>>(DEFAULT_STEP);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const film = useFilm();

  const stopTour = () => { timers.current.forEach((t) => clearTimeout(t)); timers.current = []; };
  const playTour = (id: ModeId) => {
    stopTour();
    const seq = TOUR[id];
    if (reduced() || stage.get().paused) { setStep((s) => ({ ...s, [id]: DEFAULT_STEP[id] })); return; }
    seq.forEach((k, i) => { timers.current.push(window.setTimeout(() => setStep((s) => ({ ...s, [id]: k })), i * STEP_MS)); });
  };
  /** Cambia de modo. `user`: lo eligió la persona en el selector (mide y deja la URL compartible). */
  const show = (id: ModeId, user: boolean) => {
    setM(id); setMoved(true); playTour(id);
    if (!user) return;
    track("mode_select", { profile: "gimnasios", target: `modo-${id}` });
    try {
      const u = new URL(window.location.href); u.searchParams.set("modo", id);
      history.replaceState(history.state, "", `${u.pathname}${u.search}${u.hash}`);
    } catch { /* sin historial: queda la URL actual */ }
  };
  const choose = (id: ModeId) => { if (id !== m) show(id, true); };

  // `?modo=` al cargar: preselecciona y lleva a la escena. Otras escenas eligen con el evento «repi:mode».
  useEffect(() => {
    const q = modeFromUrl();
    if (q) {
      if (q !== "completo") { setM(q); setStep((s) => ({ ...s, [q]: DEFAULT_STEP[q] })); }
      if (!window.location.hash || window.location.hash === "#modos") requestAnimationFrame(() => document.getElementById("modos")?.scrollIntoView({ block: "start" }));
    }
    const on = (e: Event) => { const id = (e as CustomEvent<{ mode: ModeId }>).detail?.mode; if (id) show(id, false); };
    window.addEventListener(MODE_EVENT, on);
    return () => { window.removeEventListener(MODE_EVENT, on); stopTour(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = MODE_IDS.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    choose(MODE_IDS[j]); tabs.current[j]?.focus();
  };

  return (
    <section id="modos" className="x3-md" data-shot={m} data-mode={m} data-moved={moved ? "1" : undefined} aria-labelledby="cn-md">
      <div className="x3-wrap">
        <Say id="cn-md" className="x3-h2" text="Un mismo REPI. *Dos formas de entrenar.*" />
        <p className="x3-lead">Cada gimnasio trabaja distinto. REPI se adapta a tu forma de planificar y acompañar a tus socios.</p>
        <div className="x3-md-tabs" role="tablist" aria-label="Elegí la modalidad" style={{ "--i": MODE_IDS.indexOf(m) } as React.CSSProperties}>
          <span className="x3-md-ind" aria-hidden="true" />
          {MODE_IDS.map((id, i) => (
            <button key={id} ref={(b) => { tabs.current[i] = b; }} type="button" role="tab" id={`md-tab-${id}`} aria-selected={id === m} aria-controls={`md-panel-${id}`} tabIndex={id === m ? 0 : -1}
              onClick={() => choose(id)} onKeyDown={(e) => onKey(e, i)}>
              <b>{MODES[id].name}</b><small>{MODES[id].tag}</small>
            </button>
          ))}
        </div>
        {MODE_IDS.map((id) => <Panel key={id} id={id} on={id === m} step={step[id]} setStep={(k) => { stopTour(); setStep((s) => ({ ...s, [id]: k })); track("feature_click", { profile: "gimnasios", target: `modo-${id}-${k + 1}` }); }} onFilm={() => { const v = VIDEOS[MODES[id].film]; if (v?.src) film(v, "gimnasios"); }} />)}
        <Compare active={m} />
      </div>
    </section>
  );
}

function Panel({ id, on, step, setStep, onFilm }: { id: ModeId; on: boolean; step: number; setStep: (k: number) => void; onFilm: () => void }) {
  const c = MODES[id];
  const video = VIDEOS[c.film];
  const target = `modo-${id}`;
  const contact = () => { track("contact_click", { profile: "gimnasios", target }); announceInterest({ profile: "gimnasios", mode: id }); };
  return (
    <div role="tabpanel" id={`md-panel-${id}`} aria-labelledby={`md-tab-${id}`} className="x3-md-panel" data-mode={id} hidden={!on}>
      <div className="x3-md-copy">
        <p className="x3-md-tag" style={{ "--d": 0 } as React.CSSProperties}>{c.name} · {c.tag}</p>
        <h3 style={{ "--d": 1 } as React.CSSProperties}>{c.claim}</h3>
        <p className="x3-md-pitch" style={{ "--d": 2 } as React.CSSProperties}>{c.pitch}</p>
        <ul className="x3-md-feat" aria-label={`Qué incluye ${c.name}`} style={{ "--d": 3 } as React.CSSProperties}>{c.features.map((f) => <li key={f}>{f}</li>)}</ul>
        <div className="x3-md-act" style={{ "--d": 4 } as React.CSSProperties}>
          <a className="x3-btn pri" href="#contacto" onClick={contact}>{c.cta}<ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
          <DemoButton role={c.demo} profile="gimnasios" label={c.demoLabel} className="x3-btn ghost" target={target} />
          <TrackLink event="whatsapp_click" profile="gimnasios" target={target} external className="x3-btn text" href={waLink(c.whatsapp)}><ChatCircle size={18} weight="bold" aria-hidden="true" />Consultar por WhatsApp</TrackLink>
          {video?.src && <button type="button" className="x3-btn text" onClick={onFilm}><Play size={16} weight="fill" aria-hidden="true" />Ver el video{video.duration ? ` · ${video.duration}` : ""}</button>}
        </div>
        <p className="x3-fine x3-md-price" style={{ "--d": 5 } as React.CSSProperties}>¿Precio? <a href="#contacto" onClick={contact}>Pedí una propuesta personalizada</a> para tu gimnasio.</p>
      </div>
      <Stage id={id} step={step} setStep={setStep} />
      <ul className="x3-md-ben" aria-label={`Beneficios de ${c.name}`}>
        {c.benefits.map((b, i) => <li key={b.title} style={{ "--d": i } as React.CSSProperties}><b>{b.title}</b><span>{b.text}</span></li>)}
      </ul>
    </div>
  );
}

/** Escenario del modo: el equipo principal con sus pantallas reales apiladas (cambia con un barrido), el teléfono que acompaña
 *  y los pasos para recorrerlas a mano. */
function Stage({ id, step, setStep }: { id: ModeId; step: number; setStep: (k: number) => void }) {
  const c = MODES[id];
  const screen = c.device === "screen";
  const dims = screen ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  return (
    <div className="x3-md-stage" data-device={c.device}>
      <div className="x3-md-area">
        <figure className={`x3-md-main ${c.device}`}>
          <div className="x3-md-glass">
            {c.screens.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.src} src={s.src} alt={s.alt} {...dims} loading="lazy" decoding="async" data-on={i === step ? "1" : undefined} aria-hidden={i === step ? undefined : true} />
            ))}
          </div>
          <figcaption className="x3-sr">{c.name}, pantalla {step + 1} de {c.screens.length}: {c.screens[step]?.label}</figcaption>
        </figure>
        <figure className="x3-md-aside">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.aside.src} alt={c.aside.alt} width={390} height={844} loading="lazy" decoding="async" />
          <figcaption>{c.aside.caption}</figcaption>
        </figure>
      </div>
      <div className="x3-md-steps" role="group" aria-label={`Pantallas de ${c.name}`}>
        {c.screens.map((s, i) => (
          <button key={s.src} type="button" aria-pressed={i === step} onClick={() => setStep(i)}><span aria-hidden="true">{i + 1}</span>{s.label}</button>
        ))}
      </div>
    </div>
  );
}

/** «Qué cambia y qué no»: primero lo que cambia según la política, después lo que es igual en las dos. La columna del modo
 *  elegido se enciende. En el teléfono, cada fila es un bloque con sus dos respuestas. */
function Compare({ active }: { active: ModeId }) {
  const policy = MODE_ROWS.filter((r) => r.kind === "policy"), same = MODE_ROWS.filter((r) => r.kind === "same");
  return (
    <div className="x3-md-cmp" data-active={active}>
      <h3 id="cn-md-cmp" className="x3-h3">Qué cambia <em>y qué no.</em></h3>
      <table className="x3-md-table" aria-labelledby="cn-md-cmp">
        <thead><tr><td /><th scope="col" data-col="completo">REPI Completo</th><th scope="col" data-col="control">REPI Control</th></tr></thead>
        <tbody>
          <tr className="grp"><th scope="rowgroup" colSpan={3}>Cambia según la política del gimnasio</th></tr>
          {policy.map((r) => r.kind === "policy" && (
            <tr key={r.label}><th scope="row">{r.label}</th><td data-col="completo" data-k="REPI Completo">{r.completo}</td><td data-col="control" data-k="REPI Control">{r.control}</td></tr>
          ))}
        </tbody>
        <tbody>
          <tr className="grp"><th scope="rowgroup" colSpan={3}>En las dos modalidades</th></tr>
          {same.map((r) => r.kind === "same" && (
            <tr key={r.label} className="same"><th scope="row">{r.label}</th><td colSpan={2} data-k="En las dos">{r.both}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
