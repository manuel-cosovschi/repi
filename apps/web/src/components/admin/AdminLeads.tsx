"use client";
// REPI Admin › Captación (D218, REPI Sales Intelligence 1.0). Investigación, expedientes con fuentes, puntaje explicable,
// mensajes, campañas con aprobación, seguimientos, panel y agente. Nada se envía solo: abrir WhatsApp o Gmail no marca el
// envío; «Lo envié» lo confirma una persona. Toda acción va a /api/admin/captacion (Admin con 2FA).
import { Fragment, useEffect, useState } from "react";
import {
  INTENT_LABEL, INTENTS, LEAD_CATEGORIES, LEAD_CATEGORY_LABEL, LEAD_STAGES, LEAD_STAGE_LABEL, OBJECTION_PLAYBOOK, OBJECTIONS, SCORE_FACTORS, SCORE_FACTOR_LABEL, VARIANTS, VARIANT_LABEL, localDate,
  type Intent, type LeadStage, type Objection, type Variant,
} from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, fmt, useLoad, when } from "@/components/gym/shared";

type Flash = (t: string) => void;
const B = "/api/admin/captacion";
const today = () => localDate(new Date());
const go = async (fn: () => Promise<unknown>, flash: Flash, ok: string, after?: () => void) => { try { await fn(); flash(ok); after?.(); return true; } catch (e) { flash((e as Error).message); return false; } };
const BAND_CHIP: Record<string, string> = { very_high: "ok", high: "info", medium: "warn", low: "mute" };
const CH: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", instagram: "Instagram", phone: "Teléfono", facebook: "Facebook", in_person: "En persona", other: "Otro" };
const money = (minor: number | null | undefined) => minor == null ? "—" : `$${Math.round(minor / 100).toLocaleString("es-AR")}`;
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v} %`);

type Tab = "today" | "leads" | "pipeline" | "campaigns" | "dashboard" | "agent" | "runs" | "settings";
export function AdminLeads({ flash }: { flash: Flash }) {
  const [tab, setTab] = useState<Tab>("today");
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [bump, setBump] = useState(0);
  const reload = () => setBump((x) => x + 1);
  return (
    <>
      <Head kicker="Investigación de gimnasios, contacto preparado y seguimiento. Nada se envía sin aprobación o confirmación." title="Captación">
        <button type="button" className="btn pri" onClick={() => setCreate(true)}>Agregar gimnasio</button>
      </Head>
      <div className="tabs sv-tabs" role="tablist" aria-label="Secciones de captación">
        {([["today", "Hoy"], ["leads", "Leads"], ["pipeline", "Pipeline"], ["campaigns", "Campañas"], ["dashboard", "Panel"], ["agent", "Agente"], ["runs", "Procesos"], ["settings", "Ajustes"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div key={`${tab}:${bump}`} className="sv-sec">
        {tab === "today" && <Today onOpen={setOpen} />}
        {tab === "leads" && <Leads onOpen={setOpen} flash={flash} />}
        {tab === "pipeline" && <Pipeline onOpen={setOpen} />}
        {tab === "campaigns" && <Campaigns flash={flash} onOpen={setOpen} />}
        {tab === "dashboard" && <Dashboard />}
        {tab === "agent" && <Agent onOpen={setOpen} />}
        {tab === "runs" && <Runs flash={flash} />}
        {tab === "settings" && <Settings flash={flash} />}
      </div>
      {open && <LeadModal id={open} flash={flash} onClose={() => { setOpen(null); reload(); }} onOpen={setOpen} />}
      {create && <LeadForm flash={flash} onClose={(id) => { setCreate(false); if (id) setOpen(id); reload(); }} />}
    </>
  );
}

// ── Hoy ─────────────────────────────────────────────────────────────────────
type Action = { kind: string; title: string; why: string; leadId: string | null; dueOn: string | null };
type TodayV = { summary: { day: string; found: number; sent: number; replies: number; hot: number; drafts: number; due: number; actions: Action[]; errors: { kind: string; error: string | null }[] };
  lastReport: { startedAt: string } | null; schedule: { enabled: boolean }; tasks: { id: string; businessId: string; name: string; kind: string; dueOn: string; dueAt: string | null; note: string | null }[] };
function Today({ onOpen }: { onOpen: (id: string) => void }) {
  const d = useLoad<TodayV>(`${B}/today`);
  const v = d.data;
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  if (!v) return <p className="muted">Cargando…</p>;
  const s = v.summary;
  return (
    <>
      {!v.schedule.enabled && <p className="sv-note">La programación diaria está apagada: los procesos corren cuando los lanzás desde «Procesos». Se enciende en Ajustes.</p>}
      <div className="sv-kpis">
        <div className="sv-kpi"><span>Nuevos hoy</span><strong>{s.found}</strong></div>
        <div className="sv-kpi"><span>Enviados hoy (confirmados)</span><strong>{s.sent}</strong></div>
        <div className="sv-kpi"><span>Respuestas hoy</span><strong>{s.replies}</strong></div>
        <div className="sv-kpi"><span>Oportunidades calientes</span><strong>{s.hot}</strong><small>Pasaron hoy a interesado o reunión</small></div>
        <div className="sv-kpi"><span>Borradores por revisar</span><strong>{s.drafts}</strong></div>
        <div className="sv-kpi"><span>Tareas vencidas o de hoy</span><strong>{s.due}</strong></div>
      </div>
      {s.errors.length > 0 && <p role="alert" className="err-box">Procesos con problemas hoy: {s.errors.map((e) => `${e.kind}: ${e.error ?? "error"}`).join(" · ")}</p>}
      <section className="card"><h2>Las 5 acciones de hoy</h2>
        {s.actions.length ? <ol className="ld-actions">{s.actions.map((a, i) => <li key={i}><button type="button" className="ld-link" disabled={!a.leadId} onClick={() => a.leadId && onOpen(a.leadId)}>{a.title}</button><small>{a.why}</small></li>)}</ol> : <p className="sv-note">No hay acciones pendientes.</p>}
      </section>
      <section className="card"><h2>Agenda (7 días)</h2>
        {v.tasks.length ? <ul className="sv-timeline">{v.tasks.map((t) => <li key={t.id}><button type="button" className="ld-link" onClick={() => onOpen(t.businessId)}>{t.name}</button> · {t.note ?? t.kind}<small>{t.dueAt ? t.dueAt.replace("T", " ") : fmt(`${t.dueOn}T15:00:00Z`)}{t.dueOn < today() ? " · vencida" : ""}</small></li>)}</ul> : <p className="sv-note">Sin tareas.</p>}
      </section>
    </>
  );
}

// ── Leads ───────────────────────────────────────────────────────────────────
type Row = { id: string; name: string; city: string | null; locality: string | null; categoryLabel: string; score: number; band: string; bandLabel: string; stage: string; stageLabel: string; channel: string | null;
  hasPhone: boolean; hasEmail: boolean; hasIg: boolean; hasWeb: boolean; exclusion: string | null; doNotContact: boolean; review: boolean; nextAction: string | null; nextActionOn: string | null; topReason: string | null };
type List = { total: number; page: number; pages: number; cities: string[]; rows: Row[] };
function Leads({ onOpen, flash }: { onOpen: (id: string) => void; flash: Flash }) {
  const [f, setF] = useState({ view: "queue", q: "", city: "", stage: "", band: "", sort: "score", page: 1 });
  const [q, setQ] = useState("");
  const [imp, setImp] = useState(false);
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q, page: 1 })), 300); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  const d = useLoad<List>(`${B}/list?${qs}`, { keep: true });
  return (
    <>
      <div className="sv-filter">
        <select aria-label="Vista" value={f.view} onChange={(e) => setF({ ...f, view: e.target.value, page: 1 })}>
          <option value="queue">Cola de contacto</option><option value="">Todos</option><option value="research">Pendientes de investigación</option><option value="review">Posibles duplicados</option><option value="excluded">Excluidos / no contactar</option>
        </select>
        <input type="search" aria-label="Buscar" placeholder="Buscar nombre, ciudad, Instagram" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Ciudad" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, page: 1 })}><option value="">Todas las ciudades</option>{d.data?.cities.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Etapa" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value, page: 1 })}><option value="">Toda etapa</option>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABEL[s]}</option>)}</select>
        <select aria-label="Prioridad" value={f.band} onChange={(e) => setF({ ...f, band: e.target.value, page: 1 })}><option value="">Toda prioridad</option><option value="very_high">Muy alta (80–100)</option><option value="high">Alta (60–79)</option><option value="medium">Media (40–59)</option><option value="low">Baja (0–39)</option></select>
        <a className="btn sm" href={`${B}/export/csv`}>CSV</a><a className="btn sm" href={`${B}/export/xls`}>Excel</a>
        <button type="button" className="btn sm" onClick={() => setImp(true)}>Importar</button>
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.rows.length ? <div className="empty">No hay gimnasios con estos filtros. Lanzá la investigación desde «Procesos» o importá una lista.</div> : <>
        <p className="sv-note">{d.data.total} gimnasio{d.data.total === 1 ? "" : "s"}. Puntaje 0–100 explicable: abrí cada uno para ver por qué.</p>
        <section className="card" style={{ padding: 0 }}><div style={{ overflowX: "auto" }} tabIndex={0}>
          <table className="gy-table sv-reps-table ld-table"><caption className="sr-only">Gimnasios</caption>
            <thead><tr><th>Gimnasio</th><th>Puntaje</th><th>Etapa</th><th>Contacto</th><th>Próxima acción</th></tr></thead>
            <tbody>{d.data.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row"><button type="button" className="ld-link" onClick={() => onOpen(r.id)}>{r.name}</button><br /><small className="muted">{[r.locality !== r.city ? r.locality : null, r.city].filter(Boolean).join(", ")} · {r.categoryLabel}</small>
                  {r.review && <span className="chip warn">Posible duplicado</span>}{r.doNotContact ? <span className="chip bad">No contactar</span> : r.exclusion && <span className="chip mute">Excluido</span>}</th>
                <td data-label="Puntaje"><span className={`chip ${BAND_CHIP[r.band]}`}>{r.score} · {r.bandLabel}</span><br /><small className="muted">{r.topReason}</small></td>
                <td data-label="Etapa">{r.stageLabel}</td>
                <td data-label="Contacto">{[r.hasPhone && "Tel.", r.hasEmail && "Email", r.hasIg && "IG", r.hasWeb && "Web"].filter(Boolean).join(" · ") || "—"}{r.channel && <><br /><small className="muted">Mejor canal: {CH[r.channel]}</small></>}</td>
                <td data-label="Próxima acción">{r.nextAction ?? "—"}{r.nextActionOn && <><br /><small className="muted">{fmt(`${r.nextActionOn}T15:00:00Z`)}</small></>}</td>
              </tr>))}</tbody>
          </table></div></section>
        {d.data.pages > 1 && <div className="sv-filter"><button type="button" className="btn sm" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Anterior</button><span className="muted">Página {f.page} de {d.data.pages}</span><button type="button" className="btn sm" disabled={f.page >= d.data.pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Siguiente</button></div>}
      </>}
      {imp && <ImportModal flash={flash} onClose={() => { setImp(false); d.reload(); }} />}
    </>
  );
}

function ImportModal({ flash, onClose }: { flash: Flash; onClose: () => void }) {
  const [mode, setMode] = useState<"leads" | "exclusions">("leads");
  const [text, setText] = useState("");
  const [res, setRes] = useState<string | null>(null);
  const run = async () => {
    try {
      let rows: unknown[];
      if (mode === "leads") {
        const t = text.trim();
        if (t.startsWith("[")) rows = JSON.parse(t);
        else {
          const lines = t.split(/\r?\n/).filter(Boolean);
          const head = lines.shift()?.split(/[;,\t]/).map((h) => h.trim().toLowerCase()) ?? [];
          const idx = (k: string[]) => head.findIndex((h) => k.includes(h));
          const col = { name: idx(["nombre", "name"]), city: idx(["ciudad", "city"]), phone: idx(["telefono", "teléfono", "phone"]), email: idx(["email", "mail"]), instagram: idx(["instagram"]), website: idx(["sitio", "web", "website"]), address: idx(["direccion", "dirección", "address"]), whatsapp: idx(["whatsapp"]), source: idx(["fuente", "source"]) };
          if (col.name < 0 || col.city < 0) throw new Error("La primera fila tiene que tener al menos «nombre» y «ciudad».");
          rows = lines.map((l) => { const c = l.split(/[;,\t]/).map((x) => x.trim()); const g = (i: number) => (i >= 0 ? c[i] || null : null); const src = g(col.source);
            return { name: g(col.name), city: g(col.city), phone: g(col.phone), email: g(col.email), instagram: g(col.instagram), website: g(col.website), address: g(col.address), whatsapp: g(col.whatsapp),
              sources: src ? Object.fromEntries(["phone", "email", "instagram", "website", "address", "whatsapp"].filter((k) => g(col[k as keyof typeof col])).map((k) => [k, { url: src, type: "import" }])) : undefined }; });
        }
        const r = await api<{ created: number; updated: number; branch: number; review: number; unchanged: number; excluded: number; errors: string[] }>(`${B}/import`, { body: { label: "Importación", rows } });
        setRes(`Nuevos ${r.created} · actualizados ${r.updated} · sedes ${r.branch} · a revisar ${r.review} · sin cambios ${r.unchanged} · excluidos ${r.excluded}${r.errors.length ? ` · errores ${r.errors.length}: ${r.errors.slice(0, 3).join("; ")}` : ""}`);
      } else {
        rows = text.split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((x) => x.trim())).filter((c) => c[0]).map((c) => ({ name: c[0], city: c[1] || null, reason: c[2] || "Lista de exclusión" }));
        const r = await api<{ marked: number; notFound: string[] }>(`${B}/exclusions`, { body: { rows } });
        setRes(`Marcados ${r.marked}.${r.notFound.length ? ` Sin coincidencia: ${r.notFound.join(", ")}` : ""}`);
      }
      flash("Importación terminada.");
    } catch (e) { flash((e as Error).message); }
  };
  return (
    <Modal label="Importar" onClose={onClose} wide>
      <div className="mhead"><h2>Importar</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <div className="seg" role="tablist" aria-label="Qué importar">
        <button type="button" role="tab" aria-selected={mode === "leads"} onClick={() => setMode("leads")}>Gimnasios</button>
        <button type="button" role="tab" aria-selected={mode === "exclusions"} onClick={() => setMode("exclusions")}>Lista de exclusión</button>
      </div>
      <p className="sv-note">{mode === "leads" ? "CSV con encabezado (nombre, ciudad, teléfono, email, instagram, sitio, dirección, whatsapp, fuente) o JSON con la fuente de cada dato. Todo entra «sin verificar» hasta que alguien lo confirme. Si ya existe, se actualiza el mismo expediente." : "Una línea por negocio: nombre; ciudad; motivo. Clientes actuales, conversaciones abiertas o ya contactados: quedan fuera de la cola."}</p>
      <label className="field">Contenido<textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} /></label>
      {res && <p className="sv-note" role="status">{res}</p>}
      <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cerrar</button><button type="button" className="btn pri" disabled={!text.trim()} onClick={run}>Importar</button></div>
    </Modal>
  );
}

// ── Ficha ───────────────────────────────────────────────────────────────────
type Fact = { id: string; field: string; value: string; sourceLabel: string; sourceUrl: string | null; status: string; observedAt: string; current: boolean };
type Msg = { id: string; direction: "in" | "out"; channel: string; variant: string | null; step: number | null; subject: string | null; body: string; status: string; generatedBy: string | null; guardIssues: string[]; intent: string | null; confidence: number | null; needsReview: boolean; reviewedAt: string | null; sentAt: string | null; createdAt: string; campaignId: string | null; links: { kind: string; label: string; url: string }[] };
type Detail = {
  lead: { id: string; name: string; city: string | null; locality: string | null; address: string | null; website: string | null; instagram: string | null; facebook: string | null; email: string | null; phone: string | null; whatsapp: string | null;
    category: string; categoryLabel: string; positioning: string | null; branches: number | null; estMembers: number | null; contactName: string | null; contactRole: string | null; stage: string; stageLabel: string; score: number; scoreBand: string; bandLabel: string;
    scoreLines: { factor: string; points: number; max: number; why: string }[]; exclusion: string | null; exclusionNote: string | null; doNotContact: boolean; reviewOfId: string | null; reviewSignals: string[] | null; channel: string | null;
    nextAction: string | null; nextActionOn: string | null; firstSentOn: string | null; followupsSent: number; sequenceStopped: boolean; snoozeUntil: string | null; techSignals: { kind: string; evidence: string }[]; notes: string | null; firstSeenAt: string; lastVerifiedAt: string | null };
  facts: Fact[]; activity: { id: string; kind: string; summary: string; actorRole: string; createdAt: string }[]; messages: Msg[];
  tasks: { id: string; kind: string; dueOn: string; dueAt: string | null; note: string | null; status: string }[]; review: { id: string; name: string; city: string | null; address: string | null } | null; chain: { id: string; name: string; address: string | null }[]; rep: { id: string; name: string } | null;
};
const FIELD: Record<string, string> = { name: "Nombre", legalName: "Razón social", address: "Dirección", locality: "Barrio", website: "Sitio", instagram: "Instagram", facebook: "Facebook", email: "Email", phone: "Teléfono", whatsapp: "WhatsApp", branches: "Sedes", estMembers: "Socios", category: "Tipo", positioning: "Posicionamiento", tools: "Herramientas", contactName: "Responsable", contactRole: "Cargo" };
function LeadModal({ id, flash, onClose, onOpen }: { id: string; flash: Flash; onClose: () => void; onOpen: (id: string) => void }) {
  const d = useLoad<Detail>(`${B}/lead/${id}`);
  const [tab, setTab] = useState<"contact" | "data" | "history">("contact");
  const [edit, setEdit] = useState(false);
  const v = d.data;
  const post = (path: string, body: unknown, ok: string) => go(() => api(`${B}/${path}`, { body }), flash, ok, d.reload);
  if (!v) return <Modal label="Gimnasio" onClose={onClose} wide><p className="muted">{d.err ?? "Cargando…"}</p></Modal>;
  const l = v.lead;
  return (
    <Modal label={`Gimnasio ${l.name}`} onClose={onClose} wide>
      <div className="mhead"><h2>{l.name} <span className={`chip ${BAND_CHIP[l.scoreBand]}`}>{l.score} · {l.bandLabel}</span></h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <p className="sv-note">{[l.locality !== l.city ? l.locality : null, l.city].filter(Boolean).join(", ")} · {l.categoryLabel} · {l.stageLabel}{v.rep && <> · Vendedor: <b>{v.rep.name}</b></>}</p>
      {l.doNotContact && <p role="alert" className="err-box">No contactar: pidió no recibir mensajes. No se preparan ni registran envíos.</p>}
      {!l.doNotContact && l.exclusion && <p className="sv-note"><span className="chip mute">Excluido</span> {l.exclusionNote}</p>}
      {v.review && <section className="card ld-warn"><b>¿Es el mismo negocio que «{v.review.name}»?</b><small> Coincide por {l.reviewSignals?.join(", ")}. {v.review.address ?? ""}</small>
        <div className="sv-checks"><button type="button" className="btn sm" onClick={() => onOpen(v.review!.id)}>Ver el otro</button><button type="button" className="btn sm" onClick={() => post(`lead/${id}/review`, { action: "distinct" }, "Marcado como distinto.")}>Son distintos</button>
          <button type="button" className="btn sm" onClick={async () => { if (!confirm("¿Fusionar en el otro expediente? Los datos de este pasan como historia.")) return; try { const r = await api<{ id: string }>(`${B}/lead/${id}/review`, { body: { action: "merge" } }); flash("Fusionados."); onOpen(r.id); } catch (e) { flash((e as Error).message); } }}>Fusionar</button></div></section>}
      <div className="seg" role="tablist" aria-label="Ficha">
        {([["contact", "Contacto"], ["data", "Datos y puntaje"], ["history", "Historial"]] as const).map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      {tab === "contact" && <ContactTab v={v} flash={flash} reload={d.reload} />}
      {tab === "data" && <DataTab v={v} flash={flash} reload={d.reload} onEdit={() => setEdit(true)} />}
      {tab === "history" && <section className="card"><ul className="sv-timeline">{v.activity.map((a) => <li key={a.id}>{a.summary}<small>{when(a.createdAt)} · {a.actorRole === "system" ? "sistema" : a.actorRole === "rep" ? "vendedor" : "admin"}</small></li>)}</ul></section>}
      {edit && <LeadForm flash={flash} lead={l} onClose={() => { setEdit(false); d.reload(); }} />}
    </Modal>
  );
}

function ContactTab({ v, flash, reload }: { v: Detail; flash: Flash; reload: () => void }) {
  const l = v.lead;
  const [variant, setVariant] = useState<Variant>("first_contact");
  const [channel, setChannel] = useState<string>(l.channel ?? "whatsapp");
  const [objection, setObjection] = useState<Objection>("budget");
  const [reply, setReply] = useState({ channel: l.channel ?? "whatsapp", text: "", receivedOn: today() });
  const [task, setTask] = useState({ kind: "meeting", dueOn: today(), time: "", note: "" });
  const [note, setNote] = useState("");
  const [stage, setStage] = useState({ stage: l.stage, note: "" });
  const [assign, setAssign] = useState({ repId: "", reason: "" });
  const reps = useLoad<{ id: string; name: string; status: string }[]>("/api/admin/sales/reps/options");
  const post = (path: string, body: unknown, ok: string, after?: () => void) => go(() => api(`${B}/${path}`, { body }), flash, ok, () => { reload(); after?.(); });
  const channels = [l.whatsapp && "whatsapp", l.email && "email", l.instagram && "instagram"].filter(Boolean) as string[];
  return (
    <>
      <section className="card"><h2>Mensajes</h2>
        {!l.doNotContact && <div className="sv-filter">
          <select aria-label="Variante" value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>{VARIANTS.map((x) => <option key={x} value={x}>{VARIANT_LABEL[x]}</option>)}</select>
          {variant === "objection" && <select aria-label="Objeción" value={objection} onChange={(e) => setObjection(e.target.value as Objection)}>{OBJECTIONS.map((o) => <option key={o} value={o}>{OBJECTION_PLAYBOOK[o].label}</option>)}</select>}
          <select aria-label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)}>{channels.length ? channels.map((c) => <option key={c} value={c}>{CH[c]}</option>) : <option value="">Sin canal publicado</option>}</select>
          {l.phone && <a className="btn sm" href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}>Llamar</a>}
          <button type="button" className="btn sm pri" disabled={!channels.length} onClick={() => post(`lead/${l.id}/draft`, { variant, channel, objection: variant === "objection" ? objection : null }, "Borrador listo: revisalo antes de enviar.")}>Preparar mensaje</button>
        </div>}
        {!channels.length && !l.doNotContact && <p className="sv-note">Sin WhatsApp, email ni Instagram publicados{l.phone ? ": llamá y, si te dan un WhatsApp o email, cargalo en «Datos»." : ". Completá los datos para poder contactarlo."}</p>}
        {variant === "objection" && <p className="sv-note">Preocupación: {OBJECTION_PLAYBOOK[objection].concern}. Respuesta sugerida y próximo paso en el borrador.</p>}
        {v.messages.length === 0 ? <p className="sv-note">Todavía no hay mensajes.</p> : <ul className="ld-msgs">{v.messages.map((m) => <MessageItem key={m.id} m={m} flash={flash} reload={reload} />)}</ul>}
      </section>
      <section className="card"><h2>Registrar una respuesta</h2>
        <p className="sv-note">Pegá lo que respondió. Se clasifica la intención y se aplica: baja, tarea en la fecha pedida, reunión o cierre de la secuencia. Nunca contesta sola.</p>
        <div className="sv-filter"><select aria-label="Canal de la respuesta" value={reply.channel} onChange={(e) => setReply({ ...reply, channel: e.target.value })}>{Object.entries(CH).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <input type="date" aria-label="Fecha" value={reply.receivedOn} max={today()} onChange={(e) => setReply({ ...reply, receivedOn: e.target.value })} /></div>
        <label className="field">Texto<textarea rows={3} value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} /></label>
        <div className="mfoot"><button type="button" className="btn pri" disabled={!reply.text.trim()} onClick={async () => {
          try { const r = await api<{ label: string; confidence: number; needsReview: boolean; followUpOn: string | null }>(`${B}/lead/${l.id}/reply`, { body: reply }); flash(`${r.label} (${Math.round(r.confidence * 100)} %)${r.needsReview ? " · revisala" : ""}${r.followUpOn ? ` · tarea el ${r.followUpOn}` : ""}`); setReply({ ...reply, text: "" }); reload(); } catch (e) { flash((e as Error).message); }
        }}>Registrar respuesta</button></div>
      </section>
      <div className="grid-2">
        <section className="card"><h2>Tarea o reunión</h2>
          <div className="sv-filter"><select aria-label="Tipo de tarea" value={task.kind} onChange={(e) => setTask({ ...task, kind: e.target.value })}><option value="meeting">Reunión / demo</option><option value="callback">Volver a contactar</option><option value="send_info">Enviar información</option><option value="pricing">Preparar cotización</option><option value="other">Otra</option></select>
            <input type="date" aria-label="Fecha de la tarea" value={task.dueOn} onChange={(e) => setTask({ ...task, dueOn: e.target.value })} />
            {task.kind === "meeting" && <input type="time" aria-label="Hora" value={task.time} onChange={(e) => setTask({ ...task, time: e.target.value })} />}</div>
          <label className="field">Nota<input value={task.note} onChange={(e) => setTask({ ...task, note: e.target.value })} /></label>
          <div className="mfoot"><button type="button" className="btn" onClick={async () => {
            try { const r = await api<{ calendarUrl: string | null }>(`${B}/lead/${l.id}/task`, { body: { kind: task.kind, dueOn: task.dueOn, dueAt: task.kind === "meeting" && task.time ? `${task.dueOn}T${task.time}` : null, note: task.note || null } });
              flash("Tarea creada."); if (r.calendarUrl) window.open(r.calendarUrl, "_blank", "noopener"); reload(); } catch (e) { flash((e as Error).message); }
          }}>Crear</button></div>
          {v.tasks.filter((t) => t.status === "open").length > 0 && <ul className="sv-timeline">{v.tasks.filter((t) => t.status === "open").map((t) => <li key={t.id}>{t.note ?? t.kind} · {t.dueAt?.replace("T", " ") ?? t.dueOn}
            <span className="sv-checks"><button type="button" className="btn sm" onClick={() => post(`task/${t.id}`, { status: "done" }, "Hecha.")}>Hecha</button><button type="button" className="btn sm" onClick={() => post(`task/${t.id}`, { status: "cancelled" }, "Cancelada.")}>Cancelar</button></span></li>)}</ul>}
        </section>
        <section className="card"><h2>Etapa y notas</h2>
          <div className="sv-filter"><select aria-label="Etapa" value={stage.stage} onChange={(e) => setStage({ ...stage, stage: e.target.value })}>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABEL[s]}</option>)}</select>
            <button type="button" className="btn sm" disabled={stage.stage === l.stage} onClick={() => post(`lead/${l.id}/stage`, stage, "Etapa actualizada.")}>Mover</button></div>
          {stage.stage !== l.stage && <label className="field">Motivo (obligatorio para salir de «No contactar»)<input value={stage.note} onChange={(e) => setStage({ ...stage, note: e.target.value })} /></label>}
          <label className="field">Nota interna<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="mfoot"><button type="button" className="btn sm" disabled={!note.trim()} onClick={() => post(`lead/${l.id}/note`, { text: note }, "Nota guardada.", () => setNote(""))}>Guardar nota</button></div>
          {!l.doNotContact && <div className="mfoot"><button type="button" className="btn sm" onClick={() => { const r = prompt("Motivo de «No contactar»:", "Pidió no recibir mensajes"); if (r) void post(`lead/${l.id}/suppress`, { reason: r }, "Marcado como no contactar."); }}>Marcar «No contactar»</button></div>}
        </section>
      </div>
      <section className="card"><h2>Asignar a un vendedor</h2>
        <p className="sv-note">Crea el prospecto en Ventas: el vendedor lo ve en su panel y sale de la cola de Captación para que nadie lo contacte en paralelo.</p>
        <div className="sv-filter"><select aria-label="Vendedor" value={assign.repId} onChange={(e) => setAssign({ ...assign, repId: e.target.value })}><option value="">Elegí un vendedor…</option>{(reps.data ?? []).filter((r) => r.status === "active").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <input aria-label="Motivo" placeholder="Motivo" value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })} />
          <button type="button" className="btn sm" disabled={!assign.repId || assign.reason.trim().length < 3} onClick={() => post(`lead/${l.id}/assign`, assign, "Asignado.")}>Asignar</button></div>
        {!(reps.data ?? []).some((r) => r.status === "active") && <p className="sv-note">No hay vendedores activos. Se dan de alta en Admin › Vendedores.</p>}
      </section>
    </>
  );
}

function MessageItem({ m, flash, reload }: { m: Msg; flash: Flash; reload: () => void }) {
  const [edit, setEdit] = useState(false);
  const [body, setBody] = useState(m.body);
  const [subject, setSubject] = useState(m.subject ?? "");
  const post = (path: string, b: unknown, ok: string) => go(() => api(`${B}/message/${m.id}/${path}`, { body: b }), flash, ok, reload);
  const ST: Record<string, [string, string]> = { draft: ["Borrador", "info"], approved: ["Aprobado", "ok"], sent: ["Enviado", "ok"], failed: ["Falló", "bad"], cancelled: ["Cancelado", "mute"], received: ["Recibido", "info"] };
  if (m.direction === "in") return (
    <li className="ld-msg in"><div className="ld-msg-h"><b>Respuesta · {CH[m.channel] ?? m.channel}</b><span className={`chip ${m.needsReview && !m.reviewedAt ? "warn" : "info"}`}>{INTENT_LABEL[m.intent as Intent] ?? m.intent} {m.confidence != null && `· ${Math.round(m.confidence * 100)} %`}</span><small>{when(m.sentAt ?? m.createdAt)}</small></div>
      <p>{m.body}</p>
      {m.needsReview && !m.reviewedAt && <div className="sv-filter"><span className="sv-note">¿Qué quiso decir?</span><select aria-label="Intención correcta" defaultValue="" onChange={(e) => e.target.value && post("review", { intent: e.target.value }, "Clasificación corregida.")}><option value="">Elegí…</option>{INTENTS.map((i) => <option key={i} value={i}>{INTENT_LABEL[i]}</option>)}</select></div>}
    </li>
  );
  const live = m.status === "draft" || m.status === "approved";
  return (
    <li className="ld-msg"><div className="ld-msg-h"><b>{VARIANT_LABEL[m.variant as Variant] ?? m.variant} · {CH[m.channel] ?? m.channel}</b><span className={`chip ${ST[m.status]?.[1]}`}>{ST[m.status]?.[0] ?? m.status}</span>{m.generatedBy === "ai" && <span className="chip mute">IA</span>}{m.campaignId && <span className="chip mute">Campaña</span>}<small>{m.sentAt ? `Enviado ${when(m.sentAt)}` : when(m.createdAt)}</small></div>
      {edit ? <>{m.channel === "email" && <label className="field">Asunto<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}<label className="field">Texto<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="mfoot"><button type="button" className="btn sm" onClick={() => setEdit(false)}>Cancelar</button><button type="button" className="btn sm pri" onClick={async () => { if (await post("edit", { body, subject: subject || null }, "Guardado.")) setEdit(false); }}>Guardar</button></div></>
        : <>{m.subject && <p><b>{m.subject}</b></p>}<p className="ld-body">{m.body}</p></>}
      {m.guardIssues.length > 0 && <p className="err-box">Revisar: {m.guardIssues.join(" ")}</p>}
      {live && !edit && <div className="sv-checks">
        {m.links.map((x) => <a key={x.kind} className="btn sm" href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a>)}
        <button type="button" className="btn sm pri" onClick={() => { if (confirm("¿Confirmás que ya enviaste este mensaje? Se registra como enviado hoy.")) void post("sent", {}, "Envío registrado."); }}>Lo envié</button>
        <button type="button" className="btn sm" onClick={() => setEdit(true)}>Editar</button>
        <button type="button" className="btn sm" onClick={() => post("cancel", {}, "Cancelado.")}>Descartar</button>
      </div>}
      {live && <p className="sv-note">Abrir el enlace no envía ni marca nada: confirmá con «Lo envié» cuando salga.</p>}
    </li>
  );
}

function DataTab({ v, flash, reload, onEdit }: { v: Detail; flash: Flash; reload: () => void; onEdit: () => void }) {
  const l = v.lead;
  const post = (path: string, body: unknown, ok: string) => go(() => api(`${B}/${path}`, { body }), flash, ok, reload);
  const [sig, setSig] = useState(l.techSignals[0] ?? { kind: "no_app", evidence: "" });
  const cur = v.facts.filter((f) => f.current);
  const old = v.facts.filter((f) => !f.current);
  return (
    <>
      <section className="card"><div className="mhead"><h2>Datos y fuentes</h2><span className="sv-checks"><button type="button" className="btn sm" onClick={onEdit}>Editar / completar</button>{l.website && <button type="button" className="btn sm" onClick={() => post(`lead/${l.id}/enrich`, {}, "Sitio oficial revisado.")}>Leer sitio oficial</button>}</span></div>
        <p className="sv-note">Cada dato con su fuente. «Sin verificar» = visto en un directorio o buscador: confirmalo (por ejemplo, llamando o abriendo la fuente) antes de usarlo.</p>
        <ul className="ld-facts">{cur.map((f) => (
          <li key={f.id}>
            <span className="ld-fk">{FIELD[f.field] ?? f.field}</span>
            <span className="ld-fv">{f.field === "category" ? LEAD_CATEGORY_LABEL[f.value as keyof typeof LEAD_CATEGORY_LABEL] ?? f.value : f.value}</span>
            <span className="ld-fs">
              <span className={`chip ${f.status === "verified" ? "ok" : "warn"}`}>{f.status === "verified" ? "Verificado" : "Sin verificar"}</span>
              <small>{f.sourceUrl ? <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer">{f.sourceLabel}</a> : f.sourceLabel} · {fmt(`${f.observedAt}T15:00:00Z`)}</small>
              {f.status !== "verified" && <button type="button" className="btn sm" onClick={() => post(`fact/${f.id}`, { status: "verified" }, "Verificado.")}>Verificar</button>}
              <button type="button" className="btn sm" onClick={() => post(`fact/${f.id}`, { status: "rejected" }, "Descartado.")}>Descartar</button>
            </span>
          </li>))}</ul>
        {old.length > 0 && <details><summary>Valores anteriores u otras fuentes ({old.length})</summary><ul className="sv-timeline">{old.map((f) => <li key={f.id}>{FIELD[f.field] ?? f.field}: {f.value}<small>{f.sourceLabel} · {f.status === "rejected" ? "descartado" : f.status === "verified" ? "verificado" : "sin verificar"} · {f.observedAt}</small></li>)}</ul></details>}
        {v.chain.length > 0 && <p className="sv-note">Misma cadena: {v.chain.map((c) => c.name).join(", ")}.</p>}
        <p className="sv-note">Visto por primera vez {when(l.firstSeenAt)} · última verificación {l.lastVerifiedAt ? when(l.lastVerifiedAt) : "—"}</p>
      </section>
      <section className="card"><h2>Por qué tiene {l.score} puntos</h2>
        <div className="ld-score">{l.scoreLines.map((s) => <Fragment key={s.factor}><span>{SCORE_FACTOR_LABEL[s.factor as keyof typeof SCORE_FACTOR_LABEL] ?? s.factor}</span><div className="sv-bar" aria-hidden="true"><i style={{ width: `${s.max ? (s.points / s.max) * 100 : 0}%` }} /></div><b>{s.points}/{s.max}</b><small>{s.why}</small></Fragment>)}</div>
        <h3 style={{ fontSize: 15, margin: "12px 0 4px" }}>Señal tecnológica (con evidencia)</h3>
        <p className="sv-note">Sólo suma con evidencia concreta (por ejemplo: «rutinas en papel en la sala», «nos dijeron que usan X»). Poca presencia digital no es una necesidad.</p>
        <div className="sv-filter"><select aria-label="Tipo de señal" value={sig.kind} onChange={(e) => setSig({ ...sig, kind: e.target.value })}><option value="no_app">No usa app para socios</option><option value="paper_routines">Rutinas en papel</option><option value="uses_other_software">Usa otro software</option><option value="online_booking">Reservas online</option></select>
          <input aria-label="Evidencia" placeholder="Evidencia" value={sig.evidence} onChange={(e) => setSig({ ...sig, evidence: e.target.value })} />
          <button type="button" className="btn sm" onClick={() => post(`lead/${l.id}/signals`, { signals: sig.evidence.trim() ? [sig] : [] }, "Guardado.")}>Guardar</button></div>
        <div className="sv-checks" style={{ marginTop: 10 }}>{l.exclusion === "manual" ? <button type="button" className="btn sm" onClick={() => post(`lead/${l.id}/exclude`, { exclude: false }, "Vuelve a la prospección.")}>Volver a incluir</button>
          : !l.exclusion && <button type="button" className="btn sm" onClick={() => { const n = prompt("Motivo de la exclusión (por ejemplo, cliente actual):"); if (n) void post(`lead/${l.id}/exclude`, { exclude: true, note: n }, "Excluido."); }}>Excluir de la prospección</button>}</div>
      </section>
    </>
  );
}

function LeadForm({ flash, onClose, lead }: { flash: Flash; onClose: (id?: string) => void; lead?: Detail["lead"] }) {
  const [f, setF] = useState<Record<string, string>>({
    name: lead?.name ?? "", city: lead?.city ?? "Mar del Plata", locality: lead?.locality ?? "", address: lead?.address ?? "", website: lead?.website ?? "", instagram: lead?.instagram ?? "", facebook: lead?.facebook ?? "",
    email: lead?.email ?? "", phone: lead?.phone ?? "", whatsapp: lead?.whatsapp ? `+${lead.whatsapp}` : "", category: lead?.category ?? "unknown", positioning: lead?.positioning ?? "", branches: lead?.branches ? String(lead.branches) : "",
    estMembers: lead?.estMembers ? String(lead.estMembers) : "", contactName: lead?.contactName ?? "", contactRole: lead?.contactRole ?? "", sourceUrl: "", notes: "",
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const n = (x: string) => (x.trim() ? Number(x) : null);
    const o = (x: string) => x.trim() || null;
    try {
      const body = { name: f.name, city: f.city, locality: o(f.locality), address: o(f.address), website: o(f.website), instagram: o(f.instagram), facebook: o(f.facebook), email: o(f.email), phone: o(f.phone), whatsapp: o(f.whatsapp),
        category: f.category, positioning: o(f.positioning), branches: n(f.branches), estMembers: n(f.estMembers), contactName: o(f.contactName), contactRole: o(f.contactRole), sourceUrl: o(f.sourceUrl), notes: o(f.notes) };
      const r = await api<{ id: string; outcome: string }>(lead ? `${B}/lead/${lead.id}/update` : `${B}/lead`, { body });
      flash(r.outcome === "updated" || r.outcome === "unchanged" ? (lead ? "Datos guardados." : "Ya existía: se actualizó el mismo expediente.") : r.outcome === "review" ? "Guardado. Parece un duplicado: revisalo." : "Gimnasio agregado.");
      onClose(r.id);
    } catch (e) { flash((e as Error).message); }
  };
  return (
    <Modal label={lead ? "Editar gimnasio" : "Agregar gimnasio"} onClose={() => onClose()} wide>
      <div className="mhead"><h2>{lead ? "Completar datos" : "Agregar gimnasio"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose()}>×</button></div>
      <p className="sv-note">Lo que cargás a mano queda como verificado por vos. Indicá la fuente si la tenés. No cargues datos personales que no sean de contacto comercial.</p>
      <div className="grid-2">
        <label className="field">Nombre *<input value={f.name} onChange={set("name")} /></label>
        <label className="field">Ciudad *<input value={f.city} onChange={set("city")} /></label>
        <label className="field">Barrio<input value={f.locality} onChange={set("locality")} /></label>
        <label className="field">Dirección<input value={f.address} onChange={set("address")} /></label>
        <label className="field">Tipo<select value={f.category} onChange={set("category")}>{LEAD_CATEGORIES.map((c) => <option key={c} value={c}>{LEAD_CATEGORY_LABEL[c]}</option>)}</select></label>
        <label className="field">Socios (sólo si hay respaldo)<input inputMode="numeric" value={f.estMembers} onChange={set("estMembers")} /></label>
        <label className="field">Teléfono comercial<input type="tel" value={f.phone} onChange={set("phone")} /></label>
        <label className="field">WhatsApp comercial<input type="tel" value={f.whatsapp} onChange={set("whatsapp")} /></label>
        <label className="field">Email comercial<input type="email" value={f.email} onChange={set("email")} /></label>
        <label className="field">Instagram<input value={f.instagram} onChange={set("instagram")} placeholder="@usuario" /></label>
        <label className="field">Sitio web<input value={f.website} onChange={set("website")} /></label>
        <label className="field">Facebook<input value={f.facebook} onChange={set("facebook")} /></label>
        <label className="field">Sedes<input inputMode="numeric" value={f.branches} onChange={set("branches")} /></label>
        <label className="field">Posicionamiento<input value={f.positioning} onChange={set("positioning")} /></label>
        <label className="field">Responsable (si es público)<input value={f.contactName} onChange={set("contactName")} /></label>
        <label className="field">Cargo<input value={f.contactRole} onChange={set("contactRole")} /></label>
        <label className="field">Fuente (URL)<input value={f.sourceUrl} onChange={set("sourceUrl")} /></label>
        <label className="field">Nota<input value={f.notes} onChange={set("notes")} /></label>
      </div>
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose()}>Cancelar</button><button type="button" className="btn pri" disabled={!f.name.trim() || !f.city.trim()} onClick={save}>Guardar</button></div>
    </Modal>
  );
}

// ── Pipeline ────────────────────────────────────────────────────────────────
function Pipeline({ onOpen }: { onOpen: (id: string) => void }) {
  const d = useLoad<List>(`${B}/list?view=&sort=score&page=1`);
  const [stageRows, setStageRows] = useState<Record<string, Row[]>>({});
  useEffect(() => {
    let off = false;
    (async () => {
      const out: Record<string, Row[]> = {};
      for (const s of LEAD_STAGES) { try { const r = await api<List>(`${B}/list?stage=${s}&sort=score`); out[s] = r.rows; } catch { out[s] = []; } }
      if (!off) setStageRows(out);
    })();
    return () => { off = true; };
  }, []);
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  return (
    <>
      <p className="sv-note">Cada columna muestra hasta 50 por puntaje. Mové la etapa desde la ficha: la historia de la conversación se conserva siempre.</p>
      <div className="sv-board" tabIndex={0} aria-label="Pipeline de captación">
        {LEAD_STAGES.map((s) => (
          <div key={s} className="sv-col"><b>{LEAD_STAGE_LABEL[s as LeadStage]} <span className="muted">({stageRows[s]?.length ?? "…"})</span></b>
            {(stageRows[s] ?? []).map((r) => <button key={r.id} type="button" className="sv-card" onClick={() => onOpen(r.id)}><b>{r.name}</b><small className="muted">{r.city} · {r.score}</small>{r.nextAction && <small>{r.nextAction}</small>}</button>)}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Campañas ────────────────────────────────────────────────────────────────
type Camp = { id: string; name: string; channel: string; variant: string; status: string; maxRecipients: number; minScore: number; dailyLimit: number; createdAt: string; approvedAt: string | null; counts: Record<string, number> };
type CampD = { campaign: Camp & { approval: { count: number; textHash: string; sendMode: string } | null }; preview: { count: number; blocked: number; sendMode: string; costNote: string; consentNote: string };
  recipients: { messageId: string; businessId: string; channel: string; name: string; city: string | null; score: number; stageLabel: string; to: string | null; subject: string | null; body: string; status: string; guardIssues: string[]; generatedBy: string | null; reason: string; links: { kind: string; label: string; url: string }[] }[] };
const CST: Record<string, [string, string]> = { draft: ["Borrador", "mute"], pending_approval: ["Pendiente de aprobación", "warn"], approved: ["Aprobada", "ok"], paused: ["Pausada", "warn"], closed: ["Cerrada", "mute"] };
function Campaigns({ flash, onOpen }: { flash: Flash; onOpen: (id: string) => void }) {
  const d = useLoad<Camp[]>(`${B}/campaigns`);
  const areas = useLoad<{ areas: { id: string; name: string; tier: number; enabled: boolean }[] }>(`${B}/settings`);
  const [sel, setSel] = useState<string | null>(null);
  const [f, setF] = useState({ name: "Repi — Captación Gimnasios Costa Atlántica", channel: "best", maxRecipients: "10", minScore: "40", dailyLimit: "10", areaIds: [] as string[] });
  if (sel) return <CampaignView id={sel} flash={flash} onBack={() => { setSel(null); d.reload(); }} onOpen={onOpen} />;
  return (
    <>
      <section className="card"><h2>Nueva campaña</h2>
        <div className="grid-2">
          <label className="field">Nombre<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Canal<select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="best">Mejor canal de cada gimnasio (manual)</option><option value="whatsapp">WhatsApp (envío manual con wa.me)</option><option value="email">Email</option><option value="instagram">Instagram (manual)</option></select></label>
          <label className="field">Destinatarios (máx.)<input inputMode="numeric" value={f.maxRecipients} onChange={(e) => setF({ ...f, maxRecipients: e.target.value })} /></label>
          <label className="field">Puntaje mínimo<input inputMode="numeric" value={f.minScore} onChange={(e) => setF({ ...f, minScore: e.target.value })} /></label>
          <label className="field">Tope diario<input inputMode="numeric" value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: e.target.value })} /></label>
        </div>
        <fieldset className="sv-checks" style={{ border: 0, padding: 0 }}><legend className="sv-note">Zonas (vacío = todas)</legend>{(areas.data?.areas ?? []).filter((a) => a.enabled).map((a) => <label key={a.id} className="chip mute"><input type="checkbox" checked={f.areaIds.includes(a.id)} onChange={(e) => setF({ ...f, areaIds: e.target.checked ? [...f.areaIds, a.id] : f.areaIds.filter((x) => x !== a.id) })} /> {a.name}</label>)}</fieldset>
        <div className="mfoot"><button type="button" className="btn pri" onClick={async () => {
          try { const c = await api<{ id: string }>(`${B}/campaigns`, { body: { name: f.name, channel: f.channel, maxRecipients: Number(f.maxRecipients) || 10, minScore: Number(f.minScore) || 0, dailyLimit: Number(f.dailyLimit) || 10, areaIds: f.areaIds } }); flash("Campaña creada en borrador."); setSel(c.id); } catch (e) { flash((e as Error).message); }
        }}>Crear campaña</button></div>
      </section>
      {d.data?.length ? <section className="card"><h2>Campañas</h2><ul className="sv-timeline">{d.data.map((c) => <li key={c.id}><button type="button" className="ld-link" onClick={() => setSel(c.id)}>{c.name}</button> <span className={`chip ${CST[c.status][1]}`}>{CST[c.status][0]}</span><small>{c.channel === "best" ? "Mejor canal" : CH[c.channel]} · {Object.entries(c.counts).map(([k, v]) => `${v} ${k === "sent" ? "enviados" : k === "approved" ? "aprobados" : k === "draft" ? "borradores" : k}`).join(" · ") || "sin mensajes"} · {when(c.createdAt)}</small></li>)}</ul></section> : null}
    </>
  );
}
function CampaignView({ id, flash, onBack, onOpen }: { id: string; flash: Flash; onBack: () => void; onOpen: (id: string) => void }) {
  const d = useLoad<CampD>(`${B}/campaigns/${id}`);
  const [ok, setOk] = useState(false);
  const post = (path: string, body: unknown, msg: string) => go(() => api(`${B}/${path}`, { body }), flash, msg, d.reload);
  const v = d.data;
  if (!v) return <p className="muted">{d.err ?? "Cargando…"}</p>;
  const c = v.campaign;
  return (
    <>
      <div className="sv-filter"><button type="button" className="btn sm" onClick={onBack}>← Campañas</button><h2 style={{ margin: 0, fontSize: 18 }}>{c.name}</h2><span className={`chip ${CST[c.status][1]}`}>{CST[c.status][0]}</span></div>
      <section className="card ld-approval"><h2>Vista de aprobación</h2>
        <dl className="sv-preview"><dt>Canal</dt><dd>{c.channel === "best" ? "Mejor canal de cada gimnasio" : CH[c.channel]} · {v.preview.sendMode === "provider" ? "envío por el proveedor" : "envío manual, uno por uno"}</dd><dt>Destinatarios</dt><dd>{v.preview.count}{v.preview.blocked ? ` · ${v.preview.blocked} con advertencias` : ""}</dd>
          <dt>Costo estimado</dt><dd>{v.preview.costNote}</dd><dt>Base del contacto</dt><dd>{v.preview.consentNote}</dd>{c.approval && <><dt>Aprobado</dt><dd>{c.approval.count} mensajes · {when(c.approvedAt)} · huella {c.approval.textHash.slice(0, 10)}</dd></>}</dl>
        <div className="sv-checks">
          {c.status === "draft" && <button type="button" className="btn" onClick={() => post(`campaigns/${id}/build`, {}, "Lista armada con los mejores leads.")}>Armar lista</button>}
          {c.status === "draft" && v.preview.count > 0 && <button type="button" className="btn pri" onClick={() => post(`campaigns/${id}/submit`, {}, "Enviada a aprobación.")}>Enviar a aprobación</button>}
          {c.status === "pending_approval" && <><label className="sv-note"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Revisé destinatarios, textos, canal y cantidad</label>
            <button type="button" className="btn pri" disabled={!ok || v.preview.blocked > 0} onClick={() => post(`campaigns/${id}/approve`, { confirm: true }, "Campaña aprobada.")}>Aprobar campaña</button>
            <button type="button" className="btn" onClick={() => post(`campaigns/${id}/status`, { status: "draft" }, "Volvió a borrador.")}>Volver a borrador</button></>}
          {c.status === "approved" && c.approval?.sendMode === "provider" && <button type="button" className="btn pri" onClick={() => post(`campaigns/${id}/send`, {}, "Lote enviado.")}>Enviar lote de hoy</button>}
          {c.status === "approved" && <button type="button" className="btn" onClick={() => post(`campaigns/${id}/status`, { status: "paused" }, "Pausada.")}>Pausar</button>}
          {c.status === "paused" && <button type="button" className="btn" onClick={() => post(`campaigns/${id}/status`, { status: "approved" }, "Reanudada.")}>Reanudar</button>}
          {c.status !== "closed" && <button type="button" className="btn" onClick={() => { if (confirm("¿Cerrar la campaña? Los mensajes no enviados se cancelan.")) void post(`campaigns/${id}/status`, { status: "closed" }, "Cerrada."); }}>Cerrar</button>}
        </div>
        {v.preview.blocked > 0 && <p className="err-box">Hay mensajes con advertencias: editá el texto desde la ficha o sacalos de la campaña.</p>}
      </section>
      {v.recipients.length === 0 ? <div className="empty">Sin destinatarios. «Armar lista» elige los mejores leads con el canal publicado, sin exclusiones ni envíos previos.</div> :
        <ol className="ld-recipients">{v.recipients.map((r) => (
          <li key={r.messageId} className="card">
            <div className="ld-msg-h"><button type="button" className="ld-link" onClick={() => onOpen(r.businessId)}><b>{r.name}</b></button><span className="chip info">{r.score}</span><span className="chip mute">{r.status === "sent" ? "Enviado" : r.status === "approved" ? "Aprobado" : r.status === "draft" ? "Borrador" : r.status}</span><small>{r.city} · {CH[r.channel]} · {r.to ? (r.channel === "whatsapp" ? `+${r.to}` : r.channel === "instagram" ? `@${r.to}` : r.to) : "—"}</small></div>
            <small className="muted">Motivo: {r.reason}</small>
            {r.subject && <p><b>{r.subject}</b></p>}<p className="ld-body">{r.body}</p>
            {r.guardIssues.length > 0 && <p className="err-box">{r.guardIssues.join(" ")}</p>}
            <div className="sv-checks">
              {r.links.map((x) => <a key={x.kind} className="btn sm" href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a>)}
              {r.status === "approved" && <button type="button" className="btn sm pri" onClick={() => { if (confirm(`¿Confirmás que ya enviaste el mensaje a ${r.name}?`)) void post(`message/${r.messageId}/sent`, {}, "Envío registrado."); }}>Lo envié</button>}
              {(r.status === "draft" || r.status === "approved") && c.status !== "closed" && <button type="button" className="btn sm" onClick={() => post(`message/${r.messageId}/uncampaign`, {}, "Quitado de la campaña.")}>Quitar</button>}
            </div>
          </li>))}</ol>}
    </>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────
type Dash = {
  captacion: { total: number; verified: number; contactable: number; high: number; newInPeriod: number; excluded: number; review: number; perDay: { d: string; n: number }[]; byCity: { city: string | null; n: number; high: number; contacted: number; replied: number; won: number; replyRate: number | null }[] };
  comunicacion: { drafts: number; approved: number; sent: number; firstSent: number; followupsSent: number; failed: number; replies: number; toReview: number; open: number; due: number; followupsOpen: number; followupsDone: number; repliedLeads: number; contactedLeads: number; replyRate: number | null; intents: { label: string; n: number }[]; avgReplyHours: number | null };
  ventas: { interested: number; meetings: number; demos: number; proposals: number; negotiation: number; won: number; lost: number; funnel: { label: string; reached: number; conv: number | null }[]; pipelineMembers: number; pipelineEstimateMinor: number | null; estimateNote: string; mrrConfirmedMinor: number; mrrDeals: number };
  productividad: { byRep: { name: string; assigned: number; won: number }[]; byChannel: { channel: string; sent: number; replies: number; replyRate: number | null }[]; byVariant: { label: string; sent: number; replied: number; meetings: number; replyRate: number | null; meetingRate: number | null }[]; objections: { label: string; n: number }[] };
};
function Bars({ rows, label }: { rows: [string, number][]; label: string }) {
  const max = Math.max(1, ...rows.map(([, x]) => x));
  return <div className="sv-hbar" role="list" aria-label={label}>{rows.map(([k, x]) => <Fragment key={k}><span role="listitem">{k}</span><div className="sv-bar" aria-hidden="true"><i style={{ width: `${(x / max) * 100}%` }} /></div><b className="sv-money">{x}</b></Fragment>)}</div>;
}
function Dashboard() {
  const [days, setDays] = useState(30);
  const d = useLoad<Dash>(`${B}/dashboard?days=${days}`);
  const v = d.data;
  return (
    <>
      <div className="sv-filter"><select aria-label="Período" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option></select><span className="sv-note">Datos reales de la base. Lo estimado dice «estimado».</span></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!v ? <p className="muted">Cargando…</p> : <>
        <h2 className="ld-h">Captación</h2>
        <div className="sv-kpis">
          <div className="sv-kpi"><span>Gimnasios descubiertos</span><strong>{v.captacion.total}</strong><small>{v.captacion.newInPeriod} nuevos en el período</small></div>
          <div className="sv-kpi"><span>Con algún dato verificado</span><strong>{v.captacion.verified}</strong></div>
          <div className="sv-kpi"><span>Contactables</span><strong>{v.captacion.contactable}</strong><small>Sin exclusión ni baja</small></div>
          <div className="sv-kpi"><span>Prioridad alta o muy alta</span><strong>{v.captacion.high}</strong></div>
          <div className="sv-kpi"><span>Excluidos / no contactar</span><strong>{v.captacion.excluded}</strong><small>{v.captacion.review} posibles duplicados</small></div>
        </div>
        <div className="grid-2">
          <section className="card"><h2>Por ciudad</h2><div style={{ overflowX: "auto" }} tabIndex={0}><table className="gy-table"><thead><tr><th>Ciudad</th><th>Leads</th><th>Alta</th><th>Contactados</th><th>Respondieron</th><th>Ganados</th></tr></thead><tbody>{v.captacion.byCity.map((c) => <tr key={c.city ?? "—"}><th scope="row">{c.city ?? "—"}</th><td>{c.n}</td><td>{c.high}</td><td>{c.contacted}</td><td>{c.replied} ({pct(c.replyRate)})</td><td>{c.won}</td></tr>)}</tbody></table></div></section>
          <section className="card"><h2>Nuevos por día (14 días)</h2>{v.captacion.perDay.length ? <Bars label="Nuevos por día" rows={v.captacion.perDay.map((x) => [fmt(`${x.d}T15:00:00Z`), x.n])} /> : <p className="sv-note">Sin altas recientes.</p>}</section>
        </div>
        <h2 className="ld-h">Comunicación</h2>
        <div className="sv-kpis">
          <div className="sv-kpi"><span>Mensajes preparados</span><strong>{v.comunicacion.drafts + v.comunicacion.approved}</strong><small>{v.comunicacion.approved} aprobados</small></div>
          <div className="sv-kpi"><span>Enviados (confirmados)</span><strong>{v.comunicacion.sent}</strong><small>{v.comunicacion.firstSent} primeros · {v.comunicacion.followupsSent} seguimientos</small></div>
          <div className="sv-kpi"><span>Errores de envío</span><strong>{v.comunicacion.failed}</strong><small>Sólo los informa el proveedor de email</small></div>
          <div className="sv-kpi"><span>Respuestas</span><strong>{v.comunicacion.replies}</strong><small>{v.comunicacion.toReview} por revisar</small></div>
          <div className="sv-kpi"><span>Tasa de respuesta</span><strong>{pct(v.comunicacion.replyRate)}</strong><small>{v.comunicacion.contactedLeads ? `${v.comunicacion.repliedLeads} de ${v.comunicacion.contactedLeads} contactados respondieron` : "Sin contactos confirmados en el período"}</small></div>
          <div className="sv-kpi"><span>Seguimientos</span><strong>{v.comunicacion.followupsOpen}</strong><small>pendientes · {v.comunicacion.followupsDone} hechos</small></div>
          <div className="sv-kpi"><span>Tiempo medio de respuesta</span><strong>{v.comunicacion.avgReplyHours != null ? `${v.comunicacion.avgReplyHours} h` : "—"}</strong></div>
        </div>
        {v.comunicacion.intents.length > 0 && <section className="card"><h2>Intención de las respuestas</h2><Bars label="Intenciones" rows={v.comunicacion.intents.map((i) => [i.label, i.n])} /></section>}
        <h2 className="ld-h">Ventas</h2>
        <div className="sv-kpis">
          <div className="sv-kpi"><span>Interesados</span><strong>{v.ventas.interested}</strong></div>
          <div className="sv-kpi"><span>Reuniones</span><strong>{v.ventas.meetings}</strong><small>{v.ventas.demos} demos realizadas</small></div>
          <div className="sv-kpi"><span>Propuestas / negociación</span><strong>{v.ventas.proposals + v.ventas.negotiation}</strong></div>
          <div className="sv-kpi"><span>Clientes ganados</span><strong>{v.ventas.won}</strong><small>{v.ventas.lost} perdidos o sin interés</small></div>
          <div className="sv-kpi"><span>Valor del pipeline (estimado)</span><strong style={{ fontSize: 18 }}>{money(v.ventas.pipelineEstimateMinor)}</strong><small>{v.ventas.estimateNote}</small></div>
          <div className="sv-kpi"><span>MRR confirmado</span><strong style={{ fontSize: 18 }}>{money(v.ventas.mrrConfirmedMinor)}</strong><small>{v.ventas.mrrDeals} ventas aprobadas en Ventas que nacieron acá</small></div>
        </div>
        <section className="card"><h2>Conversión por etapa</h2><div className="sv-hbar" role="list" aria-label="Embudo">{v.ventas.funnel.map((x) => <Fragment key={x.label}><span role="listitem">{x.label}</span><div className="sv-bar" aria-hidden="true"><i style={{ width: `${(x.reached / Math.max(1, v.ventas.funnel[0].reached)) * 100}%` }} /></div><b className="sv-money">{x.reached}{x.conv != null ? ` · ${x.conv} %` : ""}</b></Fragment>)}</div></section>
        <h2 className="ld-h">Productividad</h2>
        <div className="grid-2">
          <section className="card"><h2>Por canal</h2>{v.productividad.byChannel.length ? <ul className="sv-timeline">{v.productividad.byChannel.map((c) => <li key={c.channel}>{CH[c.channel] ?? c.channel}: {c.sent} enviados · {c.replies} respuestas<small>Tasa {pct(c.replyRate)}</small></li>)}</ul> : <p className="sv-note">Sin envíos.</p>}</section>
          <section className="card"><h2>Mensajes que mejor convierten</h2>{v.productividad.byVariant.length ? <ul className="sv-timeline">{v.productividad.byVariant.map((x) => <li key={x.label}>{x.label}: {x.sent} enviados<small>Respuesta {pct(x.replyRate)} · reunión {pct(x.meetingRate)}</small></li>)}</ul> : <p className="sv-note">Sin envíos todavía.</p>}<p className="sv-note">Se prioriza reunión y cliente ganado sobre respuestas.</p></section>
          <section className="card"><h2>Principales objeciones</h2>{v.productividad.objections.length ? <Bars label="Objeciones" rows={v.productividad.objections.map((o) => [o.label, o.n])} /> : <p className="sv-note">Sin objeciones registradas.</p>}</section>
          <section className="card"><h2>Por vendedor</h2>{v.productividad.byRep.length ? <ul className="sv-timeline">{v.productividad.byRep.map((r) => <li key={r.name}>{r.name}: {r.assigned} asignados<small>{r.won} ganados</small></li>)}</ul> : <p className="sv-note">Sin leads asignados a vendedores.</p>}</section>
        </div>
      </>}
    </>
  );
}

// ── Agente ──────────────────────────────────────────────────────────────────
const SUGGEST = ["¿Cuáles son los diez gimnasios más interesantes de Mar del Plata?", "¿Quiénes respondieron y están interesados?", "¿A quién tengo que escribirle hoy?", "¿Qué gimnasios pidieron precios?", "¿Cuáles tienen reuniones pendientes?", "¿Qué ciudad convierte mejor?", "¿Cuántos clientes necesitamos para 2 millones de MRR?"];
function Agent({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: { answer: string; basis: string; rows?: { id: string; name: string; detail: string }[] } }[]>([]);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    try { const a = await api<{ answer: string; basis: string; rows?: { id: string; name: string; detail: string }[] }>(`${B}/agent`, { body: { question } }); setLog((l) => [{ q: question, a }, ...l]); setQ(""); }
    catch (e) { setLog((l) => [{ q: question, a: { answer: (e as Error).message, basis: "error" } }, ...l]); }
    finally { setBusy(false); }
  };
  return (
    <>
      <section className="card"><h2>Repi Sales Agent</h2>
        <p className="sv-note">Responde con los datos de la base y dice en qué se basa. Si no alcanza, lo dice.</p>
        <form className="sv-filter" onSubmit={(e) => { e.preventDefault(); void ask(q); }}><input aria-label="Pregunta" style={{ flex: "1 1 240px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Preguntá algo sobre tus leads" /><button type="submit" className="btn pri" disabled={busy || !q.trim()}>{busy ? "Pensando…" : "Preguntar"}</button></form>
        <div className="sv-checks" style={{ marginTop: 8 }}>{SUGGEST.map((s) => <button key={s} type="button" className="btn sm" onClick={() => ask(s)}>{s}</button>)}</div>
      </section>
      {log.map((x, i) => <section key={i} className="card"><p><b>{x.q}</b></p><p>{x.a.answer}</p>{x.a.rows && x.a.rows.length > 0 && <ol className="ld-actions">{x.a.rows.map((r, j) => <li key={j}>{r.id ? <button type="button" className="ld-link" onClick={() => onOpen(r.id)}>{r.name}</button> : r.name}<small>{r.detail}</small></li>)}</ol>}<small className="muted">Base: {x.a.basis}</small></section>)}
    </>
  );
}

// ── Procesos ────────────────────────────────────────────────────────────────
type RunRow = { id: string; kind: string; trigger: string; status: string; stats: Record<string, unknown>; error: string | null; startedAt: string; finishedAt: string | null };
const STEP_TXT: Record<string, string> = { discovery: "Investigación (OpenStreetMap)", enrich: "Enriquecimiento (sitios oficiales)", score: "Calificación", compose: "Preparación de borradores", outreach: "Envío automático (email)", followup: "Seguimientos", report: "Informe diario" };
function Runs({ flash }: { flash: Flash }) {
  const d = useLoad<RunRow[]>(`${B}/runs`);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (k: string) => { setBusy(k); await go(() => api(`${B}/run/${k}`, { body: {} }), flash, `${STEP_TXT[k]}: terminado.`, d.reload); setBusy(null); };
  return (
    <>
      <section className="card"><h2>Ejecutar ahora</h2>
        <p className="sv-note">Mismos pasos que la programación diaria. Ninguno envía mensajes: investigan, completan, puntúan, preparan borradores y tareas.</p>
        <div className="sv-checks">{Object.entries(STEP_TXT).map(([k, t]) => <button key={k} type="button" className="btn sm" disabled={!!busy} onClick={() => run(k)}>{busy === k ? "Corriendo…" : t}</button>)}</div>
      </section>
      <section className="card"><h2>Últimas ejecuciones</h2>
        {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <p className="sv-note">Todavía no corrió ningún proceso.</p> :
          <ul className="sv-timeline">{d.data.map((r) => <li key={r.id}><b>{STEP_TXT[r.kind] ?? r.kind}</b> <span className={`chip ${r.status === "ok" ? "ok" : r.status === "error" ? "bad" : r.status === "partial" ? "warn" : "mute"}`}>{r.status === "ok" ? "Bien" : r.status === "error" ? "Error" : r.status === "partial" ? "Con avisos" : r.status === "running" ? "Corriendo" : r.status}</span>
            <small>{when(r.startedAt)} · {r.trigger === "cron" ? "programado" : "manual"} · {Object.entries(r.stats).filter(([, x]) => typeof x === "number" || (Array.isArray(x) && x.length && typeof x[0] === "string" && x.length < 6)).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(", ") : x}`).join(" · ")}</small>
            {r.error && <small className="sv-neg">{r.error}</small>}</li>)}</ul>}
      </section>
    </>
  );
}

// ── Ajustes ─────────────────────────────────────────────────────────────────
type SettingsV = { settings: { weights: Record<string, number>; cadence: { steps: number[]; businessDaysOnly: boolean }; schedule: Record<string, string | boolean | number[]> & { enabled: boolean; days: number[] };
  sender: { name: string; company: string; product: string; site: string; whatsapp: string; replyTo: string }; socialProof: string;
  autopilot: { enabled: boolean; dailyLimit: number; window: { from: string; to: string }; followups: boolean; minScore: number; social: boolean; socialDailyLimit: number };
  booking: { enabled: boolean; days: number[]; from: string; to: string; slotMin: number; horizonDays: number; minNoticeHours: number; meetingUrl: string };
  notify: { email: boolean; meetingReminderMin: number }; allowedClientNames: string[]; presentationUrl: string; demoUrl: string;
  limits: { discoveryAreasPerRun: number; enrichPerRun: number; composePerRun: number; emailPerDay: number; maxChars: number }; channels: { emailSend: boolean; whatsappApi: boolean }; aiCompose: boolean; aiClassify: boolean; pricing: { currency: "ARS"; tiers: { minMembers: number; unitMinor: number }[]; examples: { members: number; unitMinor: number }[] } };
  areas: { id: string; name: string; province: string | null; tier: number; radiusKm: number; enabled: boolean; lastDiscoveredAt: string | null }[] };
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function Settings({ flash }: { flash: Flash }) {
  const d = useLoad<SettingsV>(`${B}/settings`);
  const [s, setS] = useState<SettingsV["settings"] | null>(null);
  useEffect(() => { if (d.data && !s) setS(d.data.settings); }, [d.data, s]);
  if (!d.data || !s) return <p className="muted">{d.err ?? "Cargando…"}</p>;
  const save = (patch: Partial<SettingsV["settings"]>, ok = "Guardado.") => go(() => api(`${B}/settings`, { body: patch }), flash, ok, d.reload);
  const area = (id: string, p: Record<string, unknown>) => go(() => api(`${B}/area/${id}`, { body: p }), flash, "Zona actualizada.", d.reload);
  const sumW = Object.values(s.weights).reduce((a, x) => a + x, 0);
  return (
    <>
      <section className="card"><h2>Zonas</h2><p className="sv-note">La investigación recorre las zonas encendidas, empezando por las que hace más tiempo no se revisan.</p>
        <div style={{ overflowX: "auto" }} tabIndex={0}><table className="gy-table"><thead><tr><th>Zona</th><th>Nivel</th><th>Radio</th><th>Última investigación</th><th>Activa</th></tr></thead>
          <tbody>{d.data.areas.map((a) => <tr key={a.id}><th scope="row">{a.name}<br /><small className="muted">{a.province}</small></th><td><select aria-label={`Nivel de ${a.name}`} value={a.tier} onChange={(e) => area(a.id, { tier: Number(e.target.value) })}><option value={1}>1 · máxima</option><option value={2}>2 · regional</option><option value={3}>3 · nacional</option></select></td>
            <td>{a.radiusKm} km</td><td>{a.lastDiscoveredAt ? when(a.lastDiscoveredAt) : "—"}</td><td><input type="checkbox" aria-label={`Activar ${a.name}`} checked={a.enabled} onChange={(e) => area(a.id, { enabled: e.target.checked })} /></td></tr>)}</tbody></table></div>
      </section>
      <section className="card"><h2>Programación diaria (hora de Argentina)</h2>
        <label className="sv-note"><input type="checkbox" checked={s.schedule.enabled} onChange={(e) => setS({ ...s, schedule: { ...s.schedule, enabled: e.target.checked } })} /> Encendida (corre con el job de cada minuto ya activo en producción)</label>
        <div className="sv-checks">{DAYS.map((x, i) => <label key={x} className="chip mute"><input type="checkbox" checked={s.schedule.days.includes(i)} onChange={(e) => setS({ ...s, schedule: { ...s.schedule, days: e.target.checked ? [...s.schedule.days, i].sort() : s.schedule.days.filter((y) => y !== i) } })} /> {x}</label>)}</div>
        <div className="grid-2">{(["discovery", "enrich", "score", "compose", "outreach", "followup", "report"] as const).map((k) => <label key={k} className="field">{STEP_TXT[k]}<input type="time" value={String(s.schedule[k])} onChange={(e) => setS({ ...s, schedule: { ...s.schedule, [k]: e.target.value } })} /></label>)}</div>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => save({ schedule: s.schedule })}>Guardar programación</button></div>
      </section>
      <section className="card"><h2>Piloto automático</h2>
        <p className="sv-note">Con la programación encendida, cada día hábil manda por email el primer mensaje a los mejores gimnasios con email (y un seguimiento si no hay respuesta), dentro de la franja y el tope. Las respuestas llegan al email de respuesta; cada mensaje invita a WhatsApp y a la agenda. WhatsApp e Instagram no se automatizan: las plataformas no permiten mensajes en frío.</p>
        <label className="sv-note"><input type="checkbox" checked={s.autopilot.enabled} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, enabled: e.target.checked } })} /> Encendido</label>
        <label className="sv-note"><input type="checkbox" checked={s.autopilot.social} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, social: e.target.checked } })} /> Preparar cada día la cola de WhatsApp e Instagram (la envía Claude desde tu Mac con tus cuentas; campaña «Piloto automático · WhatsApp e Instagram»)</label>
        <label className="sv-note"><input type="checkbox" checked={s.autopilot.followups} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, followups: e.target.checked } })} /> Mandar el seguimiento si no responde</label>
        <div className="grid-2">
          <label className="field">Emails por día<input inputMode="numeric" value={s.autopilot.dailyLimit} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, dailyLimit: Number(e.target.value) || 0 } })} /></label>
          <label className="field">Puntaje mínimo<input inputMode="numeric" value={s.autopilot.minScore} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, minScore: Number(e.target.value) || 0 } })} /></label>
          <label className="field">Desde<input type="time" value={s.autopilot.window.from} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, window: { ...s.autopilot.window, from: e.target.value } } })} /></label>
          <label className="field">Hasta<input type="time" value={s.autopilot.window.to} onChange={(e) => setS({ ...s, autopilot: { ...s.autopilot, window: { ...s.autopilot.window, to: e.target.value } } })} /></label>
          <label className="field">Email donde llegan las respuestas<input type="email" value={s.sender.replyTo} onChange={(e) => setS({ ...s, sender: { ...s.sender, replyTo: e.target.value } })} /></label>
        </div>
        <h3 style={{ fontSize: 15, margin: "12px 0 4px" }}>Agenda pública y avisos</h3>
        <label className="sv-note"><input type="checkbox" checked={s.booking.enabled} onChange={(e) => setS({ ...s, booking: { ...s.booking, enabled: e.target.checked } })} /> Ofrecer la agenda en los emails (el gimnasio elige horario y te llega la invitación de calendario)</label>
        <div className="grid-2">
          <label className="field">Agenda desde<input type="time" value={s.booking.from} onChange={(e) => setS({ ...s, booking: { ...s.booking, from: e.target.value } })} /></label>
          <label className="field">Agenda hasta<input type="time" value={s.booking.to} onChange={(e) => setS({ ...s, booking: { ...s.booking, to: e.target.value } })} /></label>
          <label className="field">Duración (min)<select value={s.booking.slotMin} onChange={(e) => setS({ ...s, booking: { ...s.booking, slotMin: Number(e.target.value) } })}>{[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="field">Enlace de videollamada fijo (opcional)<input value={s.booking.meetingUrl} onChange={(e) => setS({ ...s, booking: { ...s.booking, meetingUrl: e.target.value } })} placeholder="Vacío: llamás al teléfono que dejan" /></label>
          <label className="field">Recordatorio antes de cada reunión (min)<input inputMode="numeric" value={s.notify.meetingReminderMin} onChange={(e) => setS({ ...s, notify: { ...s.notify, meetingReminderMin: Number(e.target.value) || 60 } })} /></label>
        </div>
        <label className="sv-note"><input type="checkbox" checked={s.notify.email} onChange={(e) => setS({ ...s, notify: { ...s.notify, email: e.target.checked } })} /> Avisarme por email (reunión agendada, recordatorio y resumen diario cuando hay novedades)</label>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => save({ autopilot: s.autopilot, booking: s.booking, notify: s.notify, sender: s.sender }, "Piloto automático guardado.")}>Guardar</button></div>
      </section>
      <section className="card"><h2>Puntaje: pesos</h2><p className="sv-note">Se normalizan a 100 (suma actual {sumW}). Al guardar se recalculan todos los puntajes.</p>
        <div className="grid-2">{SCORE_FACTORS.map((f) => <label key={f} className="field">{SCORE_FACTOR_LABEL[f]}<input inputMode="numeric" value={s.weights[f]} onChange={(e) => setS({ ...s, weights: { ...s.weights, [f]: Number(e.target.value) || 0 } })} /></label>)}</div>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => save({ weights: s.weights }, "Pesos guardados y puntajes recalculados.")}>Guardar pesos</button></div>
      </section>
      <section className="card"><h2>Cadencia de seguimiento</h2><p className="sv-note">Días desde el primer mensaje. El último es la evaluación final y cierra la secuencia sin respuesta. Una respuesta o un pedido de fecha la frenan.</p>
        <label className="field">Días (separados por coma)<input value={s.cadence.steps.join(", ")} onChange={(e) => setS({ ...s, cadence: { ...s.cadence, steps: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) } })} /></label>
        <label className="sv-note"><input type="checkbox" checked={s.cadence.businessDaysOnly} onChange={(e) => setS({ ...s, cadence: { ...s.cadence, businessDaysOnly: e.target.checked } })} /> Sólo días hábiles</label>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => save({ cadence: s.cadence })}>Guardar cadencia</button></div>
      </section>
      <section className="card"><h2>Remitente y mensajes</h2>
        <div className="grid-2">
          <label className="field">Nombre<input value={s.sender.name} onChange={(e) => setS({ ...s, sender: { ...s.sender, name: e.target.value } })} /></label>
          <label className="field">Empresa<input value={s.sender.company} onChange={(e) => setS({ ...s, sender: { ...s.sender, company: e.target.value } })} /></label>
          <label className="field">Producto<input value={s.sender.product} onChange={(e) => setS({ ...s, sender: { ...s.sender, product: e.target.value } })} /></label>
          <label className="field">Sitio<input value={s.sender.site} onChange={(e) => setS({ ...s, sender: { ...s.sender, site: e.target.value } })} /></label>
          <label className="field">WhatsApp comercial (firma del email)<input value={s.sender.whatsapp} onChange={(e) => setS({ ...s, sender: { ...s.sender, whatsapp: e.target.value } })} /></label>
          <label className="field">Enlace de la presentación<input value={s.presentationUrl} onChange={(e) => setS({ ...s, presentationUrl: e.target.value })} /></label>
          <label className="field">Enlace de la demo<input value={s.demoUrl} onChange={(e) => setS({ ...s, demoUrl: e.target.value })} /></label>
        </div>
        <label className="field">Prueba social autorizada (texto exacto; vacío = no se menciona a ningún cliente)<input value={s.socialProof} onChange={(e) => setS({ ...s, socialProof: e.target.value })} placeholder="Ej.: Ya lo usan gimnasios de Mar del Plata." /></label>
        <label className="field">Clientes que se pueden nombrar (con autorización, separados por coma)<input value={s.allowedClientNames.join(", ")} onChange={(e) => setS({ ...s, allowedClientNames: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
        <label className="sv-note"><input type="checkbox" checked={s.aiCompose} onChange={(e) => setS({ ...s, aiCompose: e.target.checked })} /> Pulir los borradores con IA (pasan igual por la guarda de afirmaciones)</label>
        <label className="sv-note"><input type="checkbox" checked={s.aiClassify} onChange={(e) => setS({ ...s, aiClassify: e.target.checked })} /> Usar IA para respuestas ambiguas</label>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => save({ sender: s.sender, presentationUrl: s.presentationUrl, demoUrl: s.demoUrl, socialProof: s.socialProof, allowedClientNames: s.allowedClientNames, aiCompose: s.aiCompose, aiClassify: s.aiClassify })}>Guardar</button></div>
      </section>
      <section className="card"><h2>Canales y límites</h2>
        <label className="sv-note"><input type="checkbox" checked={s.channels.emailSend} onChange={(e) => setS({ ...s, channels: { ...s.channels, emailSend: e.target.checked } })} /> Permitir envío de emails por el proveedor configurado, sólo en campañas aprobadas (apagado: se abre Gmail y se envía a mano)</label>
        <p className="sv-note">WhatsApp Business Platform (API oficial): no configurada. Requiere cuenta verificada, plantillas aprobadas y consentimiento; hasta entonces WhatsApp es envío manual con wa.me.</p>
        <div className="grid-2">
          <label className="field">Emails por día (máx. 100)<input inputMode="numeric" value={s.limits.emailPerDay} onChange={(e) => setS({ ...s, limits: { ...s.limits, emailPerDay: Number(e.target.value) || 0 } })} /></label>
          <label className="field">Zonas por investigación<input inputMode="numeric" value={s.limits.discoveryAreasPerRun} onChange={(e) => setS({ ...s, limits: { ...s.limits, discoveryAreasPerRun: Number(e.target.value) || 1 } })} /></label>
          <label className="field">Sitios por enriquecimiento<input inputMode="numeric" value={s.limits.enrichPerRun} onChange={(e) => setS({ ...s, limits: { ...s.limits, enrichPerRun: Number(e.target.value) || 1 } })} /></label>
          <label className="field">Borradores por preparación<input inputMode="numeric" value={s.limits.composePerRun} onChange={(e) => setS({ ...s, limits: { ...s.limits, composePerRun: Number(e.target.value) || 1 } })} /></label>
        </div>
        <h3 style={{ fontSize: 15, margin: "12px 0 4px" }}>Precio por socio (referencia del dossier)</h3>
        <p className="sv-note">Se usa sólo para estimar el valor de las oportunidades y, como ejemplo, al responder una consulta de precios. El precio real se acuerda con cada gimnasio.</p>
        <div className="grid-2">{s.pricing.tiers.map((t, i) => <label key={i} className="field">Desde {t.minMembers} socios: $ por socio<input inputMode="numeric" value={t.unitMinor / 100} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, tiers: s.pricing.tiers.map((x, j) => j === i ? { ...x, unitMinor: Math.round(Number(e.target.value) * 100) || x.unitMinor } : x) } })} /></label>)}</div>
        <p className="sv-note">Ejemplos que se citan: {s.pricing.examples.map((e) => `${e.members} socios × $${e.unitMinor / 100} = $${((e.members * e.unitMinor) / 100).toLocaleString("es-AR")}/mes`).join(" · ")}</p>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => save({ channels: { emailSend: s.channels.emailSend, whatsappApi: false }, limits: s.limits, pricing: s.pricing })}>Guardar</button></div>
      </section>
    </>
  );
}
