// Escena 07 · En gimnasios reales. Pedido del titular (07/11): REPI se presenta por lo que hace en varios gimnasios de la zona y
// Smart Center Gym (logo autorizado por el gimnasio el 07/11/2026) aparece una sola vez, como caso de éxito, en un panel oscuro
// donde su logo (blanco y verde) se ve. Sin cifras ni testimonios: cuando un gimnasio comparta resultados, se suman acá.
import { STEPS } from "@/content/conoce";

export function Proof() {
  return (
    <section id="caso" className="x3-proof" data-shot="finale" data-solid="1" aria-labelledby="cn-caso">
      <div className="x3-wrap x3-proof-grid">
        <div>
          <h2 id="cn-caso" className="x3-h2 ink">Ya funciona en <em>gimnasios de la zona.</em></h2>
          <div className="x3-proof-text">
            <p>REPI está en funcionamiento en varios gimnasios de Mar del Plata. Los socios piden acceso con el QR de su sede, el equipo los aprueba y entrenan con su rutina en el teléfono, incluida la que ya tenían. El equipo de sala recibe los pedidos de ayuda y los profes ven cómo entrena cada uno.</p>
          </div>
        </div>
        <figure className="x3-case">
          <figcaption className="x3-case-k">Caso de éxito</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/conoce/smart-center-gym.webp" alt="Smart Center Gym" width={260} height={70} loading="lazy" decoding="async" />
          <p>En Smart Center Gym, Mar del Plata, los socios entrenan con su programa en el teléfono y piden ayuda al equipo de sala desde su serie.</p>
        </figure>
      </div>
      <div className="x3-wrap">
        <h3 className="x3-h3 ink" id="empezar">Cómo se empieza.</h3>
        <ol className="x3-steps">{STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
      </div>
    </section>
  );
}
