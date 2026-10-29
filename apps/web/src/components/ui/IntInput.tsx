"use client";
import { useEffect, useState, type InputHTMLAttributes } from "react";

/**
 * Campo de número entero que se puede borrar y reescribir (QA 29/10, reportado por el titular): antes cada tecla se
 * convertía a número con un mínimo, así que el campo vacío volvía a «1» y al tipear «4» quedaba «14». Mientras se escribe
 * guarda lo tipeado; sólo informa valores válidos (en rango) y al salir del campo vuelve al último valor bueno.
 * Con `nullable`, vacío significa «sin dato» (p. ej. RIR). Al enfocar se selecciona todo para reemplazar de una.
 */
export function IntInput({ value, onChange, min, max, nullable = false, ...rest }: {
  value: number | null; onChange: (n: number | null) => void; min: number; max: number; nullable?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "type">) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value == null ? "" : String(value)); }, [value, editing]);
  return (
    <input {...rest} inputMode="numeric" pattern="[0-9]*" value={draft}
      onFocus={(ev) => { setEditing(true); ev.currentTarget.select(); rest.onFocus?.(ev); }}
      onChange={(ev) => {
        const t = ev.target.value.replace(/\D/g, "").slice(-String(max).length); // con un dígito de más, gana lo último tipeado
        setDraft(t);
        if (t === "") { if (nullable) onChange(null); return; }
        const n = Number(t);
        if (n >= min && n <= max) onChange(n);
      }}
      onBlur={(ev) => { setEditing(false); setDraft(value == null ? "" : String(value)); rest.onBlur?.(ev); }} />
  );
}
