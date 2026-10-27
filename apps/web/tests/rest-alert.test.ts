import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// F-HX-22 / D107: aviso local de fin de descanso. Sin permiso o sin elegirlo no programa nada; a la vista sólo vibra.
const shown: unknown[] = [];
let visibility = "hidden";
let store: Record<string, string> = {};
beforeEach(() => {
  vi.useFakeTimers();
  shown.length = 0; store = {}; visibility = "hidden";
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: async () => "granted" });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  vi.stubGlobal("document", { get visibilityState() { return visibility; } });
  vi.stubGlobal("navigator", { vibrate: vi.fn(), serviceWorker: { ready: Promise.resolve({ showNotification: async (t: string, o: unknown) => { shown.push([t, o]); } }) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("aviso de fin de descanso", () => {
  it("sólo con permiso y elegido: notifica al terminar si la app está en segundo plano", async () => {
    const ra = await import("@/lib/restAlert");
    expect(ra.restAlertState()).toBe("off");
    ra.scheduleRestAlert(Date.now() + 90_000, "Seguí con Prensa.");
    await vi.advanceTimersByTimeAsync(91_000);
    expect(shown).toHaveLength(0);
    expect(await ra.enableRestAlert()).toBe("on");
    ra.scheduleRestAlert(Date.now() + 90_000, "Seguí con Prensa.");
    await vi.advanceTimersByTimeAsync(89_000);
    expect(shown).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(shown).toEqual([["Descanso terminado", expect.objectContaining({ body: "Seguí con Prensa.", tag: "repi-rest", data: { url: "/app", focusOnly: true } })]]);
  });
  it("cancelar, desactivar o tener la app a la vista no notifica", async () => {
    const ra = await import("@/lib/restAlert");
    await ra.enableRestAlert();
    ra.scheduleRestAlert(Date.now() + 1_000, "x");
    ra.cancelRestAlert();
    await vi.advanceTimersByTimeAsync(2_000);
    visibility = "visible";
    ra.scheduleRestAlert(Date.now() + 1_000, "x");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(shown).toHaveLength(0);
    expect((navigator as unknown as { vibrate: ReturnType<typeof vi.fn> }).vibrate).toHaveBeenCalledWith(200);
    ra.disableRestAlert();
    expect(ra.restAlertState()).toBe("off");
    (Notification as unknown as { permission: string }).permission = "denied";
    expect(ra.restAlertState()).toBe("denied");
  });
});
