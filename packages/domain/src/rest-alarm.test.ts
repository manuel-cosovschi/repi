import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REST_ALARM_MAX_MS, RestAlarm, restCues, restWarnSec, type RestAlarmState, type RestCue, type RestCueAt } from "./rest-alarm";

/** Doble del navegador: guarda lo programado en el «reloj de audio», los avisos en vivo y los cambios de estado. */
function world(on = true) {
  const w = {
    on,
    /** Atraso simulado: la hora real va `skew` ms por delante de los temporizadores de la página (segundo plano). */
    skew: 0,
    scheduled: [] as RestCueAt[],
    live: [] as { at: number; cue: RestCue }[],
    states: [] as RestAlarmState[],
    alarm: null as unknown as RestAlarm,
    /** Lo que el reloj de audio haría sonar entre dos momentos (segundos relativos al fin `end`). */
    audible(end: number, fromSec: number, toSec: number) { return w.scheduled.filter((c) => c.at >= end + fromSec * 1000 && c.at < end + toSec * 1000).map((c) => `${c.cue}@${(c.at - end) / 1000}`); },
  };
  w.alarm = new RestAlarm({
    now: () => Date.now() + w.skew,
    schedule: (c) => { w.scheduled = c; },
    cue: (cue) => { w.live.push({ at: Date.now() + w.skew, cue }); },
    state: (s) => { w.states.push(s); },
  }, () => w.on);
  return w;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T15:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("alerta sonora del descanso · qué suena y cuándo", () => {
  it("últimos 10 segundos: un tono por segundo, los últimos 3 distintos; después la señal de fin que se repite hasta el tope", () => {
    const end = 1_000_000;
    const cues = restCues(end, 120, end - 120_000);
    expect(cues.filter((c) => c.at < end).map((c) => `${c.cue}@${(c.at - end) / 1000}`)).toEqual(["tick@-10", "tick@-9", "tick@-8", "tick@-7", "tick@-6", "tick@-5", "tick@-4", "last@-3", "last@-2", "last@-1"]);
    const ends = cues.filter((c) => c.cue === "end").map((c) => (c.at - end) / 1000);
    expect(ends.slice(0, 13)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 40, 50]); // cada 3 s medio minuto; después cada 10 s
    expect(ends[ends.length - 1]).toBe(REST_ALARM_MAX_MS / 1000); // y se calla a los 5 minutos
    expect(ends.every((s, i) => i === 0 || s > ends[i - 1])).toBe(true);
  });

  it("descansos cortos: menos de 20 s avisa sólo los últimos 3; menos de 6 s, sólo el fin", () => {
    expect([restWarnSec(180), restWarnSec(20), restWarnSec(19), restWarnSec(6), restWarnSec(5), restWarnSec(0)]).toEqual([10, 10, 3, 3, 0, 0]);
    const end = 50_000;
    expect(restCues(end, 15, end - 15_000).filter((c) => c.at < end).map((c) => c.cue)).toEqual(["last", "last", "last"]);
    expect(restCues(end, 5, end - 5_000).filter((c) => c.at < end)).toEqual([]);
  });

  it("lo que ya pasó no se vuelve a programar (reanudar a mitad de la cuenta regresiva)", () => {
    const end = 100_000;
    expect(restCues(end, 90, end - 4_500).filter((c) => c.at < end).map((c) => (c.at - end) / 1000)).toEqual([-4, -3, -2, -1]);
    expect(restCues(end, 90, end + 7_000)[0]).toEqual({ at: end + 9_000, cue: "end" });
  });
});

describe("alerta sonora del descanso · estado", () => {
  it("es opcional: apagada no programa ni suena nada, ni al terminar el descanso", () => {
    const w = world(false);
    const end = Date.now() + 60_000;
    w.alarm.arm(end, 60);
    expect(w.alarm.state).toBe("idle");
    vi.advanceTimersByTime(70_000);
    w.alarm.release();
    expect(w.scheduled).toEqual([]);
    expect(w.live).toEqual([]);
    expect(w.alarm.state).toBe("idle");
  });

  it("encendida: cuenta regresiva en los últimos 10 s y sigue sonando hasta que la persona arranca la serie", () => {
    const w = world();
    const end = Date.now() + 60_000;
    w.alarm.arm(end, 60);
    expect(w.alarm.state).toBe("armed");
    // Todo queda programado de entrada en el reloj de audio (así suena aunque los temporizadores de la página se frenen).
    expect(w.audible(end, -60, -10)).toEqual([]);
    expect(w.audible(end, -10, 0)).toHaveLength(10);
    expect(w.audible(end, 0, 10)).toEqual(["end@0", "end@3", "end@6", "end@9"]);
    vi.advanceTimersByTime(49_999);
    expect(w.live).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(w.live).toEqual([{ at: end - 10_000, cue: "tick" }]);
    vi.advanceTimersByTime(9_999);
    expect(w.live.map((c) => c.cue)).toEqual(["tick", "tick", "tick", "tick", "tick", "tick", "tick", "last", "last", "last"]);
    expect(w.alarm.state).toBe("armed");
    vi.advanceTimersByTime(1);
    expect(w.alarm.state).toBe("ringing"); // terminó el descanso
    w.alarm.release(); // la pantalla saca el descanso al llegar a cero: la alerta NO se calla por eso
    expect(w.alarm.state).toBe("ringing");
    vi.advanceTimersByTime(45_000);
    expect(w.live.filter((c) => c.cue === "end").map((c) => (c.at - end) / 1000)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 40]);
    // Arranca la serie (o toca «Listo»): silencio inmediato, también en lo ya programado.
    w.alarm.ack();
    expect(w.alarm.state).toBe("idle");
    expect(w.scheduled).toEqual([]);
    const n = w.live.length;
    vi.advanceTimersByTime(120_000);
    expect(w.live).toHaveLength(n);
    expect(w.states).toEqual(["armed", "ringing", "idle"]);
  });

  it("si la pantalla saca el descanso antes de que el temporizador avise, igual queda sonando", () => {
    const w = world();
    const end = Date.now() + 30_000;
    w.alarm.arm(end, 30);
    vi.setSystemTime(end + 5); // el reloj llegó a cero pero el temporizador de la alerta todavía no corrió
    w.alarm.release();
    expect(w.alarm.state).toBe("ringing");
    expect(w.scheduled[0]).toEqual({ at: end + 3_000, cue: "end" });
  });

  it("saltar o pausar el descanso antes de tiempo calla todo; +30 s lo reprograma sin duplicar", () => {
    const w = world();
    const end = Date.now() + 60_000;
    w.alarm.arm(end, 60);
    vi.advanceTimersByTime(55_000); // en plena cuenta regresiva
    w.alarm.release(); // «Saltar descanso»
    expect(w.alarm.state).toBe("idle");
    expect(w.scheduled).toEqual([]);
    const n = w.live.length;
    vi.advanceTimersByTime(60_000);
    expect(w.live).toHaveLength(n);

    const w2 = world();
    const end2 = Date.now() + 60_000;
    w2.alarm.arm(end2, 60);
    vi.advanceTimersByTime(52_000);
    w2.alarm.arm(end2 + 30_000, 90); // «+30s» a 8 s del final
    expect(w2.audible(end2, -8, 20)).toEqual([]); // lo viejo ya no suena
    expect(w2.audible(end2 + 30_000, -10, 1)).toHaveLength(11);
    vi.advanceTimersByTime(38_000);
    expect(w2.alarm.state).toBe("ringing");
    expect(w2.live.filter((c) => c.cue === "end")).toHaveLength(1);
  });

  it("tope de 5 minutos: después se calla sola", () => {
    const w = world();
    const end = Date.now() + 20_000;
    w.alarm.arm(end, 20);
    vi.advanceTimersByTime(20_000 + REST_ALARM_MAX_MS - 1);
    expect(w.alarm.state).toBe("ringing");
    vi.advanceTimersByTime(1); // el último aviso, a los 5 minutos justos
    expect(w.alarm.state).toBe("idle");
    const n = w.live.length;
    vi.advanceTimersByTime(600_000);
    expect(w.live).toHaveLength(n);
    expect(w.live[n - 1]).toEqual({ at: end + REST_ALARM_MAX_MS, cue: "end" });
  });

  it("app congelada (pantalla bloqueada): al volver con el descanso vencido avisa enseguida y sigue hasta que respondan", () => {
    const w = world();
    const end = Date.now() + 90_000;
    w.alarm.arm(end, 90);
    vi.advanceTimersByTime(20_000);
    // El teléfono se bloquea: la página no corre (ni temporizadores ni audio). Vuelve 47 s después de terminado el descanso.
    vi.clearAllTimers();
    vi.setSystemTime(end + 47_000);
    w.alarm.resync();
    expect(w.alarm.state).toBe("ringing");
    expect(w.live[w.live.length - 1]).toEqual({ at: end + 47_000, cue: "end" });
    expect(w.scheduled[0]).toEqual({ at: end + 47_000, cue: "end" }); // suena ya…
    expect(w.scheduled[1]).toEqual({ at: end + 50_000, cue: "end" }); // …y retoma el ritmo
    w.alarm.ack();
    expect(w.scheduled).toEqual([]);

    // Vuelve mucho después (pasado el tope): un solo aviso y nada más.
    const w2 = world();
    const end2 = Date.now() + 30_000;
    w2.alarm.arm(end2, 30);
    vi.clearAllTimers();
    vi.setSystemTime(end2 + REST_ALARM_MAX_MS + 60_000);
    w2.alarm.resync();
    expect(w2.alarm.state).toBe("idle");
    expect(w2.scheduled).toEqual([{ at: end2 + REST_ALARM_MAX_MS + 60_000, cue: "end" }]);
    expect(w2.live.map((c) => c.cue)).toEqual(["end"]);

    // Vuelve antes de que termine: sólo se reprograma lo que falta, sin avisar.
    const w3 = world();
    const end3 = Date.now() + 60_000;
    w3.alarm.arm(end3, 60);
    vi.clearAllTimers();
    vi.setSystemTime(end3 - 4_200);
    w3.alarm.resync();
    expect(w3.alarm.state).toBe("armed");
    expect(w3.audible(end3, -10, 0)).toEqual(["tick@-4", "last@-3", "last@-2", "last@-1"]);
    expect(w3.live).toEqual([]);
  });

  it("temporizadores frenados en segundo plano: no dispara de golpe los avisos atrasados", () => {
    const w = world();
    const end = Date.now() + 15_000;
    w.alarm.arm(end, 15);
    // El navegador frena los temporizadores de la página: el primero (previsto 3 s antes del fin) corre 20 s después del fin.
    w.skew = 23_000;
    vi.advanceTimersByTime(12_000);
    expect(w.live).toEqual([{ at: end + 20_000, cue: "end" }]); // uno solo: no los tres de la cuenta regresiva más los del fin
    expect(w.alarm.state).toBe("ringing");
    expect(w.live).toHaveLength(1);
  });

  it("apagar la preferencia con la alerta sonando la calla", () => {
    const w = world();
    w.alarm.arm(Date.now() + 10_000, 10);
    vi.advanceTimersByTime(12_000);
    expect(w.alarm.state).toBe("ringing");
    w.on = false;
    w.alarm.refresh();
    expect(w.alarm.state).toBe("idle");
    expect(w.scheduled).toEqual([]);
  });
});
