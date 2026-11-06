"use client";
// REPI Admin · Novedades de REPI (PP1, D202): borrador, edición, vista previa, publicación (ahora o programada) y archivo.
// Texto plano y destino de una lista cerrada; la audiencia se aplica en el servidor con los roles reales. Sin push masivo.
import { useMemo, useState } from "react";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_DESTS, ANNOUNCEMENT_KINDS, ANNOUNCEMENT_LIMITS, announcementIssues, type AnnouncementAudience, type AnnouncementKind } from "@repi/domain";
import { api } from "@/lib/api";
import { Head, useLoad } from "@/components/gym/shared";

type Ann = { id: string; kind: AnnouncementKind; title: string; summary: string; ctaLabel: string | null; destination: string; audience: string[]; status: "draft" | "published" | "archived";
  publishAt: string | null; archivedAt: string | null; revision: number; createdAt: string; updatedAt: string; scheduled: boolean; reads: number };
type Form = { id?: string; revision?: number; kind: AnnouncementKind; title: string; summary: string; ctaLabel: string; destination: string; audience: AnnouncementAudience[] };
const EMPTY: Form = { kind: "feature", title: "", summary: "", ctaLabel: "", destination: "none", audience: ["member"] };
const fmt = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function AdminAnnouncements({ flash }: { flash: (t: string) => void }) {
  const list = useLoad<{ items: Ann[]; moduleOn: boolean }>("/api/admin/announcements");
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState("");
  const issues = useMemo(() => (f ? announcementIssues({ ...f, ctaLabel: f.ctaLabel || null }) : []), [f]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(null);
    try { await fn(); flash(ok); list.reload(); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(false); }
  };
  const save = async () => {
    if (!f || issues.length) return;
    const body = { kind: f.kind, title: f.title, summary: f.summary, ctaLabel: f.ctaLabel || null, destination: f.destination, audience: f.audience };
    if (await run(() => (f.id ? api(`/api/admin/announcements/${f.id}`, { body: { ...body, revision: f.revision } }) : api("/api/admin/announcements", { body })), f.id ? "Novedad actualizada." : "Borrador guardado.")) setF(null);
  };
  const publish = (a: Ann) => {
    const when = at ? new Date(at).toISOString() : null;
    if (!window.confirm(`${when ? `¿Programar para el ${fmt(when)}` : "¿Publicar ahora"} «${a.title}» para: ${a.audience.map((x) => ANNOUNCEMENT_AUDIENCES[x as AnnouncementAudience] ?? x).join(", ")}?`)) return;
    void run(() => api(`/api/admin/announcements/${a.id}/publish`, { body: { at: when } }), when ? "Novedad programada." : "Novedad publicada en la app.");
  };
  const status = (a: Ann) => (a.status === "archived" ? ["Archivada", "mute"] : a.status === "draft" ? ["Borrador", "warn"] : a.scheduled ? [`Programada · ${fmt(a.publishAt!)}`, "warn"] : [`Publicada · ${fmt(a.publishAt!)}`, "ok"]);
  return (
    <>
      <Head kicker="Comunicados del producto en la campanita del alumno y en «Novedades de REPI» de coach y gimnasio. Texto plano, sin enlaces; no se envían push." title="Novedades de REPI">
        {!f && <button type="button" className="btn primary" onClick={() => { setF(EMPTY); setErr(null); }}>Nueva novedad</button>}
      </Head>
      {list.data && !list.data.moduleOn && <p className="err-box" role="note">El módulo está apagado (interruptor «announcements»): podés preparar borradores, pero nadie los ve y no se pueden publicar hasta encenderlo.</p>}
      {err && <p role="alert" className="err-box">{err}</p>}
      {f && (
        <div className="card" style={{ maxWidth: 760 }}>
          <h2 style={{ margin: 0 }}>{f.id ? "Editar novedad" : "Nueva novedad"}</h2>
          {f.id && list.data?.items.find((x) => x.id === f.id)?.status === "published" && <p className="muted" style={{ margin: 0 }}>Ya está publicada: la corrección se ve en el mismo aviso (no se crea otro ni vuelve a figurar como nuevo).</p>}
          <label className="field"><span>Tipo</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as AnnouncementKind })}>{(Object.keys(ANNOUNCEMENT_KINDS) as AnnouncementKind[]).map((k) => <option key={k} value={k}>{ANNOUNCEMENT_KINDS[k]}</option>)}</select></label>
          <label className="field"><span>Título ({f.title.length}/{ANNOUNCEMENT_LIMITS.title})</span><input value={f.title} maxLength={ANNOUNCEMENT_LIMITS.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="field"><span>Resumen ({f.summary.length}/{ANNOUNCEMENT_LIMITS.summary})</span><textarea rows={3} value={f.summary} maxLength={ANNOUNCEMENT_LIMITS.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend>Audiencia</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {(Object.keys(ANNOUNCEMENT_AUDIENCES) as AnnouncementAudience[]).map((k) => (
                <label key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.audience.includes(k)} onChange={(e) => setF({ ...f, audience: e.target.checked ? [...f.audience, k] : f.audience.filter((x) => x !== k) })} />{ANNOUNCEMENT_AUDIENCES[k]}</label>
              ))}
            </div>
          </fieldset>
          <label className="field"><span>Destino</span><select value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })}>{Object.entries(ANNOUNCEMENT_DESTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="field"><span>Texto del botón (opcional, {ANNOUNCEMENT_LIMITS.cta} máx.)</span><input value={f.ctaLabel} maxLength={ANNOUNCEMENT_LIMITS.cta} placeholder="Ver mi progreso" onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} /></label>
          <div><span className="muted" style={{ fontSize: 12 }}>Vista previa (así se ve en la campanita)</span>
            <div className="card" style={{ padding: 12, marginTop: 4 }} aria-label="Vista previa">
              <b><span className="chip ok" style={{ marginRight: 6 }}>REPI</span>{f.title || "Título"}</b>
              <span className="muted">{f.summary || "Resumen"}</span>
              {f.ctaLabel && f.destination !== "none" && <span style={{ fontWeight: 600 }}>{f.ctaLabel} → {ANNOUNCEMENT_DESTS[f.destination as keyof typeof ANNOUNCEMENT_DESTS]?.label}</span>}
            </div>
          </div>
          {issues.length > 0 && <ul className="err-box" style={{ margin: 0, paddingLeft: 28 }}>{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
          <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn primary" disabled={busy || issues.length > 0} onClick={() => void save()}>{f.id ? "Guardar cambios" : "Guardar borrador"}</button><button type="button" className="btn" onClick={() => setF(null)}>Cancelar</button></div>
        </div>
      )}
      {list.err && <p role="alert" className="err-box">{list.err}</p>}
      {list.data && (
        <>
          <label className="field" style={{ maxWidth: 320 }}><span>Programar para (opcional; vacío = ahora)</span><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
          {!list.data.items.length ? <div className="empty">Todavía no hay novedades.</div> : list.data.items.map((a) => {
            const [st, tone] = status(a);
            return (
              <div key={a.id} className="gy-task">
                <span style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <b>{a.title}</b><small className="muted">{ANNOUNCEMENT_KINDS[a.kind]} · {a.audience.map((x) => ANNOUNCEMENT_AUDIENCES[x as AnnouncementAudience] ?? x).join(", ")} · {ANNOUNCEMENT_DESTS[a.destination as keyof typeof ANNOUNCEMENT_DESTS]?.label ?? a.destination}</small>
                  <small>{a.summary}</small>{a.status === "published" && <small className="muted">{a.reads} {a.reads === 1 ? "lectura" : "lecturas"}</small>}
                </span>
                <span className={`chip ${tone}`}>{st}</span>
                {a.status !== "archived" && <button type="button" className="btn sm" disabled={busy} onClick={() => setF({ id: a.id, revision: a.revision, kind: a.kind, title: a.title, summary: a.summary, ctaLabel: a.ctaLabel ?? "", destination: a.destination, audience: a.audience as AnnouncementAudience[] })}>Editar</button>}
                {a.status === "draft" && <button type="button" className="btn sm primary" disabled={busy || !list.data!.moduleOn} onClick={() => publish(a)}>{at ? "Programar" : "Publicar"}</button>}
                {a.scheduled && <button type="button" className="btn sm" disabled={busy} onClick={() => void run(() => api(`/api/admin/announcements/${a.id}/unschedule`, { body: {} }), "Volvió a borrador.")}>Volver a borrador</button>}
                {a.status !== "archived" && <button type="button" className="btn sm" disabled={busy} onClick={() => window.confirm("¿Archivar? Deja de mostrarse a todos.") && void run(() => api(`/api/admin/announcements/${a.id}/archive`, { body: {} }), "Novedad archivada.")}>Archivar</button>}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
