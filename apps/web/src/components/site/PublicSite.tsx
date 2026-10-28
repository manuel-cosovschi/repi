// Sitio público (F-PU-01, D104). Sólo capacidades presentes y probadas (docs/comercial/ESTADO_Y_LIMITES.md): no promete
// tiendas, pagos, facturación ni funciones del roadmap, no publica precios (son por cliente) y no ofrece alta libre.
// Visitantes sin sesión en «/»; con sesión o desde el ícono instalado se sigue yendo directo a la app.
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { Barbell, Buildings, ChatCircle, Check, DeviceMobile, EnvelopeSimple, Lifebuoy, ShieldCheck, UserCircle, Wrench, Warning } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/access/Wordmark";
import { CONTACT, SUPPORT } from "@/lib/contact";
import { LeadForm } from "./LeadForm";

const I = ({ i: X, size = 22 }: { i: Icon; size?: number }) => <X size={size} weight="bold" aria-hidden="true" focusable="false" />;

const AUDIENCES: { id: string; icon: Icon; title: string; items: string[]; note: string }[] = [
  {
    id: "coaches", icon: Barbell, title: "Personal trainers",
    items: [
      "Invitás a tus alumnos con un enlace personal o importás tu lista desde una planilla; cada uno entra con su propia cuenta.",
      "Armás programas por días con series, repeticiones, RIR, descanso y notas, y los asignás.",
      "Ves lo que entrenan, cómo rinden, sus objetivos y un informe mensual; respondés pedidos y mensajes en un solo lugar.",
      "Agendás sesiones presenciales u online y tus alumnos las confirman.",
      "Registrás a mano los cobros a tus alumnos, separados de lo que pagás a REPI.",
    ],
    note: "El alumno decide qué información sensible comparte con vos.",
  },
  {
    id: "gimnasios", icon: Buildings, title: "Gimnasios",
    items: [
      "Cada sede tiene su QR: la persona pide acceso y el equipo autorizado confirma que es socia.",
      "Turnos, cola de asistencia y traspaso de pendientes para el equipo de sala, con aviso cuando un socio pide ayuda.",
      "Equipo por sede con permisos según el rol: dueño, gerencia, recepción y entrenadores.",
      "Novedades, desafíos y una comunidad en la que participar es voluntario.",
    ],
    note: "No reemplaza el sistema con el que cobrás las cuotas.",
  },
  {
    id: "alumnos", icon: UserCircle, title: "Alumnos y socios",
    items: [
      "Registrás cada serie con carga, repeticiones, RIR o RPE, el descanso y una nota si querés.",
      "Si una máquina está ocupada, cambiás o salteás el ejercicio sin tocar tu programa.",
      "¿No vino el profe? REPI te muestra la rutina que te toca hoy o te ayuda a seguir la que dejaste.",
      "Tu historial y tu progreso por ejercicio, siempre a mano.",
      "Se instala desde el navegador en la pantalla de inicio, sin tiendas.",
      "El entrenamiento que ya abriste sigue guardándose si te quedás sin señal.",
    ],
    note: "Descargás tus datos o pedís que se eliminen desde tu perfil.",
  },
];

const FAQ: [string, string][] = [
  ["¿Se paga por cada persona que descarga la app?", "No. El acuerdo contempla todos los socios del gimnasio o todos los alumnos vigentes del coach, según la cantidad acordada. Las activaciones sirven para ver la adopción, no son la base del precio."],
  ["¿Hay un precio fijo?", "No publicamos una lista de precios: el precio por socio o por alumno se acuerda con cada cliente y queda registrado con su moneda y fecha de efecto. Si cambia, lo ves en tu cuenta con el historial."],
  ["¿Puedo crear mi espacio ahora mismo?", "No hay alta libre para gimnasios ni coaches. Dejanos tus datos, acordamos alcance y condiciones, y el equipo de REPI habilita tu espacio y te envía la invitación de bienvenida."],
  ["¿Tengo que cargar el padrón completo de socios?", "No. Cada persona pide acceso con el QR de su sede y el equipo autorizado lo confirma. El gimnasio mantiene las altas, pausas y bajas."],
  ["¿Está en App Store o Google Play?", "Todavía no. REPI se usa desde el navegador y se agrega a la pantalla de inicio del teléfono como una app."],
  ["¿Cómo se paga REPI?", "Acordamos con vos el medio y la fecha de pago, y se paga por fuera de la app. Dentro de REPI no se cargan tarjetas ni se cobra nada."],
  ["¿REPI cobra a los alumnos o emite facturas?", "No procesamos pagos ni emitimos comprobantes fiscales. Los coaches pueden registrar a mano lo que cobran; registrar un pago no mueve dinero."],
  ["¿El entrenador ve todo lo del alumno?", "No. Cada relación tiene permisos y los datos sensibles se comparten sólo si la persona lo elige. El gimnasio no accede a los mensajes privados entre alumno y coach."],
];

export function PublicSite() {
  return (
    <div className="st">
      <a className="st-skip" href="#contenido">Saltar al contenido</a>
      <header className="st-head">
        <div className="st-wrap">
          <Link href="/" aria-label="REPI, inicio"><Wordmark width={72} /></Link>
          <nav className="st-nav" aria-label="Secciones">
            <a href="#coaches">Coaches</a><a href="#gimnasios">Gimnasios</a><a href="#alumnos">Alumnos</a><a href="#como-funciona">Cómo se contrata</a><a href="#soporte">Soporte</a><a href="#preguntas">Preguntas</a>
          </nav>
          <div className="st-head-cta">
            <Link className="st-btn ghost" href="/acceso">Ingresar</Link>
          </div>
        </div>
      </header>

      <main id="contenido">
        <section className="st-hero" aria-labelledby="st-title">
          <span className="st-hero-ring" aria-hidden="true" /><span className="st-hero-dot" aria-hidden="true" />
          <div className="st-wrap">
            <p className="st-kicker">Coaches · gimnasios · alumnos</p>
            <h1 id="st-title">Cada repetición cuenta.</h1>
            <p className="st-lead">REPI conecta a personal trainers, gimnasios y alumnos: programas, registro de cada serie y seguimiento real, con una sola cuenta y una app que se instala desde el navegador.</p>
            <div className="st-hero-cta">
              <a className="st-btn pri" href="#contacto">Hablar con REPI</a>
              <Link className="st-btn ghost" href="/demo">Probar la demo</Link>
            </div>
            <p className="st-hero-note">¿Te invitó tu coach o tu gimnasio? Abrí el enlace o el QR que te dieron, o <Link href="/acceso">ingresá a tu cuenta</Link>.</p>
          </div>
        </section>

        <section className="st-sec" aria-labelledby="st-para">
          <div className="st-wrap">
            <h2 id="st-para">Para quién es</h2>
            <p>Lo que hoy funciona en REPI, sin funciones prometidas a futuro.</p>
            <div className="st-grid">
              {AUDIENCES.map((x) => (
                <article key={x.id} id={x.id} className="st-card" aria-labelledby={`st-${x.id}`}>
                  <h3 id={`st-${x.id}`}><I i={x.icon} />{x.title}</h3>
                  <ul>{x.items.map((t) => <li key={t}><I i={Check} size={18} />{t}</li>)}</ul>
                  <small>{x.note}</small>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="st-sec" aria-labelledby="st-como">
          <div className="st-wrap">
            <h2 id="st-como">Cómo se contrata</h2>
            <p>Un acuerdo por cliente, con la cantidad y el precio a la vista desde el primer día.</p>
            <ol className="st-steps">
              <li><strong>Contacto</strong>Nos contás cómo trabajás: sedes, equipo o cantidad de alumnos.</li>
              <li><strong>Acuerdo</strong>Definimos alcance, cantidad de socios o alumnos y precio por cada uno.</li>
              <li><strong>Habilitación</strong>REPI registra el acuerdo, habilita tu espacio e invita al responsable.</li>
              <li><strong>Equipo</strong>Sumás a tu equipo; en un gimnasio, preparás las sedes y sus QR.</li>
              <li><strong>Alumnos</strong>Tus alumnos se suman con tu invitación; los socios, con el QR de su sede. Y empiezan a entrenar.</li>
            </ol>
            <div className="st-facts">
              <p className="st-fact"><I i={ShieldCheck} size={20} />Pagás por la cantidad de socios o alumnos acordada, usen o no la app. Ves tus condiciones y su historial en tu cuenta, y te avisamos cualquier cambio. El pago se acuerda con REPI y se hace por fuera de la app.</p>
              <p className="st-fact"><I i={DeviceMobile} size={20} />Sin descargas desde tiendas: cada persona agrega REPI a la pantalla de inicio de su teléfono con una guía para su dispositivo.</p>
            </div>
          </div>
        </section>

        <section id="contacto" className="st-sec" aria-labelledby="st-contacto">
          <div className="st-wrap st-contact">
            <div>
              <h2 id="st-contacto">Sumá REPI a tu trabajo</h2>
              <p style={{ margin: 0, color: "var(--dark-muted)", lineHeight: 1.55 }}>Dejanos tus datos y te escribimos para conocer tu operación. Si querés ver cómo funciona antes, la <Link className="st-link" href="/demo">demo</Link> usa datos ficticios y no necesita cuenta.</p>
              <ul className="st-direct" aria-label="Contacto directo">
                <li><I i={EnvelopeSimple} size={20} /><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
                <li><I i={ChatCircle} size={20} /><a href={CONTACT.whatsapp} target="_blank" rel="noreferrer">WhatsApp {CONTACT.phoneLabel}</a></li>
              </ul>
            </div>
            <LeadForm />
          </div>
        </section>

        <section id="soporte" className="st-sec" aria-labelledby="st-soporte">
          <div className="st-wrap">
            <h2 id="st-soporte">Soporte</h2>
            <p>Para gimnasios y coaches con acuerdo vigente. Los alumnos y socios nos escriben desde Ayuda, dentro o fuera de la app.</p>
            <div className="st-grid">
              <article className="st-card"><h3><I i={Warning} />Urgencias</h3><small>{SUPPORT.urgent}</small></article>
              <article className="st-card"><h3><I i={Lifebuoy} />Errores y consultas</h3><small>{SUPPORT.included}</small></article>
              <article className="st-card"><h3><I i={Wrench} />A medida</h3><small>{SUPPORT.custom}</small></article>
            </div>
          </div>
        </section>

        <section id="preguntas" className="st-sec" aria-labelledby="st-faq">
          <div className="st-wrap">
            <h2 id="st-faq">Preguntas frecuentes</h2>
            <div className="st-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="st-foot">
      <div className="st-wrap">
        <div className="st-foot-brand">
          <Wordmark width={56} />
          <span><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={CONTACT.whatsapp} target="_blank" rel="noreferrer">WhatsApp {CONTACT.phoneLabel}</a></span>
        </div>
        <nav aria-label="Enlaces del sitio">
          <Link href="/acceso">Ingresar</Link>
          <Link href="/demo">Demo</Link>
          <Link href="/instalar">Instalar la app</Link>
          <Link href="/ayuda">Ayuda</Link>
          <Link href="/legal/terms">Términos</Link>
          <Link href="/legal/privacy">Privacidad</Link>
          <Link href="/legal/dpa">Acuerdo para organizaciones</Link>
        </nav>
      </div>
      <div className="st-wrap st-sovare">
        <a href="https://sovare-panel.vercel.app" target="_blank" rel="noreferrer" aria-label="Sovare, el estudio que hace REPI">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sovare-isotipo.webp" alt="" width={30} height={36} />
          <span><small>Un producto de</small><strong>SOVARE</strong><em>From where we come. For what comes next.</em></span>
        </a>
        <span>© 2026 REPI</span>
      </div>
    </footer>
  );
}
