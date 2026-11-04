import { describe, expect, it } from "vitest";
import { acceptThemeChange, isThemePref, parseLocalTheme, reconcileTheme, resolveTheme, type LocalTheme } from "./theme";

describe("tema global (D188)", () => {
  it("valida estrictamente los valores", () => {
    expect(["light", "dark", "system"].every(isThemePref)).toBe(true);
    for (const v of ["", "Light", "auto", null, undefined, 1, {}]) expect(isThemePref(v)).toBe(false);
  });

  it("resuelve Automático con el dispositivo y no cambia Claro/Oscuro con el sistema", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  const L = (p: Partial<LocalTheme>): LocalTheme => ({ pref: "dark", at: 100, pending: false, uid: "u1", ...p });

  it("sin cambio pendiente manda la cuenta (otro dispositivo)", () => {
    const r = reconcileTheme(L({ pref: "dark" }), { theme: "light", changedAt: 50 }, "u1");
    expect(r).toEqual({ local: { pref: "light", at: 50, pending: false, uid: "u1" }, push: false });
  });

  it("usuario nuevo o sin copia local: toma la cuenta (Automático por defecto)", () => {
    expect(reconcileTheme(null, { theme: "system", changedAt: null }, "u1").local.pref).toBe("system");
  });

  it("un cambio offline más nuevo se envía; uno más viejo cede ante la cuenta", () => {
    expect(reconcileTheme(L({ pending: true, at: 200 }), { theme: "light", changedAt: 150 }, "u1").push).toBe(true);
    const older = reconcileTheme(L({ pending: true, at: 100 }), { theme: "light", changedAt: 150 }, "u1");
    expect(older.push).toBe(false);
    expect(older.local.pref).toBe("light");
  });

  it("el pendiente de otra cuenta no se envía a la nueva", () => {
    const r = reconcileTheme(L({ pending: true, at: 999, uid: "otra" }), { theme: "system", changedAt: null }, "u1");
    expect(r.push).toBe(false);
    expect(r.local).toEqual({ pref: "system", at: 0, pending: false, uid: "u1" });
  });

  it("un pendiente hecho antes de conocer la cuenta se asigna a la sesión actual", () => {
    const r = reconcileTheme(L({ pending: true, at: 10, uid: null }), { theme: "system", changedAt: null }, "u1");
    expect(r).toEqual({ local: { pref: "dark", at: 10, pending: true, uid: "u1" }, push: true });
  });

  it("el servidor guarda el último cambio y limita relojes adelantados", () => {
    expect(acceptThemeChange(null, undefined, 1000)).toEqual({ ok: true, at: 1000 });
    expect(acceptThemeChange(500, 400, 1000).ok).toBe(false);
    expect(acceptThemeChange(500, 600, 1000)).toEqual({ ok: true, at: 600 });
    expect(acceptThemeChange(500, 10 ** 15, 1000).at).toBe(61_000);
    expect(acceptThemeChange(null, -5, 1000).ok).toBe(false);
  });

  it("lee copias locales viejas o corruptas sin romper", () => {
    expect(parseLocalTheme(null)).toBeNull();
    expect(parseLocalTheme("{")).toBeNull();
    expect(parseLocalTheme('{"pref":"neon"}')).toBeNull();
    expect(parseLocalTheme('{"pref":"light"}')).toEqual({ pref: "light", at: 0, pending: false, uid: null });
  });
});

// D188: contraste de los pares de tokens de cada tema (WCAG 2.2 AA). Texto ≥ 4,5:1; componentes e indicadores ≥ 3:1.
import { tokens } from "./tokens";
const rgb = (c: string, under?: number[]): number[] => {
  const m = c.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (m) { const a = Number(m[4]); const base = under ?? [255, 255, 255]; return [1, 2, 3].map((i, k) => Number(m[i]) * a + base[k] * (1 - a)); }
  const h = c.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe.each(["light", "dark"] as const)("contraste del tema %s", (name) => {
  const t = tokens.theme[name] as Record<string, string>;
  const grounds = ["page", "surface", "surface-2", "surface-raised"].map((k) => rgb(t[k]));
  it.each(["text", "text-2", "muted", "link", "success-text", "warning-text", "error-text"])("%s legible (≥ 4,5:1) en todas las superficies", (k) => {
    for (const g of grounds) expect(ratio(rgb(t[k]), g)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["accent", "control-border", "focus"])("%s visible como componente (≥ 3:1) sobre page y surface", (k) => {
    for (const g of grounds.slice(0, 2)) expect(ratio(rgb(t[k]), g)).toBeGreaterThanOrEqual(3);
  });
  it("texto sobre la acción primaria, sobre selección y en las pastillas de estado", () => {
    expect(ratio(rgb(t["on-primary"]), rgb(t.primary))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(t.link), rgb(t["selection-bg"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(t["inverse-text"]), rgb(t["inverse-bg"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(t["sidebar-ink"]), rgb(t["sidebar-bg"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(t["sidebar-muted"]), rgb(t["sidebar-bg"]))).toBeGreaterThanOrEqual(4.5);
    for (const c of ["info", "ok", "warn", "bad", "mute"]) {
      const bg = rgb(t[`chip-${c}-bg`], rgb(t.surface));
      expect(ratio(rgb(t[`chip-${c}-ink`]), bg), `chip ${c}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("superficies diferenciadas (no todo del mismo color)", () => {
    expect(t.page).not.toBe(t.surface);
    expect(t.surface).not.toBe(t["surface-2"]);
    expect(t["sidebar-bg"]).not.toBe(t.surface);
  });
});
