"use client";
// Escena 04 · Cuatro perspectivas. Elegir un perfil mueve la cámara de la sala a su zona (gimnasio: recepción y oficina;
// entrenador: el box; deportista: el rack; aliados: la sala entera desde arriba, como sistema) y transforma el escenario:
// problema, qué cambia, la interfaz real, su video y su acción. `/conoce/<perfil>` lo preselecciona; elegir otro deja la URL
// en `/conoce/<perfil>` (compartible, con la misma búsqueda/UTM) y avisa al formulario («repi:interest») para que el pedido
// llegue con el tipo y el interés correctos. Mide profile_select.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play } from "@phosphor-icons/react";
import { PROFILE_CONTENT, VIDEOS, FEATURES } from "@/content/conoce";
import { waLink as wa } from "@/lib/contact";
import { PROFILES, type Profile } from "@/lib/site-events";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import type { ZoneId } from "../sala/model";
import { DemoButton } from "../DemoButton";
import { TrackLink } from "../TrackLink";
import { announceInterest as announce } from "../interest";
import { gsap, MOTION_MQ, reduced, useGSAP } from "./gsap";
import { Say, splitSay } from "./Say";
import { useFilm } from "./FilmPlayer";

const ZONE: Record<Profile, ZoneId | null> = { gimnasios: "recepcion", entrenadores: "box", deportistas: "racks", aliados: null };
const SHOT_IMG: Record<Profile, string[]> = {
  gimnasios: ["/conoce/shots/owner.webp", "/conoce/shots/access.webp"],
  entrenadores: ["/conoce/shots/clients.webp", "/conoce/shots/programs.webp"],
  deportistas: ["/conoce/shots/training.webp", "/conoce/shots/progress.webp"],
  aliados: ["/conoce/shots/owner.webp", "/conoce/shots/member.webp"],
};
/** El formulario de contacto escucha este evento: tipo de organización, interés y (aliados) pedido de reunión. */
const announceInterest = (p: Profile, meeting = false) => announce({ profile: p, meeting });

export function Perspectives({ initial }: { initial: Profile | null }) {
  const [p, setP] = useState<Profile>(initial ?? "gimnasios");
  const root = useRef<HTMLElement>(null);
  const film = useFilm();
  const c = PROFILE_CONTENT[p];
  const video = VIDEOS[c.video];
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  // Mientras la escena está a la vista, resalta la zona del perfil en la sala.
  useEffect(() => {
    const el = root.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => stage.set({ focus: e.isIntersecting ? ZONE[p] : null }), { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); stage.set({ focus: null }); };
  }, [p]);
  // Entrada al llegar (no al cargar la página): las piezas acompañan al scroll de «top 85%» a «top 45%» y vuelven al subir.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION_MQ, () => {
      const q = gsap.utils.selector(root);
      gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: q(".x3-pv-tabs")[0], start: "top 85%", end: "top 45%", scrub: 0.5 } })
        .fromTo(q(".x3-pv-tabs, .x3-pv-head"), { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, 0)
        .fromTo(q(".x3-pv-shots"), { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.6 }, 0.2)
        .fromTo(q(".x3-pv-flow, .x3-pv-side"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.1 }, 0.35);
    });
    return () => mm.revert();
  }, { scope: root });
  // Cambio de perfil sin remontar el panel: el titular se reescribe palabra por palabra, las capturas se cruzan dentro de su
  // caja (±24 px) y la lista entra escalonada. Movimiento reducido: el contenido cambia al instante.
  const first = useRef(true);
  useGSAP(() => {
    if (first.current) { first.current = false; return; }
    if (reduced()) return;
    const q = gsap.utils.selector(root);
    gsap.fromTo(q(".x3-pv-head .x3-wi"), { yPercent: 112 }, { yPercent: 0, duration: 0.5, stagger: 0.035, ease: "power3.out" });
    gsap.fromTo(q(".x3-pv-who, .x3-pv-problem"), { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power1.out" });
    gsap.fromTo(q(".x3-pv-shot"), { opacity: 0, y: (i: number) => (i ? -24 : 24) }, { opacity: (i: number) => (i ? 0.9 : 1), y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out" });
    gsap.fromTo(q(".x3-pv-flow li, .x3-pv-feat li"), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.05, ease: "power3.out" });
  }, { scope: root, dependencies: [p] });
  /** Puntero o foco sobre una pestaña (escritorio): la zona de ese perfil se pre-ilumina en la sala antes del clic. */
  const preview = (x: Profile | null) => { if (window.matchMedia("(pointer: fine)").matches || x === null) stage.set({ preview: x ? ZONE[x] : null }); };
  const choose = (x: Profile) => {
    if (x === p) return;
    setP(x);
    announceInterest(x);
    try { history.replaceState(history.state, "", `/conoce/${x}${location.search}`); } catch { /* sin historial: queda la URL actual */ }
    track("profile_select", { profile: x, target: "perspectivas" });
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + PROFILES.length) % PROFILES.length;
    choose(PROFILES[j]); tabs.current[j]?.focus();
  };
  const features = FEATURES.filter((f) => f.profiles.includes(p)).slice(0, 3);
  return (
    <section ref={root} id="perfiles" className="x3-pv" data-shot={p} data-profile={p} aria-labelledby="cn-pv">
      <div className="x3-wrap">
        <Say id="cn-pv" className="x3-h2" text="Cuatro perspectivas. *Una sala.*" />
        <div className="x3-pv-tabs" role="tablist" aria-label="Elegí tu perfil" style={{ "--i": PROFILES.indexOf(p) } as React.CSSProperties}>
          <span className="x3-pv-ind" aria-hidden="true" />
          {PROFILES.map((x, i) => (
            <button key={x} ref={(b) => { tabs.current[i] = b; }} role="tab" id={`pv-tab-${x}`} aria-selected={x === p} aria-controls="pv-panel" tabIndex={x === p ? 0 : -1}
              onClick={() => choose(x)} onKeyDown={(e) => onKey(e, i)} onPointerEnter={() => preview(x)} onPointerLeave={() => preview(null)} onFocus={() => preview(x)} onBlur={() => preview(null)}>{PROFILE_CONTENT[x].short}</button>
          ))}
        </div>
        <div id="pv-panel" role="tabpanel" aria-labelledby={`pv-tab-${p}`} className="x3-pv-panel">
          <div className="x3-pv-head">
            <p className="x3-pv-who">{c.label}</p>
            {/* Titular partido por palabra (cada una en su máscara) para reescribirlo al cambiar de perfil; se lee entero. */}
            <h3 aria-label={c.headline}><span aria-hidden="true">{splitSay(c.headline).words.map((w, i) => <span key={`${p}${i}`}>{i > 0 && " "}<span className="x3-w"><span className="x3-wi">{w.t}</span></span></span>)}</span></h3>
            <p className="x3-pv-problem">{c.problem}</p>
          </div>
          <div className="x3-pv-body">
            <ol className="x3-pv-flow" aria-label="Qué cambia con REPI">{c.solution.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="x3-pv-shots" aria-hidden={false}>
              {SHOT_IMG[p].map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} className={`x3-pv-shot s${i}`} src={src} alt={i === 0 ? `REPI para ${c.short.toLowerCase()}: pantalla real de la demo` : ""} width={390} height={844} loading="lazy" decoding="async" />
              ))}
            </div>
            <div className="x3-pv-side">
              <ul className="x3-pv-feat">{features.map((f) => <li key={f.id}><b>{f.title}.</b> {f.value}</li>)}</ul>
              {c.modes && <p className="x3-pv-modes">{c.modes} <a href="#modos" onClick={() => track("feature_click", { profile: p, target: "perfil-modos" })}>Ver las dos modalidades</a></p>}
              <div className="x3-pv-act">
                {c.leadKind ? <a className="x3-btn pri" href="#contacto" onClick={() => { track("contact_click", { profile: p, target: "perspectivas" }); announceInterest(p, p === "aliados"); if (p === "aliados") track("meeting_request", { profile: p, target: "perspectivas" }); }}>{c.cta} <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
                  : <TrackLink event="whatsapp_click" profile={p} target="perspectivas" external className="x3-btn pri" href={wa(c.whatsapp)}>{c.cta}</TrackLink>}
                <DemoButton role={c.demo} profile={p} label="Ver la demo" className="x3-btn ghost" target={`perfil-${p}`} />
                {video?.src && <button type="button" className="x3-btn text" onClick={() => film(video, p)}><Play size={16} weight="fill" aria-hidden="true" />Ver el video{video.duration ? ` · ${video.duration}` : ""}</button>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
