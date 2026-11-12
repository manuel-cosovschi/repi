// Lo que busca entrenando la persona (D139), visto por quien arma su rutina (D147). Sólo llega si ella eligió compartirlo.
// D217: el perfil de entrenamiento suma experiencia declarada, días preferidos, distribución, equipamiento, ejercicios
// preferidos y que no le gustan y restricciones que no son de salud; cada uno se muestra sólo si está declarado.
export type SharedWishesView = {
  goal: string | null; daysPerWeek: number | null; minutes: number | null; likes: string | null; avoid: string | null;
  experience?: string; weekdays?: string; split?: string; equipment?: string; favorites?: string; dislikes?: string; limits?: string;
};

export function SharedWishes({ w, who }: { w: SharedWishesView | null | undefined; who: string }) {
  if (!w) return null;
  const time = [w.daysPerWeek ? `${w.daysPerWeek} día${w.daysPerWeek === 1 ? "" : "s"} por semana` : null, w.minutes ? `${w.minutes} min por día` : null].filter(Boolean).join(" · ");
  const rows: [string, string | null | undefined][] = [
    ["Objetivo", w.goal],
    ["Experiencia (declarada)", w.experience],
    ["Tiempo", time],
    ["Días que prefiere", w.weekdays],
    ["Cómo repartir la semana", w.split],
    ["Equipamiento", w.equipment],
    ["Ejercicios preferidos", w.favorites],
    ["No le gustan", w.dislikes],
    ["Le gusta", w.likes],
    ["Prefiere evitar", w.avoid],
    ["Restricciones (no de salud)", w.limits],
  ];
  return (
    <section className="card" aria-label="Lo que busca entrenando">
      <h2 style={{ margin: 0, fontSize: 16 }}>Lo que busca entrenando</h2>
      <span className="muted" style={{ fontSize: 13 }}>{who} lo compartió con quien arma su rutina. Lo puede cambiar o dejar de compartir desde su perfil.</span>
      {rows.filter(([, v]) => !!v).map(([k, v]) => <span key={k}><b>{k}:</b> {v}</span>)}
    </section>
  );
}
