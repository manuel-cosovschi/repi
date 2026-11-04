"use client";
// D192 · Copiar y pegar un día completo (pedido de Urko). Flujo corto: «Copiar día» → elegir destino → revisar → confirmar.
// El portapapeles sólo guarda una referencia (qué programa y qué día), en esta pestaña, por organización y por 2 horas; se
// borra al cerrar sesión. El contenido lo vuelve a leer el servidor con los permisos de quien pega: nunca viaja desde acá.
// Coach: pegar guarda en el servidor (versión nueva si la vigente está congelada) y recién ahí se muestra «Guardado».
// Gimnasio: la copia entra al borrador del programa del socio y se guarda con «Guardar revisión», como cualquier cambio.
import { useEffect, useMemo, useRef, useState } from "react";
import { PASTE_MODES, TECHNIQUES, type DayDoc, type PasteMode, type Technique } from "@repi/domain";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api } from "@/lib/api";

// ── Portapapeles acotado ────────────────────────────────────────────────────
const CLIP_TTL_MS = 2 * 3_600_000;
export const CLIP_PREFIX = "repi:day-clip:";
export type DayClip = { kind: "coach" | "gym"; orgId: string; programId?: string; memberId?: string; day: number; dayName: string; from: string; at: number };
const clipKey = (kind: DayClip["kind"], orgId: string) => `${CLIP_PREFIX}${kind}:${orgId}`;
export function writeClip(c: Omit<DayClip, "at">) { try { sessionStorage.setItem(clipKey(c.kind, c.orgId), JSON.stringify({ ...c, at: Date.now() })); } catch { /* sin almacenamiento: no hay portapapeles */ } }
export function readClip(kind: DayClip["kind"], orgId: string): DayClip | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(clipKey(kind, orgId)) ?? "null") as DayClip | null;
    if (!c || c.kind !== kind || c.orgId !== orgId || Date.now() - c.at > CLIP_TTL_MS) return null;
    return c;
  } catch { return null; }
}
export function clearClips() { try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(CLIP_PREFIX)) sessionStorage.removeItem(k); } catch { /* nada */ } }
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

// ── Menú del día ────────────────────────────────────────────────────────────
export function DayMenu({ dayName, clip, onDuplicate, onCopy, onPaste, onCopyTo }: {
  dayName: string; clip: DayClip | null; onDuplicate: () => void; onCopy: () => void; onPaste: () => void; onCopyTo?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", off);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", off); };
  }, [open]);
  const item = (label: string, fn: () => void, sub?: string) => (
    <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); fn(); }}><span>{label}</span>{sub && <small className="muted">{sub}</small>}</button>
  );
  return (
    <div className="daymenu" ref={ref}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Día ▾</button>
      {open && (
        <div className="daymenu-list" role="menu" aria-label={`Acciones de ${dayName}`}>
          {item("Duplicar día", onDuplicate, "Copia este día dentro del programa")}
          {item("Copiar día", onCopy, "Para pegarlo en otro programa")}
          {onCopyTo && item("Copiar a…", onCopyTo, "Otro alumno, programa o plantilla")}
          {clip ? item(`Pegar día «${clip.dayName}»`, onPaste, `De ${clip.from}`) : <span className="daymenu-item" aria-disabled="true"><span className="muted">Pegar día</span><small className="muted">Primero copiá un día</small></span>}
        </div>
      )}
    </div>
  );
}

// ── Coach: copiar a / pegar ─────────────────────────────────────────────────
type Target = { id: string; kind: string; client: string | null; name: string; version: number; locked: boolean; days: { index: number; name: string; exercises: number }[] };
type Choice = { weights: "keep" | "strip"; notes: boolean; skipUnavailable?: boolean };
type Preview = {
  source: { programId: string; label: string; day: string; exercises: { name: string; sets: number; technique: string; group: string | null; weights: number }[] };
  target: { programId: string; label: string; version: number; locked: boolean; day: number | null; dayName: string | null; existing: number; existingNames: string[]; resulting: number };
  samePerson: boolean; options: Choice; stats: { exercises: number; weightsRemoved: number; notesRemoved: number; skipped: string[] }; unavailable: string[];
  remapped: Record<string, string>; error: string | null; fingerprint: string;
};
type St = { s: "idle" } | { s: "loading" } | { s: "saving" } | { s: "saved"; version: number; created: boolean; day: number } | { s: "error"; m: string; conflict?: boolean };

/**
 * `from`: día de origen (programa + índice). `to`: destino fijo (pegar en el programa abierto) o null para elegirlo («Copiar a…»).
 * `ready`: antes de leer, el constructor guarda lo pendiente (el servidor copia lo guardado, nunca un borrador a medias).
 */
export function CoachDayCopy({ orgId, from, fromLabel, to, ready, onClose, onDone, onOpen }: {
  orgId: string; from: { programId: string; day: number }; fromLabel: string; to: { programId: string; day: number } | null;
  ready: () => Promise<boolean>; onClose: () => void; onDone: (r: { programId: string; day: number; version: number; created: boolean }) => void;
  onOpen?: (programId: string, day: number) => void;
}) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [pid, setPid] = useState<string | null>(to?.programId ?? null);
  const [mode, setMode] = useState<PasteMode>("new_day");
  const [day, setDay] = useState<number>(to?.day ?? 0);
  const [choice, setChoice] = useState<Choice | null>(null); // null = la del servidor según la persona (mismo alumno o no)
  const [pv, setPv] = useState<Preview | null>(null);
  const [st, setSt] = useState<St>({ s: "loading" });
  const [sure, setSure] = useState(false);
  const req = useRef(newRequestId());
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => { let live = true; ready().then((ok) => live && setSaved(ok)); return () => { live = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!to) api<{ programs: Target[] }>(`/api/coach/${orgId}/paste-targets`).then((r) => setTargets(r.programs)).catch((e) => setSt({ s: "error", m: (e as Error).message })); }, [orgId, to]);
  const target = targets?.find((t) => t.id === pid) ?? null;
  const body = useMemo(() => ({ from, mode, day: mode === "new_day" ? null : day, choice }), [from, mode, day, choice]);
  useEffect(() => {
    if (!pid || !saved) return;
    let live = true;
    setSt({ s: "loading" }); setSure(false); req.current = newRequestId();
    const t = setTimeout(() => api<Preview>(`/api/coach/${orgId}/programs/${pid}/paste-day/preview`, { body }).then((r) => { if (!live) return; setPv(r); setSt({ s: "idle" }); if (!choice) setChoice(r.options); })
      .catch((e) => live && setSt({ s: "error", m: (e as Error).message })), 150);
    return () => { live = false; clearTimeout(t); };
  }, [pid, body, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const replacing = mode === "replace" && (pv?.target.existing ?? 0) > 0;
  const blocked = !pv || !!pv.error || st.s === "saving" || st.s === "loading" || (replacing && !sure) || (pv.unavailable.length > 0 && !choice?.skipUnavailable);
  const confirm = async () => {
    if (!pv || !choice || !pid) return;
    setSt({ s: "saving" });
    try {
      const r = await api<{ version: number; created: boolean; day: number }>(`/api/coach/${orgId}/programs/${pid}/paste-day`, { body: { ...body, choice, expect: pv.fingerprint, requestId: req.current } });
      setSt({ s: "saved", ...r });
      onDone({ programId: pid, day: r.day, version: r.version, created: r.created });
    } catch (e) {
      // Un corte de red puede haber guardado igual: reintentar con el mismo identificador no pega dos veces.
      setSt({ s: "error", m: e instanceof TypeError ? "Sin conexión con REPI. Reintentá: no se va a pegar dos veces." : (e as Error).message, conflict: e instanceof ApiError && e.status === 409 });
    }
  };
  const tech = (t: string) => (t !== "straight" && t in TECHNIQUES ? TECHNIQUES[t as Technique].label : null);
  const days = to ? null : target?.days ?? [];
  return (
    <Modal label={to ? "Pegar día" : "Copiar día a…"} onClose={onClose} wide>
      <div className="mhead"><h2>{to ? "Pegar día" : "Copiar día a…"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <p className="muted" style={{ margin: 0 }}>Origen: <b>{fromLabel}</b>. Se copia la programación (series, métodos, etapas, superseries y circuitos), nunca sesiones, resultados ni datos de Training Intelligence.</p>
      {saved === false && <p className="err-box" role="alert">Tenés cambios sin guardar que no llegaron al servidor. Esperá a que diga «Guardado» y volvé a intentar.</p>}
      <div className="dc-grid">
        {!to && (
          <label className="field">Programa de destino
            <select value={pid ?? ""} onChange={(e) => { setPid(e.target.value || null); setDay(0); setChoice(null); setPv(null); }}>
              <option value="">Elegí alumno o plantilla…</option>
              {targets?.filter((t) => t.client).length ? <optgroup label="Alumnos (programa actual)">{targets.filter((t) => t.client).map((t) => <option key={t.id} value={t.id}>{t.client} · {t.name}</option>)}</optgroup> : null}
              {targets?.filter((t) => !t.client).length ? <optgroup label="Mis plantillas">{targets.filter((t) => !t.client).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup> : null}
            </select></label>
        )}
        <fieldset className="dc-set"><legend>Acción</legend>
          {(["new_day", "append", "replace"] as PasteMode[]).map((m) => (
            <label key={m} className="crow"><input type="radio" name="dc-mode" checked={mode === m} onChange={() => setMode(m)} />{PASTE_MODES[m]}</label>
          ))}
        </fieldset>
        {mode !== "new_day" && (days ? (
          <label className="field">Día de destino<select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {days.map((d) => <option key={d.index} value={d.index}>{d.name} ({d.exercises} {d.exercises === 1 ? "ejercicio" : "ejercicios"})</option>)}</select></label>
        ) : <span className="muted">Día de destino: el que tenés abierto.</span>)}
        {choice && (
          <fieldset className="dc-set"><legend>Pesos programados</legend>
            <label className="crow"><input type="radio" name="dc-w" checked={choice.weights === "strip"} onChange={() => setChoice({ ...choice, weights: "strip" })} />Sólo la estructura, sin pesos{pv && !pv.samePerson ? " (recomendado)" : ""}</label>
            <label className="crow"><input type="radio" name="dc-w" checked={choice.weights === "keep"} onChange={() => setChoice({ ...choice, weights: "keep" })} />También los pesos que programaste</label>
            {choice.weights === "keep" && pv && !pv.samePerson && <small className="dx-warn">Son cargas pensadas para otra persona: revisalas antes de que entrene.</small>}
            <label className="crow"><input type="checkbox" checked={choice.notes} onChange={(e) => setChoice({ ...choice, notes: e.target.checked })} />Copiar las notas de los ejercicios y series</label>
            {choice.notes && pv && !pv.samePerson && <small className="dx-warn">Revisá que las notas no mencionen a la persona de origen.</small>}
          </fieldset>
        )}
      </div>
      {pid && st.s === "loading" && <p className="muted" role="status">Armando la vista previa…</p>}
      {pv && st.s !== "loading" && (
        <section className="dc-preview" aria-label="Vista previa">
          <div><span className="dx-lbl">Se copia: {pv.source.day}</span>
            <ol>{pv.source.exercises.map((x, i) => <li key={i}>{x.name} · {x.sets} {x.sets === 1 ? "serie" : "series"}{tech(x.technique) ? ` · ${tech(x.technique)}` : ""}{x.group ? ` · grupo ${pv.remapped[x.group] ?? x.group}` : ""}</li>)}</ol>
            {!pv.source.exercises.length && <span className="muted">El día está vacío: se copia sin ejercicios.</span>}</div>
          <div><span className="dx-lbl">Destino: {pv.target.label}</span>
            <span>{pv.error ? <span className="err-box" role="alert">{pv.error}</span> : mode === "new_day" ? `Día nuevo «${pv.target.dayName}» con ${pv.target.resulting} ejercicios.` : mode === "append" ? `«${pv.target.dayName}» pasa de ${pv.target.existing} a ${pv.target.resulting} ejercicios.` : `«${pv.target.dayName}» queda con ${pv.target.resulting} ejercicios en lugar de ${pv.target.existing}.`}</span>
            {Object.keys(pv.remapped).length > 0 && <small className="muted">Para no mezclar combinaciones, {Object.entries(pv.remapped).map(([a, b]) => `el grupo ${a} pasa a ${b}`).join(" y ")}.</small>}
            {choice?.weights === "strip" && pv.stats.weightsRemoved > 0 && <small className="muted">Sin {pv.stats.weightsRemoved} {pv.stats.weightsRemoved === 1 ? "peso programado" : "pesos programados"}: Training Intelligence calcula con la historia de la persona de destino.</small>}
            <small className="muted">{pv.target.locked ? `Se guarda como versión ${pv.target.version + 1}: las sesiones registradas y un entrenamiento abierto siguen con la versión ${pv.target.version}.` : "Se guarda en la versión actual (todavía sin entrenamientos)."}</small></div>
          {pv.unavailable.length > 0 && (
            <div className="dx-review" role="alert"><span>No están disponibles en el destino: {pv.unavailable.join(", ")}. No se copian ejercicios privados de otra biblioteca.</span>
              <label className="crow"><input type="checkbox" checked={!!choice?.skipUnavailable} onChange={(e) => choice && setChoice({ ...choice, skipUnavailable: e.target.checked })} />Copiar sin esos ejercicios</label></div>
          )}
          {replacing && (
            <label className="crow dx-review"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />Sí, reemplazar los {pv.target.existing} ejercicios de «{pv.target.dayName}» ({pv.target.existingNames.slice(0, 4).join(", ")}{pv.target.existingNames.length > 4 ? "…" : ""}).</label>
          )}
        </section>
      )}
      {st.s === "error" && <p className="err-box" role="alert">{st.m}{st.conflict && <> <button type="button" className="btn sm" onClick={() => { setChoice(choice ? { ...choice } : null); }}>Actualizar la vista previa</button></>}</p>}
      {st.s === "saved" && <p className="ok-box" role="status">Guardado{st.created ? ` como versión ${st.version}` : ""}. Podés adaptarlo para esta persona.</p>}
      <div className="mfoot">
        <button type="button" className="btn" onClick={onClose}>{st.s === "saved" ? "Cerrar" : "Cancelar"}</button>
        {st.s === "saved" && onOpen && pid && <button type="button" className="btn pri" onClick={() => onOpen(pid, st.day)}>Abrir el día pegado</button>}
        {st.s !== "saved" && <button type="button" className="btn pri" disabled={blocked} aria-busy={st.s === "saving" || undefined} onClick={() => void confirm()}>{st.s === "saving" ? "Guardando…" : st.s === "error" && !st.conflict ? "Reintentar" : "Confirmar"}</button>}
      </div>
    </Modal>
  );
}

// ── Gimnasio: pegar en el borrador del socio ───────────────────────────────
type GymCopy = { day: DayDoc; stats: { exercises: number; weightsRemoved: number; notesRemoved: number }; samePerson: boolean; options: Choice; source: { program: string; revision: number; day: string }; unavailable: string[] };
/** Panel dentro del editor del programa del socio (sin otra ventana encima). Aplica al borrador; se guarda con «Guardar revisión». */
export function GymDayPaste({ orgId, clip, memberId, days, currentDay, onApply, onCancel }: {
  orgId: string; clip: DayClip; memberId: string; days: DayDoc[]; currentDay: number;
  onApply: (content: DayDoc, mode: PasteMode, day: number) => void; onCancel: () => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [mode, setMode] = useState<PasteMode>("new_day");
  const [day, setDay] = useState(currentDay);
  const [r, setR] = useState<GymCopy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    let live = true;
    api<GymCopy>(`/api/gym/${orgId}/members/${clip.memberId}/day-copy`, { body: { day: clip.day, forMemberId: memberId, choice } })
      .then((x) => { if (!live) return; setR(x); setErr(null); if (!choice) setChoice(x.options); }).catch((e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [choice?.weights, choice?.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const existing = mode === "new_day" ? 0 : days[day]?.exercises.length ?? 0;
  return (
    <section className="dx-dist" aria-label="Pegar día">
      <b>Pegar día de {clip.from}</b>
      <small className="muted">Se copia la programación de la última revisión guardada{r ? ` (revisión ${r.source.revision})` : ""}: nunca sesiones ni resultados. Queda en este borrador hasta que toques «Guardar revisión».</small>
      <div className="dc-grid">
        <fieldset className="dc-set"><legend>Acción</legend>
          {(["new_day", "append", "replace"] as PasteMode[]).map((m) => <label key={m} className="crow"><input type="radio" name="gdc-mode" checked={mode === m} onChange={() => { setMode(m); setSure(false); }} />{PASTE_MODES[m]}</label>)}
        </fieldset>
        {mode !== "new_day" && <label className="field">Día<select value={day} onChange={(e) => { setDay(Number(e.target.value)); setSure(false); }}>{days.map((d, i) => <option key={i} value={i}>{d.name || `Día ${i + 1}`} ({d.exercises.length})</option>)}</select></label>}
        {choice && (
          <fieldset className="dc-set"><legend>Pesos programados</legend>
            <label className="crow"><input type="radio" name="gdc-w" checked={choice.weights === "strip"} onChange={() => setChoice({ ...choice, weights: "strip" })} />Sólo la estructura{r && !r.samePerson ? " (recomendado)" : ""}</label>
            <label className="crow"><input type="radio" name="gdc-w" checked={choice.weights === "keep"} onChange={() => setChoice({ ...choice, weights: "keep" })} />También los pesos programados</label>
            {choice.weights === "keep" && r && !r.samePerson && <small className="dx-warn">Son cargas de otro socio: revisalas.</small>}
            <label className="crow"><input type="checkbox" checked={choice.notes} onChange={(e) => setChoice({ ...choice, notes: e.target.checked })} />Copiar notas</label>
          </fieldset>
        )}
      </div>
      {r && <span>{r.day.exercises.map((x) => x.name).join(" · ") || "Día vacío"}</span>}
      {r && r.unavailable.length > 0 && <small className="dx-warn">No disponibles en esta biblioteca (no se copian): {r.unavailable.join(", ")}.</small>}
      {mode === "replace" && existing > 0 && <label className="crow dx-review"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />Sí, reemplazar los {existing} ejercicios de este día.</label>}
      {err && <p className="err-box" role="alert">{err}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn sm pri" disabled={!r || (mode === "replace" && existing > 0 && !sure)} onClick={() => r && onApply(r.day, mode, day)}>Pegar en el borrador</button>
        <button type="button" className="btn sm" onClick={onCancel}>Cancelar</button>
      </div>
    </section>
  );
}
