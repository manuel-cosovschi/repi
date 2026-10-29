"use client";
// «Acceso y presencia» (D127): política del gimnasio, QR dinámico, pantallas de recepción, validación a mano e indicadores.
// Sólo eventos de validación: no hay mapa ni rastreo de personas. El servidor decide permisos por rol y sede.
import { useState } from "react";
import { ACCESS_MODES, CHECKIN_METHOD_LABEL, GEO_MODES, GYM_ACTIONS, PASS_HOURS_RANGE, QR_TTL_RANGE, STRICT_OPTIONAL, type AccessMode, type CheckinMethod, type GeoMode, type GymAction } from "@repi/domain";
import { api } from "@/lib/api";
import { LiveQrView, useLiveQr, type LiveQrData } from "@/components/gym-access/LiveQr";
import { HBar, Head, LocSelect, Seg, can, nf, useAct, useLoad, when, type Shell } from "./shared";
import { IntInput } from "@/components/ui/IntInput";

type Policy = { enabled: boolean; mode: AccessMode; strictActions: GymAction[]; qrTtlSec: number; passHours: number; geoMode: GeoMode };
type Settings = {
  policy: Policy; canEditPolicy: boolean;
  locations: { id: string; name: string; lat: string | number | null; lng: string | number | null; radiusM: number | null }[];
  displays: { id: string; name: string; locationId: string; createdAt: string; lastSeenAt: string | null }[];
};
type Report = {
  policy: Policy; days: number;
  totals: { ok: number; denied: number; members: number; sessions: number; manual: number; desk: number; withGeo: number } | null;
  denials: { reason: string; label: string; n: number }[];
  byLocation: { id: string; name: string; ok: number; denied: number }[];
  active: { id: string; name: string; location: string; method: CheckinMethod; issuedAt: string; expiresAt: string; note: string | null }[];
  recent: { id: string; at: string; name: string; location: string; method: CheckinMethod | null; result: "ok" | "denied"; reason: string | null; geo: string | null; revoked: boolean; note: string | null }[];
};
type Found = { id: string; name: string; location: string; locationId: string; membership: string };

const hm = (iso: string) => when(iso).replace(/^Hoy /, "");

/** QR del equipo a pantalla completa (recepción, dueño, gerencia), con el mismo token corto que la tablet. */
export function StaffQrLayer({ shell, loc, onClose }: { shell: Shell; loc: string; onClose: () => void }) {
  const { qr, err, left } = useLiveQr(() => api<LiveQrData>(`/api/gym/${shell.orgId}/access/qr?loc=${loc}`));
  return <LiveQrView qr={qr} left={left} err={err} title="QR de ingreso" onClose={onClose} />;
}

/** Buscar un socio y validar su ingreso a mano (sin teléfono, sin cámara, sin datos). Queda registrado quién lo hizo. */
export function ManualCheckin({ shell, loc, onDone }: { shell: Shell; loc: string | null; onDone?: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [note, setNote] = useState("");
  const { busy, run } = useAct(shell.flash);
  const search = async () => {
    if (q.trim().length < 2) return shell.flash("Escribí al menos 2 letras del nombre.");
    await run("search", async () => setFound(await api<Found[]>(`/api/gym/${shell.orgId}/access/members?q=${encodeURIComponent(q.trim())}`)));
  };
  const validate = (m: Found) => run(`v-${m.id}`, () => api<{ duplicate: boolean; pass: { location: string; expiresAt: string } }>(`/api/gym/${shell.orgId}/access/checkins`, { body: { gymMemberId: m.id, loc: loc ?? m.locationId, note: note.trim() || null } }),
    (r) => { const x = r as { duplicate: boolean; pass: { location: string; expiresAt: string } }; onDone?.(); return `${m.name}: ${x.duplicate ? "ya tenía el ingreso vigente" : "ingreso validado"} en ${x.pass.location} hasta las ${hm(x.pass.expiresAt)}.`; });
  return (
    <section className="card"><h2>Validar un ingreso a mano</h2>
      <small className="muted">Para quien no tiene el teléfono, no puede usar la cámara o la ubicación. El socio tiene que estar en la sede. Queda registrado quién lo validó.</small>
      <form className="crow" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label className="search" style={{ flex: "1 1 220px" }}><input aria-label="Nombre del socio" placeholder="Nombre del socio" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} /></label>
        <button type="submit" className="btn" aria-busy={busy === "search" || undefined}>Buscar</button>
      </form>
      <label className="field">Motivo (opcional, sin datos de salud)<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: sin batería, sin datos móviles" /></label>
      {found && !found.length && <div className="empty">No encontramos socios con ese nombre en tus sedes.</div>}
      {found?.map((m) => (
        <div key={m.id} className="crow" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span><b>{m.name}</b> <small className="muted">· {m.location} · Membresía {m.membership.toLowerCase()}</small></span>
          <button type="button" className="btn pri sm" disabled={m.membership !== "Activa"} aria-busy={busy === `v-${m.id}` || undefined} onClick={() => void validate(m)}
            title={m.membership !== "Activa" ? "La membresía no está activa: no se puede validar el ingreso." : undefined}>Validar ingreso</button>
        </div>
      ))}
    </section>
  );
}

/** Tarjeta de recepción y mostrador: QR a pantalla completa y validación a mano. */
export function AccessDesk({ shell }: { shell: Shell }) {
  const [qrOpen, setQrOpen] = useState(false);
  const loc = shell.loc ?? shell.ctx.locations[0]?.id ?? null;
  if (!shell.ctx.accessControl) return null;
  return (
    <>
      <div className="gy-incoming">
        <span style={{ flex: 1 }}><b>Ingreso al gimnasio.</b> Mostrá el QR que se renueva solo para que los socios validen su ingreso, o validalo a mano.</span>
        {loc && <button type="button" className="btn pri" onClick={() => setQrOpen(true)}>Mostrar QR de ingreso</button>}
      </div>
      <ManualCheckin shell={shell} loc={loc} />
      {qrOpen && loc && <StaffQrLayer shell={shell} loc={loc} onClose={() => setQrOpen(false)} />}
    </>
  );
}

export function AccessControlScreen({ shell }: { shell: Shell }) {
  const [tab, setTab] = useState<"panel" | "policy" | "displays" | "validate">("panel");
  const owner = shell.ctx.roles.includes("owner");
  const [loc, setLoc] = useState<string | null>(owner ? null : shell.loc);
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const [qrOpen, setQrOpen] = useState(false);
  const rep = useLoad<Report>(`/api/gym/${shell.orgId}/access/report?days=${days}${loc ? `&loc=${loc}` : ""}`);
  const set = useLoad<Settings>(`/api/gym/${shell.orgId}/access/settings`);
  const qrLoc = loc ?? shell.loc ?? shell.ctx.locations[0]?.id ?? null;
  const enabled = rep.data?.policy.enabled ?? set.data?.policy.enabled;
  return (
    <>
      <Head kicker="Membresía, política del gimnasio e ingreso validado · sin rastrear ubicación" title="Acceso y presencia">
        {enabled && qrLoc && (can(shell.ctx, "members.approve") || can(shell.ctx, "reception.desk")) && <button type="button" className="btn pri" onClick={() => setQrOpen(true)}>Mostrar QR de ingreso</button>}
      </Head>
      <Seg label="Sección" value={tab} onChange={setTab} options={[["panel", "Panel"], ["policy", "Política"], ["displays", "Pantallas y sedes"], ["validate", "Validar a mano"]]} />
      {(rep.err || set.err) && <p role="alert" className="err-box">{rep.err ?? set.err}</p>}
      {enabled === false && (
        <div className="banner"><span><b>El control de acceso no está activo en este gimnasio.</b> Se activa por gimnasio, desde REPI, cuando lo acuerdan. Mientras tanto los socios entrenan como siempre y podés dejar lista la política, las sedes y las pantallas.</span></div>
      )}
      {tab === "panel" && <AccessPanel shell={shell} r={rep.data} loc={loc} setLoc={setLoc} days={days} setDays={setDays} reload={rep.reload} owner={owner} />}
      {tab === "policy" && set.data && <PolicyForm shell={shell} s={set.data} onSaved={() => { void set.reload(); void rep.reload(); }} />}
      {tab === "displays" && set.data && <DisplaysAndSites shell={shell} s={set.data} reload={set.reload} />}
      {tab === "validate" && (enabled ? <ManualCheckin shell={shell} loc={qrLoc} onDone={rep.reload} /> : <div className="empty">Con el módulo apagado no hace falta validar ingresos.</div>)}
      {qrOpen && qrLoc && <StaffQrLayer shell={shell} loc={qrLoc} onClose={() => setQrOpen(false)} />}
    </>
  );
}

function AccessPanel({ shell, r, loc, setLoc, days, setDays, reload, owner }: {
  shell: Shell; r: Report | null; loc: string | null; setLoc: (v: string | null) => void; days: "1" | "7" | "30"; setDays: (v: "1" | "7" | "30") => void; reload: () => void; owner: boolean;
}) {
  const { busy, run } = useAct(shell.flash);
  const revoke = (id: string, name: string) => {
    if (!confirm(`¿Revocar el ingreso de ${name}? No va a poder iniciar ni registrar el entrenamiento presencial hasta validar de nuevo.`)) return;
    void run(`r-${id}`, () => api(`/api/gym/${shell.orgId}/access/checkins/${id}`, { body: {} }), "Ingreso revocado.").then(reload);
  };
  const t = r?.totals;
  return (
    <>
      <div className="crow" style={{ gap: 10, flexWrap: "wrap" }}>
        <LocSelect shell={shell} allowAll={owner} value={loc} onChange={setLoc} />
        <Seg label="Período" value={days} onChange={setDays} options={[["1", "Hoy y ayer"], ["7", "7 días"], ["30", "30 días"]]} />
      </div>
      {r && !t && <div className="empty">No tenés sedes a cargo.</div>}
      {r && t && (
        <>
          <div className="grid-kpi">
            <div className="kpi"><strong>{nf(t.ok)}</strong><span>Ingresos validados</span><small>{r.days === 1 ? "Últimas 24 h" : `${r.days} días`}</small></div>
            <div className="kpi"><strong>{nf(t.members)}</strong><span>Socios distintos</span></div>
            <div className="kpi"><strong>{nf(t.sessions)}</strong><span>Entrenamientos con ingreso</span><small>Iniciados con el ingreso validado</small></div>
            <div className="kpi"><strong>{nf(t.denied)}</strong><span>Intentos rechazados</span><small>QR vencido, membresía, sede o ubicación</small></div>
            <div className="kpi"><strong>{nf(t.manual + t.desk)}</strong><span>Validados por el equipo</span><small>{t.manual} en sala · {t.desk} con carnet</small></div>
            <div className="kpi"><strong>{nf(t.withGeo)}</strong><span>Con QR + ubicación</span></div>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))" }}>
            <section className="card"><h2>Por sede</h2>
              {r.byLocation.map((l) => <HBar key={l.id} label={l.name} n={l.ok} max={Math.max(1, ...r.byLocation.map((x) => x.ok))} note={l.denied ? `${l.denied} rechazados` : null} />)}
            </section>
            <section className="card"><h2>Motivos de rechazo</h2>
              {!r.denials.length ? <div className="empty">Sin rechazos en el período.</div>
                : r.denials.map((d) => <HBar key={d.reason} label={d.label} n={d.n} max={Math.max(1, r.denials[0].n)} color="#F59E0B" />)}
            </section>
          </div>
          <section className="card"><h2>Ingresos vigentes ({r.active.length})</h2>
            <small className="muted">Vencen solos. Revocá sólo si alguien no está en la sede o hubo un error; queda registrado.</small>
            {!r.active.length ? <div className="empty">Nadie tiene un ingreso vigente ahora.</div> : (
              <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Tabla (deslizá para ver más columnas)"><table className="gy-table"><thead><tr><th>Socio</th><th>Sede</th><th>Cómo</th><th>Desde</th><th>Hasta</th><th /></tr></thead>
                <tbody>{r.active.map((a) => (
                  <tr key={a.id}><th>{a.name}</th><td>{a.location}</td><td>{CHECKIN_METHOD_LABEL[a.method]}</td><td>{hm(a.issuedAt)}</td><td>{hm(a.expiresAt)}</td>
                    <td><button type="button" className="btn sm danger" aria-busy={busy === `r-${a.id}` || undefined} onClick={() => revoke(a.id, a.name)}>Revocar</button></td></tr>
                ))}</tbody></table></div>
            )}
          </section>
          <section className="card"><h2>Últimos intentos</h2>
            {!r.recent.length ? <div className="empty">Todavía no hay intentos en el período.</div> : (
              <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Tabla (deslizá para ver más columnas)"><table className="gy-table"><thead><tr><th>Cuándo</th><th>Socio</th><th>Sede</th><th>Resultado</th></tr></thead>
                <tbody>{r.recent.map((x) => (
                  <tr key={x.id}><td>{when(x.at)}</td><th>{x.name}</th><td>{x.location}</td>
                    <td>{x.result === "ok" ? <span className={`chip ${x.revoked ? "mute" : "ok"}`}>{x.revoked ? "Revocado" : x.method ? CHECKIN_METHOD_LABEL[x.method] : "Validado"}</span> : <span className="chip warn">{x.reason ?? "Rechazado"}</span>}{x.note && <small className="muted"> · {x.note}</small>}</td></tr>
                ))}</tbody></table></div>
            )}
          </section>
          <small className="muted">Sólo se registran validaciones de ingreso (hora, sede y resultado). No se guardan coordenadas ni se sigue a nadie dentro o fuera del gimnasio. Un ingreso validado no prueba que la persona siga en la sede.</small>
        </>
      )}
    </>
  );
}

function PolicyForm({ shell, s, onSaved }: { shell: Shell; s: Settings; onSaved: () => void }) {
  const [p, setP] = useState<Policy>(s.policy);
  const { busy, run } = useAct(shell.flash);
  const ro = !s.canEditPolicy;
  const toggleAction = (a: GymAction) => setP({ ...p, strictActions: p.strictActions.includes(a) ? p.strictActions.filter((x) => x !== a) : [...p.strictActions, a] });
  const save = () => run("save", () => api(`/api/gym/${shell.orgId}/access/policy`, { body: { mode: p.mode, strictActions: p.strictActions, qrTtlSec: p.qrTtlSec, passHours: p.passHours, geoMode: p.geoMode } }), "Política guardada.").then((r) => { if (r) onSaved(); });
  return (
    <>
      {ro && <div className="banner"><span>La política la define el dueño o una gerencia de todas las sedes. La ves en modo lectura.</span></div>}
      <section className="card"><h2>Modo</h2>
        <small className="muted">Rutina, historial, progreso, mensajes, privacidad y exportar datos nunca se bloquean. Repi Coach y otros gimnasios no se ven afectados.</small>
        {(Object.keys(ACCESS_MODES) as AccessMode[]).map((m) => (
          <label key={m} className="crow" style={{ alignItems: "flex-start", gap: 10, cursor: ro ? "default" : "pointer" }}>
            <input type="radio" name="mode" checked={p.mode === m} disabled={ro} onChange={() => setP({ ...p, mode: m })} style={{ marginTop: 4 }} />
            <span><b>{ACCESS_MODES[m].label}</b><br /><small className="muted">{ACCESS_MODES[m].what}</small></span>
          </label>
        ))}
        {p.mode === "strict" && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}><legend className="muted" style={{ fontSize: 13 }}>Además de iniciar y registrar, exigir ingreso para:</legend>
            {STRICT_OPTIONAL.map((a) => <label key={a} className="crow" style={{ gap: 8 }}><input type="checkbox" disabled={ro} checked={p.strictActions.includes(a)} onChange={() => toggleAction(a)} />{GYM_ACTIONS[a]}</label>)}
          </fieldset>
        )}
      </section>
      <section className="card"><h2>QR e ingreso</h2>
        <div className="crow" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 200px" }}>El QR se renueva cada (segundos)
            <IntInput min={QR_TTL_RANGE[0]} max={QR_TTL_RANGE[1]} disabled={ro} value={p.qrTtlSec} onChange={(n) => n != null && setP({ ...p, qrTtlSec: n })} /></label>
          <label className="field" style={{ flex: "1 1 200px" }}>El ingreso vale (horas)
            <select disabled={ro} value={p.passHours} onChange={(e) => setP({ ...p, passHours: Number(e.target.value) })} style={{ height: 42, borderRadius: 10, border: "1px solid #C9D2DD", padding: "0 10px" }}>
              {Array.from({ length: PASS_HOURS_RANGE[1] - PASS_HOURS_RANGE[0] + 1 }, (_, i) => PASS_HOURS_RANGE[0] + i).map((h) => <option key={h} value={h}>{h} {h === 1 ? "hora" : "horas"}</option>)}
            </select></label>
        </div>
        <small className="muted">Un QR más corto dificulta reenviar una foto; uno más largo tolera mejor la conexión lenta. Recomendado: 30 segundos y 3 horas.</small>
      </section>
      <section className="card"><h2>Ubicación del teléfono (opcional)</h2>
        {(Object.keys(GEO_MODES) as GeoMode[]).map((g) => (
          <label key={g} className="crow" style={{ gap: 10, cursor: ro ? "default" : "pointer" }}>
            <input type="radio" name="geo" disabled={ro} checked={p.geoMode === g} onChange={() => setP({ ...p, geoMode: g })} />{GEO_MODES[g]}
          </label>
        ))}
        <div className="gy-warn"><span>Antes de usar la ubicación, revisalo con tu asesoría legal (Ley 25.326 y guías de la AAIP) e informalo a tus socios. REPI la lee una sola vez al validar, no guarda coordenadas y siempre ofrece validar con el equipo. La ubicación puede fallar o falsearse: es un complemento del QR, no una prueba.</span></div>
      </section>
      {!ro && <div className="crow" style={{ justifyContent: "flex-end" }}><button type="button" className="btn pri" aria-busy={busy === "save" || undefined} onClick={() => void save()}>Guardar política</button></div>}
    </>
  );
}

function DisplaysAndSites({ shell, s, reload }: { shell: Shell; s: Settings; reload: () => void }) {
  const { busy, run } = useAct(shell.flash);
  const [newLoc, setNewLoc] = useState(s.locations[0]?.id ?? "");
  const [name, setName] = useState("Tablet recepción");
  const [link, setLink] = useState<string | null>(null);
  const create = () => run("create", () => api<{ id: string; link: string }>(`/api/gym/${shell.orgId}/access/displays`, { body: { loc: newLoc, name } }), "Pantalla creada.")
    .then((r) => { if (r) { setLink((r as { link: string }).link); reload(); } });
  const revoke = (id: string, n: string) => {
    if (!confirm(`¿Revocar «${n}»? Deja de mostrar el QR al instante.`)) return;
    void run(`d-${id}`, () => api(`/api/gym/${shell.orgId}/access/displays/${id}`, { body: {} }), "Pantalla revocada.").then(reload);
  };
  const locName = (id: string) => s.locations.find((l) => l.id === id)?.name ?? "—";
  return (
    <>
      <section className="card"><h2>Pantallas de recepción</h2>
        <small className="muted">Una tablet o TV que muestra el QR de una sede, sin iniciar sesión con una cuenta. El enlace se muestra una sola vez; si se pierde o roban el equipo, revocala.</small>
        {!s.displays.length ? <div className="empty">Todavía no hay pantallas.</div> : (
          <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Tabla (deslizá para ver más columnas)"><table className="gy-table"><thead><tr><th>Pantalla</th><th>Sede</th><th>Última conexión</th><th /></tr></thead>
            <tbody>{s.displays.map((d) => (
              <tr key={d.id}><th>{d.name}</th><td>{locName(d.locationId)}</td><td>{d.lastSeenAt ? when(d.lastSeenAt) : "Nunca"}</td>
                <td><button type="button" className="btn sm danger" aria-busy={busy === `d-${d.id}` || undefined} onClick={() => revoke(d.id, d.name)}>Revocar</button></td></tr>
            ))}</tbody></table></div>
        )}
        <div className="crow" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 180px" }}>Sede
            <select value={newLoc} onChange={(e) => setNewLoc(e.target.value)} style={{ height: 42, borderRadius: 10, border: "1px solid #C9D2DD", padding: "0 10px" }}>
              {s.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>
          <label className="field" style={{ flex: "1 1 200px" }}>Nombre<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <button type="button" className="btn pri" disabled={!newLoc} aria-busy={busy === "create" || undefined} onClick={() => void create()}>Crear pantalla</button>
        </div>
        {link && (
          <div className="gy-warn" role="status">
            <span style={{ flex: "1 1 100%" }}><b>Abrí este enlace en la tablet de recepción.</b> Se muestra una sola vez: no lo compartas por grupos ni redes.</span>
            <code className="mono" style={{ wordBreak: "break-all", flex: "1 1 100%" }}>{link}</code>
            <button type="button" className="btn sm" onClick={() => { void navigator.clipboard?.writeText(link).then(() => shell.flash("Enlace copiado."), () => shell.flash("No se pudo copiar: seleccionalo a mano.")); }}>Copiar enlace</button>
            <button type="button" className="btn sm" onClick={() => setLink(null)}>Listo</button>
          </div>
        )}
      </section>
      <section className="card"><h2>Ubicación de las sedes</h2>
        <small className="muted">Sólo hace falta si la política usa la ubicación del teléfono. Cargala estando en la sede o con las coordenadas del mapa.</small>
        {s.locations.map((l) => <SiteGeo key={l.id} shell={shell} l={l} onSaved={reload} />)}
      </section>
    </>
  );
}

function SiteGeo({ shell, l, onSaved }: { shell: Shell; l: Settings["locations"][number]; onSaved: () => void }) {
  const [lat, setLat] = useState(l.lat == null ? "" : String(l.lat));
  const [lng, setLng] = useState(l.lng == null ? "" : String(l.lng));
  const [r, setR] = useState(String(l.radiusM ?? 150));
  const { busy, run } = useAct(shell.flash);
  const here = () => {
    if (!("geolocation" in navigator)) return shell.flash("Este navegador no da la ubicación.");
    navigator.geolocation.getCurrentPosition((p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); shell.flash(`Ubicación leída (precisión ±${Math.round(p.coords.accuracy)} m). Revisala y guardá.`); },
      () => shell.flash("No pudimos leer la ubicación de este equipo."), { enableHighAccuracy: true, timeout: 10000 });
  };
  const save = (clear = false) => run(`g-${l.id}`, () => api(`/api/gym/${shell.orgId}/access/locations/${l.id}`, { body: { geo: clear ? null : { lat: Number(lat), lng: Number(lng), radiusM: Math.round(Number(r)) } } }),
    clear ? "Ubicación de la sede borrada." : "Ubicación de la sede guardada.").then((x) => { if (x) { if (clear) { setLat(""); setLng(""); } onSaved(); } });
  const valid = lat !== "" && lng !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Number(r) >= 50 && Number(r) <= 1000;
  return (
    <div className="crow" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end", borderTop: "1px solid #EEF2F6", paddingTop: 10 }}>
      <b style={{ flex: "1 1 100%" }}>{l.name} {l.lat != null ? <span className="chip ok">Cargada</span> : <span className="chip mute">Sin ubicación</span>}</b>
      <label className="field" style={{ flex: "1 1 120px" }}>Latitud<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-34.5889" /></label>
      <label className="field" style={{ flex: "1 1 120px" }}>Longitud<input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-58.4108" /></label>
      <label className="field" style={{ flex: "0 1 110px" }}>Radio (m)<input type="number" min={50} max={1000} step={10} value={r} onChange={(e) => setR(e.target.value)} /></label>
      <button type="button" className="btn sm" onClick={here}>Usar este equipo</button>
      <button type="button" className="btn sm pri" disabled={!valid} aria-busy={busy === `g-${l.id}` || undefined} onClick={() => void save()}>Guardar</button>
      {l.lat != null && <button type="button" className="btn sm" onClick={() => void save(true)}>Borrar</button>}
    </div>
  );
}
