"use client";
// REPI Admin › Coaching IA (D210, máster §24): cómo se comporta el asistente REPI y cuánto cuesta. Sólo agregados del servidor
// (GET /api/admin/brain): ninguna persona, ningún texto de avisos, mensajes ni memoria. Cifras reales: si algo es 0, se dice
// que no hubo; no hay gráficos inventados (tablas y barras simples con su número visible).
// Límites de la IA del cerebro (PUT /api/admin/brain): global y por organización, con revisión y confirmación. Con 0, la IA
// del cerebro queda apagada y REPI sigue andando con reglas.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { HBar, Head, fmt, nf, useLoad } from "@/components/gym/shared";
import type { BrainMetrics } from "@/server/brain/admin";
import type { AiPolicy } from "@/server/brain/gateway";

type Org = { id: string; name: string };
type Cfg = Record<string, unknown>;
type Field = "enabled" | "user_daily_calls" | "org_monthly_micros" | "global_daily_micros" | "max_concurrency";

const TASK: Record<string, string> = { "brain.chat": "Chat", "brain.intent": "Intención", "brain.explain": "Explicaciones" };
const REASON: Record<string, string> = {
  duplicate: "Repetido", cooldown: "En enfriamiento", daily_cap: "Tope diario", quiet_hours: "Horario de silencio", category_off: "Categoría apagada",
  proactive_off: "Avisos apagados", never_again: "«No mostrar algo parecido»", insufficient_evidence: "Evidencia insuficiente", not_novel: "Nada nuevo",
  minor: "Menor o edad sin confirmar", obsolete: "Obsoleto", lower_priority: "Otro aviso más importante", push_off: "Push apagado",
};
const KIND: Record<string, string> = {
  weekly_target_met: "Objetivo semanal cumplido", inactivity: "¿Retomamos?", pr: "Marca personal", progressing: "Progreso", plateau: "Estancamiento",
  declining: "Baja de rendimiento", program_updated: "Programa actualizado", import_unknowns: "Rutina importada incompleta", low_energy: "Poca energía",
  session_review: "Cierre de sesión", weekly_summary: "Resumen semanal",
};
const ACTION: Record<string, string> = {
  open_workout: "Abrir entrenamiento", show_history: "Ver historial", propose_substitution: "Proponer reemplazo", apply_substitution: "Aplicar reemplazo",
  propose_short_session: "Proponer sesión corta", apply_short_session: "Acortar sesión", save_preference: "Guardar preferencia", delete_memory: "Borrar recuerdo",
  draft_coach_message: "Borrador para el entrenador", floor_help: "Pedir ayuda en sala", report_discomfort: "Registrar molestia", record_feedback: "Registrar opinión",
  propose_to_coach: "Propuesta al entrenador", update_prefs: "Cambiar avisos",
};
const PUSH: Record<string, string> = { pending: "En cola", sent: "Enviados", skipped: "Omitidos", failed: "Fallidos" };
const LABEL: Record<Field, string> = {
  enabled: "IA del cerebro", user_daily_calls: "Llamadas por persona por día", org_monthly_micros: "Presupuesto por organización por mes",
  global_daily_micros: "Presupuesto global por día", max_concurrency: "Llamadas simultáneas (máximo global)",
};
/** Rangos del servidor (server/brain/admin.ts): se validan acá para avisar antes y allá de nuevo. */
const RANGE: Record<Exclude<Field, "enabled">, { max: number; usd?: boolean }> = {
  user_daily_calls: { max: 1_000 }, org_monthly_micros: { max: 1_000, usd: true }, global_daily_micros: { max: 100, usd: true }, max_concurrency: { max: 50 },
};
const GLOBAL_ONLY: Field[] = ["global_daily_micros", "max_concurrency"];

const usd = (v: number) => `US$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.01 ? 6 : 2 })}`;
const ms = (v: number | null) => (v == null ? "—" : `${nf(v)} ms`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
/** Valor guardado para mostrar (micro-dólares como US$). `undefined` = no está definido en este alcance (se hereda). */
const show = (k: Field, v: unknown) => (v === undefined || v === null ? "Heredado" : k === "enabled" ? (v ? "Encendida" : "Apagada")
  : RANGE[k].usd ? usd(Number(v) / 1e6) : nf(Number(v)));
const effShow = (k: Field, p: AiPolicy) => (k === "enabled" ? (p.enabled ? "Encendida" : "Apagada") : RANGE[k].usd ? usd(p[k] / 1e6) : nf(p[k]));

export function AdminCoaching({ orgs, flash }: { orgs: Org[]; flash: (t: string) => void }) {
  const [days, setDays] = useState<7 | 30>(7);
  const d = useLoad<BrainMetrics>(`/api/admin/brain?days=${days}`);
  const m = d.data;
  return (
    <div className="ac">
      <Head kicker="Uso, costo y calidad del asistente REPI. Sólo agregados: sin personas, mensajes ni memoria." title="Coaching IA">
        <label className="ac-period">Período
          <select value={days} onChange={(e) => setDays(Number(e.target.value) === 30 ? 30 : 7)}>
            <option value={7}>7 días</option><option value={30}>30 días</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void d.reload()}>Actualizar</button>
      </Head>
      {d.err && <p role="alert" className="err-box">{d.err} <button type="button" className="btn sm" onClick={() => void d.reload()}>Reintentar</button></p>}
      {!m ? !d.err && <p className="muted">Cargando…</p> : <Metrics m={m} />}
      {m && <PolicyEditor m={m} orgs={orgs} flash={flash} onSaved={() => void d.reload()} />}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="ac-kpi"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

/** Tabla simple: la primera columna rotula la fila; las numéricas van a la derecha (`text` = cuántas columnas de texto hay al principio). */
function Table({ label, head, rows, empty, text = 1 }: { label: string; head: string[]; rows: (string | number)[][]; empty: string; text?: number }) {
  if (!rows.length) return <p className="muted ac-empty">{empty}</p>;
  const num = (i: number) => i >= text;
  return (
    <div className="ac-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="gy-table ac-table">
        <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={num(i) ? "num" : undefined}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={String(r[0]) + String(r[1])}>{r.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i} className={num(i) ? "num" : undefined}>{c}</td>))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Metrics({ m }: { m: BrainMetrics }) {
  const r = m.recommendations, a = m.actions, q = m.questions, ai = m.ai, e = m.engine;
  const answers = q.rules + q.ai + q.fallback + q.safety;
  const range = `${fmt(m.window.since, { day: "numeric", month: "short" })} – ${fmt(m.window.until, { day: "numeric", month: "short" })}`;
  const push = Object.entries(e.push as Record<string, number>);
  return (
    <>
      <p className="muted ac-range">Del {range} ({m.window.days} días). Hora de Buenos Aires.</p>
      <div className="ac-kpis">
        <Kpi label="Recomendaciones emitidas" value={nf(r.emitted)} sub={`${nf(r.accepted)} aceptadas · ${nf(r.dismissed + r.rejected)} descartadas`} />
        <Kpi label="Acciones ejecutadas" value={nf(a.executed)} sub={`${nf(a.blocked)} bloqueadas · ${nf(a.failed)} con falla`} />
        <Kpi label="Respuestas sin IA" value={pct(q.withoutAi, answers)} sub={answers ? `${nf(q.withoutAi)} de ${nf(answers)} respuestas de REPI` : "Sin preguntas en el período"} />
        <Kpi label="Llamadas a la IA" value={nf(ai.totals.calls)} sub={`${nf(ai.totals.errors)} con error · ${nf(ai.totals.cache)} desde caché`} />
        <Kpi label="Costo estimado" value={usd(ai.totals.costUsd)} sub={`${nf(ai.totals.inputTokens)} tokens de entrada · ${nf(ai.totals.outputTokens)} de salida`} />
        <Kpi label="Opiniones de los alumnos" value={`${nf(m.feedback.positive)} · ${nf(m.feedback.negative)}`} sub="Útil · No útil" />
      </div>

      <section className="card" aria-labelledby="ac-engine">
        <h2 id="ac-engine">Estado de los motores</h2>
        <div className="ac-status">
          <span className={`chip ${ai.configured ? "ok" : "mute"}`}>{ai.configured ? "IA configurada" : "Sin clave de IA en este entorno"}</span>
          <span className={`chip ${e.policy.effective.enabled ? "ok" : "warn"}`}>IA del cerebro {e.policy.effective.enabled ? "encendida" : "apagada"} (global)</span>
          {e.breakers.some((b) => b.open) && <span className="chip bad">Breaker abierto</span>}
        </div>
        {!ai.configured && <p className="ac-note">Sin clave, todo se resuelve con reglas: REPI responde con datos y las acciones siguen andando.</p>}
        <h3 className="ac-h3">Circuit breakers</h3>
        <Table label="Circuit breakers por tarea" head={["Tarea", "Modelo", "Estado", "Fallas seguidas"]} empty="Sin tareas." text={3}
          rows={e.breakers.map((b) => [TASK[b.task] ?? b.task, b.model, b.open ? `Abierto hasta ${fmt(b.openedUntil, { hour: "2-digit", minute: "2-digit" })}` : "Cerrado", `${b.failures} de ${b.threshold}`])} />
        <div className="ac-grid">
          <div>
            <h3 className="ac-h3">Avisos proactivos (cron)</h3>
            {e.proactive.last ? (
              <p className="ac-note">Última corrida: {fmt(e.proactive.last.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.proactive.last.result === "ok" ? "bien" : e.proactive.last.result} · {nf(e.proactive.last.evaluated)} evaluadas · {nf(e.proactive.last.emitted)} avisos · {ms(e.proactive.last.ms)}</p>
            ) : <p className="ac-note">Todavía no corrió.</p>}
            <p className="ac-note">En el período: {nf(e.proactive.runs)} corridas · {nf(e.proactive.pushed)} push · {nf(e.proactive.failedUsers)} personas con falla · {nf(e.proactive.budgetHits)} veces sin tiempo.</p>
          </div>
          <div>
            <h3 className="ac-h3">Push del asistente</h3>
            {push.length ? <p className="ac-note">{push.map(([k, n]) => `${PUSH[k] ?? k}: ${nf(n)}`).join(" · ")}</p> : <p className="ac-note">Sin push del asistente en el período.</p>}
          </div>
        </div>
        <h3 className="ac-h3">Modelos con precio conocido</h3>
        <Table label="Modelos y precios" head={["Modelo", "Entrada", "Entrada en caché", "Salida"]} empty="Sin modelos."
          rows={e.models.map((x) => [x.model, ...(x.price ? [x.price.input, x.price.cached, x.price.output].map((p) => `${usd(p)} / M`) : ["Sin precio", "—", "—"])])} />
      </section>

      <div className="ac-grid">
        <section className="card" aria-labelledby="ac-recs">
          <h2 id="ac-recs">Recomendaciones y avisos</h2>
          {r.emitted + r.suppressed === 0 ? <p className="muted ac-empty">Sin recomendaciones en el período.</p> : (
            <Table label="Recomendaciones por estado" head={["Estado", "Cantidad"]} empty=""
              rows={[["Emitidas", nf(r.emitted)], ["Aceptadas", nf(r.accepted)], ["Descartadas («Descartar»)", nf(r.dismissed)], ["Rechazadas («No mostrar algo parecido»)", nf(r.rejected)],
                ["Ignoradas (vencieron sin respuesta)", nf(r.ignored)], ["Abiertas", nf(r.open)], ["Canceladas por obsoletas", nf(r.cancelled)], ["Calladas por el motor", nf(r.suppressed)],
                ["Duplicados evitados por el cron", nf(r.duplicatesAvoided)]]} />
          )}
          <h3 className="ac-h3">Calladas por motivo</h3>
          <Table label="Recomendaciones calladas por motivo" head={["Motivo", "Cantidad"]} empty="Ninguna callada en el período."
            rows={Object.entries(r.suppressedByReason).sort((x, y) => y[1] - x[1]).map(([k, n]) => [REASON[k] ?? k, nf(n)])} />
        </section>
        <section className="card" aria-labelledby="ac-q">
          <h2 id="ac-q">Preguntas a REPI</h2>
          {!answers ? <p className="muted ac-empty">Sin preguntas en el período.</p> : (
            <div className="ac-bars">
              <HBar label="Con reglas (sin IA)" n={q.rules} max={answers} />
              <HBar label="Con IA" n={q.ai} max={answers} color="var(--ui-accent-2)" />
              <HBar label="Sin IA por límite o falla (fallback)" n={q.fallback} max={answers} color="var(--ui-warning)" />
              <HBar label="Respuesta fija de seguridad" n={q.safety} max={answers} color="var(--ui-error)" />
            </div>
          )}
          <p className="ac-note">Opiniones explícitas: {nf(m.feedback.positive)} útiles · {nf(m.feedback.negative)} no útiles.</p>
        </section>
      </div>

      <section className="card" aria-labelledby="ac-kinds">
        <h2 id="ac-kinds">Recomendaciones por tipo</h2>
        <Table label="Recomendaciones por tipo" head={["Tipo", "Emitidas", "Aceptadas", "Descartadas", "Rechazadas", "Ignoradas", "Calladas"]} empty="Sin recomendaciones en el período."
          rows={Object.entries(r.byKind).sort((x, y) => y[1].emitted - x[1].emitted).map(([k, v]) => [KIND[k] ?? k, nf(v.emitted), nf(v.accepted), nf(v.dismissed), nf(v.never), nf(v.ignored), nf(v.suppressed)])} />
      </section>

      <section className="card" aria-labelledby="ac-acts">
        <h2 id="ac-acts">Acciones</h2>
        <p className="ac-note">{nf(a.proposed)} propuestas · {nf(a.confirmed)} confirmadas · {nf(a.executed)} ejecutadas · {nf(a.blocked)} bloqueadas · {nf(a.failed)} con falla · {nf(a.cancelled)} canceladas por la persona.</p>
        <Table label="Acciones por tipo" head={["Acción", "Propuestas", "Confirmadas", "Ejecutadas", "Bloqueadas", "Con falla", "Canceladas"]} empty="Sin acciones en el período."
          rows={Object.entries(a.byKind).map(([k, v]) => [ACTION[k] ?? k, ...(["proposed", "confirmed", "executed", "blocked", "failed", "cancelled"] as const).map((s) => nf(v[s] ?? 0))])} />
      </section>

      <section className="card" aria-labelledby="ac-ai">
        <h2 id="ac-ai">IA por tarea y modelo</h2>
        <p className="ac-note">Latencia p50/p95 sólo de llamadas reales al proveedor. «Límite» = no se llamó por cuota diaria, presupuesto, breaker o concurrencia: respondió REPI con reglas.</p>
        <Table label="Uso de IA por tarea y modelo"
          head={["Tarea · modelo", "Llamadas", "OK", "Errores", "Tiempo agotado", "Salida inválida", "Cuota", "Presupuesto", "Breaker", "Concurrencia", "Caché", "Tokens entrada", "Tokens en caché", "Tokens salida", "Costo", "p50", "p95"]}
          empty="Sin uso de IA en el período."
          rows={ai.byTaskModel.map((x) => [`${TASK[x.task] ?? x.task} · ${x.model}`, nf(x.calls), nf(x.ok), nf(x.errors), nf(x.timeouts), nf(x.badOutput), nf(x.quota), nf(x.budget), nf(x.breaker), nf(x.concurrency), nf(x.cache),
            nf(x.inputTokens), nf(x.cachedTokens), nf(x.outputTokens), usd(x.costUsd), ms(x.p50LatencyMs), ms(x.p95LatencyMs)])} />
      </section>
    </>
  );
}

// ── Límites ─────────────────────────────────────────────────────────────────
type Form = { enabled: "" | "on" | "off"; user_daily_calls: string; org_monthly_micros: string; global_daily_micros: string; max_concurrency: string };
const toForm = (c: Cfg): Form => ({
  enabled: c.enabled === true ? "on" : c.enabled === false ? "off" : "",
  user_daily_calls: c.user_daily_calls == null ? "" : String(c.user_daily_calls),
  org_monthly_micros: c.org_monthly_micros == null ? "" : String(Number(c.org_monthly_micros) / 1e6).replace(".", ","),
  global_daily_micros: c.global_daily_micros == null ? "" : String(Number(c.global_daily_micros) / 1e6).replace(".", ","),
  max_concurrency: c.max_concurrency == null ? "" : String(c.max_concurrency),
});
/** Texto del campo → valor a guardar (`undefined` = vacío, se hereda) o el mensaje de error. */
function parse(k: Exclude<Field, "enabled">, raw: string): { v: number | undefined } | { err: string } {
  const t = raw.trim().replace(",", ".");
  if (!t) return { v: undefined };
  const { max, usd: money } = RANGE[k];
  if (money ? !/^\d+(\.\d{1,2})?$/.test(t) : !/^\d+$/.test(t)) return { err: money ? "Escribí un importe en dólares, con hasta 2 decimales." : "Escribí un número entero." };
  const n = Number(t);
  if (n > max) return { err: `El máximo es ${money ? usd(max) : nf(max)}.` };
  return { v: money ? Math.round(n * 1e6) : n };
}

function PolicyEditor({ m, orgs, flash, onSaved }: { m: BrainMetrics; orgs: Org[]; flash: (t: string) => void; onSaved: () => void }) {
  const pol = m.engine.policy;
  const [scope, setScope] = useState("global");
  const isGlobal = scope === "global";
  // Lo que devolvió el servidor al guardar vale hasta que llegan las métricas nuevas (sin parpadeo de «Revisar cambios»).
  const [override, setOverride] = useState<{ scope: string; config: Cfg } | null>(null);
  useEffect(() => { setOverride(null); }, [pol]);
  const stored: Cfg = useMemo(() => (override?.scope === scope ? override.config
    : isGlobal ? (pol.global as Cfg) : ((pol.orgs.find((o) => o.scope === scope)?.config as Cfg | undefined) ?? {})), [override, isGlobal, pol, scope]);
  const [form, setFormRaw] = useState<Form>(() => toForm(stored));
  // Una recarga de métricas no pisa lo que la persona está escribiendo: sólo se reinicia el formulario si no lo tocó.
  const [dirty, setDirty] = useState(false);
  const setForm = (f: Form) => { setFormRaw(f); setDirty(true); };
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ scope: string; effective: AiPolicy } | null>(null);
  useEffect(() => { setDirty(false); setFormRaw(toForm(stored)); setErr(null); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dirty) setFormRaw(toForm(stored)); }, [stored]); // eslint-disable-line react-hooks/exhaustive-deps
  const orgName = (s: string) => orgs.find((o) => `org:${o.id}` === s)?.name ?? s.slice(4);
  const scopeName = isGlobal ? "toda la plataforma" : orgName(scope);
  const options = [...orgs.map((o) => ({ scope: `org:${o.id}`, name: o.name })),
    ...pol.orgs.filter((o) => !orgs.some((x) => `org:${x.id}` === o.scope)).map((o) => ({ scope: o.scope, name: o.scope.slice(4) }))];
  const fields: Field[] = isGlobal ? ["enabled", "user_daily_calls", "global_daily_micros", "org_monthly_micros", "max_concurrency"] : ["enabled", "user_daily_calls", "org_monthly_micros"];

  // Validación y parche: lo distinto de lo guardado; vacío = vuelve a heredar (null).
  const errors: Partial<Record<Field, string>> = {};
  const patch: Cfg = {};
  for (const k of fields) {
    const next = k === "enabled" ? (form.enabled === "" ? undefined : form.enabled === "on") : (() => { const p = parse(k, form[k]); if ("err" in p) { errors[k] = p.err; return stored[k]; } return p.v; })();
    const cur = stored[k] ?? undefined;
    if (next !== cur) patch[k] = next === undefined ? null : next;
  }
  const changed = Object.keys(patch) as Field[];
  const turnsOff = changed.some((k) => patch[k] === 0 || patch[k] === false);
  // Global vacío = valor por defecto; organización vacía = lo vigente en global.
  const inherited = (k: Field) => (k === "enabled" ? effShow(k, isGlobal ? pol.defaults : pol.effective).toLowerCase() : effShow(k, isGlobal ? pol.defaults : pol.effective));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ scope: string; config: Cfg; effective: AiPolicy }>("/api/admin/brain", { method: "PUT", body: { scope, config: patch } });
      setSaved({ scope: r.scope, effective: r.effective }); setReview(false);
      setOverride({ scope: r.scope, config: r.config }); setFormRaw(toForm(r.config)); setDirty(false);
      flash(`Límites guardados para ${scopeName}.`);
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="card" aria-labelledby="ac-limits">
      <h2 id="ac-limits">Límites de la IA del cerebro</h2>
      <p className="ac-note">Topes del chat, la interpretación de mensajes y las explicaciones de REPI. <b>Con 0 (o apagada), la IA del cerebro no se usa y todo sigue andando con reglas:</b> entrenar, registrar, la guía por serie y las respuestas con datos no dependen de la IA.</p>
      <div className="ac-eff" aria-label="Política vigente (global)">
        <h3 className="ac-h3">Vigente (global)</h3>
        <dl>{(["enabled", "user_daily_calls", "global_daily_micros", "org_monthly_micros", "max_concurrency"] as Field[]).map((k) => <div key={k}><dt>{LABEL[k]}</dt><dd>{effShow(k, pol.effective)}{k !== "enabled" && pol.effective[k] === 0 ? " · IA apagada" : ""}</dd></div>)}</dl>
      </div>
      <label className="field ac-scope">Alcance
        <select value={scope} onChange={(e) => { setScope(e.target.value); setSaved(null); }}>
          <option value="global">Global (toda la plataforma)</option>
          {options.map((o) => <option key={o.scope} value={o.scope}>{o.name}{pol.orgs.some((x) => x.scope === o.scope) ? " · con límites propios" : ""}</option>)}
        </select>
      </label>
      {!isGlobal && <p className="ac-note">Lo que dejes vacío se hereda del global. Apagarla acá la apaga sólo para {scopeName}; los topes globales (por día y simultáneas) se editan en Global.</p>}
      <div className="ac-form">
        {fields.map((k) => k === "enabled" ? (
          <label key={k} className="field">{LABEL[k]}
            <select value={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.value as Form["enabled"] })}>
              <option value="">Heredar ({inherited("enabled")})</option><option value="on">Encendida</option><option value="off">Apagada</option>
            </select>
          </label>
        ) : (
          <label key={k} className="field">{LABEL[k]}{RANGE[k].usd ? " (US$)" : ""}
            <input inputMode={RANGE[k].usd ? "decimal" : "numeric"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={`Heredado: ${inherited(k)}`} aria-invalid={errors[k] ? true : undefined} aria-describedby={`ac-${k}-help`} />
            <small id={`ac-${k}-help`} className={errors[k] ? "ac-err" : "muted"}>{errors[k] ?? `De 0 a ${RANGE[k].usd ? usd(RANGE[k].max) : nf(RANGE[k].max)}. 0 apaga la IA${GLOBAL_ONLY.includes(k) || isGlobal ? "" : " de esta organización"}. Vacío: se hereda.`}</small>
          </label>
        ))}
      </div>
      <div className="ac-foot">
        <button type="button" className="btn pri" aria-disabled={!changed.length || Object.keys(errors).length > 0} onClick={() => { if (changed.length && !Object.keys(errors).length) { setErr(null); setReview(true); } }}>
          {Object.keys(errors).length ? "Revisá los valores" : changed.length ? "Revisar cambios" : "Sin cambios"}
        </button>
        {changed.length > 0 && <button type="button" className="btn" onClick={() => { setFormRaw(toForm(stored)); setDirty(false); }}>Descartar</button>}
      </div>
      {saved && saved.scope === scope && (
        <div className="ac-eff" role="status">
          <h3 className="ac-h3">Vigente ahora para {scopeName}</h3>
          <dl>{(["enabled", "user_daily_calls", "global_daily_micros", "org_monthly_micros", "max_concurrency"] as Field[]).map((k) => <div key={k}><dt>{LABEL[k]}</dt><dd>{effShow(k, saved.effective)}</dd></div>)}</dl>
        </div>
      )}
      {review && (
        <Modal label="Confirmar límites de la IA" onClose={() => setReview(false)}>
          <div className="mhead"><h2>Confirmar límites · {isGlobal ? "Global" : scopeName}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setReview(false)}>×</button></div>
          <div className="ac-scroll" role="region" aria-label="Cambios a guardar" tabIndex={0}>
            <table className="gy-table ac-table">
              <thead><tr><th scope="col">Límite</th><th scope="col">Antes</th><th scope="col">Después</th></tr></thead>
              <tbody>{changed.map((k) => <tr key={k}><th scope="row">{LABEL[k]}</th><td>{show(k, stored[k])}</td><td>{show(k, patch[k])}</td></tr>)}</tbody>
            </table>
          </div>
          {turnsOff && <p className="gy-warn" role="note" style={{ margin: 0 }}>Esto apaga la IA del cerebro para {scopeName}. REPI sigue respondiendo con reglas y nada del entrenamiento se bloquea.</p>}
          <span className="muted" style={{ fontSize: 13 }}>Queda registrado en la auditoría con el antes y el después. Se aplica en segundos.</span>
          {err && <p role="alert" className="err-box">{err}</p>}
          <div className="mfoot"><button type="button" className="btn" onClick={() => setReview(false)}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy || undefined} disabled={busy} onClick={() => void save()}>Guardar límites</button></div>
        </Modal>
      )}
    </section>
  );
}
