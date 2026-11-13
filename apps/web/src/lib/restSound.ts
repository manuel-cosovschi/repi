"use client";
// Alerta sonora del descanso (13/11/2026). Opcional y por dispositivo (apagada hasta que la persona la enciende): un tono por
// segundo en los últimos 10 s y una señal que se repite al terminar, hasta que arranca la serie o la descarta (tope: 5 min).
// La lógica (qué suena y cuándo, estados) está en @repi/domain/rest-alarm; acá, lo que depende del navegador.
//
// Cómo suena: tonos generados con Web Audio (sin archivos de sonido). Se programan TODOS de entrada en el reloj de audio, que
// no depende de los temporizadores de la página: en Android suele seguir sonando con la pantalla apagada o en otra app.
//
// Lo que la web no puede hacer (y por eso no se promete en pantalla):
// - iPhone/iPad: al bloquear la pantalla o salir de la app el sistema congela la página y corta su audio. No suena hasta
//   volver; al volver, si el descanso ya terminó, avisa enseguida. Sólo un push desde el servidor llega a un teléfono
//   bloqueado, y REPI no tiene (todavía) un planificador con precisión de segundos para mandarlo al final de cada descanso.
// - El modo silencio y el volumen del teléfono mandan: no se intenta saltearlos (en iOS se pide la sesión de audio
//   «ambient», que además no corta la música que la persona esté escuchando).
// - El audio necesita un toque previo de la persona en la página: se desbloquea al encender la opción y con cualquier toque
//   dentro del entrenamiento (completar la serie, que es lo que inicia el descanso, ya es uno).
import { RestAlarm, type RestAlarmState, type RestCue, type RestCueAt } from "@repi/domain";

const KEY = "repi:rest-sound";
type Ctor = typeof AudioContext;
const ctor = (): Ctor | null => (typeof window === "undefined" ? null : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null));

export const restSoundSupported = () => !!ctor();
export function restSoundOn(): boolean {
  try { return restSoundSupported() && localStorage.getItem(KEY) === "1"; } catch { return false; }
}

// ── Tonos ───────────────────────────────────────────────────────────────────
type Beep = { at: number; hz: number; ms: number; gain: number; wave: OscillatorType };
/** Cada aviso, como una o más notas (ms desde su inicio). El fin son tres notas ascendentes: se distingue de la cuenta regresiva sin mirar. */
const SOUND: Record<RestCue, Beep[]> = {
  tick: [{ at: 0, hz: 880, ms: 80, gain: 0.22, wave: "sine" }],
  last: [{ at: 0, hz: 1175, ms: 130, gain: 0.3, wave: "sine" }],
  end: [
    { at: 0, hz: 1568, ms: 130, gain: 0.42, wave: "triangle" },
    { at: 190, hz: 1568, ms: 130, gain: 0.42, wave: "triangle" },
    { at: 380, hz: 2093, ms: 260, gain: 0.42, wave: "triangle" },
  ],
};

let ctx: AudioContext | null = null;
type Voice = { osc: OscillatorNode; gain: GainNode };
/** Lo programado por la alerta y, aparte, la muestra («Probar el sonido»): reprogramar la alerta no corta la muestra. */
const voices: { alarm: Voice[]; preview: Voice[] } = { alarm: [], preview: [] };
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const C = ctor();
  if (!C) return null;
  try {
    // iOS 17+: «ambient» respeta el interruptor de silencio y se mezcla con la música de otra app en vez de cortarla.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) try { session.type = "ambient"; } catch { /* sin soporte */ }
    ctx = new C({ latencyHint: "interactive" });
    // Si el sistema pausó el audio (llamada, pantalla bloqueada en iOS) y lo reanuda, se reprograma con la hora real.
    ctx.onstatechange = () => { if (ctx?.state === "running") alarm?.resync(); };
  } catch { ctx = null; }
  return ctx;
}

function hush(bag: keyof typeof voices) {
  const now = ctx?.currentTime ?? 0;
  for (const v of voices[bag]) {
    try { v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(0, now); v.osc.onended = null; v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch { /* ya terminó */ }
  }
  voices[bag] = [];
}

/** Programa los tonos de `cues` en el reloj de audio (momentos en hora real) y los anota en `bag`. */
function play(cues: RestCueAt[], bag: keyof typeof voices) {
  const c = audio();
  if (!c) return;
  if (c.state !== "running") void c.resume().catch(() => {}); // sólo funciona si ya hubo un toque; si no, `unlock` lo hace después
  clearTimeout(idleTimer);
  const wall = Date.now();
  for (const cue of cues) {
    const t0 = c.currentTime + Math.max(0, cue.at - wall) / 1000;
    for (const b of SOUND[cue.cue]) {
      const start = t0 + b.at / 1000, stop = start + b.ms / 1000;
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = b.wave;
      osc.frequency.setValueAtTime(b.hz, start);
      // Entrada y salida suaves: sin «clic» al empezar ni al cortar.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(b.gain, start + 0.008);
      gain.gain.setValueAtTime(b.gain, Math.max(start + 0.008, stop - 0.03));
      gain.gain.linearRampToValueAtTime(0, stop);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(start); osc.stop(stop + 0.02);
      const voice = { osc, gain };
      osc.onended = () => { voices[bag] = voices[bag].filter((v) => v !== voice); try { osc.disconnect(); gain.disconnect(); } catch { /* */ } rest(); };
      voices[bag].push(voice);
    }
  }
}

/** Sin nada por sonar, se suelta el audio del teléfono a los 20 s (batería); el próximo toque lo reanuda. */
function rest() {
  clearTimeout(idleTimer);
  if (voices.alarm.length || voices.preview.length) return;
  idleTimer = setTimeout(() => { if (!voices.alarm.length && !voices.preview.length && ctx?.state === "running") void ctx.suspend().catch(() => {}); }, 20_000);
}

/** Reemplaza todo lo programado por la alerta (vacío = silencio). */
function schedule(cues: RestCueAt[]) {
  hush("alarm");
  if (cues.length) play(cues, "alarm");
  rest();
}

/** Vibración (Android; iOS no la ofrece a la web). El navegador sólo la permite con la página a la vista. */
function cue(k: RestCue) {
  if (typeof document === "undefined" || document.visibilityState !== "visible" || typeof navigator.vibrate !== "function") return;
  if (k === "end") navigator.vibrate([180, 90, 180]); else if (k === "last") navigator.vibrate(40);
}

// ── Estado compartido con la pantalla ───────────────────────────────────────
export type RestSoundSnapshot = { on: boolean; supported: boolean; state: RestAlarmState };
const SERVER: RestSoundSnapshot = { on: false, supported: false, state: "idle" };
let snap: RestSoundSnapshot = SERVER;
const subs = new Set<() => void>();
function emit() {
  const next: RestSoundSnapshot = { on: restSoundOn(), supported: restSoundSupported(), state: alarm?.state ?? "idle" };
  if (next.on === snap.on && next.supported === snap.supported && next.state === snap.state) return;
  snap = next;
  subs.forEach((f) => f());
}

let alarm: RestAlarm | null = null;
let wired = false;
function controller(): RestAlarm {
  alarm ??= new RestAlarm({ now: () => Date.now(), schedule, cue, state: () => emit() }, restSoundOn);
  if (!wired && typeof document !== "undefined") {
    wired = true;
    // Volver a la app (pantalla desbloqueada, otra app, otra pestaña): la página pudo estar congelada.
    const back = () => { if (document.visibilityState === "visible") alarm?.resync(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
  }
  return alarm;
}

export function subscribeRestSound(f: () => void) { subs.add(f); emit(); return () => { subs.delete(f); }; }
export const restSoundSnapshot = () => snap;
export const restSoundServerSnapshot = () => SERVER;

/** Dentro de un toque de la persona: deja el audio listo para sonar (los navegadores no permiten audio sin un gesto previo). */
export function unlockRestSound() {
  if (!restSoundOn()) return;
  const c = audio();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}

/** Enciende o apaga la alerta en este dispositivo. Al encender hace sonar una muestra (también sirve para comprobar el volumen). */
export function setRestSound(on: boolean): boolean {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento: no se puede recordar */ }
  if (on && restSoundOn()) { unlockRestSound(); previewRestSound(); } else { hush("preview"); controller().refresh(); }
  emit();
  return restSoundOn();
}

/** Muestra: el tono de los últimos segundos y la señal de fin, una vez. No pisa una alerta que ya está sonando. */
export function previewRestSound() {
  if (!restSoundOn() || controller().state === "ringing") return;
  unlockRestSound();
  hush("preview");
  const now = Date.now();
  play([{ at: now + 60, cue: "last" }, { at: now + 700, cue: "end" }], "preview");
}

/** Hay un descanso corriendo que termina en `endMs` (hora real). */
export function armRestSound(endMs: number, totalSec: number) { controller().arm(endMs, totalSec); }
/** El descanso salió de la pantalla: si terminó por su hora la alerta sigue; si se saltó o pausó, se calla. */
export function releaseRestSound() { alarm?.release(); }
/** La persona arrancó la serie o descartó el aviso. */
export function ackRestSound() { alarm?.ack(); }
