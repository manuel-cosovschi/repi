"use client";
// D194 · «Actualizar programas de alumnos» desde una plantilla. Muestra quién usa copias de la plantilla, de qué versión salió
// cada una, qué cambiaría y qué personalizó el profe en cada alumno; aplica sólo lo elegido y con confirmación. El éxito se
// muestra recién cuando el servidor confirma (nunca antes). Complementa a copiar y pegar días (D192), no lo reemplaza.
import { useEffect, useMemo, useRef, useState } from "react";
import type { RolloutChange } from "@repi/domain";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api } from "@/lib/api";

type Student = { programId: string; name: string; version: number; baseVersion: number | null; noBase: boolean; upToDate: boolean; ownChanges: boolean; training: boolean; changes: RolloutChange[]; fingerprint: string };
type Preview = { template: { id: string; name: string; version: number; fingerprint: string }; students: Student[] };
type Result = { results: { programId: string; version: number | null; applied: number }[]; repeated: boolean };
type St = { s: "loading" | "idle" | "saving" } | { s: "error"; m: string; conflict?: boolean } | { s: "saved"; r: Result };
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
const first = (n: string) => n.split(" ")[0];

export function TemplateRollout({ orgId, templateId, ready, onClose, onDone }: {
  orgId: string; templateId: string; ready: () => Promise<boolean>; onClose: () => void; onDone: (text: string) => void;
}) {
  const [pv, setPv] = useState<Preview | null>(null);
  const [st, setSt] = useState<St>({ s: "loading" });
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const req = useRef(newRequestId());
  const [load, setLoad] = useState(0);

  useEffect(() => {
    let live = true;
    setSt({ s: "loading" }); setSure(false); req.current = newRequestId();
    (async () => {
      if (!(await ready())) { if (live) setSt({ s: "error", m: "Tenés cambios de la plantilla sin guardar. Esperá a que diga «Guardado» y volvé a intentar." }); return; }
      const r = await api<Preview>(`/api/coach/${orgId}/programs/${templateId}/rollout`);
      if (!live) return;
      setPv(r);
      // Por defecto: alumnos con cambios pendientes; en cada uno, todo menos los conflictos (lo personalizado se conserva).
      setPick(Object.fromEntries(r.students.map((s) => [s.programId, !s.upToDate])));
      setSel(Object.fromEntries(r.students.map((s) => [s.programId, new Set(s.changes.filter((c) => !c.conflict).map((c) => c.key))])));
      setOpen(r.students.find((s) => !s.upToDate && s.ownChanges)?.programId ?? null);
      setSt({ s: "idle" });
    })().catch((e) => live && setSt({ s: "error", m: (e as Error).message }));
    return () => { live = false; };
  }, [orgId, templateId, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un alumno sin ningún cambio marcado no se envía (sus cambios pendientes siguen para la próxima vez).
  const chosen = useMemo(() => (pv?.students ?? []).filter((s) => pick[s.programId] && !s.upToDate && sel[s.programId]?.size), [pv, pick, sel]);
  const nothing = !chosen.length;
  const toggle = (pid: string, key: string, on: boolean) => setSel((m) => { const n = new Set(m[pid]); if (on) n.add(key); else n.delete(key); return { ...m, [pid]: n }; });
  const confirm = async () => {
    if (!pv) return;
    setSt({ s: "saving" });
    try {
      const r = await api<Result>(`/api/coach/${orgId}/programs/${templateId}/rollout`, { body: { requestId: req.current, template: pv.template.fingerprint,
        targets: chosen.map((s) => ({ programId: s.programId, fingerprint: s.fingerprint, apply: [...(sel[s.programId] ?? [])] })) } });
      setSt({ s: "saved", r });
      const names = r.results.filter((x) => x.version != null).map((x) => `${first(pv.students.find((s) => s.programId === x.programId)?.name ?? "")} (versión ${x.version})`);
      onDone(names.length ? `Programas actualizados: ${names.join(", ")}. Lo ya entrenado no cambia.` : "No había cambios para aplicar.");
    } catch (e) {
      setSt({ s: "error", m: e instanceof TypeError ? "Sin conexión con REPI. Reintentá: no se va a aplicar dos veces." : (e as Error).message, conflict: e instanceof ApiError && e.status === 409 });
    }
  };

  return (
    <Modal label="Actualizar programas de alumnos" onClose={onClose} wide>
      <div className="mhead"><h2>Actualizar programas de alumnos</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <p className="muted" style={{ margin: 0 }}>
        {pv ? <>Plantilla <b>«{pv.template.name}»</b> · versión {pv.template.version}. </> : null}
        Cada alumno tiene su propia copia. Elegí a quién enviarle los cambios y cuáles: nada se aplica sin tu confirmación.
      </p>
      {st.s === "loading" && <p className="muted" role="status">Comparando programas…</p>}
      {pv && !pv.students.length && <p className="muted">Ningún alumno activo usa esta plantilla.</p>}
      {pv && pv.students.length > 0 && (
        <ul className="ro-list" aria-label="Alumnos con esta plantilla">
          {pv.students.map((s) => {
            const on = !!pick[s.programId] && !s.upToDate;
            const conflicts = s.changes.filter((c) => c.conflict).length;
            return (
              <li key={s.programId} className={`ro-item${on ? " on" : ""}`}>
                <div className="ro-row">
                  <label className="crow" style={{ flex: 1 }}>
                    <input type="checkbox" checked={on} disabled={s.upToDate || st.s === "saving"} onChange={(e) => setPick((m) => ({ ...m, [s.programId]: e.target.checked }))} />
                    <span><b>{s.name}</b>
                      <small className="muted">Su programa: versión {s.version}{s.baseVersion != null ? ` · basado en la versión ${s.baseVersion} de la plantilla` : s.noBase ? " · sin versión de origen conocida" : ""}</small></span>
                  </label>
                  <span className="ro-tags">
                    {s.upToDate ? <span className="chip ok">Al día</span> : <span className="chip">{s.changes.length} {s.changes.length === 1 ? "cambio" : "cambios"}</span>}
                    {s.ownChanges && <span className="chip warn">Con cambios propios</span>}
                    {s.training && <span className="chip">Entrenando ahora</span>}
                  </span>
                  {!s.upToDate && <button type="button" className="linkbtn" aria-expanded={open === s.programId} onClick={() => setOpen(open === s.programId ? null : s.programId)}>{open === s.programId ? "Ocultar comparación" : "Ver comparación"}</button>}
                </div>
                {open === s.programId && !s.upToDate && (
                  <div className="ro-diff">
                    {conflicts > 0 && <p className="dx-review" role="note">{conflicts === 1 ? "Un cambio choca" : `${conflicts} cambios chocan`} con lo que personalizaste para {first(s.name)}. Por defecto se conserva lo suyo; marcalo sólo si querés reemplazarlo.</p>}
                    {s.noBase && <p className="dx-review" role="note">No sabemos de qué versión salió este programa: revisá cada diferencia.</p>}
                    <ul aria-label={`Cambios para ${s.name}`}>
                      {s.changes.map((c) => (
                        <li key={c.key} className={c.conflict ? "ro-conflict" : ""}>
                          <label className="crow">
                            <input type="checkbox" checked={!!sel[s.programId]?.has(c.key)} disabled={!on || st.s === "saving"} onChange={(e) => toggle(s.programId, c.key, e.target.checked)} />
                            <span><span>{c.text}</span>
                              {c.conflict && <small>{c.student ? `Hoy ${first(s.name)} tiene: ${c.student}.` : "Lo cambiaste para este alumno."} {sel[s.programId]?.has(c.key) ? "Se reemplaza con lo de la plantilla." : "Se conserva lo suyo."}</small>}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {s.training && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{first(s.name)} está entrenando: le aparece «Aplicar ahora» y sus series hechas no cambian.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {st.s === "error" && <div className="err-box" role="alert">{st.m}{st.conflict && <> <button type="button" className="linkbtn" onClick={() => setLoad((n) => n + 1)}>Actualizar la comparación</button></>}</div>}
      {st.s === "saved" && <p className="ok-box" role="status">Listo: {st.r.results.filter((x) => x.version != null).length} {st.r.results.filter((x) => x.version != null).length === 1 ? "programa actualizado" : "programas actualizados"} con una versión nueva. Lo ya entrenado no cambia.</p>}
      {pv && chosen.length > 0 && st.s !== "saved" && (
        <label className="crow ro-sure"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>Revisé la comparación. Se crea una versión nueva del programa de {chosen.map((s) => first(s.name)).join(", ")}; sus entrenamientos y series registradas no cambian.</span></label>
      )}
      <div className="mfoot">
        <button type="button" className="btn" onClick={onClose}>{st.s === "saved" ? "Cerrar" : "Cancelar"}</button>
        {st.s !== "saved" && <button type="button" className="btn pri" disabled={!pv || !chosen.length || nothing || !sure || st.s === "saving" || st.s === "loading"} aria-busy={st.s === "saving" || undefined} onClick={() => void confirm()}>
          {st.s === "saving" ? "Actualizando…" : `Actualizar ${chosen.length} ${chosen.length === 1 ? "programa" : "programas"}`}</button>}
      </div>
    </Modal>
  );
}
