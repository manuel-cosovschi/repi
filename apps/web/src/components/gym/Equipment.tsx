"use client";
// D195 · Equipamiento de la sede (bloque 05/06). Qué cargas existen de verdad para que REPI recomiende pesos armables:
// mancuernas 10 / 12,5 / 15…, barra con discos de 1,25 por lado, máquina de placas de 5 en 5. No es un inventario.
// Lo administran dueño, gerencia y coordinación de la sede; quien arma programas lo consulta. El servidor decide.
import { useMemo, useState } from "react";
import { EQUIPMENT_CATEGORY, PER_SIDE_CATEGORIES, parseLoadList, validateEquipment, type EquipmentCategory } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, nf, useAct, useLoad, type Shell } from "./shared";

type Item = {
  id: string; name: string; category: EquipmentCategory; code: string | null; unit: "kg" | "lb"; increment: number | null; perSide: boolean;
  minLoad: number | null; maxLoad: number | null; loads: number[] | null; note: string | null; archivedAt: string | null; revision: number;
  exercises: { id: string; name: string }[]; ladder: { incrementKg: number | null; loadsKg: number[] | null };
};
type View = { location: { id: string; name: string }; locations: { id: string; name: string }[]; canEdit: boolean; items: Item[] };
const num = (s: string) => { const t = s.trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const fmtN = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

/** Resumen legible de lo que REPI va a usar («10 · 12,5 · 15 kg» o «saltos de 2,5 kg»). */
function summary(x: Item) {
  if (x.loads?.length) return `${x.loads.map((n) => nf(n, 2)).join(" · ")} ${x.unit}`;
  const inc = x.increment ? `saltos de ${nf(x.increment, 2)} ${x.unit}${x.perSide ? " por lado" : ""}` : null;
  const range = x.minLoad != null || x.maxLoad != null ? `${x.minLoad != null ? nf(x.minLoad, 2) : "…"} a ${x.maxLoad != null ? nf(x.maxLoad, 2) : "…"} ${x.unit}` : null;
  return [inc, range].filter(Boolean).join(" · ") || "Sin cargas cargadas: REPI usa una carga de referencia";
}

export function EquipmentScreen({ shell }: { shell: Shell }) {
  const [archived, setArchived] = useState(false);
  const loc = shell.loc ?? shell.ctx.locations[0]?.id ?? "";
  const v = useLoad<View>(`/api/gym/${shell.orgId}/equipment?loc=${loc}${archived ? "&archived=1" : ""}`);
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const { busy, run } = useAct(shell.flash);
  const archive = async (x: Item, on: boolean) => {
    if (on && !window.confirm(`¿Archivar «${x.name}»? REPI deja de usar sus cargas en esta sede. Podés volver a usarlo cuando quieras.`)) return;
    const ok = await run(`a:${x.id}`, () => api(`/api/gym/${shell.orgId}/equipment/${x.id}/archive`, { body: { archived: on } }), on ? "Equipo archivado." : "Equipo activo otra vez.");
    if (ok) void v.reload();
  };
  return (
    <>
      <Head kicker={v.data ? `Sede ${v.data.location.name} · lo que REPI usa para recomendar cargas que existen` : "Equipamiento"} title="Equipamiento">
        <label className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Ver archivados</label>
        {v.data?.canEdit && <button type="button" className="btn pri" onClick={() => setEdit("new")}>Agregar equipo</button>}
      </Head>
      {v.err && <p role="alert" className="err-box">{v.err}</p>}
      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <b>Cómo lo usa REPI</b>
        <span className="muted">1) Si quien programa indicó el salto en el ejercicio, manda ese. 2) Si no, el equipo de esta sede asociado a ese ejercicio. 3) Si no hay ninguno, una carga de referencia que la persona ajusta.</span>
        <span className="muted">REPI nunca sube una carga por redondear a lo disponible, nunca cambia la carga que indicó el profe y no aplica nada solo a un entrenamiento abierto.</span>
      </section>
      {v.data && !v.data.items.length && <p className="muted">{archived ? "No hay equipos en esta sede." : "Todavía no cargaron equipos en esta sede. Empezá por los que tienen saltos irregulares (mancuernas, máquinas)."}</p>}
      {v.data && v.data.items.length > 0 && (
        <section className="card" style={{ padding: 0, overflowX: "auto" }} tabIndex={0} aria-label="Equipos de la sede">
          <table className="gy-table">
            <thead><tr><th>Equipo</th><th>Tipo</th><th>Cargas</th><th>Ejercicios</th>{v.data.canEdit && <th><span className="sr-only">Acciones</span></th>}</tr></thead>
            <tbody>
              {v.data.items.map((x) => (
                <tr key={x.id} style={x.archivedAt ? { opacity: 0.6 } : undefined}>
                  <td><b>{x.name}</b>{x.code && <small className="muted"> · {x.code}</small>}{x.archivedAt && <span className="chip mute" style={{ marginLeft: 6 }}>Archivado</span>}</td>
                  <td>{EQUIPMENT_CATEGORY[x.category]}</td>
                  <td>{summary(x)}</td>
                  <td>{x.exercises.length ? x.exercises.map((e) => e.name).join(", ") : <span className="muted">Sin asociar: REPI no lo usa</span>}</td>
                  {v.data!.canEdit && <td style={{ whiteSpace: "nowrap" }}>
                    {!x.archivedAt && <button type="button" className="btn sm" onClick={() => setEdit(x)}>Editar</button>}{" "}
                    <button type="button" className="btn sm" aria-busy={busy === `a:${x.id}` || undefined} onClick={() => void archive(x, !x.archivedAt)}>{x.archivedAt ? "Volver a usar" : "Archivar"}</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {edit && <EquipmentModal shell={shell} loc={loc} item={edit === "new" ? null : edit} onClose={(ok) => { setEdit(null); if (ok) void v.reload(); }} />}
    </>
  );
}

function EquipmentModal({ shell, loc, item, onClose }: { shell: Shell; loc: string; item: Item | null; onClose: (ok: boolean) => void }) {
  const lib = useLoad<{ id: string; name: string; group: string }[]>(`/api/gym/${shell.orgId}/equipment/library?loc=${loc}`);
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<EquipmentCategory>(item?.category ?? "dumbbell");
  const [code, setCode] = useState(item?.code ?? "");
  const [unit, setUnit] = useState<"kg" | "lb">(item?.unit ?? "kg");
  const [mode, setMode] = useState<"list" | "step">(item ? (item.loads?.length ? "list" : "step") : "list");
  const [loads, setLoads] = useState(item?.loads?.map(fmtN).join("; ") ?? "");
  const [inc, setInc] = useState(fmtN(item?.increment ?? null));
  const [perSide, setPerSide] = useState(item?.perSide ?? false);
  const [min, setMin] = useState(fmtN(item?.minLoad ?? null));
  const [max, setMax] = useState(fmtN(item?.maxLoad ?? null));
  const [note, setNote] = useState(item?.note ?? "");
  const [exIds, setExIds] = useState<string[]>(item?.exercises.map((e) => e.id) ?? []);
  const [q, setQ] = useState("");
  const { busy, run } = useAct(shell.flash);
  const sideOk = PER_SIDE_CATEGORIES.includes(category);
  const input = {
    name, category, code: code.trim() || null, unit, note: note.trim() || null, exerciseIds: exIds,
    loads: mode === "list" ? parseLoadList(loads) : null, increment: mode === "step" ? num(inc) : null, perSide: mode === "step" && sideOk && perSide,
    minLoad: mode === "step" ? num(min) : null, maxLoad: mode === "step" ? num(max) : null,
  };
  const bad = [input.increment, input.minLoad, input.maxLoad].some((x) => Number.isNaN(x)) || (mode === "list" && loads.trim() !== "" && !input.loads);
  const errors = bad ? [{ message: "Revisá los números: usá coma o punto para los decimales." }] : validateEquipment({ ...input, increment: input.increment as number | null, minLoad: input.minLoad as number | null, maxLoad: input.maxLoad as number | null });
  const found = useMemo(() => (lib.data ?? []).filter((e) => !exIds.includes(e.id) && (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 8), [lib.data, exIds, q]);
  const save = async () => {
    if (errors.length) { shell.flash(errors[0].message); return; }
    const url = item ? `/api/gym/${shell.orgId}/equipment/${item.id}` : `/api/gym/${shell.orgId}/equipment`;
    const ok = await run("save", () => api(url, { body: item ? { ...input, revision: item.revision } : { ...input, loc } }), item ? "Equipo actualizado." : "Equipo agregado.");
    if (ok) onClose(true);
  };
  return (
    <Modal label={item ? `Editar ${item.name}` : "Agregar equipo"} onClose={() => onClose(false)} wide>
      <div className="mhead"><h2>{item ? `Editar · ${item.name}` : "Agregar equipo"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <label className="field">Nombre<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Mancuernas hexagonales" /></label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <label className="field">Tipo<select value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory)}>{(Object.keys(EQUIPMENT_CATEGORY) as EquipmentCategory[]).map((k) => <option key={k} value={k}>{EQUIPMENT_CATEGORY[k]}</option>)}</select></label>
        <label className="field">Unidad<select value={unit} onChange={(e) => setUnit(e.target.value as "kg" | "lb")}><option value="kg">kg</option><option value="lb">lb</option></select></label>
        <label className="field">Identificador (opcional)<input value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} placeholder="M-04" /></label>
      </div>
      <div className="pills" role="group" aria-label="Cómo cargar las cargas">
        <button type="button" className="pill" aria-pressed={mode === "list"} onClick={() => setMode("list")}>Lista de cargas</button>
        <button type="button" className="pill" aria-pressed={mode === "step"} onClick={() => setMode("step")}>Salto mínimo</button>
      </div>
      {mode === "list" ? (
        <label className="field">Cargas disponibles ({unit}), separadas por «;»
          <input inputMode="decimal" value={loads} onChange={(e) => setLoads(e.target.value)} placeholder="10; 12,5; 15; 17,5; 20" aria-describedby="eq-loads-help" />
          <small id="eq-loads-help" className="muted">Para mancuernas, pesas rusas o máquinas con placas irregulares. REPI elige siempre una de estas.</small>
        </label>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <label className="field">Salto mínimo ({unit})<input inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} placeholder="2,5" /></label>
          <label className="field">Desde ({unit}, opcional)<input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></label>
          <label className="field">Hasta ({unit}, opcional)<input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></label>
          {sideOk && <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={perSide} onChange={(e) => setPerSide(e.target.checked)} /> El salto es por lado (discos)</label>}
        </div>
      )}
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Ejercicios que se hacen con este equipo</legend>
        <span className="muted">Elegilos vos: REPI no supone que dos máquinas son iguales por trabajar el mismo músculo.</span>
        <div className="pills" role="list">{exIds.map((id) => { const e = lib.data?.find((x) => x.id === id) ?? item?.exercises.find((x) => x.id === id); return (
          <span role="listitem" key={id} className="pill" aria-pressed="true">{e?.name ?? "Ejercicio"} <button type="button" className="x" aria-label={`Quitar ${e?.name ?? "ejercicio"}`} onClick={() => setExIds(exIds.filter((x) => x !== id))}>×</button></span>); })}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio de la biblioteca" aria-label="Buscar ejercicio" />
        {q.trim() && <div className="pills">{found.map((e) => <button key={e.id} type="button" className="pill" onClick={() => { setExIds([...exIds, e.id]); setQ(""); }}>+ {e.name}</button>)}{!found.length && <span className="muted">Sin resultados.</span>}</div>}
      </fieldset>
      <label className="field">Nota (opcional)<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: las de 22,5 están en el rack del fondo" /></label>
      {errors.length > 0 && (name.trim() || loads || inc) && <p className="gy-warn" role="note" style={{ margin: 0 }}>{errors[0].message}</p>}
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button>
        <button type="button" className="btn pri" aria-busy={busy === "save" || undefined} aria-disabled={errors.length > 0} onClick={() => void save()}>{item ? "Guardar cambios" : "Agregar equipo"}</button></div>
    </Modal>
  );
}
