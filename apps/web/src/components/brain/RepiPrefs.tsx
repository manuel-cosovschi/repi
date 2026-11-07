"use client";
// Asistente REPI (D209) · Perfil → «Asistente REPI». Avisos dentro de la app y por categoría, avisos en el teléfono (push,
// sólo adultos y con el permiso del navegador), horario de silencio, cuántos por día, autonomía y tono, y «Lo que REPI
// recuerda» para ver y borrar. Cada cambio se guarda en el servidor y la pantalla muestra lo que el servidor devolvió.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { enablePush, pushState } from "@/lib/push";
import { useBrain } from "./BrainProvider";
import { serialLatest } from "./presenter";
import type { BrainPrefs, MemoryItem } from "./types";

type Cat = keyof BrainPrefs["categories"];
const CATS: [Cat, string, string][] = [
  ["training", "Recordatorios de entrenamiento", "Retomar, la semana, el día que toca."],
  ["progress", "Avisos de progreso", "Marcas, tendencias, objetivos."],
  ["performance", "Recomendaciones de rendimiento", "Cargas, descansos, poca energía."],
  ["motivation", "Mensajes motivacionales", "Apagado si no lo pedís."],
  ["weekly", "Resumen semanal", "Los lunes, cómo te fue la semana anterior."],
];
const AUTONOMY: [0 | 1 | 2, string, string][] = [
  [0, "Sólo informar", "REPI te cuenta y te explica. No te propone cambios en la sesión."],
  [1, "Proponer y preguntar", "REPI te propone cambios y no hace nada sin que lo confirmes. Recomendado."],
  [2, "Hacer lo simple", "Por ahora funciona igual que «Proponer y preguntar»: todo cambio se confirma."],
];
const PER_DAY = [1, 2, 3, 5];
const SOURCE: Record<MemoryItem["source"], string> = { user: "Lo dijiste vos", system: "Lo registró REPI", coach: "De tu entrenador" };
const KIND: Record<MemoryItem["kind"], string> = { preference: "Preferencia", decision: "Decisión", outcome: "Resultado", temporal: "Sólo por hoy" };
const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso));

export function RepiPrefs({ offline, flash }: { offline: boolean; flash: (m: string) => void }) {
  const brain = useBrain();
  const [p, setP] = useState<BrainPrefs | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set()); // lo que se está guardando (puede ser más de una cosa)
  const inflight = useRef(new Map<string, number>()); // lo mismo, al instante (un doble toque llega antes del nuevo render)
  const [push, setPush] = useState<{ eligible: boolean; supported: boolean; configured: boolean } | null>(null);
  const [mem, setMem] = useState<MemoryItem[] | null>(null);
  // Revisión AC3 #26: los pedidos de preferencias salen de a uno y en orden (dos toques rápidos no se pisan en el servidor) y
  // sólo la respuesta del último se muestra (una respuesta vieja que llega tarde no deshace lo nuevo).
  const send = useMemo(() => serialLatest<{ prefs: BrainPrefs }>((r) => setP(r.prefs)), []);
  const load = useCallback(() => {
    setErr(false);
    api<{ prefs: BrainPrefs }>("/api/me/brain/prefs").then((r) => setP(r.prefs)).catch(() => setErr(true));
    api<{ items: MemoryItem[] }>("/api/me/brain/memory").then((r) => setMem(r.items)).catch(() => setMem(null));
    // Push sólo para adultos confirmados (el servidor también lo exige): a un menor no se le ofrece.
    pushState().then((s) => setPush({ eligible: !!s.coaching?.eligible, supported: s.supported, configured: s.configured })).catch(() => setPush(null));
  }, []);
  useEffect(() => { if (brain.enabled && !offline) load(); }, [brain.enabled, offline, load]);
  if (!brain.enabled) return null;

  // La pantalla sigue mostrando lo que devolvió el servidor. Cada cambio manda sólo lo que cambió (una categoría, no todas:
  // antes se mandaban las cinco con los valores de la pantalla y un segundo toque rápido deshacía el primero). Un interruptor
  // no se vuelve a tocar mientras se guarda (su valor nuevo depende de la respuesta); horario, cantidad, autonomía y tono mandan
  // un valor fijo y se pueden cambiar seguido. Si algo falla, se relee lo vigente.
  const put = (patch: Partial<BrainPrefs>) => send(() => api<{ prefs: BrainPrefs }>("/api/me/brain/prefs", { method: "PUT", body: patch }));
  const resync = () => { send(() => api<{ prefs: BrainPrefs }>("/api/me/brain/prefs")).catch(() => {}); };
  const mark = (what: string, d: 1 | -1) => {
    const n = (inflight.current.get(what) ?? 0) + d;
    if (n > 0) inflight.current.set(what, n); else inflight.current.delete(what);
    setBusy(new Set(inflight.current.keys()));
  };
  const save = async (patch: Partial<BrainPrefs>, what: string, toggle = false) => {
    if (offline) { flash("Necesitás conexión para cambiar el asistente."); return; }
    if (toggle && inflight.current.has(what)) return;
    mark(what, 1);
    try {
      await put(patch);
      brain.reloadHome(true);
    } catch (e) { flash((e as Error).message); resync(); } finally { mark(what, -1); }
  };
  const togglePush = async (on: boolean) => {
    if (offline) { flash("Necesitás conexión para cambiar los avisos."); return; }
    if (inflight.current.has("push")) return;
    mark("push", 1);
    try {
      if (on) {
        const r = await enablePush({ coaching: true });
        if (r?.coaching) setP((x) => (x ? { ...x, push: true } : x));
        flash("Avisos de REPI activados en este teléfono.");
      } else {
        await put({ push: false });
        flash("Avisos de REPI en el teléfono apagados.");
      }
    } catch (e) { flash((e as Error).message); } finally { mark("push", -1); }
  };
  const forget = async (m: MemoryItem) => {
    if (offline) { flash("Necesitás conexión para borrar un recuerdo."); return; }
    if (inflight.current.has(`mem:${m.id}`)) return;
    if (!window.confirm(`¿Borrar «${m.text}» de lo que REPI recuerda? No se puede deshacer.`)) return;
    mark(`mem:${m.id}`, 1);
    try {
      await api(`/api/me/brain/memory/${m.id}`, { method: "DELETE" });
      setMem((xs) => (xs ? xs.filter((x) => x.id !== m.id) : xs));
      flash("Recuerdo borrado.");
      resync();
    } catch (e) { flash((e as Error).message); } finally { mark(`mem:${m.id}`, -1); }
  };

  const off = offline || !p;
  return (
    <section className="rp-prefs" aria-labelledby="rp-prefs-h">
      <h2 id="rp-prefs-h" style={{ fontSize: 16 }}>Asistente REPI</h2>
      <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>REPI te acompaña con tus datos. Elegí cuándo y cómo te habla. Tu conversación y lo que recuerda son privados: ni tu profe ni el gimnasio los ven.</span>
      {offline && <p className="mb-note" role="status">Sin conexión: el asistente se ajusta cuando vuelva la conexión. Tu rutina funciona igual.</p>}
      {err && !offline && <p className="mb-muted" style={{ fontSize: 14 }}>No pude traer tus preferencias. <button type="button" className="linkbtn" onClick={load}>Reintentar</button></p>}
      {p && (
        <>
          <div className="panel">
            <button type="button" className="prow-dark" role="switch" aria-checked={p.proactive} aria-busy={busy.has("proactive") || undefined} disabled={off}
              onClick={() => void save({ proactive: !p.proactive }, "proactive", true)}>
              <span><span style={{ fontSize: 15, fontWeight: 500 }}>Avisos de REPI en la app</span><small>{p.proactive ? "REPI puede tomar la iniciativa en Inicio." : "Apagados: sólo avisos de seguridad. Podés hablarle cuando quieras."}</small></span>
              <span className="track" aria-hidden="true" />
            </button>
            {CATS.map(([k, l, d]) => (
              <button key={k} type="button" className="prow-dark" role="switch" aria-checked={p.categories[k]} aria-busy={busy.has(`cat:${k}`) || undefined} aria-disabled={!p.proactive || undefined} disabled={off}
                onClick={() => (p.proactive ? void save({ categories: { [k]: !p.categories[k] } as BrainPrefs["categories"] }, `cat:${k}`, true) : flash("Primero activá los avisos de REPI en la app."))}>
                <span><span style={{ fontSize: 15, fontWeight: 500 }}>{l}</span><small>{d}</small></span>
                <span className="track" aria-hidden="true" />
              </button>
            ))}
            {push?.eligible && (
              <button type="button" className="prow-dark" role="switch" aria-checked={p.push} aria-busy={busy.has("push") || undefined} disabled={off || (!p.push && (!push.supported || !push.configured))}
                onClick={() => void togglePush(!p.push)}>
                <span><span style={{ fontSize: 15, fontWeight: 500 }}>Avisos de REPI en el teléfono</span>
                  <small>{!push.supported && !p.push ? "Este navegador no admite avisos. En iPhone, agregá REPI a la pantalla de inicio." : !push.configured && !p.push ? "No disponibles en este entorno." : "Como mucho uno por día, fuera del horario de silencio. Te pide permiso el navegador."}</small></span>
                <span className="track" aria-hidden="true" />
              </button>
            )}
          </div>

          <fieldset className="rp-fs" disabled={off}>
            <legend>Horario de silencio</legend>
            <div className="rp-quiet">
              <label>Desde<input type="time" value={p.quietStart} onChange={(e) => e.target.value && void save({ quietStart: e.target.value }, "quiet")} /></label>
              <label>Hasta<input type="time" value={p.quietEnd} onChange={(e) => e.target.value && void save({ quietEnd: e.target.value }, "quiet")} /></label>
            </div>
            <small className="mb-muted">En ese horario REPI no te avisa (hora de Buenos Aires).</small>
          </fieldset>

          <fieldset className="rp-fs" disabled={off}>
            <legend>Avisos por día, como máximo</legend>
            <div className="unitseg" role="radiogroup" aria-label="Avisos por día, como máximo" aria-busy={busy.has("max") || undefined}>
              {[...new Set([...PER_DAY, p.maxPerDay])].sort((a, b) => a - b).map((n) => (
                <button key={n} type="button" role="radio" aria-checked={p.maxPerDay === n} onClick={() => p.maxPerDay !== n && void save({ maxPerDay: n }, "max")}>{n}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="rp-fs" disabled={off}>
            <legend>Qué puede hacer REPI</legend>
            <div className="rp-radios" role="radiogroup" aria-label="Qué puede hacer REPI" aria-busy={busy.has("autonomy") || undefined}>
              {AUTONOMY.map(([v, l, d]) => (
                <button key={v} type="button" role="radio" aria-checked={p.autonomy === v} className="rp-radio" onClick={() => p.autonomy !== v && void save({ autonomy: v }, "autonomy")}>
                  <b>{l}</b><small>{d}</small>
                </button>
              ))}
            </div>
            <small className="mb-muted">En ningún caso REPI cambia el programa de tu profe ni registra datos de salud sin tu confirmación.</small>
          </fieldset>

          <fieldset className="rp-fs" disabled={off}>
            <legend>Cómo te habla</legend>
            <div className="unitseg" role="radiogroup" aria-label="Cómo te habla REPI" aria-busy={busy.has("tone") || undefined}>
              {([["normal", "Normal"], ["breve", "Breve"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={p.tone === v} onClick={() => p.tone !== v && void save({ tone: v }, "tone")}>{l}</button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <div className="rp-mem">
        <h3>Lo que REPI recuerda</h3>
        {mem == null ? (!offline && <span className="mb-muted" style={{ fontSize: 14 }}>Cargando…</span>) : !mem.length ? (
          <span className="mb-muted" style={{ fontSize: 14, lineHeight: 1.45 }}>Todavía no recuerda nada. Si le contás una preferencia («no me gusta el remo»), te pregunta antes de guardarla.</span>
        ) : (
          <ul className="rp-mem-list" aria-label="Lo que REPI recuerda">
            {mem.map((m) => (
              <li key={m.id}>
                <span><b>{m.text}</b><small>{KIND[m.kind]} · {SOURCE[m.source]} · {day(m.createdAt)}{m.expiresAt ? ` · hasta el ${day(m.expiresAt)}` : ""}</small></span>
                <button type="button" className="ghost sm" aria-label={`Borrar «${m.text}»`} aria-busy={busy.has(`mem:${m.id}`) || undefined} disabled={offline} onClick={() => void forget(m)}>Borrar</button>
              </li>
            ))}
          </ul>
        )}
        <span className="mb-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>Para corregir algo, decíselo: «ya no me molesta la rodilla», «hablame más corto».</span>
        {!offline && <button type="button" className="ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => brain.open({ section: "profile" })}>Hablar con REPI</button>}
      </div>
    </section>
  );
}
