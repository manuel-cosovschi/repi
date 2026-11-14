"use client";
// Código de barras (Open Food Facts, ODbL) y alimentos cargados a mano. Un valor que la persona no conoce queda vacío y se
// guarda como «sin dato», nunca como 0. La cámara sólo se ofrece si el navegador trae BarcodeDetector (sin dependencias
// nuevas); el video se apaga al cerrar.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { NUTRIENT_KEYS, NUTRIENT_LABEL, type FoodSnapshot, type NutrientKey } from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { BASE, errText, num, parseAmount } from "./lib";
import { FoodInfo, per } from "./QtyPicker";

type Lookup = { status: "found"; food: FoodSnapshot; complete: boolean } | { status: "not_found" } | { status: "unavailable" };
type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

export function BarcodeLookup({ onFound, onManual }: { onFound: (f: FoodSnapshot) => void; onManual: (code: string) => void }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [res, setRes] = useState<Lookup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [hasDetector] = useState(() => typeof window !== "undefined" && "BarcodeDetector" in window);
  const video = useRef<HTMLVideoElement>(null);

  const lookup = useCallback(async (c: string) => {
    const clean = c.replace(/\D/g, "");
    if (clean.length < 8) { setErr("El código tiene 8, 12, 13 o 14 números."); return; }
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await api<Lookup>(`${BASE}/barcode/${clean}`)); }
    catch (e) { setErr(e instanceof ApiError && e.code === "invalid_barcode" ? e.message : errText(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!cam) return;
    let stream: MediaStream | null = null, stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream; await v.play().catch(() => undefined);
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const det = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        const tick = async () => {
          if (stop) return;
          const found = await det.detect(v).catch(() => []);
          const raw = found[0]?.rawValue?.replace(/\D/g, "");
          if (raw) { setCode(raw); setCam(false); void lookup(raw); return; }
          timer = setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch { setCamErr("No pudimos usar la cámara. Escribí el código de abajo del código de barras."); setCam(false); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam, lookup]);

  return (
    <div className="nu-col">
      <div className="pp-form">
        <label htmlFor={`${id}-c`}>Número del código de barras</label>
        <div className="nu-qty-row">
          <input id={`${id}-c`} inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={code} placeholder="7790000000000" onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 14))}
            onKeyDown={(e) => { if (e.key === "Enter") void lookup(code); }} />
          <button type="button" className="cta sm" disabled={busy || code.length < 8} aria-busy={busy || undefined} onClick={() => void lookup(code)}>{busy ? "Buscando…" : "Buscar"}</button>
        </div>
      </div>
      {hasDetector && !cam && <button type="button" className="ghost" onClick={() => { setCamErr(null); setCam(true); }}>Escanear con la cámara</button>}
      {cam && (
        <div className="nu-cam">
          <video ref={video} muted playsInline aria-label="Vista de la cámara para leer el código" />
          <button type="button" className="ghost sm" onClick={() => setCam(false)}>Cerrar cámara</button>
        </div>
      )}
      {camErr && <p className="sheet-warn" role="alert">{camErr}</p>}
      <div aria-live="polite" className="nu-col">
        {err && <><p className="mb-err" role="alert">{err}</p><button type="button" className="ghost" onClick={() => onManual(code)}>Cargarlo a mano</button></>}
        {res?.status === "found" && (
          <div className="pp-card nu-col">
            <b className="nu-name">{res.food.name}</b>
            <small>{per(res.food)}</small>
            <p className="nu-small">Valores de la etiqueta tal como los cargó la comunidad de Open Food Facts.</p>
            {!res.complete && <p className="sheet-warn">La etiqueta cargada no informa todos los macronutrientes: lo que falta queda «sin dato» y los totales se muestran como mínimos.</p>}
            <FoodInfo food={res.food} full noNote={!res.complete} />
            <button type="button" className="cta" onClick={() => onFound(res.food)}>Elegir cantidad</button>
          </div>
        )}
        {res && res.status !== "found" && (
          <>
            <p className="sheet-warn" role="status">{res.status === "not_found" ? "No encontramos ese producto en Open Food Facts." : "Open Food Facts no responde en este momento."} Podés cargarlo a mano con los datos de la etiqueta.</p>
            <button type="button" className="ghost" onClick={() => onManual(code)}>Cargarlo a mano</button>
          </>
        )}
      </div>
    </div>
  );
}

const UNITS: [FoodSnapshot["basis"]["unit"], string][] = [["g", "gramos"], ["ml", "ml"], ["unidad", "unidad"], ["porcion", "porción"]];
type Form = { name: string; brand: string; barcode: string; basisAmount: string; basisUnit: FoodSnapshot["basis"]["unit"]; basisGrams: string; values: Record<NutrientKey, string> };
const emptyForm = (barcode = ""): Form => ({ name: "", brand: "", barcode, basisAmount: "100", basisUnit: "g", basisGrams: "", values: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, ""])) as Record<NutrientKey, string> });

/** Alimentos propios: crear, usar, editar y borrar. Editar no cambia lo ya registrado (cada registro guarda su copia). */
export function ManualFood({ prefillBarcode, onCreated }: { prefillBarcode?: string; onCreated: (f: FoodSnapshot) => void }) {
  const [mine, setMine] = useState<FoodSnapshot[] | null>(null);
  const [f, setF] = useState<Form>(() => emptyForm(prefillBarcode));
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<{ foods: FoodSnapshot[] }>(`${BASE}/foods/mine`).then((r) => setMine(r.foods)).catch(() => setMine([])), []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (busy) return;
    const amount = parseAmount(f.basisAmount);
    if (f.name.trim().length < 2) { setErr("Escribí el nombre del alimento."); return; }
    if (!amount) { setErr("Indicá la cantidad a la que corresponden los valores (por ejemplo, 100 g)."); return; }
    const values: Partial<Record<NutrientKey, number | null>> = {};
    for (const k of NUTRIENT_KEYS) {
      const raw = f.values[k].trim();
      if (!raw) { values[k] = null; continue; }
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { setErr(`Revisá ${NUTRIENT_LABEL[k].label.toLowerCase()}: tiene que ser un número.`); return; }
      values[k] = n;
    }
    if (NUTRIENT_KEYS.every((k) => values[k] == null)) { setErr("Cargá al menos un valor (por ejemplo, proteínas). Lo que no sepas, dejalo vacío."); return; }
    const grams = f.basisUnit === "g" ? null : parseAmount(f.basisGrams);
    setBusy(true); setErr(null);
    try {
      const body = { name: f.name.trim(), brand: f.brand.trim() || null, barcode: f.barcode || null, basisAmount: amount, basisUnit: f.basisUnit, basisGrams: grams, values };
      const r = await api<{ food: FoodSnapshot }>(editing ? `${BASE}/foods/${editing}` : `${BASE}/foods`, { body });
      onCreated(r.food);
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  const del = async (food: FoodSnapshot) => {
    if (busy) return;
    setBusy(true);
    try { await api(`${BASE}/foods/${food.refId}`, { method: "DELETE" }); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const edit = (food: FoodSnapshot) => {
    setEditing(food.refId);
    setF({
      name: food.name, brand: "", barcode: "", basisAmount: num(food.basis.amount, 2), basisUnit: food.basis.unit, basisGrams: food.basis.grams ? num(food.basis.grams, 2) : "",
      values: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, food.values[k] == null || (k === "energyKcal" && food.energy === "calculated") ? "" : num(food.values[k]!, 2)])) as Record<NutrientKey, string>,
    });
  };

  return (
    <div className="nu-col">
      {mine && mine.length > 0 && !editing && (
        <details className="nu-details">
          <summary>Mis alimentos ({mine.length})</summary>
          <ul className="pp-rows" aria-label="Mis alimentos">
            {mine.map((m) => (
              <li key={m.refId}><span>{m.name}<br /><span className="mb-muted">{per(m)}</span></span>
                <span className="nu-rowbtns">
                  <button type="button" className="linkbtn nu-act" onClick={() => onCreated(m)} aria-label={`Usar ${m.name}`}>Usar</button>
                  <button type="button" className="linkbtn nu-act" onClick={() => edit(m)} aria-label={`Editar ${m.name}`}>Editar</button>
                  <button type="button" className="linkbtn nu-act" disabled={busy} onClick={() => void del(m)} aria-label={`Eliminar ${m.name}`}>Eliminar</button>
                </span></li>
            ))}
          </ul>
        </details>
      )}
      <div className="pp-form">
        <h3 className="nu-h">{editing ? "Editar alimento" : "Nuevo alimento"}</h3>
        <label>Nombre<input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej.: Yogur de la casa" /></label>
        {!editing && <div className="pp-row2">
          <label>Marca (opcional)<input value={f.brand} maxLength={60} onChange={(e) => setF({ ...f, brand: e.target.value })} /></label>
          <label>Código de barras (opcional)<input inputMode="numeric" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value.replace(/\D/g, "").slice(0, 14) })} /></label>
        </div>}
        <div className="pp-row2">
          <label>Los valores son por<input inputMode="decimal" value={f.basisAmount} onChange={(e) => setF({ ...f, basisAmount: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })} /></label>
          <label>Unidad<select value={f.basisUnit} onChange={(e) => setF({ ...f, basisUnit: e.target.value as Form["basisUnit"] })}>{UNITS.map(([u, l]) => <option key={u} value={u}>{l}</option>)}</select></label>
        </div>
        {f.basisUnit !== "g" && <label>Peso de esa cantidad en gramos (opcional: permite registrar en gramos)<input inputMode="decimal" value={f.basisGrams} onChange={(e) => setF({ ...f, basisGrams: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })} /></label>}
        <p className="nu-note" role="note">Copiá los valores de la etiqueta. Lo que no sepas, dejalo vacío: se guarda como «sin dato», nunca como 0.</p>
        <div className="nu-nutgrid">
          {NUTRIENT_KEYS.map((k) => (
            <label key={k}>{NUTRIENT_LABEL[k].label} ({NUTRIENT_LABEL[k].unit})
              <input inputMode="decimal" value={f.values[k]} placeholder="sin dato" onChange={(e) => setF({ ...f, values: { ...f.values, [k]: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) } })} />
            </label>
          ))}
        </div>
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>{busy ? "Guardando…" : editing ? "Guardar y elegir cantidad" : "Crear y elegir cantidad"}</button>
        {editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setF(emptyForm()); }}>Cancelar edición</button>}
        <small className="mb-muted nu-small">Si la energía queda vacía y cargás proteínas, carbohidratos y grasas, se calcula con los factores de Atwater y se muestra como «calculada».</small>
      </div>
    </div>
  );
}
