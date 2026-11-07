// D206: preferencias del pedido de programa, como las ve quien lo atiende (equipo de sala o coach). Las lesiones van
// resaltadas. Sin preferencias (pedidos anteriores o creados por el gimnasio) se avisa que ya se le pidió a la persona.
export type BriefViewData = { rows: { label: string; value: string; alert?: boolean }[]; missing: boolean } | null | undefined;

export function BriefBlock({ brief, compact = false }: { brief: BriefViewData; compact?: boolean }) {
  if (!brief) return null;
  if (brief.missing) {
    return <p className="brief-missing" role="note">Sin preferencias todavía: le pedimos al socio que complete objetivo, días, experiencia y lesiones. Cuando lo haga, aparecen acá.</p>;
  }
  const rows = compact ? brief.rows.slice(0, 4) : brief.rows;
  return (
    <dl className={`brief${compact ? " compact" : ""}`} aria-label="Preferencias para el programa">
      {rows.map((r) => (
        <div key={r.label} className={r.alert ? "alert" : undefined}><dt>{r.label}</dt><dd>{r.value}</dd></div>
      ))}
    </dl>
  );
}
