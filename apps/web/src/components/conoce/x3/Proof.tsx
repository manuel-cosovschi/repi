// Escena 07 · Caso real. Un momento calmo y creíble, en crema: Smart Center Gym (logo autorizado por el gimnasio el 07/11/2026),
// qué usa y cómo empezó. Sin cifras ni testimonios: cuando el gimnasio comparta resultados, se van a ver acá.
import { STEPS } from "@/content/conoce";

export function Proof() {
  return (
    <section id="caso" className="x3-proof" data-shot="finale" data-solid="1" aria-labelledby="cn-caso">
      <div className="x3-wrap x3-proof-grid">
        <div>
          <h2 id="cn-caso" className="x3-h2 ink">Funciona en una sala real.</h2>
          <span className="x3-proof-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/conoce/smart-center-gym.webp" alt="Smart Center Gym" width={260} height={70} loading="lazy" decoding="async" />
          </span>
          <p className="x3-proof-place">Smart Center Gym · Mar del Plata</p>
        </div>
        <div className="x3-proof-text">
          <p>Sus socios piden acceso con el QR de la sede, el equipo los aprueba y entrenan con su rutina en el teléfono, incluida la que ya tenían antes de REPI. El equipo de sala recibe los pedidos de ayuda y los profes ven cómo entrena cada uno.</p>
          <p className="x3-fine">Sin cifras ni testimonios inventados: cuando el gimnasio comparta resultados, los vas a ver acá.</p>
        </div>
      </div>
      <div className="x3-wrap">
        <h3 className="x3-h3 ink" id="empezar">Cómo se empieza.</h3>
        <ol className="x3-steps">{STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
      </div>
    </section>
  );
}
