"use client";
// Importación CSV de clientes (F-CO-11, D99). Pasos: archivo → columnas → vista previa por fila (servidor) → confirmar.
// Importar = invitar por email: cada persona acepta con su cuenta y elige qué compartir. No se crean cuentas.
import { useState } from "react";
import { CSV_MAX_ROWS, guessColumns, mapRows, parseCsv } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";

type Row = { line: number; name: string | null; email: string; status: "ok" | "invalid_email" | "duplicate_in_file" | "already_client" | "pending_invitation"; label: string };
type Report = { invited: number; skipped: number; failed: number; rows: { line: number; email: string; result: "invited" | "skipped" | "failed"; detail: string }[] };
type Cols = { email: number | null; name: number | null; lastName: number | null };

export function ImportModal({ orgId, flash, onClose }: { orgId: string; flash: (t: string) => void; onClose: (changed: boolean) => void }) {
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][]; file: string } | null>(null);
  const [cols, setCols] = useState<Cols>({ email: null, name: null, lastName: null });
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | null) => {
    setErr(null); setPreview(null);
    if (!f) return;
    if (f.size > 1_000_000) { setErr("El archivo es muy grande (máximo 1 MB)."); return; }
    const p = parseCsv(await f.text());
    if (!p.headers.length || !p.rows.length) { setErr("No encontramos filas. La primera fila tiene que tener los títulos de las columnas."); return; }
    setCsv({ ...p, file: f.name }); setCols(guessColumns(p.headers));
  };
  const rows = () => (csv ? mapRows(csv.rows, cols) : []);
  const check = async () => {
    if (cols.email == null) { setErr("Elegí la columna del email."); return; }
    setBusy(true); setErr(null);
    try { setPreview(await api<Row[]>(`/api/coach/${orgId}/import?step=preview`, { body: { rows: rows() } })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<Report>(`/api/coach/${orgId}/import`, { body: { rows: rows() } }); setReport(r); flash(`${r.invited} ${r.invited === 1 ? "invitación creada" : "invitaciones creadas"}.`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const ok = preview?.filter((r) => r.status === "ok").length ?? 0;
  const sel = (k: keyof Cols, label: string, optional = false) => (
    <label className="field" style={{ flex: "1 1 160px" }}>{label}
      <select value={cols[k] ?? ""} onChange={(e) => { setCols({ ...cols, [k]: e.target.value === "" ? null : Number(e.target.value) }); setPreview(null); }}>
        <option value="">{optional ? "No hay" : "Elegí una columna"}</option>
        {csv!.headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
      </select>
    </label>
  );
  return (
    <Modal label="Importar clientes" onClose={() => onClose(!!report)} wide>
      <div className="mhead"><h2>Importar clientes desde CSV</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(!!report)}>×</button></div>
      {report ? (
        <>
          <p role="status" style={{ margin: 0 }}><b>{report.invited}</b> invitadas · {report.skipped} salteadas · {report.failed} con error. Cada persona recibe un enlace personal y acepta desde su cuenta.</p>
          <div className="table" style={{ maxHeight: 320, overflowY: "auto" }}>
            {report.rows.map((r) => (
              <div key={r.line} className="trow"><span className="mono" style={{ flex: "0 0 48px" }}>{r.line}</span><span style={{ flex: "1 1 200px", overflowWrap: "anywhere" }}>{r.email}</span>
                <span className={`chip ${r.result === "invited" ? "ok" : r.result === "failed" ? "bad" : "mute"}`}>{r.detail}</span></div>
            ))}
          </div>
          <div className="mfoot"><button type="button" className="btn pri" onClick={() => onClose(true)}>Listo</button></div>
        </>
      ) : (
        <>
          <span className="muted" style={{ fontSize: 13 }}>Exportá tu planilla como CSV (Excel: «CSV UTF-8»). Primera fila con títulos; hace falta una columna de email. Hasta {CSV_MAX_ROWS} filas. A cada email válido le llega una invitación personal: nadie queda como cliente hasta aceptarla.</span>
          <label className="field">Archivo CSV<input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void pick(e.target.files?.[0] ?? null)} /></label>
          {csv && <>
            <span className="muted" style={{ fontSize: 13 }}>{csv.file} · {csv.rows.length} {csv.rows.length === 1 ? "fila" : "filas"}{csv.rows.length > CSV_MAX_ROWS ? ` (se toman las primeras ${CSV_MAX_ROWS})` : ""}</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{sel("email", "Email")}{sel("name", "Nombre", true)}{sel("lastName", "Apellido", true)}</div>
          </>}
          {preview && (
            <>
              <span role="status" style={{ fontSize: 14 }}><b>{ok}</b> de {preview.length} se van a invitar.</span>
              <div className="table" style={{ maxHeight: 300, overflowY: "auto" }}>
                {preview.map((r) => (
                  <div key={r.line} className="trow"><span className="mono" style={{ flex: "0 0 48px" }}>{r.line}</span>
                    <span style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", minWidth: 0 }}><b>{r.name ?? "Sin nombre"}</b><small className="muted" style={{ overflowWrap: "anywhere" }}>{r.email || "—"}</small></span>
                    <span className={`chip ${r.status === "ok" ? "ok" : r.status === "invalid_email" ? "bad" : "mute"}`}>{r.label}</span></div>
                ))}
              </div>
            </>
          )}
          {err && <p role="alert" className="err-box">{err}</p>}
          <div className="mfoot">
            <button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button>
            {csv && !preview && <button type="button" className="btn pri" aria-busy={busy || undefined} onClick={check}>{busy ? "Revisando…" : "Revisar filas"}</button>}
            {preview && <button type="button" className="btn pri" aria-busy={busy || undefined} disabled={!ok} onClick={confirm}>{busy ? "Invitando…" : `Invitar ${ok}`}</button>}
          </div>
        </>
      )}
    </Modal>
  );
}
