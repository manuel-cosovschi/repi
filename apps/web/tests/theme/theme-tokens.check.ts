// D188: guarda del tema global. Los estilos y componentes con tema consumen sólo tokens --ui-*; un color fijo nuevo
// (hex, rgb, variables de paleta vieja) rompería Claro u Oscuro sin que nadie lo note. Excepciones explícitas: líneas o
// bloques marcados «theme-fixed» (ilustraciones, QR sobre blanco, escena de marca) con su motivo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@repi/domain/tokens";

const root = fileURLToPath(new URL("../../src/", import.meta.url));
const THEMED_CSS = ["member.css", "coach.css", "gym.css", "method-editor.css", "access.css", "globals.css"];
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|var\(--(?:dark|light|core|semantic|access)-/;

function offenders(src: string, strip = (l: string) => l) {
  const out: string[] = [];
  let fixed = false;
  src.split("\n").forEach((line, i) => {
    if (line.includes("theme-fixed:start")) fixed = true;
    const inFixed = fixed || line.includes("theme-fixed");
    if (line.includes("theme-fixed:end")) fixed = false;
    const code = strip(line).replace(/\/\*.*?\*\//g, "");
    if (!inFixed && COLOR.test(code)) out.push(`${i + 1}: ${line.trim().slice(0, 120)}`);
  });
  return out;
}

test("los CSS con tema no tienen colores fijos fuera de las excepciones marcadas", () => {
  for (const f of THEMED_CSS) assert.deepEqual(offenders(readFileSync(join(root, "styles", f), "utf8")), [], f);
});

test("los componentes no escriben colores fijos (usan var(--ui-*))", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".tsx")) files.push(p); } };
  walk(join(root, "components"));
  walk(join(root, "app"));
  // Sitio público (editorial navy), pantallas de recepción, buzón de desarrollo y el QR (se lee sobre blanco) tienen diseño fijo.
  const allowed = (p: string, l: string) => /ingreso\/pantalla|ranking\/pantalla|dev\/mailbox|components\/site\//.test(p) || /renderSVG|^\s*\/\//.test(l);
  const bad: string[] = [];
  for (const p of files) {
    readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (!allowed(p, l) && /["'`]#[0-9a-fA-F]{3,8}\b|var\(--(?:dark|light|core|semantic|access)-/.test(l)) bad.push(`${p.slice(root.length)}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});

test("Claro y Oscuro definen exactamente los mismos tokens y tokens.css está generado", () => {
  const l = Object.keys(tokens.theme.light).sort(); const d = Object.keys(tokens.theme.dark).sort();
  assert.deepEqual(l, d);
  const css = readFileSync(join(root, "styles", "tokens.css"), "utf8");
  for (const k of l) assert.ok(css.includes(`--ui-${k}: ${tokens.theme.light[k as keyof typeof tokens.theme.light]};`), `tokens.css desactualizado: ${k} (pnpm tokens)`);
  assert.ok(css.includes(':root[data-theme="dark"], .ui-dark {') && css.includes("prefers-color-scheme: dark"));
});

test("cada token --ui-* que usan los estilos existe en el tema", () => {
  const known = new Set(Object.keys(tokens.theme.light));
  const used = new Set<string>();
  for (const f of readdirSync(join(root, "styles"))) for (const m of readFileSync(join(root, "styles", f), "utf8").matchAll(/var\(--ui-([a-z0-9-]+)/g)) used.add(m[1]);
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".tsx")) for (const m of readFileSync(p, "utf8").matchAll(/var\(--ui-([a-z0-9-]+)/g)) used.add(m[1]); } };
  walk(root);
  assert.deepEqual([...used].filter((k) => !known.has(k)), []);
});
