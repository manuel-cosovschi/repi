// Alerta sonora del descanso (pedido del titular, 13/11/2026): «que los últimos diez segundos haga un sonido de alerta […] y
// que siga sonando hasta que arrancás la serie, por si tenés el celular bloqueado o en otra app. […] Que tenga que
// habilitarse». Acá vive sólo la lógica, sin navegador: qué suena y cuándo, y el estado (armada → sonando → en silencio).
// El sonido real (Web Audio), la vibración y la preferencia por dispositivo están en apps/web/src/lib/restSound.ts.
//
// Reglas:
// - Es opcional: sin `enabled()` no programa nada.
// - Cuenta regresiva: un tono por segundo en los últimos 10 s (los últimos 3, más agudos). Un descanso corto (menos de 20 s:
//   pausas de rest-pause o cluster) sólo avisa los últimos 3 s; uno de menos de 6 s, nada (sería ruido continuo).
// - Al terminar: una señal que se repite (cada 3 s el primer medio minuto, después cada 10 s) hasta que la persona arranca la
//   serie o la descarta. Tope de 5 minutos: un teléfono olvidado en el bolso no suena para siempre.
// - Todo se calcula con la hora real de fin del descanso, no contando intervalos: si la app estuvo congelada (pantalla
//   bloqueada en iPhone), al volver se retoma donde corresponde y se avisa enseguida si el descanso ya terminó.

export const REST_WARN_SEC = 10;
export const REST_WARN_SHORT_SEC = 3;
/** Desde cuántos segundos de descanso se usa la cuenta regresiva completa. */
export const REST_WARN_FULL_FROM_SEC = 20;
export const REST_WARN_MIN_REST_SEC = 6;
export const REST_ALARM_FAST_EVERY_MS = 3_000;
export const REST_ALARM_FAST_FOR_MS = 30_000;
export const REST_ALARM_SLOW_EVERY_MS = 10_000;
export const REST_ALARM_MAX_MS = 5 * 60_000;

/** `tick`: cuenta regresiva · `last`: últimos 3 segundos · `end`: el descanso terminó (se repite). */
export type RestCue = "tick" | "last" | "end";
export type RestCueAt = { at: number; cue: RestCue };

/** Segundos de cuenta regresiva que corresponden a un descanso de `totalSec`. */
export function restWarnSec(totalSec: number): number {
  if (!(totalSec >= REST_WARN_MIN_REST_SEC)) return 0;
  return totalSec >= REST_WARN_FULL_FROM_SEC ? REST_WARN_SEC : REST_WARN_SHORT_SEC;
}

/**
 * Todos los avisos de un descanso que termina en `endMs`, de `fromMs` en adelante (lo que ya pasó no se toca). Momentos
 * en milisegundos de reloj real.
 */
export function restCues(endMs: number, totalSec: number, fromMs: number): RestCueAt[] {
  const out: RestCueAt[] = [];
  for (let k = restWarnSec(totalSec); k >= 1; k--) {
    const at = endMs - k * 1000;
    if (at >= fromMs) out.push({ at, cue: k <= REST_WARN_SHORT_SEC ? "last" : "tick" });
  }
  for (let off = 0; off <= REST_ALARM_MAX_MS; off += off < REST_ALARM_FAST_FOR_MS ? REST_ALARM_FAST_EVERY_MS : REST_ALARM_SLOW_EVERY_MS) {
    const at = endMs + off;
    if (at >= fromMs) out.push({ at, cue: "end" });
  }
  return out;
}

/** `idle`: nada pendiente · `armed`: hay un descanso corriendo · `ringing`: terminó y sigue avisando hasta que la persona responde. */
export type RestAlarmState = "idle" | "armed" | "ringing";

/** Lo que el controlador necesita del entorno (navegador en la app, dobles en las pruebas). */
export type RestAlarmSink = {
  now(): number;
  /** Reemplaza TODOS los sonidos programados por estos (vacío = silencio). El reloj de audio los dispara aunque la pantalla esté apagada. */
  schedule(cues: RestCueAt[]): void;
  /** Un aviso acaba de ocurrir con la app despierta (para vibrar o mostrar algo). Opcional. */
  cue?(cue: RestCue): void;
  /** Cambió el estado. */
  state?(s: RestAlarmState): void;
};

export class RestAlarm {
  private st: RestAlarmState = "idle";
  private end = 0;
  private total = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sink: RestAlarmSink, private enabled: () => boolean) {}

  get state(): RestAlarmState { return this.st; }
  /** Hora real de fin del descanso que está armado o sonando. */
  get endsAt(): number | null { return this.st === "idle" ? null : this.end; }

  /** Hay un descanso corriendo que termina en `endMs`. Volver a llamarlo con otra hora (+30 s, reanudar) lo reprograma. */
  arm(endMs: number, totalSec: number) {
    if (!this.enabled()) { this.silence(); return; }
    if (this.st === "armed" && this.end === endMs && this.total === totalSec) return;
    this.end = endMs; this.total = totalSec;
    this.set("armed");
    this.plan();
  }

  /**
   * El descanso dejó de estar en pantalla. Si terminó por su hora, la alerta sigue sonando hasta `ack()`; si se saltó o se
   * pausó antes de tiempo, se calla.
   */
  release() {
    if (this.st !== "armed") return;
    if (this.sink.now() >= this.end && this.enabled()) { this.set("ringing"); this.plan(); } else this.silence();
  }

  /** La persona arrancó la serie o descartó el aviso. */
  ack() { if (this.st !== "idle") this.silence(); }

  /** La preferencia cambió: apagada, se calla todo. */
  refresh() { if (!this.enabled()) this.silence(); }

  /**
   * La app volvió al frente (o el audio se reanudó): se reprograma con la hora real. Si el descanso terminó mientras estaba
   * congelada, avisa ya; pasado el tope, un solo aviso y queda en silencio.
   */
  resync() {
    if (this.st === "idle") return;
    if (!this.enabled()) { this.silence(); return; }
    const now = this.sink.now();
    if (now < this.end) { this.plan(); return; }
    if (now > this.end + REST_ALARM_MAX_MS) {
      this.clear();
      this.sink.schedule([{ at: now, cue: "end" }]);
      this.sink.cue?.("end");
      this.set("idle");
      return;
    }
    this.set("ringing");
    this.plan(true);
  }

  dispose() { this.silence(); }

  private set(s: RestAlarmState) { if (this.st !== s) { this.st = s; this.sink.state?.(s); } }
  private clear() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private silence() { this.clear(); this.sink.schedule([]); this.set("idle"); }

  /** Programa el sonido pendiente y el próximo paso del estado. `catchUp`: además suena ahora (volvió con el descanso vencido). */
  private plan(catchUp = false) {
    this.clear();
    const now = this.sink.now();
    const cues = restCues(this.end, this.total, now);
    this.sink.schedule(catchUp ? [{ at: now, cue: "end" }, ...cues] : cues);
    if (catchUp) this.sink.cue?.("end");
    this.next(cues);
  }

  private next(cues: RestCueAt[]) {
    const [head, ...rest] = cues;
    if (!head) { this.silence(); return; } // se cumplió el tope
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.enabled()) { this.silence(); return; }
      // Si el temporizador llegó tarde (pantalla apagada, pestaña en segundo plano), se saltean los avisos que ya pasaron.
      const now = this.sink.now();
      const due = [head, ...rest].filter((c) => c.at <= now);
      const last = due[due.length - 1] ?? head;
      if (last.cue === "end") this.set("ringing");
      this.sink.cue?.(last.cue);
      this.next(rest.filter((c) => c.at > now));
    }, Math.max(0, head.at - this.sink.now()));
  }
}
