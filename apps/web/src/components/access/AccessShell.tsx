import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

// Composición de REPI Acceso: panel de marca (≥900px) + columna de formulario.
export function AccessShell({ children }: { children: ReactNode }) {
  return (
    <div className="ac">
      <aside className="ac-brand" aria-hidden="false">
        <Wordmark width={83} />
        <div className="ac-brand-claim">
          <strong>Cada repetición cuenta.</strong>
          <span>Entrená, entrená a otros o gestioná tu gimnasio con la misma cuenta.</span>
        </div>
        <span className="ac-brand-foot">© REPI · Términos · Privacidad</span>
        <div className="ac-brand-ring" aria-hidden="true" />
        <div className="ac-brand-dot" aria-hidden="true" />
      </aside>
      <main className="ac-main">{children}</main>
    </div>
  );
}
