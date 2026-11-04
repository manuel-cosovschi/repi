"use client";
// D188: selector único de apariencia (Alumno, Coach, Gym, Admin y Mi cuenta). Radios nativos: flechas del teclado,
// lector de pantalla y táctil sin lógica propia. Aplica al instante; el estado de guardado se anuncia sin mover el foco.
import { useId, useState, useSyncExternalStore } from "react";
import { CircleHalf, Moon, Sun, type Icon } from "@phosphor-icons/react";
import type { ThemePref } from "@repi/domain";
import { getServerThemeState, getThemeState, setThemePref, subscribeTheme } from "@/lib/theme";

const OPTIONS: { v: ThemePref; label: string; hint: string; icon: Icon }[] = [
  { v: "light", label: "Claro", hint: "Fondo crema, ideal con mucha luz", icon: Sun },
  { v: "dark", label: "Oscuro", hint: "Navy profundo, cansa menos la vista", icon: Moon },
  { v: "system", label: "Automático", hint: "Sigue la configuración del teléfono o la compu", icon: CircleHalf },
];

const STATUS = { synced: "Guardado en tu cuenta: se aplica en todos tus espacios y dispositivos.", pending: "Guardado en este dispositivo. Se sincroniza con tu cuenta cuando vuelva la conexión.", error: "No pudimos guardarlo en tu cuenta. En este dispositivo ya está aplicado; probá de nuevo." } as const;

export function ThemePicker({ compact = false, showStatus = !compact }: { compact?: boolean; showStatus?: boolean }) {
  const s = useSyncExternalStore(subscribeTheme, getThemeState, getServerThemeState);
  const name = useId();
  // El estado de guardado se informa recién después de un cambio: antes no hay nada que confirmar.
  const [touched, setTouched] = useState(false);
  return (
    <fieldset className={`thp${compact ? " thp-compact" : ""}`}>
      <legend className={compact ? "sr-only" : "thp-legend"}>Apariencia</legend>
      <div className="thp-opts">
        {OPTIONS.map((o) => (
          <label key={o.v} className="thp-opt" title={compact ? `${o.label}: ${o.hint}` : undefined}>
            <input type="radio" name={name} value={o.v} checked={s.pref === o.v} onChange={() => { setTouched(true); void setThemePref(o.v); }} />
            <o.icon size={compact ? 18 : 22} weight={s.pref === o.v ? "fill" : "bold"} aria-hidden="true" focusable="false" />
            <span className={compact ? "sr-only" : "thp-txt"}><b>{o.label}</b>{!compact && <small>{o.hint}</small>}</span>
          </label>
        ))}
      </div>
      {showStatus && <p className="thp-status" role="status" aria-live="polite" data-sync={touched ? s.sync : undefined}>
        {touched && <>{s.pref === "system" && s.sync === "synced" ? `Ahora: ${s.theme === "dark" ? "oscuro" : "claro"}, como tu dispositivo. ` : ""}{STATUS[s.sync]}</>}
      </p>}
    </fieldset>
  );
}
