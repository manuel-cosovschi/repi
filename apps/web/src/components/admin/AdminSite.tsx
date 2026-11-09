"use client";
// REPI Admin › Sitio y QR (D205): resultados del Experience Hub (/conoce y /qr). Conteos anónimos, sin personas: cuántos
// escanearon el QR, qué perfil eligieron, demos iniciadas y contactos, separando el tráfico del QR del resto.
// Cómo leerlo: docs/comercial/EXPERIENCE_HUB.md §Medición.
import { useState } from "react";
import { Head, useLoad } from "@/components/gym/shared";
import { PRODUCT_MODE_LABEL } from "@/content/conoce";

type Row = { name: string; total: number; qr: number; other: number; visitsQr: number; visitsOther: number };
type Site = {
  days: number; funnel: Row[]; scans: { campaign: string | null; n: number }[]; profiles: { profile: string | null; n: number }[];
  demos: { target: string | null; name: string; n: number }[]; campaigns: { source: string | null; medium: string | null; campaign: string | null; visits: number }[];
  visitsByDay: { day: string; qr: boolean; n: number }[]; leads: { source: string | null; campaign: string | null; kind: string; productMode?: string | null; n: number }[];
};
const LABEL: Record<string, string> = {
  landing_view: "Visitas a la presentación", profile_select: "Eligieron un perfil", mode_select: "Miraron una modalidad", video_play: "Reprodujeron un video", demo_click: "Tocaron una demo",
  demo_start: "Demos iniciadas", intel_try: "Probaron el simulador", whatsapp_click: "Abrieron WhatsApp", email_click: "Abrieron el email",
  contact_click: "Fueron al formulario", form_submit: "Enviaron el formulario", meeting_request: "Pidieron reunión",
};
const PROFILE: Record<string, string> = { gimnasios: "Gimnasio", entrenadores: "Entrenador", deportistas: "Deportista", aliados: "Empresa o aliado" };
const DEMO: Record<string, string> = { owner: "Gimnasio", floor: "Entrenador de sala", member: "Alumno", coach: "Personal trainer" };
const KIND: Record<string, string> = { gym: "Gimnasio", coach: "Coach", partner: "Aliado" };

export function AdminSite() {
  const [days, setDays] = useState(30);
  const d = useLoad<Site>(`/api/admin/site?days=${days}`);
  const s = d.data;
  const views = s?.funnel.find((r) => r.name === "landing_view");
  return (
    <>
      <Head kicker="Presentación comercial (/conoce) y QR permanente (/qr). Conteos anónimos: sin cookies, IP ni cuentas." title="Sitio y QR">
        <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>Período
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input" style={{ minHeight: 40 }}>
            <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>Un año</option>
          </select>
        </label>
      </Head>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!s ? <p className="muted">Cargando…</p> : (
        <>
          <div className="kpis" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Kpi label="Escaneos del QR" value={s.scans.reduce((a, x) => a + x.n, 0)} />
            <Kpi label="Visitas desde el QR" value={views?.visitsQr ?? 0} />
            <Kpi label="Visitas de otros orígenes" value={views?.visitsOther ?? 0} />
            <Kpi label="Contactos recibidos" value={s.leads.reduce((a, x) => a + x.n, 0)} />
          </div>

          <section className="card" aria-labelledby="as-funnel">
            <h2 id="as-funnel" style={{ fontSize: 16, margin: "0 0 10px" }}>Embudo</h2>
            <div style={{ overflowX: "auto" }} tabIndex={0}>
              <table className="gy-table">
                <thead><tr><th>Paso</th><th>Desde el QR</th><th>Otros orígenes</th><th>Visitas distintas (QR · otros)</th></tr></thead>
                <tbody>{s.funnel.map((r) => (
                  <tr key={r.name}><th scope="row">{LABEL[r.name] ?? r.name}</th><td>{r.qr}</td><td>{r.other}</td><td>{r.visitsQr} · {r.visitsOther}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>Las visitas distintas cuentan pestañas, no personas. Quien bloquea scripts o pide no ser rastreado no aparece, salvo en los escaneos (los cuenta el servidor).</p>
          </section>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Mini title="Escaneos por campaña" rows={s.scans.map((x) => [x.campaign ?? "—", x.n])} />
            <Mini title="Perfil elegido" rows={s.profiles.map((x) => [PROFILE[x.profile ?? ""] ?? "—", x.n])} />
            <Mini title="Demos iniciadas" rows={s.demos.filter((x) => x.name === "demo_start").map((x) => [DEMO[x.target ?? ""] ?? x.target ?? "—", x.n])} foot={s.demos.some((x) => x.name === "demo_error") ? `No se pudieron crear: ${s.demos.filter((x) => x.name === "demo_error").reduce((a, x) => a + x.n, 0)} (límite por IP o demasiadas abiertas).` : undefined} />
            <Mini title="Contactos por origen" rows={sumBy(s.leads, (x) => `${KIND[x.kind] ?? x.kind} · ${x.source ?? "sin dato"}${x.campaign ? ` · ${x.campaign}` : ""}`)} />
            <Mini title="Gimnasios por modalidad" rows={byMode(s.leads)} />
          </div>

          <Mini title="Visitas por campaña (UTM)" rows={s.campaigns.map((x) => [[x.source, x.medium, x.campaign].filter(Boolean).join(" / ") || "Directo o sin UTM", x.visits])} />
          <Mini title="Visitas por día (QR · otros)" rows={[...new Set(s.visitsByDay.map((x) => x.day))].reverse().slice(0, 31).map((day) => [day, `${s.visitsByDay.find((x) => x.day === day && x.qr)?.n ?? 0} · ${s.visitsByDay.find((x) => x.day === day && !x.qr)?.n ?? 0}`])} />
        </>
      )}
    </>
  );
}

/** Suma los conteos que comparten etiqueta (el servidor agrupa también por modalidad). */
function sumBy(rows: Site["leads"], key: (x: Site["leads"][number]) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of rows) m.set(key(x), (m.get(key(x)) ?? 0) + x.n);
  return [...m];
}
const byMode = (rows: Site["leads"]) => sumBy(rows.filter((x) => x.kind === "gym"), (x) => PRODUCT_MODE_LABEL[x.productMode ?? ""] ?? "Sin elegir");

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className="card" style={{ padding: 16 }}><small className="muted">{label}</small><div style={{ font: "700 30px var(--font-display)" }}>{value}</div></div>;
}
function Mini({ title, rows, foot }: { title: string; rows: [string, number | string][]; foot?: string }) {
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>{title}</h2>
      {!rows.length ? <p className="muted" style={{ margin: 0 }}>Sin datos en el período.</p> : (
        <table className="gy-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row" style={{ fontWeight: 500 }}>{k}</th><td style={{ textAlign: "right" }}>{v}</td></tr>)}</tbody></table>
      )}
      {foot && <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>{foot}</p>}
    </section>
  );
}
