"use client";
// Reseñas (gerencia), Ejecutivo, Sedes y Configuración del dueño (REPI Desktop Gym.dc.html · sc.reviews/exec/locs/config).
import { useState } from "react";
import { REVIEW_DIMS } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, HBar, LocSelect, Seg, dec, fmt, nf, pct, stars, useAct, useLoad, when, type Shell } from "./shared";

type Agg = { n: number; avg: number | null; lowSample: boolean; dist: { stars: number; n: number }[]; dims: { label: string; n: number; avg: number | null }[] };
type An = { days: number; aggregate: Agg; trend: { month: string; n: number; avg: number | null }[]; reviews: { id: string; stars: number; dims: (number | null)[]; text: string | null; kind: string; at: string; member: string; trainer: string; response: string | null }[] };
type CaseRow = { id: string; ref: string; type: string; reason: string; by: string; status: string; outcome: string | null; at: string };
type CaseD = { id: string; ref: string; type: string; reason: string; detail: string | null; status: string; by: string; review: { stars: number; text: string | null; kind: string; at: string; member: string; status: string } | null; task: { ref: string; label: string; completedAt: string | null } | null; log: { at: string; text: string }[] };
const ST: Record<string, [string, string]> = { open: ["Reportado", "warn"], in_review: ["En revisión", "info"], resolved: ["Resuelto", "ok"], appealed: ["Apelado", "info"] };
const OUT: Record<string, string> = { keep: "se mantiene", remove: "retirada", edit: "edición pedida", fix: "atribución corregida", reject: "disputa rechazada" };

export function ReviewsScreen({ shell }: { shell: Shell }) {
  const owner = shell.ctx.roles.includes("owner");
  const [tab, setTab] = useState<"an" | "mod" | "audit">("an");
  const [loc, setLoc] = useState<string | null>(owner ? null : shell.loc);
  const [days, setDays] = useState<"30" | "90" | "365">("90");
  const a = useLoad<An>(tab === "an" ? `/api/gym/${shell.orgId}/reviews?days=${days}${loc ? `&loc=${loc}` : ""}` : null);
  const c = useLoad<CaseRow[]>(tab === "mod" ? `/api/gym/${shell.orgId}/cases${loc ? `?loc=${loc}` : ""}` : null);
  const h = useLoad<{ at: string; text: string; result: string }[]>(tab === "audit" ? `/api/gym/${shell.orgId}/access-history` : null);
  const [open, setOpen] = useState<string | null>(null);
  const g = a.data?.aggregate;
  const maxD = Math.max(1, ...(g?.dist.map((d) => d.n) ?? [1]));
  return (
    <>
      <Head kicker="Reseñas verificadas · la gerencia ve el nombre del socio; el entrenador no" title="Reseñas"><LocSelect shell={shell} allowAll={owner} value={loc} onChange={setLoc} /></Head>
      <div className="tabs" role="tablist" aria-label="Reseñas">{([["an", "Análisis"], ["mod", "Moderación"], ["audit", "Historial de accesos"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "an" && (
        <>
          <Seg label="Período" value={days} options={[["30", "30 días"], ["90", "90 días"], ["365", "12 meses"]]} onChange={setDays} />
          {a.err && <p role="alert" className="err-box">{a.err}</p>}
          {g && (
            <div className="grid-2">
              <section className="card">
                <h2>Promedio</h2>
                <strong style={{ fontSize: 36 }}>{g.avg == null ? "—" : dec(g.avg)}</strong>
                <span className="muted">{g.lowSample ? `Muestra insuficiente: ${g.n} reseña${g.n === 1 ? "" : "s"} (se muestra con 5 o más).` : `${g.n} reseñas verificadas.`} Sin rango de confianza todavía.</span>
                {g.dist.map((d) => <HBar key={d.stars} label={`${d.stars} ★`} n={d.n} max={maxD} />)}
              </section>
              <section className="card">
                <h2>Dimensiones</h2>
                {g.dims.map((d) => <div key={d.label} className="trow" style={{ justifyContent: "space-between" }}><span>{d.label}</span><b>{d.avg == null ? `Muestra insuficiente (${d.n})` : dec(d.avg)}</b></div>)}
                <h2 style={{ marginTop: 8 }}>Por mes</h2>
                {a.data!.trend.map((t) => <div key={t.month} className="trow" style={{ justifyContent: "space-between" }}><span>{t.month.split("-").reverse().join("/")}</span><span className="muted">{t.avg == null ? `${t.n} · muestra insuficiente` : `${dec(t.avg)} · ${t.n}`}</span></div>)}
                {!a.data!.trend.length && <span className="muted">Sin reseñas en el período.</span>}
              </section>
            </div>
          )}
          {a.data && (
            <section className="card">
              <h2>Reseñas publicadas</h2>
              {a.data.reviews.map((r) => (
                <div key={r.id} className="trow" style={{ alignItems: "flex-start" }}>
                  <span style={{ color: "#007EA0", flex: "0 0 80px" }}>{stars(r.stars)}</span>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>{r.text ?? <i className="muted">Sin comentario</i>}<small className="muted">{r.member} → {r.trainer} · {r.kind} · {REVIEW_DIMS.map((d, i) => `${d} ${r.dims[i] ?? "—"}`).join(" · ")}</small>{r.response && <small>Respuesta: {r.response}</small>}</span>
                  <span className="muted">{fmt(r.at)}</span>
                </div>
              ))}
              {!a.data.reviews.length && <span className="muted" style={{ fontSize: 14 }}>Sin reseñas publicadas en el período.</span>}
            </section>
          )}
        </>
      )}
      {tab === "mod" && (
        <section className="card">
          {c.err && <p role="alert" className="err-box">{c.err}</p>}
          {c.data?.map((x) => (
            <div key={x.id} className="trow">
              <b style={{ flex: "0 0 70px" }}>{x.ref}</b><span style={{ flex: 1 }}>{x.type === "attribution" ? "Disputa de atribución" : "Reporte de reseña"} · {x.reason} · por {x.by}{x.outcome ? ` · ${OUT[x.outcome]}` : ""}</span>
              <span className={`chip ${ST[x.status][1]}`}>{ST[x.status][0]}</span><span className="muted">{fmt(x.at)}</span>
              <button type="button" className="btn sm" onClick={() => setOpen(x.id)}>Abrir</button>
            </div>
          ))}
          {c.data && !c.data.length && <span className="muted" style={{ fontSize: 14 }}>No hay casos de moderación.</span>}
        </section>
      )}
      {tab === "audit" && (
        <section className="card">
          {h.err && <p role="alert" className="err-box">{h.err}</p>}
          {h.data?.map((x, i) => <div key={i} className="trow"><span className="muted" style={{ flex: "0 0 130px" }}>{when(x.at)}</span><span style={{ flex: 1 }}>{x.text}</span>{x.result === "denied" && <span className="chip bad">Denegado</span>}</div>)}
          {h.data && !h.data.length && <span className="muted">Sin registros.</span>}
        </section>
      )}
      {open && <CaseModal shell={shell} id={open} onClose={() => { setOpen(null); c.reload(); }} />}
    </>
  );
}

function CaseModal({ shell, id, onClose }: { shell: Shell; id: string; onClose: () => void }) {
  const d = useLoad<CaseD>(`/api/gym/${shell.orgId}/cases/${id}`);
  const [note, setNote] = useState("");
  const { busy, run } = useAct(shell.flash);
  const resolve = (outcome: string) => run(outcome, () => api<{ ref: string; label: string }>(`/api/gym/${shell.orgId}/cases/${id}/resolve`, { body: { outcome, note: note || null, fixToUserId: null } }), (r) => { const x = r as { ref: string; label: string }; return `${x.ref}: resuelta · ${x.label}. Quedó registrado en el historial.`; }).then((r) => r && onClose());
  const x = d.data;
  const done = x?.status === "resolved";
  return (
    <Modal label={x ? `Caso ${x.ref}` : "Caso"} onClose={onClose}>
      <div className="mhead"><h2>{x ? `Caso ${x.ref}` : "Caso"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {x && (
        <>
          <span className="muted">{x.type === "attribution" ? "Disputa de atribución" : "Reporte de reseña"} · {x.reason} · por {x.by}{x.detail ? ` — “${x.detail}”` : ""}</span>
          {x.review && <div style={{ background: "#F4FBFD", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}><span style={{ color: "#007EA0" }}>{stars(x.review.stars)}</span><span>{x.review.text ?? <i>Sin comentario</i>}</span><small className="muted">{x.review.member} · {x.review.kind} · {fmt(x.review.at)}</small></div>}
          {x.task && <div style={{ background: "#F4FBFD", borderRadius: 12, padding: 12 }}>{x.task.ref} · {x.task.label} · completada {when(x.task.completedAt)}</div>}
          <span className="muted">El staff no edita el texto del socio: sólo se mantiene, se retira o se le pide editar.</span>
          <h2 style={{ fontSize: 14 }}>Historial</h2>
          {x.log.map((l, i) => <div key={i} className="trow" style={{ padding: "6px 4px" }}><span className="muted" style={{ flex: "0 0 110px" }}>{when(l.at)}</span><span>{l.text}</span></div>)}
          {!done && (
            <>
              <label className="field">Nota de la decisión (opcional)<textarea className="note" rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="mfoot">
                {x.type === "review_report" ? (<>
                  <button type="button" className="btn" aria-busy={busy === "keep" || undefined} onClick={() => resolve("keep")}>Mantener</button>
                  <button type="button" className="btn" aria-busy={busy === "edit" || undefined} onClick={() => resolve("edit")}>Pedir edición al socio</button>
                  <button type="button" className="btn pri" aria-busy={busy === "remove" || undefined} onClick={() => resolve("remove")}>Retirar</button>
                </>) : (<>
                  <button type="button" className="btn" aria-busy={busy === "reject" || undefined} onClick={() => resolve("reject")}>Rechazar disputa</button>
                  <button type="button" className="btn pri" aria-busy={busy === "fix" || undefined} onClick={() => resolve("fix")}>Corregir: sin atribución</button>
                </>)}
              </div>
              {x.status === "appealed" && <span className="muted">Caso apelado: esta decisión es final.</span>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Dueño ───────────────────────────────────────────────────────────────────
type Exec = { kpis: { roster: number; members: number; adoption: number | null; sessions30: number; satisfaction: number | null; reviews: number; locations: number };
  locations: { id: string; name: string; roster: number; members: number; adoption: number | null; sessions30: number; perMember30: number | null; followOnTime: number | null; satisfaction: number | null; reviews: number; trainers: number }[] };

export function ExecScreen({ shell }: { shell: Shell }) {
  const e = useLoad<Exec>(`/api/gym/${shell.orgId}/exec`);
  const k = e.data?.kpis;
  return (
    <>
      <Head kicker={`${shell.ctx.org.name} · ${k ? `${k.locations} sedes` : ""}`} title="Ejecutivo" />
      {e.err && <p role="alert" className="err-box">{e.err}</p>}
      {k && (
        <div className="grid-kpi">
          {([["Socios en padrón", nf(k.roster), "Todas las sedes"], ["En REPI", nf(k.members), k.adoption == null ? "Sin padrón" : `${k.adoption}% del padrón tiene cuenta`], ["Sesiones registradas", nf(k.sessions30), "30 días"], ["Satisfacción", k.satisfaction == null ? "—" : dec(k.satisfaction), k.satisfaction == null ? `Muestra insuficiente (${k.reviews})` : `${k.reviews} reseñas · 90 días`]] as [string, string, string][]).map(([l, v, s]) => (
            <div key={l} className="stat"><span>{l}</span><strong>{v}</strong><small className="muted">{s}</small></div>
          ))}
        </div>
      )}
      {e.data && <LocTable rows={e.data.locations} onOpen={() => shell.go("pc")} />}
      <span className="muted">Ingresos y cuotas de socios no se muestran: REPI no gestiona cobros del gym a sus socios.</span>
    </>
  );
}

function LocTable({ rows, onOpen }: { rows: Exec["locations"]; onOpen: () => void }) {
  return (
    <section className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="gy-table">
        <thead><tr><th scope="col">Sede</th><th scope="col">Padrón</th><th scope="col">En REPI</th><th scope="col">Sesiones · 30 días</th><th scope="col">Por socio</th><th scope="col">Seguimientos a tiempo</th><th scope="col">Satisfacción</th><th scope="col">Entrenadores</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><th scope="row"><button type="button" className="gy-link" onClick={onOpen}>{r.name}</button></th><td>{nf(r.roster)}</td><td>{nf(r.members)}{r.adoption != null ? ` · ${r.adoption}%` : ""}</td><td>{nf(r.sessions30)}</td><td>{r.perMember30 == null ? "Sin datos" : dec(r.perMember30)}</td><td>{pct(r.followOnTime)}</td><td>{r.satisfaction == null ? `Muestra insuficiente (${r.reviews})` : `${dec(r.satisfaction)} (${r.reviews})`}</td><td>{r.trainers}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

export function LocsScreen({ shell }: { shell: Shell }) {
  const e = useLoad<Exec>(`/api/gym/${shell.orgId}/exec`);
  const [metric, setMetric] = useState<"adoption" | "perMember30" | "followOnTime" | "satisfaction">("adoption");
  const M = { adoption: ["Adopción REPI", 100, (v: number) => `${v}%`], perMember30: ["Sesiones por socio · 30 días", 12, dec], followOnTime: ["Seguimientos a tiempo", 100, (v: number) => `${v}%`], satisfaction: ["Satisfacción", 5, dec] } as const;
  const [label, max, f] = M[metric];
  return (
    <>
      <Head kicker="Comparación de sedes con datos registrados" title="Sedes"><Seg label="Métrica" value={metric} options={[["adoption", "Adopción"], ["perMember30", "Sesiones"], ["followOnTime", "Seguimientos"], ["satisfaction", "Satisfacción"]]} onChange={setMetric} /></Head>
      {e.err && <p role="alert" className="err-box">{e.err}</p>}
      {e.data && (
        <section className="card">
          <h2>{label}</h2>
          {e.data.locations.map((l) => { const v = l[metric]; return <HBar key={l.id} label={l.name} n={v} max={max} note={v == null ? "Sin datos suficientes" : f(v as number)} />; })}
        </section>
      )}
      {e.data && <LocTable rows={e.data.locations} onOpen={() => shell.go("pc")} />}
    </>
  );
}

type Config = { org: { name: string; status: string; trialEndsAt: string | null; reviewResponses: boolean }; steps: { title: string; detail: string; done: boolean; pending?: string }[] };
const GYM_SEES: [boolean, string, string][] = [
  [true, "Asistencia y entrenamientos registrados", "Del programa institucional, para medir uso y adherencia de la sede"],
  [true, "Programa institucional y notas del equipo", "Sólo el equipo de entrenamiento de la sede"],
  [true, "Reseñas del servicio", "La gerencia con nombre; el entrenador sin nombre"],
  [false, "App del socio y su coach privado", "Programas, mensajes y progreso privados"],
  [false, "Salud, nutrición y Mi cuerpo", "Sólo con permiso explícito y para un fin concreto"],
  [false, "Cobros y cuotas de socios", "REPI no gestiona pagos del gym"],
];

export function ConfigScreen({ shell }: { shell: Shell }) {
  const c = useLoad<Config>(`/api/gym/${shell.orgId}/config`);
  const { run } = useAct(shell.flash);
  const toggle = (on: boolean) => run("r", () => api(`/api/gym/${shell.orgId}/config/review-responses`, { body: { on } }), on ? "Los entrenadores pueden responder reseñas." : "Respuestas de entrenadores desactivadas.").then(() => c.reload());
  return (
    <>
      <Head kicker={shell.ctx.org.name} title="Configuración" />
      {c.err && <p role="alert" className="err-box">{c.err}</p>}
      {c.data && (
        <div className="grid-2">
          <section className="card">
            <h2>Puesta en marcha</h2>
            {c.data.steps.map((s, i) => (
              <div key={s.title} className="todo">
                <span className="gy-step" data-done={s.done ? "1" : "0"} aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                <span><b>{s.title}</b><small>{s.detail}{!s.done && s.pending ? ` · ${s.pending}` : ""}</small></span>
                <span className={`chip ${s.done ? "ok" : "mute"}`}>{s.done ? "Listo" : "Pendiente"}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Qué ve el gym de cada socio</h2>
            {GYM_SEES.map(([ok, t, d]) => <div key={t} className="todo"><span className={`chip ${ok ? "ok" : "bad"}`} aria-label={ok ? "Ve" : "No ve"}>{ok ? "✓" : "✕"}</span><span><b>{t}</b><small>{d}</small></span></div>)}
          </section>
          <section className="card">
            <h2>Políticas de reseñas</h2>
            <label className="mrow" style={{ border: "1px solid #E2E8F0" }}>
              <input type="checkbox" checked={c.data.org.reviewResponses} onChange={(e) => toggle(e.target.checked)} />
              <span><b style={{ fontSize: 14 }}>Los entrenadores pueden responder reseñas</b><small className="muted">Una respuesta por reseña; la ven el socio y la gerencia.</small></span>
            </label>
            <div className="trow"><span style={{ flex: 1 }}><b>Publicación externa</b><br /><small className="muted">Deshabilitada: requiere política y consentimiento del socio.</small></span><span className="chip mute">No disponible</span></div>
          </section>
        </div>
      )}
    </>
  );
}
