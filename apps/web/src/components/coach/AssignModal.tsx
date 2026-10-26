"use client";
import { useMemo, useState } from "react";
import { formatDayEs, startOptions } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { fmtIsoDay, type Overview } from "./types";

// Modal «Asignar» del prototipo: clientes activos + fecha de inicio. Cada cliente recibe su propia copia.
export function AssignModal({ orgId, ov, programId, name, flash, onClose, onDone }: {
  orgId: string; ov: Overview; programId: string; name: string; flash: (t: string) => void; onClose: () => void; onDone: () => void;
}) {
  const active = ov.clients.filter((c) => c.status === "active");
  const [ids, setIds] = useState<string[]>([]);
  const opts = useMemo(() => startOptions(new Date()), []);
  const [start, setStart] = useState(opts[0].date);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (k: string, d: string) => (k === "hoy" ? "Hoy" : k === "lun" ? `Lunes ${fmtIsoDay(d)}` : `1 de ${formatDayEs(d).split(" de ").pop()}`);
  const n = ids.length;
  const submit = async () => {
    if (!n) { setErr("Elegí al menos un cliente."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api<{ names: string[] }>(`/api/coach/${orgId}/programs/${programId}/assign`, { body: { coachClientIds: ids, startsOn: start } });
      const when = start === opts[0].date ? "desde hoy" : `desde el ${formatDayEs(start)}`;
      flash(`Programa asignado a ${r.names.map((x) => x.split(" ")[0]).join(", ")}. Lo verá en la app ${when}.`);
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label="Asignar programa" onClose={onClose}>
      <div className="mhead"><h2>Asignar «{name}»</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <span className="muted" style={{ fontSize: 13 }}>Cada cliente recibe su propia copia: podés ajustarla después sin afectar a los demás.</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {active.map((c) => (
          <label key={c.id} className="mrow">
            <input type="checkbox" aria-label={c.name} checked={ids.includes(c.id)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, c.id] : x.filter((i) => i !== c.id)))} />
            <span><b style={{ fontSize: 14 }}>{c.name}</b><small className="muted">{c.program ? `Actual: ${c.program.name} · se reemplaza` : "Sin programa"}</small></span>
          </label>
        ))}
        {!active.length && <span className="muted">No tenés clientes activos todavía.</span>}
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <legend style={{ fontSize: 13, fontWeight: 600, float: "left", marginRight: 8 }}>Empieza</legend>
        {opts.map((o) => <button type="button" key={o.key} className="pill" aria-pressed={start === o.date} onClick={() => setStart(o.date)} style={{ height: 32, borderRadius: 16 }}>{label(o.key, o.date)}</button>)}
      </fieldset>
      {err && <p role="alert" className="err-box">{err}</p>}
      <div className="mfoot">
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn pri" style={{ opacity: n ? 1 : .45 }} aria-busy={busy || undefined} onClick={submit}>Asignar a {n === 1 ? "1 cliente" : `${n} clientes`}</button>
      </div>
    </Modal>
  );
}
