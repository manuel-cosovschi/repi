// Cartel imprimible A4 con el QR de instalación (D115). Lo imprime el gimnasio o el coach: un solo QR para todos
// (alumnos, socios, coaches y equipo) que abre /instalar con los pasos de su teléfono. El QR apunta siempre a la
// dirección pública, no al entorno donde se genera. Para el alta de socios de un gimnasio se usa el QR de cada sede.
import type { Metadata } from "next";
import { renderSVG } from "uqr";
import { SITE } from "@/lib/contact";
import "@/styles/poster.css";

export const metadata: Metadata = { title: "Cartel para instalar · REPI", robots: { index: false } };

export default function InstallPoster() {
  const qr = renderSVG(SITE.install, { border: 0 });
  return (
    <main className="pst">
      <div className="pst-glow" aria-hidden="true" />
      <header className="pst-top">
        <span className="wm" role="img" aria-label="repi" style={{ width: 150 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wm_full.png" alt="" width={315} height={154} /><i />
        </span>
        <span className="pst-kicker">Cada repetición cuenta.</span>
      </header>
      <h1>Llevá REPI<br />en tu teléfono</h1>
      <p className="pst-sub">Escaneá con la cámara y seguí los pasos. Sin tiendas de apps: se agrega a tu pantalla de inicio en menos de un minuto.</p>
      <div className="pst-qr" role="img" aria-label={`Código QR a ${SITE.install}`} dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="pst-url">{SITE.install.replace("https://", "")}</p>
      <section className="pst-steps" aria-label="Pasos">
        <div>
          <h2>iPhone · Safari</h2>
          <ol><li>Tocá <b>Compartir</b> (cuadrado con flecha)</li><li>Elegí <b>Agregar a inicio</b></li><li>Tocá <b>Agregar</b></li></ol>
        </div>
        <div>
          <h2>Android · Chrome</h2>
          <ol><li>Tocá el menú <b>⋮</b></li><li>Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b></li><li>Confirmá con <b>Instalar</b></li></ol>
        </div>
      </section>
      <footer className="pst-foot">Para alumnos, socios, coaches y equipos de gimnasio · Después abrís REPI desde el ícono e ingresás con tu email.</footer>
    </main>
  );
}
