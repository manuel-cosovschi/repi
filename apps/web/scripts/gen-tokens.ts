// Genera src/styles/tokens.css desde @repi/domain/tokens (fuente única). Uso: pnpm tokens
import { writeFileSync } from "node:fs";
import { tokens } from "@repi/domain/tokens";

const lines: string[] = [];
const kebab = (s: string) => s.replace(/_/g, "-");
for (const [group, vals] of Object.entries(tokens.color)) {
  if (group === "usage") continue;
  for (const [k, v] of Object.entries(vals as Record<string, unknown>)) {
    if (typeof v === "string") lines.push(`  --${kebab(group)}-${kebab(k)}: ${v};`);
    else if (Array.isArray(v)) { lines.push(`  --${kebab(group)}-${kebab(k)}-bg: ${v[0]};`, `  --${kebab(group)}-${kebab(k)}-ink: ${v[1]};`); }
    else for (const [k2, v2] of Object.entries(v as Record<string, string[]>)) {
      lines.push(`  --${kebab(group)}-${kebab(k)}-${kebab(k2)}-bg: ${v2[0]};`, `  --${kebab(group)}-${kebab(k)}-${kebab(k2)}-ink: ${v2[1]};`);
    }
  }
}
for (const [k, v] of Object.entries(tokens.motion.easing)) lines.push(`  --ease-${k}: ${v};`);
for (const [k, v] of Object.entries(tokens.motion.duration_ms)) lines.push(`  --dur-${kebab(k)}: ${v}ms;`);
lines.push(`  --font-ui: var(--font-barlow), "Barlow", system-ui, sans-serif;`);
lines.push(`  --font-display: var(--font-barlow-condensed), "Barlow Condensed", var(--font-ui);`);
lines.push(`  --font-mono: var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace;`);
// D188: tema global. Sin atributo (antes de hidratar o sin JS) sigue al dispositivo; data-theme en <html> lo fija el
// script de arranque (ThemeScript) con la preferencia guardada. .ui-dark / .ui-light fijan una zona (barra lateral navy,
// tarjeta del día, informes) sin depender del tema activo: gana por estar declarada en el propio elemento.
const vars = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `  --ui-${k}: ${v};`).join("\n");
const light = `${vars(tokens.theme.light)}\n  color-scheme: light;`;
const dark = `${vars(tokens.theme.dark)}\n  color-scheme: dark;`;
const theme = [
  `:root, .ui-light {\n${light}\n}`,
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${dark.replace(/^/gm, "  ")}\n  }\n}`,
  `:root[data-theme="dark"], .ui-dark {\n${dark}\n}`,
].join("\n");
writeFileSync(new URL("../src/styles/tokens.css", import.meta.url), `/* Generado por scripts/gen-tokens.ts. No editar. */\n:root {\n${lines.join("\n")}\n}\n${theme}\n`);
console.log(lines.length, "tokens");
