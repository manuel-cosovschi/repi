"use client";
// REPI Admin › Demostraciones (D220): la biblioteca oficial de REPI Exercise Motion. Qué parte del catálogo y del uso real
// cubre, qué ejercicios muy usados todavía no tienen demostración y el estado de revisión de cada una, con vista previa.
// Las demostraciones se editan en el código (lib/exercise-motion/library) y se publican por PR revisado: acá no hay edición.
import { useState } from "react";
import { HBar, Head, nf, useLoad } from "@/components/gym/shared";
import { ExerciseMotion } from "@/components/exercise-motion/ExerciseMotion";
import type { motionReport } from "@/server/training/motion-report";

type Report = Awaited<ReturnType<typeof motionReport>>;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

export function AdminMotion() {
  const r = useLoad<Report>("/api/admin/motion");
  const [open, setOpen] = useState<string | null>(null);
  const d = r.data;
  return (
    <>
      <Head kicker="Animaciones propias de REPI con técnica y músculos. Se muestran en el entrenamiento, el kiosco y el panel del coach." title="Demostraciones" />
      {r.err && <p role="alert" className="err-box">{r.err}</p>}
      {!d ? <p className="muted">Cargando…</p> : <>
        {!d.on && <p className="err-box">El módulo está apagado (exercise_motion): nadie ve las demostraciones.</p>}
        <section className="card" style={{ gap: 12 }} aria-labelledby="am-cov">
          <h2 id="am-cov" style={{ margin: 0, fontSize: 16 }}>Cobertura · biblioteca v{d.version}</h2>
          <HBar label={`Catálogo global con demostración exacta (${pct(d.catalog.exact, d.catalog.total)})`} n={d.catalog.exact} max={d.catalog.total} note={`de ${nf(d.catalog.total)} ejercicios`} />
          <HBar label={`Con variante compatible (${pct(d.catalog.compatible, d.catalog.total)})`} n={d.catalog.compatible} max={d.catalog.total} color="var(--ui-accent-2)" />
          <HBar label={`Series de los últimos 90 días con demostración exacta (${pct(d.usage.exact, d.usage.sets)})`} n={d.usage.exact} max={d.usage.sets} note={`de ${nf(d.usage.sets)} series del catálogo global`} />
          <HBar label={`Con variante compatible (${pct(d.usage.compatible, d.usage.sets)})`} n={d.usage.compatible} max={d.usage.sets} color="var(--ui-accent-2)" />
        </section>
        <section className="card" style={{ gap: 8 }} aria-labelledby="am-miss">
          <h2 id="am-miss" style={{ margin: 0, fontSize: 16 }}>Más usados sin demostración</h2>
          {d.missing.length ? <ol style={{ margin: 0, paddingLeft: 20 }}>{d.missing.map((m) => <li key={m.name}>{m.name} <span className="muted">· {nf(m.n)} series</span></li>)}</ol>
            : <p className="muted" style={{ margin: 0 }}>{d.usage.sets ? "Todos los ejercicios usados tienen demostración." : "No hubo series del catálogo global en los últimos 90 días."}</p>}
        </section>
        <section className="card" style={{ gap: 8 }} aria-labelledby="am-lib">
          <h2 id="am-lib" style={{ margin: 0, fontSize: 16 }}>Biblioteca ({d.library.length})</h2>
          <ul className="xv-list">
            {d.library.map((e) => (
              <li key={e.id}>
                <div className="xv-name"><b>{e.title}</b><small className="muted">{e.group} · v{e.version} · {e.view === "side" ? "lateral" : "frontal"} · {e.catalog.join(", ")}{e.compatible.length ? ` · compatibles: ${e.compatible.map((c) => c.name).join(", ")}` : ""}</small></div>
                <span className="xv-state on">{e.review.status === "professional" ? "Validada por profesional" : `Revisión interna · ${e.review.date}`}</span>
                <div className="xv-acts"><button type="button" className="btn" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Ocultar" : "Ver"}</button></div>
                {open === e.id && <div className="xv-demo"><ExerciseMotion motion={{ id: e.id, v: e.version, match: "exact" }} name={e.title} variant="preview" /></div>}
              </li>
            ))}
          </ul>
        </section>
      </>}
    </>
  );
}
