// Créditos de la música y los efectos de los films de /conoce (D208). La licencia CC BY 4.0 pide atribución «razonable según el
// medio»: en el sitio va acá, enlazada desde el pie de todas las páginas públicas, para que el reproductor muestre sólo qué hace
// cada film. Fuente: marketing/videos/LICENCIAS.md (mantener las dos listas iguales).
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/access/Wordmark";
import { SiteFooter } from "@/components/site/PublicSite";
import { VIDEOS } from "@/content/conoce";
import "@/styles/site.css";

export const viewport: Viewport = { themeColor: "var(--ui-text)" };
export const metadata: Metadata = { title: "Créditos · REPI", description: "Música y efectos de sonido de los videos de REPI." };

const BY = "https://creativecommons.org/licenses/by/4.0/deed.es";

export default function Creditos() {
  const films = Object.values(VIDEOS).filter((v) => v.music);
  return (
    <div className="st">
      <header className="st-head"><div className="st-wrap"><Link href="/" aria-label="REPI, inicio"><Wordmark width={72} /></Link></div></header>
      <main className="st-wrap lg" id="contenido">
        <h1>Créditos</h1>
        <p>Los videos de REPI no tienen voz: usan música instrumental con licencia para uso comercial y efectos de sonido libres.</p>
        <section>
          <h2>Música</h2>
          <p>
            Música de Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener noreferrer">incompetech.com</a>), con licencia{" "}
            <a href={BY} target="_blank" rel="noopener noreferrer">Creative Commons Atribución 4.0</a>. En cada video se usa un fragmento
            editado: recortado, con el volumen normalizado y sincronizado con la imagen.
          </p>
          <ul>{films.map((v) => <li key={v.id}><b>{v.title}</b>: «{v.music}», Kevin MacLeod.</li>)}</ul>
        </section>
        <section>
          <h2>Efectos de sonido</h2>
          <p>
            Efectos de <a href="https://pixabay.com/service/license-summary/" target="_blank" rel="noopener noreferrer">Pixabay</a> (Pixabay Content
            License, uso comercial sin atribución obligatoria).
          </p>
        </section>
        <Link className="lg-back" href="/conoce">← Volver a Conocé REPI</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
