"use client";
// Desempeño (F-GP-01..05, F-RV-03): Mi desempeño del entrenador, Performance Center y detalle de entrenador.
// Cinco categorías separadas, sin puntaje combinado ni recomendaciones disciplinarias. "Sin datos" no es cero.
import { useState } from "react";
import { REVIEW_DIMS, type Period } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Bars, Head, HBar, LocSelect, Seg, dec, fmt, initials, nf, pct, stars, useAct, useLoad, when, type Shell } from "./shared";

type M = { hours: number; req: number; per10: number | null; respMin: number | null; overdue: number; fuOnTime: number | null; fuN: number; pn: number; pu: number; onb: number; uniq: number; inUse: number | null; inUseN: number; rn: number; ra: number | null; lowSample: boolean };
type Defs = Record<"op" | "svc" | "eng" | "out" | "sat", readonly (readonly [string, string])[]>;
const PERIODS: [Period, string][] = [["7d", "7 días"], ["30d", "30 días"], ["90d", "90 días"]];
const CATS = { op: "Operativo", svc: "Calidad de servicio", eng: "Participación de socios", out: "Resultados de entrenamiento", sat: "Satisfacción" } as const;
type Cat = keyof typeof CATS;
const min = (x: number | null) => (x == null ? "Sin datos" : `${dec(x)} min`);
const COLS: Record<Exclude<Cat, "out">, [string, (m: M) => string][]> = {
  op: [["Horas de turno", (m) => dec(m.hours)], ["Solicitudes atendidas", (m) => nf(m.req)], ["Por 10 h de turno", (m) => m.per10 == null ? "Sin datos" : dec(m.per10)], ["Respuesta mediana", (m) => min(m.respMin)], ["Tareas vencidas", (m) => nf(m.overdue)]],
  svc: [["Seguimientos a tiempo", (m) => m.fuOnTime == null ? "Sin datos" : `${m.fuOnTime}% (${m.fuN})`], ["Programas nuevos", (m) => nf(m.pn)], ["Programas actualizados", (m) => nf(m.pu)], ["Onboardings", (m) => nf(m.onb)]],
  eng: [["Socios atendidos", (m) => nf(m.uniq)], ["Programas en uso", (m) => m.inUse == null ? "Sin datos" : `${m.inUse}% de ${m.inUseN}`]],
  sat: [["Reseñas", (m) => nf(m.rn)], ["Promedio", (m) => m.lowSample ? "Muestra insuficiente" : dec(m.ra)]],
};

function DefList({ defs }: { defs: readonly (readonly [string, string])[] }) {
  return <dl className="gy-defs">{defs.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>;
}

// ── Mi desempeño ────────────────────────────────────────────────────────────
type MineReviews = { responsesEnabled: boolean; aggregate: { n: number; avg: number | null; lowSample: boolean }; reviews: { id: string; stars: number; dims: (number | null)[]; kind: string; at: string; text: string | null; status: string; response: string | null; caseRef: string | null }[] };
type Attr = { attributions: { taskId: string; ref: string; label: string; at: string; offShift: boolean; disputed: boolean }[]; cases: { id: string; ref: string; type: string; reason: string; status: string; outcome: string | null; at: string; canAppeal: boolean; appealUntil: string | null }[] };
const CASE_ST: Record<string, [string, string]> = { open: ["Enviado", "warn"], in_review: ["En revisión", "info"], resolved: ["Resuelto", "ok"], appealed: ["Apelado", "info"] };
const OUTCOME: Record<string, string> = { keep: "se mantiene", remove: "retirada", edit: "edición pedida al socio", fix: "atribución corregida", reject: "disputa rechazada" };

export function MyPerfScreen({ shell }: { shell: Shell }) {
  const [period, setPeriod] = useState<Period>("30d");
  const [open, setOpen] = useState<string | null>(null);
  const p = useLoad<{ metrics: M; defs: Defs; minN: number }>(`/api/gym/${shell.orgId}/perf/me?period=${period}`);
  const r = useLoad<MineReviews>(`/api/gym/${shell.orgId}/reviews/mine`);
  const a = useLoad<Attr>(`/api/gym/${shell.orgId}/attributions`);
  const [modal, setModal] = useState<{ type: "respond" | "report" | "dispute" | "appeal"; id: string; ref: string } | null>(null);
  const m = p.data?.metrics;
  const cards: [Cat, [string, string][]][] = m ? [
    ["op", [["Horas de turno", dec(m.hours)], ["Solicitudes atendidas", nf(m.req)], ["Por 10 h de turno", m.per10 == null ? "Sin datos" : dec(m.per10)], ["Respuesta mediana", min(m.respMin)]]],
    ["svc", [["Seguimientos a tiempo", pct(m.fuOnTime)], ["Programas nuevos", nf(m.pn)], ["Programas actualizados", nf(m.pu)], ["Onboardings", nf(m.onb)]]],
    ["sat", [["Reseñas verificadas", nf(m.rn)], ["Promedio", m.lowSample ? "Muestra insuficiente" : dec(m.ra)]]],
  ] : [];
  const done = () => { setModal(null); r.reload(); a.reload(); };
  return (
    <>
      <Head kicker="Sólo vos y la gerencia de tu sede ven estos datos" title="Mi desempeño"><Seg label="Período" value={period} options={PERIODS} onChange={setPeriod} /></Head>
      {p.err && <p role="alert" className="err-box">{p.err}</p>}
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}>
        {cards.map(([k, items]) => (
          <section key={k} className="card">
            <h2>{CATS[k]}</h2>
            {items.map(([l, v]) => <div key={l} className="trow" style={{ justifyContent: "space-between" }}><span className="muted" style={{ fontSize: 14 }}>{l}</span><b>{v}</b></div>)}
            <button type="button" className="gy-link" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>{open === k ? "Ocultar cómo se calcula" : "¿Cómo se calcula?"}</button>
            {open === k && p.data && <DefList defs={p.data.defs[k]} />}
          </section>
        ))}
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Atribuciones recientes</h2>
          <span className="muted">Si algo no lo hiciste vos o lo hicieron entre dos, disputalo: lo revisa la gerencia.</span>
          {a.data?.attributions.map((x) => (
            <div key={x.taskId} className="trow"><span className="muted" style={{ flex: "0 0 110px" }}>{when(x.at)}</span><span style={{ flex: 1 }}>{x.label}{x.offShift ? " · fuera de turno" : ""}</span>
              {x.disputed ? <span className="chip info">En disputa</span> : <button type="button" className="btn sm" onClick={() => setModal({ type: "dispute", id: x.taskId, ref: `${x.ref} · ${x.label}` })}>Disputar</button>}</div>
          ))}
          {a.data && !a.data.attributions.length && <span className="muted" style={{ fontSize: 14 }}>Todavía no completaste tareas.</span>}
          {!!a.data?.cases.length && <h2 style={{ fontSize: 14, marginTop: 8 }}>Tus casos</h2>}
          {a.data?.cases.map((c) => (
            <div key={c.id} className="trow"><span style={{ flex: 1 }}><b>{c.ref}</b> · {c.type === "attribution" ? "Disputa" : "Reporte"} · {c.reason}{c.outcome ? ` · ${OUTCOME[c.outcome]}` : ""}</span>
              <span className={`chip ${CASE_ST[c.status][1]}`}>{CASE_ST[c.status][0]}</span>
              {c.canAppeal && <button type="button" className="btn sm" onClick={() => setModal({ type: "appeal", id: c.id, ref: c.ref })}>Apelar</button>}</div>
          ))}
        </section>
        <section className="card">
          <h2>Mis reseñas</h2>
          <span className="muted">Las ves sin el nombre del socio. {r.data && !r.data.responsesEnabled ? "El gym desactivó las respuestas." : "Podés responder una vez; no podés editar lo que escribió el socio."}</span>
          {r.data?.reviews.map((x) => (
            <div key={x.id} style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#007EA0", letterSpacing: 1 }} aria-label={`${x.stars} de 5`}>{stars(x.stars)}</span><span className="muted">{x.kind} · {fmt(x.at)}</span>
                <span className={`chip ${x.status === "published" ? "ok" : "warn"}`}>{x.status === "published" ? "Verificada" : x.status === "reported" ? `Reportada · en moderación (${x.caseRef})` : "Edición pedida al socio"}</span>
              </div>
              {x.text && <span style={{ fontSize: 14, lineHeight: 1.45 }}>“{x.text}”</span>}
              <span className="muted">{REVIEW_DIMS.map((d, i) => `${d} ${x.dims[i] ?? "—"}`).join(" · ")}</span>
              {x.response && <span style={{ fontSize: 13, background: "#F4FBFD", borderRadius: 8, padding: 8 }}>Tu respuesta: {x.response}</span>}
              {x.status === "published" && (
                <div style={{ display: "flex", gap: 8 }}>
                  {r.data!.responsesEnabled && !x.response && <button type="button" className="btn sm" onClick={() => setModal({ type: "respond", id: x.id, ref: x.text ?? stars(x.stars) })}>Responder</button>}
                  <button type="button" className="btn sm" onClick={() => setModal({ type: "report", id: x.id, ref: x.text ?? stars(x.stars) })}>Reportar</button>
                </div>
              )}
            </div>
          ))}
          {r.data && !r.data.reviews.length && <span className="muted" style={{ fontSize: 14 }}>Todavía no recibiste reseñas. Llegan después de una atención elegible y son opcionales para el socio.</span>}
        </section>
      </div>
      {modal && <CaseModal shell={shell} modal={modal} onClose={(ok) => (ok ? done() : setModal(null))} />}
    </>
  );
}

function CaseModal({ shell, modal, onClose }: { shell: Shell; modal: { type: "respond" | "report" | "dispute" | "appeal"; id: string; ref: string }; onClose: (ok: boolean) => void }) {
  const reasons = modal.type === "dispute" ? ["No realicé esta acción", "La realizamos entre dos", "Fecha u horario incorrecto"] : ["Contenido ofensivo", "No corresponde a una interacción conmigo", "Datos personales expuestos"];
  const [reason, setReason] = useState(reasons[0]);
  const [txt, setTxt] = useState("");
  const { busy, run } = useAct(shell.flash);
  const title = { respond: "Responder reseña", report: "Reportar reseña", dispute: "Disputar una atribución", appeal: "Apelar la decisión" }[modal.type];
  const send = async () => {
    const o = shell.orgId;
    const r = modal.type === "respond" ? await run("x", () => api(`/api/gym/${o}/reviews/${modal.id}/respond`, { body: { text: txt } }), "Respuesta enviada. La ven el socio y la gerencia.")
      : modal.type === "appeal" ? await run("x", () => api(`/api/gym/${o}/cases/${modal.id}/appeal`, { body: { text: txt } }), "Apelación enviada a la gerencia.")
      : await run("x", () => api<{ ref: string }>(`/api/gym/${o}/cases`, { body: { type: modal.type === "dispute" ? "attribution" : "review_report", refId: modal.id, reason, detail: txt || null } }), (x) => `Caso ${(x as { ref: string }).ref} enviado a la gerencia. Te avisamos cuando se resuelva.`);
    if (r) onClose(true);
  };
  return (
    <Modal label={title} onClose={() => onClose(false)}>
      <div className="mhead"><h2>{title}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <span className="muted" style={{ fontSize: 14 }}>{modal.ref}</span>
      {(modal.type === "report" || modal.type === "dispute") && reasons.map((x) => (
        <label key={x} className="mrow" style={{ border: `1px solid ${reason === x ? "#00D1FF" : "#E2E8F0"}` }}><input type="radio" name="reason" checked={reason === x} onChange={() => setReason(x)} /><span style={{ fontSize: 14 }}>{x}</span></label>
      ))}
      <label className="field">{modal.type === "respond" ? "Tu respuesta" : modal.type === "appeal" ? "Por qué apelás" : "Detalle (opcional)"}
        <textarea className="note" rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={600} />
      </label>
      {modal.type === "report" && <span className="muted">Mientras se modera, el texto queda oculto en tu vista. No se borra hasta que la gerencia decida.</span>}
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy === "x" || undefined} onClick={send}>Enviar</button></div>
    </Modal>
  );
}

// ── Performance Center ──────────────────────────────────────────────────────
type Pc = { rows: (M & { id: string; name: string; sede: string; turno: string | null })[]; defs: Defs; minN: number; outcomes: { members: number; withProgram: number | null; trained30: number | null; twoPerWeek: number | null; sessions30: number } | null };

export function PerfCenterScreen({ shell }: { shell: Shell }) {
  const owner = shell.ctx.roles.includes("owner");
  const [loc, setLoc] = useState<string | null>(owner ? null : shell.loc);
  const [period, setPeriod] = useState<Period>("30d");
  const [cat, setCat] = useState<Cat>("op");
  const [sel, setSel] = useState<string[]>([]);
  const [defs, setDefs] = useState(false);
  const [cmp, setCmp] = useState(false);
  const pc = useLoad<Pc>(`/api/gym/${shell.orgId}/perf?period=${period}${loc ? `&loc=${loc}` : ""}`);
  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]);
  const out = pc.data?.outcomes;
  return (
    <>
      <Head kicker={owner ? "Equipo y servicio" : "Categorías separadas · sin puntaje combinado"} title="Performance Center">
        <LocSelect shell={shell} allowAll={owner} value={loc} onChange={(v) => { setLoc(v); setSel([]); }} />
        <Seg label="Período" value={period} options={PERIODS} onChange={setPeriod} />
      </Head>
      <div className="tabs" role="tablist" aria-label="Categoría">{(Object.keys(CATS) as Cat[]).map((k) => <button key={k} type="button" role="tab" aria-selected={cat === k} onClick={() => { setCat(k); setDefs(false); }}>{CATS[k]}</button>)}</div>
      {pc.err && <p role="alert" className="err-box">{pc.err}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="gy-link" aria-expanded={defs} onClick={() => setDefs(!defs)}>{defs ? "Ocultar definiciones" : "Definiciones"}</button>
        {cat !== "out" && <><span className="muted" style={{ marginLeft: "auto" }}>{sel.length ? `${sel.length} elegidos` : "Elegí 2 o 3 para comparar con contexto"}</span>
          <button type="button" className="btn sm" aria-disabled={sel.length < 2} onClick={() => sel.length >= 2 ? setCmp(true) : shell.flash("Elegí 2 o 3 entrenadores para comparar.")}>Comparar</button>
          {!!sel.length && <button type="button" className="btn sm" onClick={() => setSel([])}>Limpiar</button>}</>}
      </div>
      {defs && pc.data && <section className="card"><DefList defs={pc.data.defs[cat]} /></section>}
      {!pc.data ? <p className="muted">Cargando…</p> : cat === "out" ? (
        <section className="card">
          <h2>Resultados de entrenamiento · nivel sede</h2>
          <span className="muted">No se atribuyen a personas: los resultados dependen de muchos factores ajenos al entrenador.</span>
          {!out || !out.members ? <span className="muted">Sin socios activos en REPI todavía.</span> : (
            <>
              <HBar label="Socios con programa asignado" n={out.withProgram} max={100} note="Programa institucional vigente ÷ socios activos en REPI (%)" />
              <HBar label="Socios que entrenaron en 30 días" n={out.trained30} max={100} note="Al menos una sesión registrada (%)" />
              <HBar label="Socios con 2+ sesiones por semana" n={out.twoPerWeek} max={100} note="Últimas 4 semanas (%)" />
              <span className="muted">{nf(out.sessions30)} sesiones registradas en 30 días · {nf(out.members)} socios activos. La progresión de cargas por socio todavía no se calcula.</span>
            </>
          )}
        </section>
      ) : (
        <section className="card" style={{ padding: 0, overflowX: "auto" }} tabIndex={0}>
          <table className="gy-table">
            <thead><tr><th scope="col"><span className="sr-only">Comparar</span></th><th scope="col">Entrenador</th>{COLS[cat].map(([l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
            <tbody>
              {pc.data.rows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Comparar a ${r.name}`} style={{ width: 18, height: 18, accentColor: "#00D1FF" }} /></td>
                  <td><button type="button" className="gy-person" onClick={() => shell.go("staff", { sel: r.id })}><span className="av36" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(r.name)}</span><span><b>{r.name}</b><small className="muted">{r.sede}{r.turno ? ` · ${r.turno}` : ""}</small></span></button></td>
                  {COLS[cat].map(([l, f]) => <td key={l}>{f(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {!pc.data.rows.length && <div className="empty" style={{ margin: 16 }}>No hay personal de sala en esta sede.</div>}
        </section>
      )}
      {cmp && pc.data && (
        <Modal label="Comparar con contexto" onClose={() => setCmp(false)} wide>
          <div className="mhead"><h2>Comparar con contexto</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setCmp(false)}>×</button></div>
          <span className="muted">Turnos de distinta duración y afluencia no son directamente comparables. No hay puntaje combinado.</span>
          <table className="gy-table">
            <thead><tr><th scope="col">Métrica</th>{sel.map((id) => { const r = pc.data!.rows.find((x) => x.id === id)!; return <th key={id} scope="col">{r.name}<br /><small className="muted">{r.sede}{r.turno ? ` · ${r.turno}` : ""}</small></th>; })}</tr></thead>
            <tbody>
              {([["Horas de turno", (m: M) => dec(m.hours)], ["Solicitudes por 10 h", (m: M) => m.per10 == null ? "Sin datos" : dec(m.per10)], ["Respuesta mediana", (m: M) => min(m.respMin)], ["Seguimientos a tiempo", (m: M) => pct(m.fuOnTime)], ["Programas actualizados", (m: M) => nf(m.pu)],
                ["Reseñas", (m: M) => m.lowSample ? `${m.rn} · muestra insuficiente` : `${dec(m.ra)} (${m.rn})`]] as [string, (m: M) => string][]).map(([l, f]) => (
                <tr key={l}><th scope="row">{l}</th>{sel.map((id) => <td key={id}>{f(pc.data!.rows.find((x) => x.id === id)!)}</td>)}</tr>
              ))}
              <tr><th scope="row">Contexto del turno</th>{sel.map((id) => <td key={id}>{pc.data!.rows.find((x) => x.id === id)!.turno ?? "Sin turnos planificados"}</td>)}</tr>
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
}

// ── Detalle de entrenador (F-GP-05, SCR-GX-02) ──────────────────────────────
type TD = { id: string; name: string; metrics: M; weeks: { label: string; n: number }[]; dist: { stars: number; n: number }[]; reviews: { id: string; stars: number; text: string | null; hidden: boolean; member: string | null; at: string }[]; tasks: { ref: string; category: string; status: string; completedAt: string | null; completedByThem: boolean }[]; private: [string, string][] };

export function TrainerDetail({ shell, id, onBack, backLabel }: { shell: Shell; id: string; onBack: () => void; backLabel: string }) {
  const [period, setPeriod] = useState<Period>("30d");
  const d = useLoad<TD>(`/api/gym/${shell.orgId}/perf/trainer/${id}?period=${period}`);
  const [denied, setDenied] = useState<string | null>(null);
  const tryOpen = async (what: string) => { try { await api(`/api/gym/${shell.orgId}/team/${id}/private`, { body: { what } }); } catch { setDenied(what); } };
  const m = d.data?.metrics;
  const max = Math.max(1, ...(d.data?.dist.map((x) => x.n) ?? [1]));
  return (
    <>
      <button type="button" className="gy-link" onClick={onBack}>← {backLabel}</button>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {d.data && m && (
        <>
          <Head kicker="Entrenador/a de sala" title={d.data.name}><Seg label="Período" value={period} options={PERIODS} onChange={setPeriod} /></Head>
          <div className="grid-kpi">
            {([["Solicitudes atendidas", nf(m.req), m.per10 == null ? "Sin horas registradas" : `${dec(m.per10)} por 10 h`], ["Respuesta mediana", min(m.respMin), "Desde que se crea hasta que se toma"], ["Seguimientos a tiempo", pct(m.fuOnTime), `${m.overdue} vencidas`],
              ["Programas", `${m.pn} nuevos`, `${m.pu} actualizados`], ["Reseñas", m.lowSample ? "—" : dec(m.ra), m.lowSample ? `Muestra insuficiente (${m.rn})` : `${m.rn} reseñas`]] as [string, string, string][]).map(([l, v, s]) => (
              <div key={l} className="stat"><span>{l}</span><strong>{v}</strong><small className="muted">{s}</small></div>
            ))}
          </div>
          <div className="grid-2">
            <section className="card"><h2>Solicitudes completadas por semana</h2><Bars data={d.data.weeks} label="Solicitudes por semana" /></section>
            <section className="card">
              <h2>Distribución de reseñas</h2>
              {d.data.dist.map((x) => <HBar key={x.stars} label={`${x.stars} ★`} n={x.n} max={max} />)}
              {d.data.reviews.map((r) => <div key={r.id} className="trow"><span style={{ color: "#007EA0" }}>{stars(r.stars)}</span><span style={{ flex: 1 }}>{r.hidden ? <i className="muted">En moderación</i> : r.text ?? <i className="muted">Sin comentario</i>}</span><span className="muted">{r.member ?? ""} · {fmt(r.at)}</span></div>)}
            </section>
          </div>
          <section className="card">
            <h2>Tareas recientes</h2>
            {d.data.tasks.map((t) => <div key={t.ref} className="trow"><b style={{ flex: "0 0 70px" }}>{t.ref}</b><span style={{ flex: 1 }}>{t.status === "done" ? `Completada ${when(t.completedAt)}` : t.status === "pending_acceptance" ? "Traspaso pendiente" : "Abierta"}</span></div>)}
            {!d.data.tasks.length && <span className="muted">Sin tareas.</span>}
          </section>
          <section className="card">
            <h2>Fuera del alcance de gestión</h2>
            <span className="muted">No están disponibles para ningún rol del gym. Un intento de abrirlos queda registrado.</span>
            {d.data.private.map(([t, desc]) => (
              <div key={t} className="trow"><span style={{ flex: 1 }}><b>{t}</b><br /><small className="muted">{desc}</small></span><button type="button" className="btn sm" onClick={() => tryOpen(t)}>Abrir</button></div>
            ))}
          </section>
        </>
      )}
      {denied && (
        <Modal label="Acceso no disponible" onClose={() => setDenied(null)}>
          <div className="mhead"><h2>Acceso no disponible</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setDenied(null)}>×</button></div>
          <p style={{ margin: 0, lineHeight: 1.5 }}>“{denied}” de {d.data?.name} está fuera del alcance de gestión. El intento quedó registrado en el historial de accesos.</p>
          <span className="muted">Para supervisar el servicio usá las métricas de tareas y las reseñas verificadas.</span>
          <div className="mfoot"><button type="button" className="btn pri" onClick={() => setDenied(null)}>Entendido</button></div>
        </Modal>
      )}
    </>
  );
}
