// Informe mensual (F-CO-16, D96): vista imprimible desde datos persistidos. La misma pieza sirve al alumno (en su unidad
// de peso, con check-in) y al coach (en kg, sólo su relación). Sin datos suficientes lo dice; no inventa cifras.
import Link from "next/link";
import { fmtWeight, kgTo, volumeIn, type WeightUnit } from "@repi/domain";
import { Wordmark } from "@/components/access/Wordmark";
import type { MonthlyReport as Report } from "@/server/training/report";
import { PrintButton } from "./PrintButton";

const n = (x: number, d = 1) => x.toLocaleString("es-AR", { maximumFractionDigits: d });
const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return d.toISOString().slice(0, 7); };
const dayTxt = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function MonthlyReport({ r, unit, base, back, currentMonth }: { r: Report; unit: WeightUnit; base: string; back: { href: string; label: string }; currentMonth: string }) {
  const t = r.totals;
  const vol = (kg: number) => `${volumeIn(kg, unit).toLocaleString("es-AR")} ${unit}`;
  const diff = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} % vs. mes anterior` : "Sin mes anterior para comparar");
  const next = shiftMonth(r.month, 1);
  return (
    <div className="rp">
      <nav className="rp-tools" aria-label="Informe">
        <Link className="rp-btn" href={back.href}>← {back.label}</Link>
        <span className="rp-months">
          <Link className="rp-btn" href={`${base}mes=${shiftMonth(r.month, -1)}`} aria-label="Mes anterior">‹</Link>
          <b>{r.label}</b>
          {next <= currentMonth ? <Link className="rp-btn" href={`${base}mes=${next}`} aria-label="Mes siguiente">›</Link> : <span className="rp-btn" aria-hidden="true" style={{ visibility: "hidden" }}>›</span>}
        </span>
        <PrintButton />
      </nav>
      <article className="rp-doc">
        <header className="rp-head">
          <Wordmark width={64} />
          <span><small>Informe mensual</small><strong>{r.person}</strong><small>{r.label}{r.context ? ` · ${r.context.org}` : ""}</small></span>
        </header>

        {!t.sessions ? (
          <p className="rp-empty">Datos insuficientes: no hay entrenamientos completados en {r.label}.</p>
        ) : (
          <>
            <section className="rp-kpis" aria-label="Resumen del mes">
              <div><span>Entrenamientos</span><strong>{t.sessions}</strong><small>{r.previous.sessions ? `${r.previous.sessions} el mes anterior` : "Sin mes anterior para comparar"}</small></div>
              <div><span>Tiempo activo</span><strong>{Math.floor(t.activeMinutes / 60)} h {t.activeMinutes % 60} min</strong><small>{t.sets} series completadas</small></div>
              <div><span>Volumen</span><strong>{vol(t.volumeKg)}</strong><small>{diff(t.volumeKg, r.previous.volumeKg)}</small></div>
              <div><span>RPE promedio</span><strong>{t.avgRpe != null ? n(t.avgRpe) : "—"}</strong><small>{t.rpeCount ? `En ${t.rpeCount} de ${t.sessions} sesiones` : "No se registró RPE"}</small></div>
            </section>

            <section>
              <h2>Semanas</h2>
              <table className="rp-table">
                <thead><tr><th scope="col">Semana del</th><th scope="col">Entrenamientos</th><th scope="col">Volumen</th></tr></thead>
                <tbody>{r.weeks.map((w) => <tr key={w.from}><th scope="row">{dayTxt(w.from)}</th><td>{w.sessions}</td><td>{vol(w.volumeKg)}</td></tr>)}</tbody>
              </table>
            </section>

            <section>
              <h2>Ejercicios</h2>
              {!r.exercises.length ? <p className="rp-empty">Sin series registradas.</p> : (
                <table className="rp-table">
                  <thead><tr><th scope="col">Ejercicio</th><th scope="col">Series</th><th scope="col">Carga máx.</th><th scope="col">1RM estimado</th><th scope="col">Mes anterior</th></tr></thead>
                  <tbody>{r.exercises.map((e) => (
                    <tr key={e.name}>
                      <th scope="row">{e.name}<small>{e.group}</small></th>
                      <td>{e.sets}</td>
                      <td>{e.topKg == null ? "Peso corporal" : e.topKg > 0 ? fmtWeight(e.topKg, unit) : "Sin carga"}</td>
                      <td>{e.best ? `${n(kgTo(e.best.e1rm, unit))} ${unit}` : "—"}</td>
                      <td>{e.previous ? `${n(kgTo(e.previous.e1rm, unit))} ${unit}` : "Sin datos"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>

            {r.groups.length > 0 && (
              <section>
                <h2>Volumen por grupo muscular</h2>
                <table className="rp-table">
                  <tbody>{r.groups.map((g) => <tr key={g.group}><th scope="row">{g.group}</th><td>{vol(g.volumeKg)}</td></tr>)}</tbody>
                </table>
              </section>
            )}
          </>
        )}

        {r.checkins && (
          <section>
            <h2>Check-in</h2>
            {!r.checkins.count ? <p className="rp-empty">No hiciste check-ins este mes.</p> : (
              <p className="rp-line">{r.checkins.count} check-ins · energía {n(r.checkins.energy!)} · sueño {n(r.checkins.sleep!)} · ánimo {n(r.checkins.mood!)} (escala 1 a 5). Sólo lo ves vos.</p>
            )}
          </section>
        )}

        <footer className="rp-foot">
          <p>{r.formulas.volume} {r.formulas.e1rm} {r.formulas.rpe}</p>
          <p>Fuente: entrenamientos completados y registrados en REPI{r.context ? ` con ${r.context.coach ?? "el coach"} (${r.context.org})` : ""}. Mes en hora de Argentina. Generado el {new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(r.generatedAt))}.{unit === "lb" ? " Pesos en libras (registrados en kg)." : ""}</p>
        </footer>
      </article>
    </div>
  );
}
