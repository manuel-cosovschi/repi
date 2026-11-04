import type { ReactNode } from "react";
import { Wordmark } from "./access/Wordmark";

// Superficie todavía no construida: muestra el contexto resuelto en servidor y la etapa del plan.
export function WorkspaceStub({ dark, title, context, stage, children }: { dark?: boolean; title: string; context: string; stage: string; children?: ReactNode }) {
  // D188: los colores salen del tema de la cuenta; `dark` sólo decide si hay barra lateral (diseño de escritorio).
  const ink = "var(--ui-text)";
  const muted = "var(--ui-muted)";
  return (
    <div style={{ minHeight: "100dvh", background: "var(--ui-page)", color: ink, display: "flex" }}>
      {!dark && <aside style={{ width: 248, background: "var(--ui-sidebar-bg)", padding: "24px 20px", flex: "none" }} className="stub-side"><Wordmark width={70} /></aside>}
      <main style={{ flex: 1, padding: "28px max(16px, 4vw) 48px", maxWidth: 880 }}>
        {dark && <Wordmark width={62} />}
        <p style={{ font: "500 11px var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase", color: dark ? "var(--ui-accent-2)" : "var(--ui-link)", margin: "24px 0 6px" }}>{context}</p>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-.02em" }}>{title}</h1>
        <p style={{ fontSize: 15, color: muted, lineHeight: 1.5, maxWidth: 560 }}>
          Ingresaste con permisos verificados en el servidor. Esta superficie se construye en {stage} (docs/IMPLEMENTATION_PLAN.md).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>{children}</div>
        <p style={{ marginTop: 32 }}><a href="/acceso?step=workspace" style={{ color: dark ? "var(--ui-link)" : "var(--ui-link)", fontWeight: 600 }}>Cambiar de espacio</a></p>
      </main>
      <style>{`@media (max-width: 767px){.stub-side{display:none}}`}</style>
    </div>
  );
}
