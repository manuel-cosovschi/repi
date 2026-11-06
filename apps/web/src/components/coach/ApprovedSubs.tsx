"use client";
// Reemplazos aprobados de un ejercicio (Adaptive Coach 1b, EXT-05). Se editan junto al ejercicio en el constructor de
// programas del coach y del gimnasio, pero valen para toda la organización: si el ejercicio no se puede hacer, el alumno
// los ve primero al cambiarlo en la sesión. Sólo compatibles (mismo tipo de registro); no cambian programas ni cargas.
import { useCallback, useEffect, useState } from "react";
import { APPROVED_SUBS_MAX, SUB_NOTE_MAX } from "@repi/domain";
import { api, ApiError } from "@/lib/api";

export type Sub = { id: string; exerciseId: string; substituteExerciseId: string; name: string; group: string; note: string | null };
type LibItem = { id: string; name: string; group: string; kind: string };

export function useSubstitutions(orgId: string) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const load = useCallback(() => api<{ substitutions: Sub[] }>(`/api/substitutions/${orgId}`).then((r) => setSubs(r.substitutions)).catch(() => {}), [orgId]);
  useEffect(() => { load(); }, [load]);
  return { subs, setSubs };
}

export const subsLabel = (n: number) => (n ? `Reemplazos · ${n}` : "Reemplazos");

/**
 * Pedido de Urko (PP1, D201): el panel de reemplazos pertenece a un contexto (organización, programa o alumno, día) y a una
 * fila (posición + ejercicio). Si el contexto cambia, el panel abierto deja de valer aunque el índice coincida: no se
 * muestra nunca un panel del programa, el alumno o el día anterior. Agregar un reemplazo y que el servidor lo confirme lo cierra.
 */
export type SubsPanel = { scope: string; row: string } | null;
export const subsRow = (i: number, exerciseId: string) => `${i}:${exerciseId}`;
export const subsPanelOpen = (p: SubsPanel, scope: string, row: string) => !!p && p.scope === scope && p.row === row;
export const subsPanelToggle = (p: SubsPanel, scope: string, row: string): SubsPanel => (subsPanelOpen(p, scope, row) ? null : { scope, row });
export function useSubsPanel(scope: string) {
  const [p, setP] = useState<SubsPanel>(null);
  useEffect(() => { setP((x) => (x && x.scope !== scope ? null : x)); }, [scope]); // limpia el estado viejo; la lectura ya lo ignora
  return {
    isOpen: (row: string) => subsPanelOpen(p, scope, row),
    toggle: (row: string) => setP((x) => subsPanelToggle(x, scope, row)),
    close: () => setP(null),
  };
}

export function ApprovedSubs({ orgId, ex, lib, subs, setSubs, flash, onAdded }: {
  orgId: string; ex: { exerciseId: string; name: string }; lib: LibItem[]; subs: Sub[]; setSubs: (fn: (s: Sub[]) => Sub[]) => void; flash: (t: string) => void;
  /** Se llama sólo cuando el servidor confirmó el alta (el constructor cierra el panel). Ante un error el panel queda abierto. */
  onAdded?: () => void;
}) {
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = subs.filter((s) => s.exerciseId === ex.exerciseId);
  const self = lib.find((l) => l.id === ex.exerciseId);
  const kind = self?.kind;
  const qq = q.trim().toLowerCase();
  const cands = lib.filter((l) => l.id !== ex.exerciseId && l.kind === kind && !mine.some((m) => m.substituteExerciseId === l.id)
    && (!qq || (l.name + l.group).toLowerCase().includes(qq)))
    .sort((a, b) => Number(b.group === self?.group) - Number(a.group === self?.group)).slice(0, 8); // mismo grupo primero
  const add = async (l: LibItem) => {
    if (busy) return; // doble toque: un solo pedido
    setBusy(true); setErr(null);
    try {
      const r = await api<{ substitution: Sub }>(`/api/substitutions/${orgId}`, { body: { exerciseId: ex.exerciseId, substituteExerciseId: l.id, note: note.trim() || null } });
      // El servidor es idempotente por par (ejercicio, reemplazo): un reintento devuelve el mismo y no se duplica en la lista.
      setSubs((s) => [...s.filter((x) => x.id !== r.substitution.id), r.substitution]); setQ(""); setNote("");
      flash(`${l.name} aprobado como reemplazo de ${ex.name}. Los programas no cambian.`);
      onAdded?.();
    } catch (e) {
      // Reintento después de un alta que sí llegó (se cortó la respuesta): ya está guardado. Se trae la lista real y se cierra.
      if (e instanceof ApiError && e.code === "duplicate") {
        const r = await api<{ substitutions: Sub[] }>(`/api/substitutions/${orgId}`).catch(() => null);
        if (r) { setSubs(() => r.substitutions); setQ(""); setNote(""); flash(`${l.name} ya estaba aprobado como reemplazo de ${ex.name}.`); onAdded?.(); return; }
      }
      setErr(`${(e as Error).message} Podés reintentar.`); // búsqueda e indicación se conservan
    } finally { setBusy(false); }
  };
  const remove = async (s: Sub) => {
    setBusy(true); setErr(null);
    try { await api(`/api/substitutions/${orgId}?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }); setSubs((x) => x.filter((y) => y.id !== s.id)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="subs-panel" role="region" aria-label={`Reemplazos aprobados para ${ex.name}`} aria-busy={busy || undefined}>
      <p className="muted">Si {ex.name} no se puede hacer, en la sesión se ven primero estos reemplazos. Valen para todos los programas; el programa no cambia.</p>
      {mine.length ? (
        <ul className="subs-list">
          {mine.map((s) => (
            <li key={s.id}>
              <span><b>{s.name}</b><small>{s.group}{s.note ? ` · ${s.note}` : ""}</small></span>
              <button type="button" className="ibtn" aria-label={`Quitar ${s.name} de los reemplazos`} disabled={busy} onClick={() => remove(s)}>×</button>
            </li>
          ))}
        </ul>
      ) : <span className="muted">Todavía no hay reemplazos aprobados.</span>}
      {mine.length < APPROVED_SUBS_MAX && kind && (
        <div className="subs-add">
          <label className="search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar reemplazo compatible" aria-label={`Buscar reemplazo para ${ex.name}`} /></label>
          <label className="search"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={SUB_NOTE_MAX} placeholder="Indicación opcional (ej.: si la prensa está ocupada)" aria-label="Indicación para el alumno" /></label>
          {cands.map((l) => (
            <button type="button" key={l.id} className="librow" disabled={busy} aria-label={`Aprobar ${l.name}`} onClick={() => add(l)}>
              <span>{l.name}<small>{l.group}</small></span><i aria-hidden="true">+</i>
            </button>
          ))}
          {!cands.length && <span className="muted">No hay más ejercicios compatibles{qq ? " con esa búsqueda" : ""}.</span>}
        </div>
      )}
      {err && <p role="alert" className="err-box">{err}</p>}
    </div>
  );
}
