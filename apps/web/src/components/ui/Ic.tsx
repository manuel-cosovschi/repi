// Íconos de interfaz: Phosphor Bold (selección G · Atlética, REPI_SELECCION_VISUAL.md). Licencia MIT (@phosphor-icons/react).
// Siempre decorativos: el nombre accesible lo da el botón o el texto que los acompaña. No reemplazan el logo ni el ícono de la app.
import type { Icon, IconWeight } from "@phosphor-icons/react";

export function Ic({ i: I, size = 22, weight = "bold", color, className, style }: { i: Icon; size?: number; weight?: IconWeight; color?: string; className?: string; style?: React.CSSProperties }) {
  return <I size={size} weight={weight} color={color} className={className} style={{ flex: "none", ...style }} aria-hidden="true" focusable="false" />;
}
