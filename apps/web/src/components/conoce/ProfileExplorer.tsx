"use client";
// Selector de perfil de /conoce (D205). Un solo componente para los cuatro recorridos: cambia el contenido sin recargar y deja
// la URL del perfil (/conoce/<perfil>) para compartirla o usarla en campañas. Contenido en content/conoce.ts.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Barbell, Briefcase, Buildings, ChatCircle, Check, PersonSimpleRun, type Icon } from "@phosphor-icons/react";
import { DEMOS, PROFILE_CONTENT, VIDEOS } from "@/content/conoce";
import { CONTACT } from "@/lib/contact";
import { PROFILES, type Profile } from "@/lib/site-events";
import { track } from "@/lib/site-track";
import { DemoButton } from "./DemoButton";
import { Media } from "./Media";
import { TrackLink } from "./TrackLink";

const ICON: Record<Profile, Icon> = { gimnasios: Buildings, entrenadores: Barbell, deportistas: PersonSimpleRun, aliados: Briefcase };
export const wa = (text: string) => `${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
/** Avisa al formulario qué perfil eligió la persona (para preseleccionar el tipo de consulta). */
export const announceInterest = (p: Profile, meeting = false) => window.dispatchEvent(new CustomEvent("repi:interest", { detail: { profile: p, meeting } }));

export function ProfileExplorer({ initial }: { initial: Profile | null }) {
  const [sel, setSel] = useState<Profile | null>(initial);
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (initial) announceInterest(initial); }, [initial]);

  const choose = (p: Profile, focusPanel = true) => {
    setSel(p);
    track("profile_select", { profile: p });
    announceInterest(p);
    try { history.replaceState(history.state, "", `/conoce/${p}${location.search}`); } catch { /* */ }
    if (focusPanel) requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + PROFILES.length) % PROFILES.length;
    tabs.current[j]?.focus();
    choose(PROFILES[j], false);
  };

  const c = sel ? PROFILE_CONTENT[sel] : null;
  const demo = c ? DEMOS.find((d) => d.role === c.demo)! : null;
  return (
    <>
      <div className="cn-picker" role="tablist" aria-label="¿Qué querés conocer?">
        {PROFILES.map((p, i) => {
          const X = ICON[p];
          return (
            <button key={p} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`cn-tab-${p}`} aria-selected={sel === p} aria-controls="cn-panel"
              tabIndex={sel ? (sel === p ? 0 : -1) : 0} className="cn-pick" onClick={() => choose(p)} onKeyDown={(e) => onKey(e, i)}>
              <span className="cn-pick-ic" aria-hidden="true"><X size={24} weight="bold" /></span>
              <span className="cn-pick-t">{PROFILE_CONTENT[p].label}</span>
              <ArrowRight size={18} weight="bold" aria-hidden="true" className="cn-pick-go" />
            </button>
          );
        })}
      </div>

      {c && demo && (
        <div ref={panel} id="cn-panel" role="tabpanel" aria-labelledby={`cn-tab-${c.id}`} className="cn-panel" tabIndex={-1} key={c.id}>
          <div className="cn-panel-main">
            <p className="cn-kicker">{c.kicker}</p>
            <h3 className="cn-panel-h">{c.headline}</h3>
            <p className="cn-panel-intro">{c.intro}</p>
            <div className="cn-ps">
              <div><h4>El problema</h4><p>{c.problem}</p></div>
              <div><h4>Cómo lo resuelve REPI</h4><ul>{c.solution.map((s) => <li key={s}><Check size={18} weight="bold" aria-hidden="true" />{s}</li>)}</ul></div>
            </div>
            <div className="cn-benefits">
              {c.benefits.map((b) => <div key={b.title} className="cn-benefit"><h4>{b.title}</h4><p>{b.text}</p></div>)}
            </div>
            <div className="cn-panel-cta">
              <DemoButton role={c.demo} profile={c.id} label="Probar la demo guiada" />
              {c.leadKind ? (
                <a className="cn-btn ghost" href="#contacto" onClick={() => { track("contact_click", { profile: c.id, target: "panel" }); announceInterest(c.id, c.id === "aliados"); if (c.id === "aliados") track("meeting_request", { profile: c.id, target: "panel" }); }}>
                  {c.id === "aliados" ? "Agendar una reunión" : c.cta}
                </a>
              ) : (
                <a className="cn-btn ghost" href="/acceso">Ya tengo REPI: ingresar</a>
              )}
              <TrackLink event="whatsapp_click" profile={c.id} target={c.id} href={wa(c.whatsapp)} external className="cn-btn wa">
                <ChatCircle size={18} weight="bold" aria-hidden="true" />{c.id === "deportistas" ? c.cta : "Hablar por WhatsApp"}
              </TrackLink>
            </div>
          </div>
          <div className="cn-panel-media">
            <Media video={VIDEOS[c.video]} shot={demo.shot} alt={`Captura real de la demo: ${demo.persona}`} profile={c.id} />
            <p className="cn-fine">Captura de la demo guiada con datos ficticios.</p>
          </div>
        </div>
      )}
    </>
  );
}
