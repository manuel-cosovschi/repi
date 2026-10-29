// Lo que busca entrenando la persona (D139), visto por quien arma su rutina (D147). Sólo llega si ella eligió compartirlo.
export type SharedWishesView = { goal: string | null; daysPerWeek: number | null; minutes: number | null; likes: string | null; avoid: string | null };

export function SharedWishes({ w, who }: { w: SharedWishesView | null | undefined; who: string }) {
  if (!w) return null;
  const time = [w.daysPerWeek ? `${w.daysPerWeek} día${w.daysPerWeek === 1 ? "" : "s"} por semana` : null, w.minutes ? `${w.minutes} min por día` : null].filter(Boolean).join(" · ");
  return (
    <section className="card" aria-label="Lo que busca entrenando">
      <h2 style={{ margin: 0, fontSize: 16 }}>Lo que busca entrenando</h2>
      <span className="muted" style={{ fontSize: 13 }}>{who} lo compartió con quien arma su rutina. Lo puede cambiar o dejar de compartir desde su perfil.</span>
      {w.goal && <span><b>Objetivo:</b> {w.goal}</span>}
      {time && <span><b>Tiempo:</b> {time}</span>}
      {w.likes && <span><b>Le gusta:</b> {w.likes}</span>}
      {w.avoid && <span><b>Prefiere evitar:</b> {w.avoid}</span>}
    </section>
  );
}
