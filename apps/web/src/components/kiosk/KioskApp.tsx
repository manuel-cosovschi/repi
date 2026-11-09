"use client";
// REPI Control (D213): pantalla de consulta de rutinas del gimnasio. Bienvenida → código y PIN → programa vigente → terminar.
// El secreto del equipo llega una vez en el fragmento (#k=…) y queda en este equipo; la consulta de cada persona vive sólo en la
// memoria de esta página y se cierra al terminar, por inactividad, al ocultar la pestaña o cuando el servidor la da por vencida.
// No hay enlaces a otras partes de REPI: la pantalla no sirve para navegar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";

const KEY = "repi-routine-kiosk";
const DEMO_KEY = "repi-routine-kiosk-demo";
const read = (k: string, s: Storage | null) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const write = (k: string, v: string | null, s: Storage | null) => { try { if (!s) return; if (v) s.setItem(k, v); else s.removeItem(k); } catch { /* sin almacenamiento */ } };
const ls = () => (typeof window === "undefined" ? null : window.localStorage);
const ss = () => (typeof window === "undefined" ? null : window.sessionStorage);

type Hello = { gym: string; location: string; screen: string; idleSec: number; demo: boolean };
type Ex = { name: string; sets: number; reps: string; rir: number | null; restSec: number | null; note: string | null; prescription: string; demo: { kind: "video" | "link"; url: string } | null };
type Program = { name: string; note: string | null; weeks: number | null; version: number; updatedAt: string; startsOn: string; days: { name: string; exercises: Ex[] }[] };
type View = { person: { firstName: string; initial: string }; gym: string; expiresAt: string; idleSec: number; program: Program | null };
type DemoPerson = { name: string; code: string; pin: string; note: string };
type Step = "loading" | "unauthorized" | "off" | "welcome" | "code" | "pin" | "program" | "bye";

const rest = (s: number | null) => (s == null ? null : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s} s`);
const day = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

async function call<T>(path: string, secret: string, init: RequestInit & { token?: string } = {}): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string; error: string }> {
  try {
    const r = await fetch(`/api/kiosk/${path}`, {
      method: init.method ?? "GET", cache: "no-store", body: init.body,
      headers: { "x-repi-kiosk": secret, ...(init.token ? { "x-repi-kiosk-session": init.token } : {}), ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, code: j.code ?? String(r.status), error: j.error ?? "No pudimos conectarnos. Probá de nuevo." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, code: "network", error: "Sin conexión. Revisá el wifi de la pantalla y probá de nuevo." };
  }
}

export function KioskApp({ appUrl }: { appUrl: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [hello, setHello] = useState<Hello | null>(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [left, setLeft] = useState(60);
  const [demo, setDemo] = useState<DemoPerson[]>([]);
  const token = useRef<string | null>(null);
  const lastTouch = useRef(Date.now());
  const main = useRef<HTMLDivElement>(null);

  // Secreto del equipo: del fragmento (una vez) o de este equipo. Las personas demo, sólo en esta pestaña.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const k = h.get("k");
    const d = h.get("d");
    if (k) write(KEY, k, ls());
    if (d) write(DEMO_KEY, d, ss());
    if (k || d) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const s = k ?? read(KEY, ls());
    const dd = d ?? read(DEMO_KEY, ss());
    if (dd) {
      try { setDemo(JSON.parse(decodeURIComponent(atob(dd))) as DemoPerson[]); } catch { /* demo inválida: se ignora */ }
    }
    setSecret(s);
    if (!s) setStep("unauthorized");
  }, []);

  const loadHello = useCallback(async (s: string) => {
    const r = await call<Hello>("hello", s);
    if (r.ok) { setHello(r.data); setLeft(r.data.idleSec); setStep((x) => (x === "loading" || x === "off" ? "welcome" : x)); return; }
    if (r.status === 401) { write(KEY, null, ls()); setSecret(null); setStep("unauthorized"); return; }
    if (r.code === "kiosk_off") { setStep("off"); setMsg(r.error); return; }
    setMsg(r.error);
    setStep((x) => (x === "loading" ? "off" : x));
  }, []);
  useEffect(() => { if (secret) void loadHello(secret); }, [secret, loadHello]);
  // Si la pantalla quedó sin servicio, vuelve a probar sola cada 30 s.
  useEffect(() => {
    if (step !== "off" || !secret) return;
    const t = setInterval(() => void loadHello(secret), 30_000);
    return () => clearInterval(t);
  }, [step, secret, loadHello]);

  // Pantalla encendida mientras está autorizada.
  useEffect(() => {
    if (!secret) return;
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* no disponible */ } };
    void ask();
    const again = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); void lock?.release().catch(() => {}); };
  }, [secret]);

  /** Cierra la consulta: avisa al servidor y limpia todo lo de la persona. */
  const finish = useCallback(async (reason: "done" | "idle" | "over", note?: string) => {
    const t = token.current;
    token.current = null;
    setView(null); setCode(""); setPin(""); setDayIdx(0); setBusy(false);
    setMsg(note ?? null);
    if (t && secret && reason !== "over") void call("end", secret, { method: "POST", token: t, body: JSON.stringify({ reason: reason === "idle" ? "idle" : "done" }) });
    setStep(reason === "done" ? "bye" : "welcome");
  }, [secret]);
  useEffect(() => {
    if (step !== "bye") return;
    const t = setTimeout(() => { setStep("welcome"); setMsg(null); }, 4000);
    return () => clearTimeout(t);
  }, [step]);

  // Inactividad: cualquier toque reinicia el contador. Pasado el tiempo, se cierra sola (también en código y PIN).
  const idleSec = hello?.idleSec ?? 60;
  const touch = useCallback(() => { lastTouch.current = Date.now(); setLeft(idleSec); }, [idleSec]);
  useEffect(() => {
    if (step !== "program" && step !== "code" && step !== "pin") return;
    lastTouch.current = Date.now();
    const t = setInterval(() => {
      const l = Math.max(0, idleSec - Math.floor((Date.now() - lastTouch.current) / 1000));
      setLeft(l);
      if (l <= 0) void finish("idle", "La consulta se cerró por inactividad.");
    }, 500);
    return () => clearInterval(t);
  }, [step, idleSec, finish]);
  // Si alguien cambia de pestaña o la pantalla se oculta, la consulta se cierra. Al cerrar la pestaña el token se pierde con la
  // memoria de la página (nunca se guardó) y el servidor la da por vencida a los pocos minutos.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden" && token.current) void finish("idle"); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [finish]);
  // El foco va al título de cada paso (lectores de pantalla y teclado).
  useEffect(() => { main.current?.querySelector<HTMLElement>("h1")?.focus(); }, [step]);

  const identify = async (pinValue = pin) => {
    if (!secret || busy) return;
    setBusy(true); setMsg(null);
    const r = await call<{ token: string; idleSec: number }>("identify", secret, { method: "POST", body: JSON.stringify({ code, pin: pinValue }) });
    if (!r.ok) {
      setBusy(false); setPin("");
      if (r.status === 401 && r.code === "invalid_kiosk") { write(KEY, null, ls()); setSecret(null); setStep("unauthorized"); return; }
      if (r.code === "kiosk_off") { setStep("off"); setMsg(r.error); return; }
      setMsg(r.error);
      if (r.code === "bad_credentials" || r.code === "code_locked") { setCode(""); setStep("code"); }
      return;
    }
    token.current = r.data.token;
    const p = await call<View>("program", secret, { token: r.data.token });
    setBusy(false); setCode(""); setPin("");
    if (!p.ok) { token.current = null; setMsg(p.error); setStep("welcome"); return; }
    setView(p.data); setDayIdx(0); setStep("program"); touch();
  };

  // Con el sexto número del código pasa sola al PIN; si alguien sigue tocando rápido, esos números ya son del PIN.
  const press = (d: string) => {
    touch(); setMsg(null);
    if (step === "code" && code.length < 6) {
      const v = code + d;
      setCode(v);
      if (v.length === 6) setStep("pin");
    } else if (step === "pin" || step === "code") {
      if (step === "code") setStep("pin");
      setPin((p) => (p + d).slice(0, 6));
    }
  };
  const back = () => { touch(); if (step === "code") setCode((c) => c.slice(0, -1)); else setPin((p) => p.slice(0, -1)); };
  // Teclado físico (monitor con teclado o lector).
  useEffect(() => {
    if (step !== "code" && step !== "pin") return;
    const k = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
      else if (e.key === "Enter" && step === "pin" && pin.length >= 4) { e.preventDefault(); void identify(); }
      else if (e.key === "Escape") { e.preventDefault(); void finish("idle"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const appQr = useMemo(() => renderSVG(`${appUrl}/instalar?src=pantalla`, { border: 1, ecc: "M" }), [appUrl]);
  const cur = view?.program?.days[dayIdx] ?? null;

  if (step === "loading") return <div className="kq" aria-busy="true"><p className="kq-muted">Cargando…</p></div>;
  if (step === "unauthorized") return (
    <div className="kq" ref={main}>
      <div className="kq-center">
        <span className="kq-brand">REPI</span>
        <h1 tabIndex={-1}>Pantalla de rutinas</h1>
        <p className="kq-lead">Esta pantalla no está autorizada. En REPI, el dueño o la gerencia del gimnasio entra a <b>Pantalla de rutinas</b>, registra una para esta sede y abre el enlace en este equipo.</p>
        <p className="kq-muted">El enlace se usa una vez por equipo y se puede revocar en cualquier momento.</p>
      </div>
    </div>
  );
  if (step === "off") return (
    <div className="kq" ref={main}>
      <div className="kq-center">
        <span className="kq-brand">REPI</span>
        <h1 tabIndex={-1}>Pantalla no disponible</h1>
        <p className="kq-lead">{msg ?? "La pantalla de rutinas no está disponible en este momento."}</p>
        <p className="kq-muted">Pedí ayuda en recepción. Volvemos a probar solos en unos segundos.</p>
      </div>
    </div>
  );

  return (
    <div className="kq" ref={main} onPointerDown={touch}>
      <header className="kq-top">
        <span className="kq-brand" aria-hidden="true">REPI</span>
        <span className="kq-where">{hello ? `${hello.gym} · ${hello.location}` : ""}</span>
        {hello?.demo && <span className="kq-demo" role="note">Demo · datos ficticios</span>}
        {(step === "program" || step === "code" || step === "pin") && (
          <span className={`kq-idle ${left <= 15 ? "warn" : ""}`} aria-live={left <= 15 ? "polite" : "off"}>
            {left <= 15 ? `Se cierra en ${left} s` : `Cierre automático en ${left} s`}
          </span>
        )}
      </header>

      {step === "welcome" && (
        <main className="kq-welcome">
          <section className="kq-hero">
            <h1 tabIndex={-1}>Consultá<br />tu rutina</h1>
            <p className="kq-lead">La planifica el equipo de {hello?.gym ?? "tu gimnasio"}. Sin instalar nada: con tu código de socio y tu PIN.</p>
            {msg && <p className="kq-info" role="status">{msg}</p>}
            <button type="button" className="kq-primary" onClick={() => { setMsg(null); setCode(""); setPin(""); setStep("code"); }}>Empezar</button>
            <p className="kq-muted">¿No tenés código? Pedíselo a recepción.</p>
          </section>
          <div className="kq-side">
          <aside className="kq-app" aria-label="REPI en tu celular (opcional)">
            <div className="kq-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: appQr }} />
            <div>
              <strong>Opcional: tu rutina en el celular</strong>
              <p>Escaneá para usar REPI en tu teléfono. No es el QR de ingreso al gimnasio.</p>
            </div>
          </aside>
          {demo.length > 0 && (
            <aside className="kq-demo-guide" aria-label="Personas de la demo">
              <strong>Probá con estas personas ficticias</strong>
              <ul>{demo.map((p) => <li key={p.code}><b>{p.name}</b> · código <code>{p.code}</code> · PIN <code>{p.pin}</code><small>{p.note}</small></li>)}</ul>
            </aside>
          )}
          </div>
        </main>
      )}

      {(step === "code" || step === "pin") && (
        <main className="kq-id">
          <section className="kq-id-text">
            <h1 tabIndex={-1}>{step === "code" ? "Tu código de socio" : "Tu PIN"}</h1>
            <p className="kq-lead">{step === "code" ? "Son 6 números. Te lo da recepción y lo ves en la app, si la usás." : "Son 4 a 6 números. Nadie más lo ve: se muestran puntos."}</p>
            <div className="kq-digits" aria-live="polite" aria-label={step === "code" ? `Código: ${code.length} de 6 números` : `PIN: ${pin.length} números`}>
              {step === "code"
                ? Array.from({ length: 6 }, (_, i) => <span key={i} className={i < code.length ? "on" : ""}>{code[i] ?? ""}</span>)
                : Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? "on dot" : ""}>{i < pin.length ? "•" : ""}</span>)}
            </div>
            {msg && <p className="kq-err" role="alert">{msg}</p>}
            <div className="kq-row">
              <button type="button" className="kq-ghost" onClick={() => void finish("idle")}>Cancelar</button>
              {step === "pin" && <button type="button" className="kq-ghost" onClick={() => { setPin(""); setStep("code"); }}>Cambiar código</button>}
            </div>
          </section>
          <section className="kq-pad" aria-label="Teclado numérico">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => press(d)} disabled={busy}>{d}</button>)}
            <button type="button" className="kq-pad-aux" onClick={back} disabled={busy} aria-label="Borrar el último número">Borrar</button>
            <button type="button" onClick={() => press("0")} disabled={busy}>0</button>
            {step === "pin"
              ? <button type="button" className="kq-pad-ok" onClick={() => void identify()} disabled={busy || pin.length < 4} aria-busy={busy || undefined}>{busy ? "…" : "Ver"}</button>
              : <button type="button" className="kq-pad-ok" onClick={() => setStep("pin")} disabled={code.length !== 6}>Seguir</button>}
          </section>
        </main>
      )}

      {step === "program" && view && (
        <main className="kq-prog">
          <section className="kq-prog-head">
            <div>
              <p className="kq-eyebrow">Hola, {view.person.firstName} {view.person.initial}</p>
              <h1 tabIndex={-1}>{view.program ? view.program.name : "Todavía no tenés programa"}</h1>
              {view.program && (
                <p className="kq-meta">Planificado por el equipo de {view.gym} · versión {view.program.version} · actualizado el {day(view.program.updatedAt)}{view.program.weeks ? ` · ${view.program.weeks} semanas` : ""}</p>
              )}
            </div>
            <button type="button" className="kq-end" onClick={() => void finish("done")}>Terminar</button>
          </section>
          {!view.program ? (
            <section className="kq-empty">
              <p className="kq-lead">Tu gimnasio todavía no te asignó un programa. Pedíselo al equipo de sala: cuando lo carguen, lo vas a ver acá y en la app.</p>
            </section>
          ) : (
            <>
              {view.program.note && <p className="kq-note"><b>Indicaciones:</b> {view.program.note}</p>}
              <nav className="kq-days" role="tablist" aria-label="Días del programa">
                {view.program.days.map((d, i) => (
                  <button key={i} type="button" role="tab" id={`kq-tab-${i}`} aria-selected={i === dayIdx} aria-controls="kq-day" tabIndex={i === dayIdx ? 0 : -1}
                    onClick={() => { setDayIdx(i); touch(); }}
                    onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = view.program!.days.length; const j = (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n; setDayIdx(j); (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus(); } }}>
                    {d.name}<small>{d.exercises.length} ejercicios</small>
                  </button>
                ))}
              </nav>
              <div id="kq-day" role="tabpanel" aria-labelledby={`kq-tab-${dayIdx}`}>
              <ol className="kq-list">
                {cur?.exercises.map((e, i) => (
                  <li key={i} className="kq-ex" style={{ "--i": i } as React.CSSProperties}>
                    <span className="kq-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                    <div className="kq-ex-main">
                      <h2>{e.name}</h2>
                      <p className="kq-rx">{e.prescription}</p>
                      {!!e.restSec && <p className="kq-chips"><span>Descanso {rest(e.restSec)}</span></p>}
                      {e.note && <p className="kq-exnote">{e.note}</p>}
                    </div>
                    {e.demo && <Demo d={e.demo} name={e.name} onTouch={touch} />}
                  </li>
                ))}
              </ol>
              </div>
              <p className="kq-foot">Sólo para consultar: el programa lo cambia el equipo de sala. Para registrar tus series, usá la app si tu gimnasio la habilitó.</p>
            </>
          )}
        </main>
      )}

      {step === "bye" && (
        <main className="kq-center">
          <h1 tabIndex={-1}>Listo, buen entrenamiento</h1>
          <p className="kq-lead">Tu consulta se cerró. La pantalla queda libre para la próxima persona.</p>
        </main>
      )}
    </div>
  );
}

/** Demostración del ejercicio: un video del gimnasio se reproduce acá; un enlace externo se abre en el celular con un QR. */
function Demo({ d, name, onTouch }: { d: { kind: "video" | "link"; url: string }; name: string; onTouch: () => void }) {
  const [open, setOpen] = useState(false);
  const qr = useMemo(() => (d.kind === "link" ? renderSVG(d.url, { border: 1, ecc: "M" }) : ""), [d]);
  return (
    <div className="kq-ex-demo">
      <button type="button" className="kq-ghost" aria-expanded={open} onClick={() => { setOpen((o) => !o); onTouch(); }}>{open ? "Ocultar demostración" : "Ver demostración"}</button>
      {open && (d.kind === "video"
        ? <video src={d.url} controls playsInline muted preload="metadata" aria-label={`Demostración: ${name}`} onPlay={onTouch} />
        : <div className="kq-linkqr"><div aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} /><small>Escaneá para verla en tu celular</small></div>)}
    </div>
  );
}
