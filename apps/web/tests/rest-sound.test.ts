import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 13/11/2026 · Alerta sonora del descanso (lib/restSound): la preferencia (apagada de entrada, por dispositivo) decide si se
// crea audio; con ella encendida los tonos quedan programados en el reloj de audio y se cortan al arrancar la serie. La lógica
// de tiempos y estados tiene sus pruebas en packages/domain/src/rest-alarm.test.ts.
type Osc = { hz: number; start: number; stop: number; stopped: boolean };
let oscs: Osc[] = [];
let contexts = 0;
let ctxState = "suspended";
let store: Record<string, string> = {};
let visibility = "visible";
const session = { type: "auto" };
const vibrate = vi.fn();

let born = 0;
/** El reloj de audio no arranca en cero ni coincide con el de la página; avanza con el tiempo (falso) de la prueba. */
const audioNow = () => 100 + (Date.now() - born) / 1000;
class FakeAudioContext {
  destination = {};
  onstatechange: (() => void) | null = null;
  constructor() { contexts++; born = Date.now(); }
  get currentTime() { return audioNow(); }
  get state() { return ctxState; }
  async resume() { ctxState = "running"; }
  async suspend() { ctxState = "suspended"; }
  createOscillator() {
    const o: Osc = { hz: 0, start: -1, stop: -1, stopped: false };
    oscs.push(o);
    const node = { type: "sine", frequency: { setValueAtTime: (hz: number) => { o.hz = hz; } }, connect() {}, disconnect() {}, onended: null as null | (() => void),
      start: (t: number) => { o.start = t; },
      stop: (t?: number) => { if (t === undefined) { o.stopped = true; return; } o.stop = t; setTimeout(() => node.onended?.(), Math.max(0, (t - audioNow()) * 1000)); } };
    return node;
  }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
}
/** Tonos que todavía van a sonar: ni cortados ni ya terminados. */
const pending = () => oscs.filter((o) => !o.stopped && o.stop > audioNow());

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  oscs = []; contexts = 0; ctxState = "suspended"; store = {}; visibility = "visible"; session.type = "auto"; vibrate.mockClear();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  vi.stubGlobal("document", { get visibilityState() { return visibility; }, addEventListener() {} });
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("navigator", { vibrate, audioSession: session });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("alerta sonora del descanso · preferencia y audio", () => {
  it("apagada de entrada: un descanso no crea audio ni programa tonos, ni siquiera al terminar", async () => {
    const rs = await import("@/lib/restSound");
    expect(rs.restSoundOn()).toBe(false);
    rs.unlockRestSound();
    rs.armRestSound(Date.now() + 60_000, 60);
    await vi.advanceTimersByTimeAsync(70_000);
    rs.releaseRestSound();
    expect(contexts).toBe(0);
    expect(oscs).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
    expect(rs.restSoundSnapshot()).toMatchObject({ on: false, state: "idle" });
  });

  it("encendida: muestra al activar, cuenta regresiva de 10 s y señal de fin en el reloj de audio; arrancar la serie corta todo", async () => {
    const rs = await import("@/lib/restSound");
    expect(rs.setRestSound(true)).toBe(true);
    expect(store["repi:rest-sound"]).toBe("1");
    expect(contexts).toBe(1);
    expect(ctxState).toBe("running"); // se desbloquea en el toque que la enciende
    expect(session.type).toBe("ambient"); // iOS: respeta el modo silencio y no corta la música
    expect(pending().length).toBe(4); // muestra: un tono de «últimos segundos» y las tres notas del fin
    // Programar la alerta de un descanso en curso no corta la muestra (se enciende desde el propio temporizador).
    const end = Date.now() + 90_000;
    rs.armRestSound(end, 90);
    expect(rs.restSoundSnapshot().state).toBe("armed");
    expect(oscs.slice(0, 4).every((o) => !o.stopped)).toBe(true);
    oscs = oscs.slice(4);
    const rel = (o: Osc) => Math.round((o.start - 100) * 1000) / 1000; // segundos desde ahora en el reloj de audio
    const before = pending().filter((o) => rel(o) < 90);
    expect(before.map(rel)).toEqual([80, 81, 82, 83, 84, 85, 86, 87, 88, 89]);
    expect(before.slice(0, 7).every((o) => o.hz === 880)).toBe(true);
    expect(before.slice(7).every((o) => o.hz === 1175)).toBe(true); // los últimos 3, más agudos
    const after = pending().filter((o) => rel(o) >= 90);
    expect(after.slice(0, 6).map(rel)).toEqual([90, 90.19, 90.38, 93, 93.19, 93.38]); // tres notas, cada 3 s
    expect(Math.max(...after.map(rel))).toBeLessThanOrEqual(90 + 300 + 1); // tope de 5 minutos

    // Termina el descanso con la app a la vista: sigue sonando y vibra; la pantalla saca el descanso y no se calla.
    await vi.advanceTimersByTimeAsync(90_000);
    rs.releaseRestSound();
    expect(rs.restSoundSnapshot().state).toBe("ringing");
    expect(vibrate).toHaveBeenLastCalledWith([180, 90, 180]);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(rs.restSoundSnapshot().state).toBe("ringing");
    // «Arrancar serie».
    rs.ackRestSound();
    expect(rs.restSoundSnapshot().state).toBe("idle");
    expect(pending()).toEqual([]);
    const calls = vibrate.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vibrate.mock.calls.length).toBe(calls);
    expect(ctxState).toBe("suspended"); // sin nada por sonar, suelta el audio del teléfono
  });

  it("saltar el descanso o apagar la opción corta los tonos ya programados; en segundo plano no vibra", async () => {
    const rs = await import("@/lib/restSound");
    rs.setRestSound(true);
    await vi.advanceTimersByTimeAsync(2_000);
    rs.armRestSound(Date.now() + 60_000, 60);
    expect(pending().length).toBeGreaterThan(10);
    await vi.advanceTimersByTimeAsync(30_000);
    rs.releaseRestSound(); // «Saltar descanso» antes de tiempo
    expect(pending()).toEqual([]);
    expect(rs.restSoundSnapshot().state).toBe("idle");

    visibility = "hidden";
    vibrate.mockClear();
    rs.armRestSound(Date.now() + 20_000, 20);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(rs.restSoundSnapshot().state).toBe("ringing");
    expect(vibrate).not.toHaveBeenCalled();
    expect(rs.setRestSound(false)).toBe(false);
    expect(store["repi:rest-sound"]).toBeUndefined();
    expect(pending()).toEqual([]);
    expect(rs.restSoundSnapshot()).toMatchObject({ on: false, state: "idle" });
  });

  it("sin Web Audio en el navegador la opción no se ofrece ni se puede encender", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const rs = await import("@/lib/restSound");
    expect(rs.restSoundSupported()).toBe(false);
    expect(rs.setRestSound(true)).toBe(false);
    rs.armRestSound(Date.now() + 10_000, 10);
    expect(rs.restSoundSnapshot()).toMatchObject({ on: false, supported: false, state: "idle" });
  });
});
