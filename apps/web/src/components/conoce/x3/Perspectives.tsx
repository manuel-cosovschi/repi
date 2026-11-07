"use client";
// Escena 04 · Cuatro perspectivas. Elegir un perfil mueve la cámara de la sala a su zona (gimnasio: recepción y oficina;
// entrenador: el box; deportista: el rack; aliados: la sala entera desde arriba, como sistema) y transforma el escenario:
// problema, qué cambia, la interfaz real, su video y su acción. `/conoce/<perfil>` lo preselecciona. Mide profile_select.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play } from "@phosphor-icons/react";
import { PROFILE_CONTENT, VIDEOS, FEATURES } from "@/content/conoce";
import { CONTACT } from "@/lib/contact";
import { PROFILES, type Profile } from "@/lib/site-events";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import type { ZoneId } from "../sala/model";
import { DemoButton } from "../DemoButton";
import { TrackLink } from "../TrackLink";
import { gsap, reduced, useGSAP } from "./gsap";
import { useFilm } from "./FilmPlayer";

const ZONE: Record<Profile, ZoneId | null> = { gimnasios: "recepcion", entrenadores: "box", deportistas: "racks", aliados: null };
const SHOT_IMG: Record<Profile, string[]> = {
  gimnasios: ["/conoce/shots/owner.webp", "/conoce/shots/access.webp"],
  entrenadores: ["/conoce/shots/clients.webp", "/conoce/shots/programs.webp"],
  deportistas: ["/conoce/shots/training.webp", "/conoce/shots/progress.webp"],
  aliados: ["/conoce/shots/owner.webp", "/conoce/shots/member.webp"],
};
const wa = (t: string) => `${CONTACT.whatsapp}?text=${encodeURIComponent(t)}`;

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
  useGSAP(() => {
    if (reduced()) return;
    const q = gsap.utils.selector(root);
    gsap.fromTo(q(".x3-pv-head > *"), { opacity: 0, y: 24, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.06, ease: "expo.out" });
    gsap.fromTo(q(".x3-pv-shot"), { clipPath: "inset(0 0 100% 0 round 28px)" }, { clipPath: "inset(0 0 0% 0 round 28px)", duration: 0.9, stagger: 0.12, ease: "expo.inOut" });
    gsap.fromTo(q(".x3-pv-flow li"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.07, delay: 0.2, ease: "power3.out" });
  }, { scope: root, dependencies: [p] });
  const choose = (x: Profile) => {
    if (x === p) return;
    setP(x);
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
        <h2 id="cn-pv" className="x3-h2">Cuatro perspectivas. <em>Una sala.</em></h2>
        <div className="x3-pv-tabs" role="tablist" aria-label="Elegí tu perfil" style={{ "--i": PROFILES.indexOf(p) } as React.CSSProperties}>
          <span className="x3-pv-ind" aria-hidden="true" />
          {PROFILES.map((x, i) => (
            <button key={x} ref={(b) => { tabs.current[i] = b; }} role="tab" id={`pv-tab-${x}`} aria-selected={x === p} aria-controls="pv-panel" tabIndex={x === p ? 0 : -1}
              onClick={() => choose(x)} onKeyDown={(e) => onKey(e, i)}>{PROFILE_CONTENT[x].short}</button>
          ))}
        </div>
        <div id="pv-panel" role="tabpanel" aria-labelledby={`pv-tab-${p}`} className="x3-pv-panel" key={p}>
          <div className="x3-pv-head">
            <p className="x3-pv-who">{c.label}</p>
            <h3>{c.headline}</h3>
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
              <div className="x3-pv-act">
                {c.leadKind ? <a className="x3-btn pri" href="#contacto" onClick={() => track("contact_click", { profile: p, target: "perspectivas" })}>{c.cta} <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
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
