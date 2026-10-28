// Piezas de las guías de uso (Admin, Gym, Coach; D114–D115). Texto estático: los rótulos citados entre «» tienen que
// coincidir con los botones reales de cada pantalla.
export type GuideStep = { t: string; d: string };

export const GuideSteps = ({ items }: { items: GuideStep[] }) => (
  <ol className="ag-steps">{items.map((s) => <li key={s.t}><b>{s.t}</b><span>{s.d}</span></li>)}</ol>
);

export const GuideDefs = ({ items }: { items: [string, string][] }) => (
  <dl>{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
);

export const GuideCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card ag"><h2>{title}</h2>{children}</section>
);
