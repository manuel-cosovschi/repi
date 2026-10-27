// Documentos legales (F-PU-01, D104; D21 pendiente). Los textos definitivos no existen todavía: la página lo dice, muestra
// la versión que se registra al aceptar y resume sólo cómo funciona hoy la app. No inventa titular, plazos ni coberturas.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TERMS_VERSION } from "@repi/domain";
import { Wordmark } from "@/components/access/Wordmark";
import { SiteFooter } from "@/components/site/PublicSite";
import "@/styles/site.css";

const DOCS: Record<string, { title: string; summary: string[] }> = {
  terms: {
    title: "Términos y condiciones",
    summary: [
      "Cada persona usa REPI con su propia cuenta. Los gimnasios y coaches no crean contraseñas por vos ni deben pedírtelas.",
      "Para entrar a un gimnasio necesitás la aprobación de su equipo; para entrenar con un coach, su invitación.",
      "Los gimnasios y coaches contratan REPI con un acuerdo propio, con cantidad y precio por cliente. REPI no cobra cuotas de gimnasio ni procesa pagos.",
      "Las funciones disponibles son las que ves en la app. Lo que figura como «próximamente» no está incluido.",
    ],
  },
  privacy: {
    title: "Política de privacidad",
    summary: [
      "Tus entrenamientos, check-ins y registros son tuyos. Tu coach o tu gimnasio ven lo que corresponde a esa relación, y los datos sensibles sólo si elegís compartirlos.",
      "El gimnasio no accede a los mensajes privados entre vos y tu coach. Participar de la comunidad es voluntario.",
      "Desde Perfil › Tus datos descargás tus datos y pedís que se eliminen. El pedido lo tramita REPI y no corta tu acceso mientras tanto.",
      "Los videos y fotos se guardan en almacenamiento privado; sólo los ve quien tiene permiso.",
    ],
  },
  dpa: {
    title: "Acuerdo de tratamiento de datos para organizaciones",
    summary: [
      "Lo aceptan los responsables de gimnasios al activar su espacio.",
      "El gimnasio decide quién de su equipo accede a qué, por rol y por sede, y mantiene las altas, pausas y bajas de sus socios.",
      "REPI registra las acciones administrativas sensibles para poder revisarlas.",
    ],
  },
};

type P = { params: Promise<{ doc: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = DOCS[(await params).doc];
  return { title: d ? `${d.title} · REPI` : "REPI" };
}

export default async function LegalPage({ params }: P) {
  const d = DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <div className="st">
      <header className="st-head"><div className="st-wrap"><Link href="/" aria-label="REPI, inicio"><Wordmark width={72} /></Link></div></header>
      <main className="st-wrap lg" id="contenido">
        <h1>{d.title}</h1>
        <p className="lg-state" role="note">El texto completo está en preparación. La versión que hoy se registra al aceptar es <b>{TERMS_VERSION}</b>. Cuando se publique la versión definitiva, va a estar en esta página. Mientras tanto, este es un resumen de cómo funciona REPI hoy. No reemplaza el documento legal.</p>
        <h2>Cómo funciona hoy</h2>
        <ul>{d.summary.map((x) => <li key={x}>{x}</li>)}</ul>
        <h2>Consultas</h2>
        <p>Escribinos desde <Link className="st-link" href="/ayuda">Ayuda</Link>: llega al equipo de REPI aunque no puedas entrar a tu cuenta.</p>
        <Link className="lg-back" href="/">← Volver al inicio</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
