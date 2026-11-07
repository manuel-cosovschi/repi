// REPI Experience Hub (/conoce, D205): presentación comercial pública. Sin sesión ni datos reales; todo lo que muestra existe
// en el producto (content/conoce.ts). Islas cliente sólo donde hace falta: selector, demos, simulador, video, formulario.
import Link from "next/link";
import { ArrowRight, Brain, ChatCircle, CheckCircle, EnvelopeSimple, Lightning, MapPin, Sparkle, Target } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/access/Wordmark";
import { SiteFooter } from "@/components/site/PublicSite";
import { DEMOS, FAQ, FEATURES, STATUS_LABEL, STEPS, VIDEOS, VIDEO_ORDER } from "@/content/conoce";
import { CONTACT } from "@/lib/contact";
import type { Profile } from "@/lib/site-events";
import { ContactForm } from "./ContactForm";
import { DemoButton } from "./DemoButton";
import { IntelSim } from "./IntelSim";
import { Media } from "./Media";
import { ProfileExplorer } from "./ProfileExplorer";
import { StickyCta } from "./StickyCta";
import { Tracker } from "./Tracker";
import { TrackLink } from "./TrackLink";

const wa = (t: string) => `${CONTACT.whatsapp}?text=${encodeURIComponent(t)}`;

export function ConoceHub({ profile }: { profile: Profile | null }) {
  return (
    <div className="st cn">
      <Tracker profile={profile} />
      <a className="st-skip" href="#contenido">Saltar al contenido</a>
      <header className="st-head">
        <div className="st-wrap">
          <Link href="/conoce" aria-label="REPI, presentación"><Wordmark width={72} /></Link>
          <nav className="st-nav" aria-label="Secciones">
            <a href="#perfiles">Para quién</a><a href="#inteligencia">Inteligencia</a><a href="#videos">Videos</a><a href="#demos">Demos</a><a href="#funciones">Funciones</a><a href="#preguntas">Preguntas</a>
          </nav>
          <div className="st-head-cta">
            <Link className="st-btn ghost cn-hide-sm" href="/acceso">Ingresar</Link>
            <a className="st-btn pri" href="#contacto">Solicitar demo</a>
          </div>
        </div>
      </header>

      <main id="contenido">
        {/* 1 · Hero */}
        <section id="cn-hero" className="cn-hero" aria-labelledby="cn-title">
          <span className="st-hero-ring" aria-hidden="true" />
          <div className="st-wrap cn-hero-grid">
            <div>
              <p className="st-kicker">Entrenamiento inteligente · gimnasios · entrenadores · alumnos</p>
              <h1 id="cn-title">Cada repetición cuenta.</h1>
              <p className="cn-hero-sub">La plataforma que conecta gimnasios, entrenadores y alumnos alrededor de cada serie.</p>
              <p className="st-lead">Programas en el teléfono, registro de cada serie, un objetivo concreto para la próxima y seguimiento real para el equipo. Se usa desde el navegador, en cualquier celular.</p>
              <div className="st-hero-cta">
                <a className="st-btn pri" href="#perfiles">Explorá REPI <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
                <a className="st-btn ghost" href="#demos">Probar una demo</a>
              </div>
              <p className="cn-proof"><MapPin size={16} weight="bold" aria-hidden="true" /><span>En funcionamiento en <b>Smart Center Gym</b>, Mar del Plata.</span></p>
            </div>
            <figure className="cn-phone cn-hero-phone">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/conoce/shots/intelligence.webp" alt="REPI en el teléfono: la serie muestra Anterior, REPI recomienda y Real" width={390} height={844} fetchPriority="high" decoding="async" />
            </figure>
          </div>
        </section>

        {/* 2 · Perfiles */}
        <section id="perfiles" className="cn-sec cn-light" aria-labelledby="cn-perfiles">
          <div className="st-wrap">
            <h2 id="cn-perfiles">¿Qué querés conocer?</h2>
            <p className="cn-sub">Elegí tu perfil y te mostramos lo que REPI hace por vos, con su demo.</p>
            <ProfileExplorer initial={profile} />
          </div>
        </section>

        {/* 3 · Inteligencia */}
        <section id="inteligencia" className="cn-sec" aria-labelledby="cn-intel">
          <div className="st-wrap">
            <p className="st-kicker">Training Intelligence 2.0</p>
            <h2 id="cn-intel">Inteligencia que se explica.</h2>
            <p className="cn-sub dark">REPI mira lo que hiciste en la misma serie antes y te propone carga y repeticiones para hoy. Cada número trae su razón, y durante la sesión sólo mantiene o baja la exigencia: nunca te empuja a subir en el medio.</p>
            <div className="cn-intel-grid">
              <ol className="cn-intel-steps">
                <li><Target size={22} weight="bold" aria-hidden="true" /><div><b>Compara lo comparable</b><span>La misma serie, del mismo tipo y etapa: una serie de calentamiento nunca se compara con una de trabajo.</span></div></li>
                <li><Lightning size={22} weight="bold" aria-hidden="true" /><div><b>Propone y explica</b><span>«Completaste todas las series en el tope del rango: subí la carga y volvé a 8». Anterior, recomendado y real, lado a lado.</span></div></li>
                <li><CheckCircle size={22} weight="bold" aria-hidden="true" /><div><b>Se ajusta en la sesión</b><span>Si la serie costó más, mantiene o baja. Si marcás una molestia, no recomienda subir y sugiere consultar.</span></div></li>
                <li><Brain size={22} weight="bold" aria-hidden="true" /><div><b>Respeta al profe</b><span>Si tu entrenador fijó la carga, manda el plan. REPI no cambia programas por su cuenta.</span></div></li>
              </ol>
              <IntelSim />
            </div>
            <div className="cn-ai">
              <Sparkle size={22} weight="bold" aria-hidden="true" />
              <p><b>Y además, IA para el trabajo repetitivo.</b> El profe describe objetivo, días y limitaciones y REPI le arma un borrador de programa para revisar. Si no vino el profe, propone qué hacer hoy y se rearma si una máquina está ocupada. Y lee tu historial desde una planilla, una foto o un PDF. Nada se asigna solo, no recibe nombres ni datos de salud, y nada de esto es un diagnóstico.</p>
            </div>
          </div>
        </section>

        {/* 3b · Centro audiovisual: sólo videos que existen (grabaciones reales de la demo) */}
        {VIDEO_ORDER.some((k) => VIDEOS[k]?.src) && (
          <section id="videos" className="cn-sec cn-videos-sec" aria-labelledby="cn-videos">
            <div className="st-wrap">
              <h2 id="cn-videos">Mirá cómo funciona.</h2>
              <p className="cn-sub dark">Grabaciones reales de la app con datos de ejemplo. Se reproducen sólo si las tocás.</p>
              <div className="cn-video-row" role="list">
                {VIDEO_ORDER.filter((k) => VIDEOS[k]?.src).map((k) => (
                  <div key={k} role="listitem" className="cn-video-item"><Media video={VIDEOS[k]} shot={VIDEOS[k].poster ?? ""} alt="" /></div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 4 · Demos reales */}
        <section id="demos" className="cn-sec cn-light" aria-labelledby="cn-demos">
          <div className="st-wrap">
            <h2 id="cn-demos">No te lo contamos. Probalo.</h2>
            <p className="cn-sub">Demos guiadas sobre la app real, con un gimnasio y un coach ficticios. Sin cuenta, desde tu teléfono.</p>
            <div className="cn-demos">
              {DEMOS.map((d) => (
                <article key={d.role} className="cn-demo" aria-labelledby={`cn-d-${d.role}`}>
                  <div className="cn-demo-shot" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.shot} alt="" loading="lazy" decoding="async" width={390} height={844} />
                  </div>
                  <div className="cn-demo-body">
                    <h3 id={`cn-d-${d.role}`}>{d.title}</h3>
                    <p className="cn-demo-who">Sos {d.persona}.</p>
                    <ul>{d.sees.map((s) => <li key={s}><CheckCircle size={18} weight="bold" aria-hidden="true" />{s}</li>)}</ul>
                    <p className="cn-demo-meta"><span>Para: {d.forWho}</span><span>{d.steps} pasos guiados</span></p>
                    <DemoButton role={d.role} label="Iniciar demo" />
                  </div>
                </article>
              ))}
            </div>
            <p className="cn-fine center">Datos ficticios que se borran a las 6 horas. Nada afecta a gimnasios ni personas reales. La demo abre su propia sesión en este navegador: si ya usás REPI, volvé a ingresar después.</p>
          </div>
        </section>

        {/* 5 · Funciones */}
        <section id="funciones" className="cn-sec" aria-labelledby="cn-func">
          <div className="st-wrap">
            <h2 id="cn-func">Lo que REPI ya hace.</h2>
            <p className="cn-sub dark">Funciones disponibles hoy, cada una con su demo. Lo que todavía está en desarrollo lo decimos.</p>
            <p className="cn-swipe" aria-hidden="true">Deslizá para ver las {FEATURES.length} funciones →</p>
            <div className="cn-features" role="region" aria-label="Funciones de REPI" tabIndex={0}>
              {FEATURES.map((f) => (
                <article key={f.id} id={`f-${f.id}`} className="cn-feature" aria-labelledby={`cn-f-${f.id}`}>
                  <Media video={f.video ? VIDEOS[f.video] : null} shot={f.shot} alt={f.shotAlt} phone={false} compact />
                  <div className="cn-feature-body">
                    <span className={`cn-chip ${f.status}`}>{STATUS_LABEL[f.status]}</span>
                    <h3 id={`cn-f-${f.id}`}>{f.title}</h3>
                    <p className="cn-feature-v">{f.value}</p>
                    <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
                    {f.note && <p className="cn-fine">{f.note}</p>}
                    {f.demo && <DemoButton role={f.demo} label="Verla en la demo" className="cn-btn ghost sm" target={`f-${f.id}`} />}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 6 · Caso real */}
        <section id="caso" className="cn-sec cn-light" aria-labelledby="cn-caso">
          <div className="st-wrap cn-case">
            <div>
              <p className="cn-kicker dark">Caso real</p>
              <h2 id="cn-caso">Smart Center Gym, Mar del Plata.</h2>
            </div>
            <div>
              <p>REPI está en funcionamiento en Smart Center Gym. Sus socios piden acceso con el QR de la sede, el equipo los aprueba y entrenan con su rutina en el teléfono, incluida la que ya tenían antes de REPI.</p>
              <p className="cn-fine">Sin cifras ni testimonios inventados: cuando el gimnasio comparta resultados, los vas a ver acá.</p>
            </div>
          </div>
        </section>

        {/* 7 · Cómo se empieza */}
        <section id="empezar" className="cn-sec cn-light cn-tight" aria-labelledby="cn-empezar">
          <div className="st-wrap">
            <h2 id="cn-empezar">Cómo se empieza.</h2>
            <p className="cn-sub">Sin instalar equipos ni cargar padrones. Un acuerdo por cliente, con cantidad y precio a la vista.</p>
            <ol className="cn-steps">{STEPS.map(([t, d]) => <li key={t}><strong>{t}</strong>{d}</li>)}</ol>
          </div>
        </section>

        {/* 8 · Preguntas */}
        <section id="preguntas" className="cn-sec" aria-labelledby="cn-faq">
          <div className="st-wrap">
            <h2 id="cn-faq">Preguntas frecuentes.</h2>
            <div className="st-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
          </div>
        </section>

        {/* 9 · Contacto */}
        <section id="contacto" className="cn-sec cn-contact-sec" aria-labelledby="cn-contacto">
          <div className="st-wrap st-contact">
            <div>
              <h2 id="cn-contacto">Solicitá una demo de REPI.</h2>
              <p className="cn-sub dark">Te mostramos REPI con tu caso y armamos una propuesta para tu gimnasio, tu trabajo o tu empresa.</p>
              <ul className="st-direct" aria-label="Contacto directo">
                <li><ChatCircle size={20} weight="bold" aria-hidden="true" /><TrackLink event="whatsapp_click" target="contacto" external href={wa("Hola, conocí REPI y quiero coordinar una demostración.")}>WhatsApp {CONTACT.phoneLabel}</TrackLink></li>
                <li><EnvelopeSimple size={20} weight="bold" aria-hidden="true" /><TrackLink event="email_click" target="contacto" href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Quiero conocer REPI")}`}>{CONTACT.email}</TrackLink></li>
              </ul>
              <div className="cn-quick" aria-label="Mensajes rápidos por WhatsApp">
                <TrackLink event="whatsapp_click" target="q-gimnasio" profile="gimnasios" external className="cn-chip-link" href={wa("Hola, conocí REPI y me interesa implementarlo en mi gimnasio. Quisiera coordinar una demostración.")}>Consultar para mi gimnasio</TrackLink>
                <TrackLink event="whatsapp_click" target="q-entrenador" profile="entrenadores" external className="cn-chip-link" href={wa("Hola, soy entrenador personal y quiero usar REPI con mis alumnos. ¿Me cuentan cómo empezar?")}>Soy entrenador y quiero usarlo</TrackLink>
                <TrackLink event="whatsapp_click" target="q-alianza" profile="aliados" external className="cn-chip-link" href={wa("Hola, conocí REPI y me interesa conversar sobre una alianza o inversión. ¿Podemos coordinar una reunión?")}>Proponer una alianza</TrackLink>
              </div>
            </div>
            <ContactForm initial={profile} />
          </div>
        </section>
      </main>

      <SiteFooter />
      <StickyCta />
    </div>
  );
}
