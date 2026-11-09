"use client";
// REPI Control (D213) en el escritorio Gym: «Pantalla de rutinas».
// - KioskScreen: si REPI la habilitó, las pantallas autorizadas por sede (registrar con un enlace que se muestra una sola vez,
//   con su QR, y revocar) y el estado de la planificación supervisada (sólo lectura: la configura REPI). Mismo patrón que
//   «Acceso y presencia › Pantallas» (DisplaysAndSites).
// - MemberKioskCard: código y PIN del socio para la pantalla, en su ficha y en Recepción (quien tiene reception.desk). El PIN se
//   muestra una sola vez al emitirlo, con opción de imprimir sólo esa tarjeta. Volver a emitir anula el anterior.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { QrCode } from "@/components/gym-access/LiveQr";
import { Ic } from "@/components/ui/Ic";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ConfirmDialog, Head, can, fmt, initials, useLoad, when, type Shell } from "./shared";

type Device = { id: string; name: string; location: string; locationId: string; createdAt: string; lastSeenAt: string | null };
type Settings = { enabled: boolean; supervised: boolean; credentials: number; canManageDevices: boolean; devices: Device[] };

/** Estado de la planificación supervisada, sólo lectura (la cambia REPI). */
export function SupervisedPolicy({ on, compact }: { on: boolean; compact?: boolean }) {
  return (
    <div className="kc-policy">
      <span className="kc-policy-top"><b>Planificación supervisada (REPI Control)</b><span className={`chip ${on ? "ok" : "mute"}`}>{on ? "Activa" : "Desactivada"}</span></span>
      <small className="muted">{on
        ? "Sólo el equipo con permiso para armar programas crea y cambia rutinas. Los socios registran lo que hacen sobre su programa, pero no cargan rutinas propias ni piden rutinas o ajustes a REPI."
        : "Los socios pueden cargar sus propias rutinas y pedirle a REPI una rutina para el día, además del programa del gimnasio."}
        {compact ? "" : " La configura REPI para cada gimnasio: si querés cambiarla, pedíselo desde Ayuda y soporte."}</small>
    </div>
  );
}

export function KioskScreen({ shell }: { shell: Shell }) {
  const s = useLoad<Settings>(`/api/gym/${shell.orgId}/kiosk`);
  const manager = shell.ctx.roles.some((r) => r === "owner" || r === "manager");
  return (
    <>
      <Head kicker="Consulta de rutinas en el gimnasio, sin instalar nada" title="Pantalla de rutinas" />
      {s.err && <p role="alert" className="err-box">{s.err}</p>}
      {s.data && !s.data.enabled && (
        <section className="card">
          <h2>Todavía no está habilitada</h2>
          <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>La pantalla de rutinas es una tablet o un monitor del gimnasio donde cada socio consulta su programa con su código y un PIN, sin instalar la app.
            La habilita REPI para cada gimnasio. Si la querés usar, escribinos desde Ayuda y soporte y te contamos cómo seguir.</span>
          <a className="btn" href="/ayuda" style={{ alignSelf: "flex-start", display: "inline-grid", placeItems: "center" }}>Ayuda y soporte</a>
        </section>
      )}
      {s.data?.enabled && (
        <>
          <section className="card">
            <h2>Cómo funciona</h2>
            <ol className="kc-steps">
              <li><b>Registrá la pantalla</b> de la sede: abrís el enlace una vez en la tablet y queda autorizada.</li>
              <li><b>Entregale a cada socio su código y su PIN</b> desde su ficha o en Recepción, al verificar el carnet. El PIN se ve una sola vez.</li>
              <li><b>El socio consulta su rutina</b> con el código y el PIN. La pantalla muestra sólo el programa vigente y se cierra sola si nadie la usa.</li>
            </ol>
            <span className="muted">{s.data.credentials === 1 ? "1 socio tiene código activo." : `${s.data.credentials} socios tienen código activo.`}</span>
          </section>
          <Devices shell={shell} s={s.data} reload={s.reload} />
          <MemberCodes shell={shell} />
        </>
      )}
      {s.data && manager && <section className="card"><SupervisedPolicy on={s.data.supervised} /></section>}
    </>
  );
}

function Devices({ shell, s, reload }: { shell: Shell; s: Settings; reload: () => void }) {
  const locs = shell.ctx.locations;
  const [loc, setLoc] = useState(shell.loc ?? locs[0]?.id ?? "");
  const [name, setName] = useState("Tablet sala de musculación");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<{ link: string; name: string; location: string } | null>(null);
  const [revoke, setRevoke] = useState<Device | null>(null);
  const [revErr, setRevErr] = useState<string | null>(null);
  const create = async () => {
    if (busy) return;
    if (name.trim().length < 2) { setErr("Poné un nombre para reconocer la pantalla (por ejemplo, «Tablet sala de musculación»)."); return; }
    setBusy("create"); setErr(null);
    try {
      const r = await api<{ id: string; link: string }>(`/api/gym/${shell.orgId}/kiosk/devices`, { body: { loc, name: name.trim() } });
      setLink({ link: r.link, name: name.trim(), location: locs.find((l) => l.id === loc)?.name ?? "" });
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const doRevoke = async () => {
    if (!revoke || busy) return;
    setBusy(`r-${revoke.id}`); setRevErr(null);
    try { await api(`/api/gym/${shell.orgId}/kiosk/devices/${revoke.id}/revoke`, { body: {} }); shell.flash(`Revocaste «${revoke.name}». Ya no muestra rutinas.`); setRevoke(null); reload(); }
    catch (e) { setRevErr((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <section className="card">
      <h2>Pantallas autorizadas</h2>
      <small className="muted">Cada pantalla queda autorizada para una sede, sin iniciar sesión con una cuenta. Si se pierde o roban el equipo, revocala.</small>
      {!s.devices.length ? <div className="empty">Todavía no hay pantallas.</div> : (
        <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Pantallas (deslizá para ver más columnas)">
          <table className="gy-table"><thead><tr><th scope="col">Pantalla</th><th scope="col">Sede</th><th scope="col">Última conexión</th>{s.canManageDevices && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
            <tbody>{s.devices.map((d) => (
              <tr key={d.id}><th scope="row">{d.name}</th><td>{d.location}</td><td>{d.lastSeenAt ? when(d.lastSeenAt) : "Todavía no se abrió"}</td>
                {s.canManageDevices && <td><button type="button" className="btn sm danger" aria-label={`Revocar ${d.name}`} disabled={!!busy} onClick={() => { setRevErr(null); setRevoke(d); }}>Revocar</button></td>}</tr>
            ))}</tbody></table>
        </div>
      )}
      {s.canManageDevices ? (
        <form className="kc-new" aria-busy={busy === "create" || undefined} onSubmit={(e) => { e.preventDefault(); void create(); }}>
          {locs.length > 1 && (
            <label className="field" style={{ flex: "1 1 180px" }}>Sede
              <select value={loc} onChange={(e) => setLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          )}
          <label className="field" style={{ flex: "2 1 220px" }}>Nombre de la pantalla<input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setErr(null); }} aria-invalid={!!err || undefined} /></label>
          <button type="submit" className="btn pri" disabled={!loc || !!busy} aria-busy={busy === "create" || undefined}>{busy === "create" ? "Registrando…" : "Registrar pantalla"}</button>
        </form>
      ) : <small className="muted">Las pantallas las registran el dueño o la gerencia.</small>}
      {err && <p role="alert" className="err-box" style={{ margin: 0 }}>{err}</p>}
      {link && <DeviceLink {...link} flash={shell.flash} onDone={() => setLink(null)} />}
      {revoke && (
        <ConfirmDialog title={`¿Revocar «${revoke.name}»?`} confirmLabel="Revocar pantalla" danger busy={busy === `r-${revoke.id}`} err={revErr} onConfirm={() => void doRevoke()} onClose={() => setRevoke(null)}>
          <p style={{ margin: 0, lineHeight: 1.5 }}>Deja de mostrar rutinas al instante y cierra la consulta que esté abierta. Para volver a usar ese equipo, registralo de nuevo.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** El enlace de la pantalla, una sola vez: copiar o escanear el QR con la tablet. */
function DeviceLink({ link, name, location, flash, onDone }: { link: string; name: string; location: string; flash: (t: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const copy = () => { void navigator.clipboard?.writeText(link).then(() => flash("Enlace copiado."), () => flash("No se pudo copiar: seleccionalo a mano.")); };
  return (
    <div ref={ref} tabIndex={-1} className="kc-link" role="region" aria-label={`Enlace de ${name}`}>
      <div className="kc-link-txt">
        <b>«{name}» registrada{location ? ` · ${location}` : ""}</b>
        <span>Abrí este enlace una vez en la tablet; queda autorizada. Se puede revocar cuando quieras.</span>
        <span className="muted">Se muestra una sola vez: no lo compartas por grupos ni redes. Si lo perdés, revocá la pantalla y registrala de nuevo.</span>
        <code className="mono kc-url">{link}</code>
        <div className="kc-acts">
          <button type="button" className="btn sm" onClick={copy}>Copiar enlace</button>
          <button type="button" className="btn sm pri" onClick={onDone}>Listo, ya la abrí</button>
        </div>
      </div>
      <div className="kc-qr">
        <QrCode url={link} label={`Código QR del enlace de ${name}`} size={168} />
        <small className="muted">O escanealo con la cámara de la tablet.</small>
      </div>
    </div>
  );
}

/**
 * Entregar el código a un socio desde esta pantalla: quien ve la lista de socios (dueño y gerencia) lo busca; recepción, que no
 * ve fichas, lo hace al verificar el carnet.
 */
function MemberCodes({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const [q, setQ] = useState("");
  const [qq, setQq] = useState("");
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const reads = can(shell.ctx, "member.read");
  const list = useLoad<{ members: { id: string; name: string; program: { name: string } | null }[] }>(reads && qq.length >= 2 && loc ? `/api/gym/${shell.orgId}/members?loc=${loc}&q=${encodeURIComponent(qq)}` : null, { keep: true });
  return (
    <section className="card">
      <h2>Código y PIN de un socio</h2>
      {!reads ? (
        <>
          <span className="muted" style={{ fontSize: 14 }}>Verificá el carnet del socio en Recepción: ahí podés emitirle su código y su PIN.</span>
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => shell.go("reception")}>Ir a Recepción</button>
        </>
      ) : (
        <>
          <span className="muted" style={{ fontSize: 14 }}>Buscá al socio para emitirle su código y su PIN, o hacelo desde su ficha. Sólo socios activos.</span>
          <label className="search" style={{ maxWidth: 420 }}><Ic i={MagnifyingGlass} size={16} color="var(--ui-muted)" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="Buscar socio por nombre" aria-label="Buscar socio para su código" /></label>
          {list.err && <p role="alert" className="err-box" style={{ margin: 0 }}>{list.err}</p>}
          {!sel && qq.length >= 2 && list.data && (
            !list.data.members.length ? <span className="muted">Sin resultados.</span> : (
              <div className="kc-results" role="list" aria-label="Socios encontrados">
                {list.data.members.slice(0, 6).map((m) => (
                  <button key={m.id} type="button" role="listitem" className="crow" onClick={() => setSel({ id: m.id, name: m.name })}>
                    <span className="av36">{initials(m.name)}</span><span><b>{m.name}</b><small className="muted">{m.program ? m.program.name : "Sin programa"}</small></span>
                  </button>
                ))}
              </div>
            )
          )}
          {sel && (
            <div className="kc-sel">
              <div className="kc-sel-head"><b>{sel.name}</b><button type="button" className="btn sm" onClick={() => setSel(null)}>Elegir otro socio</button></div>
              <MemberKioskCard key={sel.id} shell={shell} memberId={sel.id} name={sel.name} inline bare />
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Código y PIN del socio ──────────────────────────────────────────────────
type Cred = { enabled: boolean; credential: { code: string; issuedAt: string; lastUsedAt: string | null; locked: boolean; failedCount: number } | null };
const spaced = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c);

export function MemberKioskCard({ shell, memberId, name, inline, bare }: { shell: Shell; memberId: string; name: string; inline?: boolean; bare?: boolean }) {
  const c = useLoad<Cred>(`/api/gym/${shell.orgId}/kiosk/members/${memberId}`);
  const [ask, setAsk] = useState<null | "issue" | "revoke">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; pin: string } | null>(null);
  const issueBtn = useRef<HTMLButtonElement>(null);
  const refocus = () => requestAnimationFrame(() => issueBtn.current?.focus());
  if (!c.data?.enabled) return c.err && !inline ? <section className="card"><h2>Pantalla de rutinas</h2><p role="alert" className="err-box" style={{ margin: 0 }}>{c.err}</p></section> : null;
  const cred = c.data.credential;
  const first = name.split(" ")[0];
  const run = async (what: "issue" | "revoke") => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (what === "issue") { const r = await api<{ code: string; pin: string }>(`/api/gym/${shell.orgId}/kiosk/members/${memberId}/issue`, { body: {} }); setAsk(null); setIssued(r); }
      else { await api(`/api/gym/${shell.orgId}/kiosk/members/${memberId}/revoke`, { body: {} }); setAsk(null); refocus(); shell.flash(`Revocaste el código de ${first}. Ya no puede consultar en la pantalla.`); }
      void c.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const open = (w: "issue" | "revoke") => { setErr(null); if (w === "issue" && !cred) void run("issue"); else setAsk(w); };
  const body = (
    <>
      {bare ? null : inline ? <b>Pantalla de rutinas</b> : <h2>Pantalla de rutinas</h2>}
      {cred ? (
        <div className="kc-cred">
          <span><small className="muted">Código</small><b className="mono kc-code">{spaced(cred.code)}</b></span>
          <span className="muted">Emitido {fmt(cred.issuedAt)} · último uso {cred.lastUsedAt ? when(cred.lastUsedAt) : "nunca"}{cred.failedCount > 0 ? ` · ${cred.failedCount} ${cred.failedCount === 1 ? "intento fallido" : "intentos fallidos"}` : ""}</span>
          {cred.locked && <span className="chip warn">Pausado por intentos</span>}
        </div>
      ) : <span className="muted" style={{ fontSize: 14 }}>{first} todavía no tiene código para consultar su rutina en la pantalla del gimnasio.</span>}
      {cred?.locked && <small className="muted">El código se pausa 15 minutos después de 5 intentos fallidos. Si {first} no recuerda el PIN, generale uno nuevo.</small>}
      {err && !ask && <p role="alert" className="err-box" style={{ margin: 0 }}>{err}</p>}
      <div className="kc-acts">
        <button ref={issueBtn} type="button" className="btn sm pri" disabled={busy} aria-busy={(busy && !ask) || undefined} onClick={() => open("issue")}>{cred ? "Generar código y PIN nuevos" : busy ? "Emitiendo…" : "Emitir código y PIN"}</button>
        {cred && <button type="button" className="btn sm danger" disabled={busy} onClick={() => open("revoke")}>Revocar</button>}
      </div>
      {ask === "issue" && (
        <ConfirmDialog title={`¿Generar código y PIN nuevos para ${first}?`} confirmLabel="Generar nuevos" busy={busy} err={err} onConfirm={() => void run("issue")} onClose={() => setAsk(null)}>
          <p style={{ margin: 0, lineHeight: 1.5 }}>El código y el PIN que tiene ahora dejan de servir enseguida (también si está consultando en este momento). Entregale los nuevos en mano.</p>
        </ConfirmDialog>
      )}
      {ask === "revoke" && (
        <ConfirmDialog title={`¿Revocar el código de ${first}?`} confirmLabel="Revocar código" danger busy={busy} err={err} onConfirm={() => void run("revoke")} onClose={() => setAsk(null)}>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{first} deja de poder consultar su rutina en la pantalla. Su programa y su historial no cambian, y podés emitirle otro código cuando quieras.</p>
        </ConfirmDialog>
      )}
      {issued && <IssuedModal gym={shell.ctx.org.name} name={name} code={issued.code} pin={issued.pin} flash={shell.flash} onClose={() => { setIssued(null); refocus(); }} />}
    </>
  );
  return inline ? <div className={bare ? "kc-inline kc-bare" : "kc-inline"}>{body}</div> : <section className="card" aria-busy={busy || undefined}>{body}</section>;
}

/** Código y PIN recién emitidos: una sola vez, con dígitos grandes, para entregar en mano, copiar o imprimir. */
function IssuedModal({ gym, name, code, pin, flash, onClose }: { gym: string; name: string; code: string; pin: string; flash: (t: string) => void; onClose: () => void }) {
  const copy = () => { void navigator.clipboard?.writeText(`Pantalla de rutinas · ${gym}\nCódigo: ${code}\nPIN: ${pin}`).then(() => flash("Código y PIN copiados."), () => flash("No se pudo copiar: anotalos a mano.")); };
  const print = () => {
    const b = document.body;
    const done = () => { delete b.dataset.print; };
    b.dataset.print = "kiosk-cred";
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    setTimeout(done, 1000);
  };
  return (
    <Modal label={`Código y PIN de ${name}`} onClose={onClose}>
      <div className="mhead"><h2>Código y PIN de {name}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <p className="gy-warn" role="note" style={{ margin: 0 }}>El PIN se muestra una sola vez. Entregáselo en mano; no lo mandes por grupos ni lo dejes anotado a la vista.</p>
      <div className="kc-print">
        <span className="kc-print-gym">{gym} · Pantalla de rutinas</span>
        <span className="kc-print-name">{name}</span>
        <div className="kc-big">
          <span><small>Código de socio</small><b aria-label={`Código ${code.split("").join(" ")}`}>{spaced(code)}</b></span>
          <span><small>PIN</small><b aria-label={`PIN ${pin.split("").join(" ")}`}>{pin}</b></span>
        </div>
        <span className="kc-print-help">En la pantalla de rutinas del gimnasio, escribí tu código y tu PIN para ver tu programa. Podés cambiar el PIN desde la app REPI, en Perfil.</span>
      </div>
      <div className="mfoot">
        <button type="button" className="btn" onClick={copy}>Copiar</button>
        <button type="button" className="btn" onClick={print}>Imprimir</button>
        <button type="button" className="btn pri" onClick={onClose}>Listo, ya se lo di</button>
      </div>
    </Modal>
  );
}
