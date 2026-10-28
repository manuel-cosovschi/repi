// Documentos legales (F-PU-01, D104 → D109). Texto completo redactado sobre el funcionamiento real de la app; borrador
// pendiente de revisión legal y de los datos societarios del titular. La versión es la que se registra al aceptar.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TERMS_VERSION } from "@repi/domain";
import { Wordmark } from "@/components/access/Wordmark";
import { SiteFooter } from "@/components/site/PublicSite";
import { LEGAL } from "./texts";
import "@/styles/site.css";

type P = { params: Promise<{ doc: string }> };
const docOf = (k: string) => (k in LEGAL ? LEGAL[k as keyof typeof LEGAL] : null);

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = docOf((await params).doc);
  return { title: d ? `${d.title} · REPI` : "REPI" };
}

export default async function LegalPage({ params }: P) {
  const d = docOf((await params).doc);
  if (!d) notFound();
  return (
    <div className="st">
      <header className="st-head"><div className="st-wrap"><Link href="/" aria-label="REPI, inicio"><Wordmark width={72} /></Link></div></header>
      <main className="st-wrap lg" id="contenido">
        <h1>{d.title}</h1>
        <p className="lg-ver">Versión {TERMS_VERSION} · vigente desde el 27 de octubre de 2026</p>
        <p>{d.intro}</p>
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((x) => <p key={x}>{x}</p>)}
          </section>
        ))}
        <Link className="lg-back" href="/">← Volver al inicio</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
