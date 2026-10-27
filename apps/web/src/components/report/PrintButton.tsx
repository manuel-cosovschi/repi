"use client";
// «Guardar PDF» usa la impresión del navegador (Guardar como PDF): no hay generación de PDF en el servidor.
export function PrintButton() {
  return <button type="button" className="rp-btn pri" onClick={() => window.print()}>Guardar PDF o imprimir</button>;
}
