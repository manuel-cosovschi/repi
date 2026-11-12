"use client";
// D217 · Progress Intelligence 2.0: tarjetas de rendimiento de UN ejercicio. Cada tarjeta es un solo concepto y nunca se
// mezclan en una cifra: A (lo realmente registrado), B (estimaciones, siempre dicho), C (la propuesta de Training
// Intelligence para la próxima sesión, nunca una garantía). Las metas (D) van aparte (ProgressIntelGoals).
import { isActivityProfile, nextText, type WeightUnit } from "@repi/domain";
import { Skel } from "@/components/motion/Skeleton";
import { Explain, SourceBadges, dayTxt, n1, secTxt, wFmt, type PI } from "./ProgressIntelShared";

export const CARD_IDS = { max: "pgi-card-max", best: "pgi-card-best", next: "pgi-card-next", goals: "pgi-goals" } as const;

type Vs = "record" | "near" | "below";
const VS_TXT: Record<Vs, string> = { record: "Récord", near: "Cerca de tu récord", below: "Por debajo de tu récord" };
const vsOf = (recent: number | null, best: number | null): Vs | null =>
  recent == null || best == null || best <= 0 ? null : recent >= best ? "record" : recent >= best * 0.9 ? "near" : "below";

function VsChip({ vs }: { vs: Vs | null }) {
  if (!vs) return null;
  return <span className={`hx-chip${vs === "record" ? " pgi-ok" : vs === "below" ? " pgi-low" : ""}`}>{VS_TXT[vs]}</span>;
}

/** La frase de la propuesta (C) en la unidad elegida: misma cifra que el entrenamiento y el cerebro. */
export function nextLine(pi: PI, unit: WeightUnit): string | null {
  const n = pi.next;
  if (!n?.proposal) return null;
  const last = n.used[n.used.length - 1] ?? null;
  return nextText(last ? { w: last.w, r: last.r } : null, n.proposal, wFmt(unit)) ?? n.text;
}

export function PerfCards({ pi, unit, onOpenSession }: { pi: PI; unit: WeightUnit; onOpenSession: (id: string) => void }) {
  const fmt = wFmt(unit);
  const weeks = Math.round(pi.recent.days / 7);
  const act = isActivityProfile(pi.exercise.profile);
  const see = (id: string | null | undefined) => id ? <button type="button" className="linkbtn pgi-see" onClick={() => onOpenSession(id)}>Ver el entrenamiento</button> : null;
  return (
    <div className="pgi-cards">
      {pi.metric === "load" && (
        <>
          <article className="pgi-card" id={CARD_IDS.max} tabIndex={-1} aria-labelledby="pgi-h-max">
            <h3 id="pgi-h-max">Mayor carga registrada</h3>
            {pi.max ? <>
              <strong>{fmt(pi.max.w)}</strong>
              <small>× {pi.max.r} {pi.max.r === 1 ? "repetición" : "repeticiones"} · {dayTxt(pi.max.day)}</small>
              <SourceBadges source={pi.max.source} approx={pi.max.approx} />
              {see(pi.max.sessionId)}
            </> : <small>Todavía sin series con carga.</small>}
          </article>
          <article className="pgi-card" id={CARD_IDS.best} tabIndex={-1} aria-labelledby="pgi-h-best">
            <h3 id="pgi-h-best">Mejor serie</h3>
            {pi.bestSet ? <>
              <strong>{fmt(pi.bestSet.w)} × {pi.bestSet.r}</strong>
              <small>{dayTxt(pi.bestSet.day)}</small>
              <SourceBadges source={pi.bestSet.source} approx={pi.bestSet.approx} />
              <Explain>{pi.bestSet.criterion}</Explain>
            </> : <small>Hace falta una serie de trabajo de 1 a 12 repeticiones con carga.</small>}
          </article>
          <article className="pgi-card" aria-labelledby="pgi-h-e1rm">
            <h3 id="pgi-h-e1rm">1RM estimado</h3>
            {pi.e1rm ? <>
              <strong>{fmt(pi.e1rm.value)}</strong>
              <small>Estimación (Epley), no es una repetición que hiciste.</small>
              <Explain>
                <p>{pi.e1rm.method}</p>
                <p>Desde tu serie de {fmt(pi.e1rm.from.w)} × {pi.e1rm.from.r} ({dayTxt(pi.e1rm.from.day)}).</p>
                <p>{pi.e1rm.limits}</p>
              </Explain>
            </> : <small>Sin series para estimarlo.</small>}
          </article>
          <article className="pgi-card" aria-labelledby="pgi-h-recent">
            <h3 id="pgi-h-recent">Últimas {weeks} semanas</h3>
            {pi.recent.bestSet ? <>
              <strong>{fmt(pi.recent.bestSet.w)} × {pi.recent.bestSet.r}</strong>
              <small>Mejor serie reciente · {dayTxt(pi.recent.bestSet.day)}</small>
              <span className="pgi-badges"><VsChip vs={pi.recent.vsRecord as Vs | null} /></span>
              <Explain>Se compara el 1RM estimado de tu mejor serie de las últimas {weeks} semanas con el de tu mejor serie de todo el historial. «Cerca» es hasta un 5 % por debajo. Lo importado con fecha aproximada no cuenta acá.</Explain>
            </> : <small>Sin series en las últimas {weeks} semanas.</small>}
          </article>
        </>
      )}
      {pi.metric === "reps" && (
        <>
          <article className="pgi-card" id={CARD_IDS.max} tabIndex={-1} aria-labelledby="pgi-h-max">
            <h3 id="pgi-h-max">Más repeticiones en una serie</h3>
            {pi.bestReps ? <>
              <strong>{pi.bestReps.reps} reps</strong>
              <small>{dayTxt(pi.bestReps.day)} · sin carga externa</small>
              <SourceBadges source={pi.bestReps.source} approx={pi.bestReps.approx} />
              {see(pi.bestReps.sessionId)}
            </> : <small>Todavía sin series registradas.</small>}
          </article>
          <article className="pgi-card" aria-labelledby="pgi-h-recent">
            <h3 id="pgi-h-recent">Últimas {weeks} semanas</h3>
            {pi.recent.bestReps != null ? <>
              <strong>{pi.recent.bestReps} reps</strong>
              <small>Mejor serie reciente</small>
              <span className="pgi-badges"><VsChip vs={vsOf(pi.recent.bestReps, pi.bestReps?.reps ?? null)} /></span>
              <Explain>Tu mejor serie de las últimas {weeks} semanas contra la mejor de todo tu historial. «Cerca» es hasta un 10 % por debajo.</Explain>
            </> : <small>Sin series en las últimas {weeks} semanas.</small>}
          </article>
        </>
      )}
      {pi.metric === "time" && (
        <>
          <article className="pgi-card" id={CARD_IDS.max} tabIndex={-1} aria-labelledby="pgi-h-max">
            <h3 id="pgi-h-max">{act ? "Duración más larga" : "Mejor tiempo"}</h3>
            {pi.bestTime ? <>
              <strong>{secTxt(pi.bestTime.sec)}</strong>
              <small>{dayTxt(pi.bestTime.day)}</small>
              <SourceBadges source={pi.bestTime.source} approx={pi.bestTime.approx} />
              {see(pi.bestTime.sessionId)}
            </> : <small>Todavía sin series registradas.</small>}
          </article>
          <article className="pgi-card" aria-labelledby="pgi-h-recent">
            <h3 id="pgi-h-recent">Últimas {weeks} semanas</h3>
            {pi.recent.bestTime != null ? <>
              <strong>{secTxt(pi.recent.bestTime)}</strong>
              <small>Lo mejor reciente</small>
              <span className="pgi-badges"><VsChip vs={vsOf(pi.recent.bestTime, pi.bestTime?.sec ?? null)} /></span>
              <Explain>Lo mejor de las últimas {weeks} semanas contra lo mejor de todo tu historial. «Cerca» es hasta un 10 % por debajo.</Explain>
            </> : <small>Sin registros en las últimas {weeks} semanas.</small>}
          </article>
        </>
      )}
      <NextCard pi={pi} unit={unit} />
    </div>
  );
}

/** C: la próxima carga de trabajo (propuesta de Training Intelligence). Nunca una garantía ni un cambio aplicado. */
function NextCard({ pi, unit }: { pi: PI; unit: WeightUnit }) {
  const pr = pi.next?.proposal ?? null;
  const txt = nextLine(pi, unit);
  return (
    <article className="pgi-card wide" id={CARD_IDS.next} tabIndex={-1} aria-labelledby="pgi-h-next">
      <h3 id="pgi-h-next">Próxima sesión{pr?.requiresCoach && <span className="hx-chip">Propuesta para tu entrenador</span>}</h3>
      {txt ? <p className="pgi-text">{txt}</p>
        : <p className="pgi-text mb-muted">{pi.next?.trend.kind === "insufficient" || !pi.next ? "Todavía no hay sesiones comparables suficientes para proponer una carga. Seguí registrando tus series." : pi.next.trend.text}</p>}
      {pr && <Explain label="¿De dónde sale?"><p>{pr.basis}</p><p>Es una propuesta de REPI con tus sesiones comparables: no se aplica sola{pi.next?.coachOwned ? " y no cambia lo que programó tu entrenador" : ""}.</p></Explain>}
    </article>
  );
}

/** B: «¿Cuánto podría levantar?» (plegado). Sin una serie reciente que sirva de referencia, dice qué falta. */
export function Estimates({ pi, unit }: { pi: PI; unit: WeightUnit }) {
  if (pi.metric !== "load") return null;
  const fmt = wFmt(unit);
  const e = pi.estimates;
  return (
    <details className="pgi-est">
      <summary>¿Cuánto podría levantar?</summary>
      {!e ? <p className="pgi-text mb-muted">Hace falta una serie reciente de 1 a 10 repeticiones con carga (de los últimos 4 meses y con fecha real) para estimarlo.</p> : (
        <>
          {e.rows.length > 0 ? (
            <table className="pgi-table">
              <caption className="sr-only">Cargas estimadas por repeticiones para {pi.exercise.name}</caption>
              <thead><tr><th scope="col">Repeticiones</th><th scope="col">Carga estimada</th><th scope="col">Confianza</th></tr></thead>
              <tbody>{e.rows.map((r) => <tr key={r.reps}><td>{r.reps}</td><td>{fmt(r.weightKg)}</td><td><span className={`hx-chip${r.confidence === "baja" ? " bad" : ""}`}>{r.confidence === "media" ? "Media" : "Baja"}</span></td></tr>)}</tbody>
            </table>
          ) : <p className="pgi-text mb-muted">Tu serie de referencia queda lejos de estas repeticiones: no hay estimaciones confiables.</p>}
          <p className="pgi-text">Referencia: tu serie de {fmt(e.ref.w)} × {e.ref.r} del {dayTxt(e.ref.day)}{e.ref.source === "import" ? " (importada)" : ""}. 1RM estimado: {fmt(e.ref.e1rm)}.</p>
          <small className="mb-muted">{e.method} {e.limits}</small>
        </>
      )}
    </details>
  );
}

/** Regularidad y esfuerzo en una fila chica. */
export function RegularityRow({ pi }: { pi: PI }) {
  const r = pi.regularity, ef = pi.effort;
  const weeks = Math.round(pi.recent.days / 7);
  return (
    <div className="pgi-reg" aria-label="Regularidad y esfuerzo">
      <div className="pgi-mini">
        <div><strong>{r.perWeek != null ? n1(r.perWeek) : "—"}</strong><span>entrenamientos por semana{r.target ? ` · tu meta: ${r.target}` : ""}</span></div>
        <div><strong>{r.avgGapDays != null ? n1(r.avgGapDays) : "—"}</strong><span>días entre sesiones de este ejercicio</span></div>
        <div>{ef.withRir ? <><strong>RIR {n1(ef.avgRir ?? 0)}</strong><span>promedio · {ef.atFailure} {ef.atFailure === 1 ? "serie" : "series"} al fallo</span></>
          : <><strong>—</strong><span>Sin RIR registrado</span></>}</div>
      </div>
      <div className="pgi-line">
        {r.adherencePct != null ? <span>Cumplís el <b>{r.adherencePct} %</b> de lo que declaraste.</span> : r.target == null ? <span className="mb-muted">Sin días por semana en tu perfil para comparar.</span> : null}
        <Explain>
          <p>{r.formula}</p>
          <p>Días entre sesiones: promedio entre las fechas reales en que hiciste este ejercicio (sin fechas aproximadas).</p>
          <p>Esfuerzo: series de las últimas {weeks} semanas con RIR registrado ({ef.withRir} de {ef.sets}). RIR 0 = al fallo.</p>
        </Explain>
      </div>
    </div>
  );
}

/** Procedencia de los datos: importados, fechas aproximadas y límite de lectura. */
export function DataNotes({ pi }: { pi: PI }) {
  const d = pi.data;
  return (
    <small className="mb-muted pgi-notes">
      {d.sessions} {d.sessions === 1 ? "sesión" : "sesiones"} · {d.sets} {d.sets === 1 ? "serie válida" : "series válidas"}{d.firstDay ? ` desde ${dayTxt(d.firstDay)}` : ""}.
      {d.imported > 0 && ` ${d.imported} ${d.imported === 1 ? "viene" : "vienen"} de un historial importado.`}
      {d.approx > 0 && ` ${d.approx} con fecha aproximada: cuentan para tus marcas, no para estimar ni para la regularidad.`}
      {d.truncated && " Se leyeron las series más recientes: se alcanzó el límite de lectura."}
    </small>
  );
}

/** Esqueleto de las tarjetas (mismo alto aproximado que las reales). */
export function CardsSkeleton() {
  return (
    <div className="pgi-cards" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <div key={i} className="pgi-card"><Skel w="70%" h={12} /><Skel w="56%" h={22} style={{ margin: "3px 0" }} /><Skel w="80%" h={12} /></div>)}
      <div className="pgi-card wide"><Skel w="34%" h={12} /><Skel h={12} /><Skel w="72%" h={12} /></div>
    </div>
  );
}
