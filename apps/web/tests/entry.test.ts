import { beforeAll, describe, expect, it } from "vitest";
import { entryHref, parseEntryInput } from "@/lib/entry";

// Recuperación del alta al abrir desde el ícono: sólo destinos internos de REPI, nunca URLs externas.
beforeAll(() => { (globalThis as { location?: unknown }).location = { origin: "https://repi-app.vercel.app" }; });

describe("parseEntryInput", () => {
  it("reconoce enlaces de REPI, códigos de invitación y códigos de sede", () => {
    expect(parseEntryInput("https://repi-app.vercel.app/unirse/abcDEF_12-xy")).toEqual({ k: "join", v: "abcDEF_12-xy" });
    expect(parseEntryInput("https://repi-app.vercel.app/acceso?code=r7k2qx")).toEqual({ k: "code", v: "R7K2QX" });
    expect(parseEntryInput(" r7k-2qx ")).toEqual({ k: "code", v: "R7K2QX" });
    expect(parseEntryInput("abcDEF_12-xy")).toEqual({ k: "join", v: "abcDEF_12-xy" });
    const tok = "a".repeat(43);
    expect(parseEntryInput(`https://repi-app.vercel.app/activar/${tok}`)).toEqual({ k: "activate", v: tok });
  });
  it("rechaza otros sitios, rutas desconocidas y texto inválido", () => {
    expect(parseEntryInput("https://evil.example/unirse/abcDEF_12")).toBeNull();
    expect(parseEntryInput("https://repi-app.vercel.app/admin")).toBeNull();
    expect(parseEntryInput("javascript:alert(1)")).toBeNull();
    expect(parseEntryInput("hola mundo")).toBeNull();
    expect(parseEntryInput("")).toBeNull();
  });
  it("el destino siempre es interno", () => {
    expect(entryHref({ k: "join", v: "abc123" })).toBe("/unirse/abc123");
    expect(entryHref({ k: "code", v: "R7K2QX" })).toBe("/acceso?code=R7K2QX");
  });
});
