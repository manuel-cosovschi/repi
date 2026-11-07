"use client";
// Asistente REPI (D209) · panel de conversación. No modal: no bloquea la pantalla de atrás, no atrapa el foco y se cierra
// con Esc o «Cerrar»; al volver a abrirlo sigue la misma conversación. En el entrenamiento se ubica arriba y nunca tapa el
// dock (registrar una serie sigue a un toque). En pantallas anchas va al costado de la columna. Cada respuesta dice de dónde
// sale; las acciones se ven distintas de las respuestas y siempre muestran qué cambia antes de confirmar.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PAIN_ZONES } from "@repi/domain";
import { ArrowsInSimple, ArrowsOutSimple, PaperPlaneRight, ThumbsDown, ThumbsUp, X } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";
import { useUnit } from "@/components/member/units";
import { usePanel, type ActionState, type Item } from "./BrainProvider";
import { OFFLINE_NOTE, contextLine, panelPlace, presentMessage, type ActionVM, type CardVM, type PanelPlace, type ReplyVM } from "./presenter";
import type { ProposedAction } from "./types";
import { EvidenceInline, OriginTag } from "./parts";

const WIDE = "(min-width: 1280px)";

export function RepiPanel() {
  const p = usePanel();
  const unit = useUnit();
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [place, setPlace] = useState<PanelPlace>({ top: false, max: null, compact: false, wide: false });

  // Foco: al abrir, al título (no al campo: en el teléfono abriría el teclado encima de la rutina). Al cerrar, vuelve a quien lo abrió.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => title.current?.focus());
    return () => { if (prev && document.contains(prev)) prev.focus?.(); };
  }, []);
  // Esc cierra sólo si el foco está en el panel (no compite con una hoja abierta).
  const { close } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && root.current?.contains(document.activeElement)) { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // Con el dock del entrenamiento a la vista: arriba, con el alto que deja libre el dock, sin pasarlo nunca (se mide; cambia con
  // el descanso o el teclado). Se decide por el dock que hay en pantalla, no por la sección con que se abrió, y se vuelve a medir
  // al cambiar de pantalla (BrainProvider además lo cierra al entrar o salir del entrenamiento).
  useLayoutEffect(() => {
    const mq = window.matchMedia(WIDE);
    const measure = () => {
      const dock = document.querySelector<HTMLElement>(".dock");
      const vv = window.visualViewport;
      setPlace(panelPlace({ dockH: dock ? dock.getBoundingClientRect().height : null, vh: vv?.height ?? window.innerHeight, layoutH: window.innerHeight, wide: mq.matches }));
    };
    measure();
    const dock = document.querySelector<HTMLElement>(".dock");
    // Si el dock se va (fin del entrenamiento), el observador avisa con tamaño cero y el panel vuelve abajo.
    const ro = dock && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (dock) ro?.observe(dock);
    mq.addEventListener?.("change", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => { ro?.disconnect(); mq.removeEventListener?.("change", measure); window.visualViewport?.removeEventListener("resize", measure); };
  }, [p.panel.section, p.screen]);

  const vms = p.items.map((it) => ({ it, vm: presentMessage(it, unit) }));
  // Una respuesta nueva se lee desde su comienzo (si es larga, el final queda a un deslizamiento); lo demás, al final.
  const lastId = p.items[p.items.length - 1]?.id;
  const lastRepi = p.items[p.items.length - 1]?.role === "repi";
  useEffect(() => {
    const box = log.current;
    if (!box) return;
    const el = lastRepi && lastId ? box.querySelector<HTMLElement>(`[data-mid="${CSS.escape(lastId)}"]`) : null;
    if (el && el.offsetHeight > box.clientHeight * 0.6) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
    else box.scrollTo({ top: box.scrollHeight });
  }, [lastId, lastRepi, p.busy]);

  const ctx = contextLine(p.panel.section, p.panel.subject);
  return createPortal(
    <div ref={root} className="rp-panel" role="dialog" aria-modal="false" aria-labelledby="rp-title" aria-describedby="rp-ctx"
      data-place={place.top ? "top" : undefined} data-compact={place.compact ? "1" : undefined} data-expanded={expanded && !place.top && !place.wide ? "1" : undefined}
      style={place.top && place.max != null ? { maxHeight: place.max } : undefined}>
      <div className="rp-head">
        <span className="rp-badge" aria-hidden="true">REPI</span>
        <div className="rp-head-txt"><h2 id="rp-title" ref={title} tabIndex={-1}>Asistente REPI</h2><small id="rp-ctx">{ctx}</small></div>
        {!place.top && !place.wide && (
          <button type="button" className="mb-icon" aria-label={expanded ? "Achicar el panel" : "Agrandar el panel"} aria-pressed={expanded} onClick={() => setExpanded((x) => !x)}>
            <Ic i={expanded ? ArrowsInSimple : ArrowsOutSimple} size={20} /></button>
        )}
        <button type="button" className="mb-icon" aria-label="Cerrar el asistente" onClick={p.close}><Ic i={X} size={20} /></button>
      </div>
      <div ref={log} className="rp-log" role="log" aria-live="off" aria-label="Conversación con REPI" tabIndex={0}>
        {p.threadState === "loading" && !p.items.length && <p className="mb-muted rp-sys">Cargando la conversación…</p>}
        {p.threadState === "error" && !p.items.length && (
          <p className="mb-muted rp-sys">No pude traer la conversación anterior. <button type="button" className="linkbtn" onClick={p.loadThread}>Reintentar</button></p>
        )}
        {p.threadState !== "loading" && !p.items.length && (
          <div className="rp-intro">
            <b>Preguntame por tu entrenamiento.</b>
            <span>Te respondo con tus registros y te digo de dónde sale cada dato. Nada se cambia sin que lo confirmes.</span>
          </div>
        )}
        {vms.map(({ it, vm }) => (vm.role === "user" ? <UserMsg key={it.id} it={it} /> : <RepiMsg key={it.id} vm={vm} raw={it} />))}
        {p.busy && <p className="rp-typing" role="status"><span aria-hidden="true" />REPI está pensando…</p>}
      </div>
      <div className="sr-only" aria-live="polite">{p.announce}</div>
      <div className="rp-foot">
        {p.offline && <p className="rp-offline" role="status">{OFFLINE_NOTE} Tu entrenamiento sigue igual.</p>}
        {/* Compacto (poco alto libre sobre el dock): los atajos sólo antes de empezar; después, el lugar es para la conversación. */}
        {(!place.compact || !p.items.length) && (
          <div className="rp-chips" role="group" aria-label="Sugerencias">
            {p.chips.map((c) => (
              <button key={c.text} type="button" className="ai-chip rp-chip" disabled={p.offline || p.busy} onClick={() => p.send(c.text)}>{c.label}</button>
            ))}
          </div>
        )}
        <form className="rp-compose" onSubmit={(e) => { e.preventDefault(); p.send(p.draft); }}>
          <textarea rows={1} value={p.draft} maxLength={1000} onChange={(e) => p.setDraft(e.target.value)} aria-label="Mensaje para REPI"
            placeholder={p.offline ? "Sin conexión" : "Escribile a REPI…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); p.send(p.draft); } }} />
          <button type="submit" aria-label="Enviar a REPI" disabled={p.offline || p.busy || !p.draft.trim()}><Ic i={PaperPlaneRight} size={18} color="var(--ui-on-primary)" /></button>
        </form>
        {p.items.length > 0 && !p.offline && <button type="button" className="linkbtn rp-new" onClick={p.newThread}>Empezar otra conversación</button>}
      </div>
    </div>,
    document.body,
  );
}

function UserMsg({ it }: { it: Item }) {
  const p = usePanel();
  return (
    <div className="rp-msg mine">
      <div className="rp-bubble">{it.text}</div>
      {it.local?.status === "sending" && <small className="rp-meta">Enviando…</small>}
      {it.local?.status === "failed" && (
        <small className="rp-meta rp-failed">{it.local.error ?? "No llegó."} {!p.offline && <button type="button" className="linkbtn" onClick={() => p.retry(it)}>Reintentar</button>}</small>
      )}
    </div>
  );
}

function RepiMsg({ vm, raw }: { vm: ReplyVM; raw: Item }) {
  const p = usePanel();
  return (
    <article className="rp-msg" data-mood={vm.mood} data-mid={vm.id} aria-label="Respuesta de REPI">
      <div className="rp-reply">
        {vm.origin && <OriginTag o={vm.origin} />}
        <p className="rp-text">{vm.text}</p>
        {vm.cards.map((c, i) => <Card key={i} c={c} />)}
      </div>
      {vm.actions.map((a) => {
        const proposal = raw.actions.find((x) => x.key === a.key);
        return proposal ? <ActionCard key={a.key} a={a} proposal={proposal} st={p.actions[a.key]} /> : null;
      })}
      <div className="rp-fb" role="group" aria-label="¿Te sirvió esta respuesta?">
        <button type="button" className="rp-thumb" aria-label="Me sirvió" aria-pressed={vm.feedback === 1} disabled={p.offline} onClick={() => p.feedback(vm.id, vm.feedback === 1 ? null : 1)}><Ic i={ThumbsUp} size={16} /></button>
        <button type="button" className="rp-thumb" aria-label="No me sirvió" aria-pressed={vm.feedback === -1} disabled={p.offline} onClick={() => p.feedback(vm.id, vm.feedback === -1 ? null : -1)}><Ic i={ThumbsDown} size={16} /></button>
      </div>
    </article>
  );
}

function Card({ c }: { c: CardVM }) {
  if (c.type === "fact") return (
    <div className="rp-fact">
      <div className="rp-fact-top"><b>{c.title}</b><OriginTag o={c.origin} /></div>
      <dl>{c.rows.map((r, i) => <div key={i}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
    </div>
  );
  if (c.type === "evidence") return <EvidenceInline e={c.evidence} />;
  if (c.type === "alternatives") return (
    <ul className="rp-alts" aria-label="Alternativas">
      {c.options.map((o) => <li key={o.id}><b>{o.name}</b>{o.approvedByCoach && <span className="rp-ok">Aprobado por tu profe</span>}<small>{o.why}</small></li>)}
    </ul>
  );
  return (
    <div className="rp-plan">
      {c.keep.length > 0 && <p><small>Conservás</small>{c.keep.join(", ")}</p>}
      {c.skip.length > 0 && <p><small>Queda para otro día</small>{c.skip.join(", ")}</p>}
      {c.note && <p className="rp-plan-note">{c.note}</p>}
    </div>
  );
}

/** Una acción propuesta: qué hace, qué cambia (vista previa) y confirmar o cancelar. El resultado lo dice el servidor. */
function ActionCard({ a, proposal, st }: { a: ActionVM; proposal: ProposedAction; st: ActionState | undefined }) {
  const p = usePanel();
  const [level, setLevel] = useState<number | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const status = st?.status;
  const settled = status === "done" || status === "cancelled";
  const zones = st?.zones?.length ? st.zones : [...PAIN_ZONES];
  const needZone = status === "details" && (st?.fields ?? []).includes("zone");
  const ready = !a.needsDetails || (level != null && (!needZone || !!zone));
  const confirm = () => void p.act(proposal, "confirm", a.needsDetails ? { ...(level != null ? { level } : {}), ...(zone ? { zone } : {}) } : undefined);
  return (
    <section className="rp-action" data-tone={a.tone} data-state={status ?? "idle"} aria-label={`Propuesta: ${a.label}`}>
      <small className="rp-kicker">{a.kicker}</small>
      <b>{a.label}</b>
      {a.preview && <p className="rp-preview">{a.preview}</p>}
      {a.mode === "blocked" ? <p className="rp-preview">{a.reason ?? "Esta acción no está disponible."}</p> : !settled && (
        <>
          {a.needsDetails && (
            <div className="rp-details">
              <fieldset className="rp-picker"><legend>Intensidad (0 = nada · 10 = máxima)</legend>
                <div role="radiogroup" aria-label="Intensidad de la molestia">
                  {Array.from({ length: 11 }, (_, n) => <button key={n} type="button" role="radio" aria-checked={level === n} className="ai-chip" onClick={() => setLevel(n)}>{n}</button>)}
                </div>
              </fieldset>
              <fieldset className="rp-picker"><legend>Zona{needZone ? " (elegí una; en hombro y rodilla, el lado)" : " (opcional si ya la dijiste)"}</legend>
                <div role="radiogroup" aria-label="Zona de la molestia">
                  {zones.map((z) => <button key={z} type="button" role="radio" aria-checked={zone === z} className="ai-chip" onClick={() => setZone(zone === z ? null : z)}>{z}</button>)}
                </div>
              </fieldset>
              <small className="mb-muted">Queda privado en tu registro. REPI no hace diagnósticos: si persiste, consultá a un profesional de la salud.</small>
            </div>
          )}
          {status === "details" && st?.text && <p className="rp-preview" role="status">{st.text}</p>}
          <div className="rp-action-btns">
            <button type="button" className="cta sm" disabled={p.offline || status === "busy" || !ready} aria-busy={status === "busy" || undefined} onClick={confirm}>
              {status === "busy" ? "Un momento…" : a.confirmLabel}</button>
            {a.mode === "confirm" && <button type="button" className="ghost sm" disabled={p.offline || status === "busy"} onClick={() => void p.act(proposal, "cancel")}>Cancelar</button>}
          </div>
        </>
      )}
      {st?.text && status !== "details" && <p className="rp-result" role="status" data-ok={status === "done" ? "1" : undefined}>{st.text}</p>}
    </section>
  );
}
