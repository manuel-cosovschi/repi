"use client";
// REPI Control (D213), app del alumno:
// - SupervisedNote: en un gimnasio que planifica todo, en lugar de «Mis rutinas» queda una nota tranquila y la forma de pedir un
//   cambio al equipo de sala. Registrar el programa asignado sigue igual.
// - KioskAccess: el código para consultar la rutina en la pantalla del gimnasio y el cambio de PIN. Sólo aparece si el gimnasio
//   le emitió un código. El PIN nunca se muestra (ni el actual ni el nuevo después de guardarlo).
import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import { Reveal } from "@/components/motion/Skeleton";

export function SupervisedNote({ offline, onAsk }: { offline: boolean; onAsk: () => void }) {
  const id = useId();
  return (
    <section className="dashed-card sv-note" aria-labelledby={id}>
      <strong id={id}>Tu gimnasio planifica tus rutinas</strong>
      <span>Si necesitás un cambio, pedíselo al equipo de sala. Lo que registrás en tu programa sigue igual.</span>
      {!offline && <button type="button" className="ghost sm" onClick={onAsk}>Pedir un cambio al equipo</button>}
    </section>
  );
}

type KioskItem = { id: string; gym: string; code: string; locked: boolean };
/** «123456» → «123 456», más fácil de leer y dictar. */
const spaced = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c);

export function KioskAccess({ offline, flash }: { offline: boolean; flash: (m: string) => void }) {
  const [items, setItems] = useState<KioskItem[] | null>(null);
  const load = useCallback(() => api<{ items: KioskItem[] }>("/api/me/kiosk").then((r) => setItems(r.items)).catch(() => setItems((p) => p ?? [])), []);
  useEffect(() => { if (!offline) void load(); }, [offline, load]);
  const on = !!items?.length;
  return (
    <Reveal on={on}>
      {on && (
        <section className="wishes kiosk-me" aria-labelledby="kiosk-me-h">
          <h2 id="kiosk-me-h" style={{ fontSize: 16 }}>Pantalla de rutinas del gimnasio</h2>
          <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Con este código y tu PIN consultás tu rutina en la pantalla del gimnasio, sin instalar nada.</span>
          {items!.map((i) => <KioskItemCard key={i.id} item={i} multi={items!.length > 1} offline={offline} flash={flash} onSaved={load} />)}
        </section>
      )}
    </Reveal>
  );
}

function KioskItemCard({ item, multi, offline, flash, onSaved }: { item: KioskItem; multi: boolean; offline: boolean; flash: (m: string) => void; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = useId();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const close = () => { setOpen(false); setPin(""); setAgain(""); setErr(null); };
  const save = async () => {
    if (busy) return;
    if (offline) { setErr("Necesitás conexión para cambiar el PIN."); return; }
    if (!/^\d{4,6}$/.test(pin)) { setErr("El PIN tiene que tener de 4 a 6 números."); return; }
    if (pin !== again) { setErr("Los dos PIN no coinciden. Escribilo de nuevo."); return; }
    setBusy(true); setErr(null);
    try {
      await api("/api/me/kiosk", { body: { id: item.id, pin } });
      close();
      flash("Listo: tu PIN nuevo ya sirve en la pantalla del gimnasio.");
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="kiosk-me-card">
      <div className="kiosk-me-top">
        <span>{multi && <small className="mb-muted">{item.gym}</small>}<small className="mb-muted">Tu código de socio</small>
          <b className="kiosk-me-code" aria-label={`Código ${item.code.split("").join(" ")}`}>{spaced(item.code)}</b></span>
        {!open && <button type="button" className="ghost sm" disabled={offline} onClick={() => setOpen(true)}>Cambiar mi PIN</button>}
      </div>
      {item.locked && <p className="mb-err" role="status" style={{ margin: 0 }}>Tu código está pausado por varios intentos fallidos. Esperá unos minutos o elegí un PIN nuevo.</p>}
      {open && (
        <form id={`${base}-f`} className="kiosk-me-form" aria-busy={busy || undefined} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="wish-row">
            <label htmlFor={`${base}-p`}>PIN nuevo<input id={`${base}-p`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} disabled={busy}
              onChange={(e) => { setPin(digits(e.target.value)); setErr(null); }} aria-describedby={`${base}-h${err ? ` ${base}-e` : ""}`} aria-invalid={!!err || undefined} autoFocus /></label>
            <label htmlFor={`${base}-a`}>Repetilo<input id={`${base}-a`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={again} disabled={busy}
              onChange={(e) => { setAgain(digits(e.target.value)); setErr(null); }} aria-invalid={!!err || undefined} /></label>
          </div>
          <span id={`${base}-h`} className="mb-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>De 4 a 6 números, sin repetidos ni seguidos (nada de 1111 ni 1234). No lo compartas: el equipo del gimnasio tampoco lo ve.</span>
          {err && <p id={`${base}-e`} className="mb-err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="kiosk-me-acts">
            <button type="submit" className="cta sm" disabled={busy} aria-busy={busy || undefined}>{busy ? "Guardando…" : "Guardar PIN"}</button>
            <button type="button" className="ghost sm" disabled={busy} onClick={close}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
