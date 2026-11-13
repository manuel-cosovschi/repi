// REPI Experience 4.0 (/conoce): «The Living Gym» (docs/comercial/EXPERIENCE_4.md; evoluciona «La sala en vivo», EXPERIENCE_3.md).
// La página es la sala del gimnasio: un escenario fijo (3D con profundidad real, o el plano SVG según el equipo) y escenas que
// mueven la cámara, la recorren y la conectan. Conserva todo lo comercial de D205:
// perfiles por URL, demos reales, simulador con el motor real, formulario a REPI Admin, WhatsApp, QR/UTM y medición propia.
import Link from "next/link";
import { ArrowRight, ChatCircle, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/access/Wordmark";
import { SiteFooter } from "@/components/site/PublicSite";
import { FAQ, type HeroVariant } from "@/content/conoce";
import { CONTACT, waLink as wa } from "@/lib/contact";
import type { Profile } from "@/lib/site-events";
import { ContactForm } from "./ContactForm";
import { Tracker } from "./Tracker";
import { TrackLink } from "./TrackLink";
import { Stage } from "./sala/Stage";
import { FilmProvider } from "./x3/FilmPlayer";
import { Hero } from "./x3/Hero";
import { Problem } from "./x3/Problem";
import { Training } from "./x3/Training";
import { Perspectives } from "./x3/Perspectives";
import { Modes } from "./x3/Modes";
import { Connected } from "./x4/Connected";
import { Showcase } from "./x3/Showcase";
import { Demos } from "./x3/Demos";
import { Proof } from "./x3/Proof";
import { Finale } from "./x3/Finale";
import { SceneIndex } from "./x3/SceneIndex";
import { MotionToggle } from "./x3/motion";


export function ConoceHub({ profile, variant = "a" }: { profile: Profile | null; variant?: HeroVariant }) {
  return (
    <div className="st cn x3">
      <Tracker profile={profile} />
      {/* Sin JavaScript no hay encendido del hero: la sala se ve encendida desde el principio. */}
      <noscript dangerouslySetInnerHTML={{ __html: "<style>.sala-svg{opacity:1!important}</style>" }} />
      <Stage />
      <FilmProvider>
        <a className="st-skip" href="#contenido">Saltar al contenido</a>
        <header className="x3-head">
          <div className="x3-wrap x3-head-in">
            <Link href="/conoce" aria-label="REPI, presentación"><Wordmark width={64} /></Link>
            <nav className="x3-nav" aria-label="Secciones">
              <a href="#en-accion">En acción</a><a href="#perfiles">Para quién</a><a href="#modos">Modalidades</a><a href="#sala">La sala</a><a href="#funciones">Producto</a><a href="#demos">Demos</a><a href="#preguntas">Preguntas</a>
            </nav>
            <div className="x3-head-cta">
              <Link className="x3-head-link" href="/acceso">Ingresar</Link>
              <TrackLink event="contact_click" target="cabecera" className="x3-btn pri sm" href="#contacto">Pedir demo<ArrowRight size={16} weight="bold" aria-hidden="true" /></TrackLink>
            </div>
          </div>
        </header>
        <SceneIndex />
        <main id="contenido">
          <Hero variant={variant} />
          <Problem />
          <Training />
          <Perspectives initial={profile} />
          <Modes />
          <Connected />
          <Showcase />
          <Demos />
          <Proof />
          <Finale />
          <section id="contacto" className="x3-contact" data-shot="finale" data-solid="1" aria-labelledby="cn-contacto">
            <div className="x3-wrap x3-contact-grid">
              <div>
                <h2 id="cn-contacto" className="x3-h2">Hablemos de tu sala.</h2>
                <p className="x3-lead">Te mostramos REPI con tu caso y armamos una propuesta para tu gimnasio, tu trabajo o tu empresa.</p>
                <ul className="x3-direct" aria-label="Contacto directo">
                  <li><ChatCircle size={20} weight="bold" aria-hidden="true" /><TrackLink event="whatsapp_click" target="contacto" external href={wa("Hola, conocí REPI y quiero coordinar una demostración.")}>WhatsApp {CONTACT.phoneLabel}</TrackLink></li>
                  <li><EnvelopeSimple size={20} weight="bold" aria-hidden="true" /><TrackLink event="email_click" target="contacto" href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Quiero conocer REPI")}`}>{CONTACT.email}</TrackLink></li>
                </ul>
                <div className="x3-quick" aria-label="Mensajes rápidos por WhatsApp">
                  <TrackLink event="whatsapp_click" target="q-gimnasio" profile="gimnasios" external className="x3-btn ghost sm" href={wa("Hola, conocí REPI y me interesa implementarlo en mi gimnasio. Quisiera coordinar una demostración.")}>Consultar para mi gimnasio</TrackLink>
                  <TrackLink event="whatsapp_click" target="q-entrenador" profile="entrenadores" external className="x3-btn ghost sm" href={wa("Hola, soy entrenador personal y quiero usar REPI con mis alumnos. ¿Me cuentan cómo empezar?")}>Soy entrenador y quiero usarlo</TrackLink>
                  <TrackLink event="whatsapp_click" target="q-alianza" profile="aliados" external className="x3-btn ghost sm" href={wa("Hola, conocí REPI y me interesa conversar sobre una alianza o inversión. ¿Podemos coordinar una reunión?")}>Proponer una alianza</TrackLink>
                </div>
              </div>
              <ContactForm initial={profile} />
            </div>
            <div className="x3-wrap" id="preguntas">
              <h2 className="x3-h3">Preguntas frecuentes.</h2>
              <div className="x3-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
            </div>
          </section>
        </main>
        {/* La pausa de animaciones (WCAG 2.2.2) va en el pie, con su nombre escrito: arriba era un ícono que no se entendía. */}
        <SiteFooter><MotionToggle /></SiteFooter>
      </FilmProvider>
    </div>
  );
}
