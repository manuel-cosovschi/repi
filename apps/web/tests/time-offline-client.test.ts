// Ejercicios por tiempo (07/11/2026) · teléfono sin conexión. Las métricas de una actividad (velocidad, inclinación, nivel…) viajan
// en la serie local (`m`), en el cuerpo que manda la cola y en la detección de cambios mientras viaja el pedido. Una sesión guardada
// por una versión anterior (sin `m`) sigue funcionando: se lee como «sin métricas» y no manda el campo (el servidor conserva lo
// suyo). Puro: no toca la base ni IndexedDB.
import { describe, expect, it } from "vitest";
import { fromServer, localProfile, activityDraft, type LocalSet } from "@/lib/offline/store";
import { acceptedSet, setChangedSince, setRequest } from "@/lib/offline/queue";

const CINTA = { profile: "treadmill" as const, speedKmh: 5, incline: 3 };
const srvEx = (p: Record<string, unknown>) => ({
  id: "pe", exerciseId: "x", name: "Cinta (caminata)", sets: 1, reps: "10 min", rir: null, restSec: 0, note: null, prev: null, detail: { activity: CINTA },
  defaultWeight: null, defaultReps: null, logs: [], ...p,
});
const session = (exercises: unknown[]) => fromServer({
  id: "s1", dayName: "Día A", status: "in_progress", note: "", rpe: null, sessionNote: null, startedAt: "2026-11-07T14:00:00.000Z", endedAt: null,
  activeMs: 0, lastResumedAt: "2026-11-07T14:00:00.000Z", revision: 1, exercises: exercises as never,
});

describe("sesión local de una actividad", () => {
  it("una cinta sin registrar arranca con la duración (segundos) y los valores que indicó el profe", () => {
    const s = session([srvEx({ profile: "treadmill", activity: CINTA })]);
    expect(s.exercises[0]).toMatchObject({ profile: "treadmill", activity: CINTA });
    expect(s.sets["pe:0"]).toMatchObject({ r: 600, w: 0, m: { speedKmh: 5, incline: 3 }, done: false });
    expect(localProfile(s.exercises[0])).toBe("treadmill");
  });

  it("una serie registrada trae sus métricas; una de antes (sin métricas) queda en null", () => {
    const s = session([srvEx({ profile: "treadmill", activity: CINTA, sets: 2, logs: [
      { id: "l1", setIndex: 0, weightKg: null, reps: 720, rir: null, metrics: { speedKmh: 5.5, incline: 4 }, revision: 1, completedAt: "2026-11-07T14:12:00.000Z" },
      { id: "l2", setIndex: 1, weightKg: null, reps: 600, rir: null, revision: 1, completedAt: "2026-11-07T14:24:00.000Z" }] })]);
    expect(s.sets["pe:0"]).toMatchObject({ r: 720, m: { speedKmh: 5.5, incline: 4 }, done: true });
    expect(s.sets["pe:1"]).toMatchObject({ r: 600, m: null, done: true });
  });

  it("fuerza, plancha y una cinta reemplazada no reciben valores de actividad; una sesión vieja (sin perfil) se deduce del detalle", () => {
    const s = session([
      srvEx({ id: "b", name: "Press de banca", sets: 1, reps: "8-10", detail: null, profile: "strength", activity: null, defaultReps: 8 }),
      srvEx({ id: "p", name: "Plancha", sets: 1, reps: "40 s", detail: null, profile: "hold", activity: null }),
      srvEx({ id: "c", change: { kind: "substitute", reason: "busy", substitute: { exerciseId: "bike", name: "Bicicleta fija", profile: "bike" } }, profile: "treadmill", activity: CINTA }),
    ]);
    expect(s.sets["b:0"]).toMatchObject({ r: 8 });
    expect("m" in s.sets["b:0"]).toBe(false);
    expect(s.sets["p:0"].r).toBe(0); // la plancha sigue como siempre (el cronómetro de la serie)
    expect("m" in s.sets["c:0"]).toBe(false);
    // Con reemplazo se registra con el perfil del reemplazo (la bici); sin ese dato (versión anterior), como siempre. Deshacerlo
    // sin conexión vuelve al perfil de la fila (la cinta), sin esperar al servidor.
    expect(localProfile(s.exercises[2])).toBe("bike");
    expect(localProfile({ ...s.exercises[2], change: { kind: "substitute", reason: "busy", substitute: { exerciseId: "bike", name: "Bicicleta fija" } } })).toBeNull();
    expect(localProfile({ ...s.exercises[2], change: null })).toBe("treadmill");
    expect(localProfile({ detail: { activity: CINTA } as never })).toBe("treadmill");
    expect(localProfile({ detail: null })).toBeNull();
    expect(activityDraft({ profile: "duration" })).toBeNull();
  });
});

describe("cola: cuerpo enviado y cambios mientras viaja", () => {
  const base: LocalSet = { id: "l1", w: 0, r: 720, rir: null, feel: null, note: null, done: true, revision: 0, at: "2026-11-07T14:12:00.000Z" };
  it("manda las métricas si la serie las tiene (también null); sin `m` (versión anterior) no manda el campo", () => {
    const withM = setRequest("pe", 0, { ...base, m: { speedKmh: 5.5, incline: 4 } });
    expect(withM.body).toMatchObject({ programExerciseId: "pe", setIndex: 0, reps: 720, metrics: { speedKmh: 5.5, incline: 4 } });
    expect(JSON.parse(JSON.stringify(setRequest("pe", 0, { ...base, m: null }).body)).metrics).toBeNull();
    expect("metrics" in JSON.parse(JSON.stringify(setRequest("pe", 0, base).body))).toBe(false);
  });
  it("cambiar sólo la velocidad o la inclinación mientras viajaba cuenta como cambio; el mismo valor en otro orden, no", () => {
    const { sent } = setRequest("pe", 0, { ...base, m: { speedKmh: 5.5, incline: 4 } });
    expect(setChangedSince({ ...base, m: { incline: 4, speedKmh: 5.5 } }, sent)).toBe(false);
    expect(setChangedSince({ ...base, m: { speedKmh: 5.5, incline: 5 } }, sent)).toBe(true);
    expect(setChangedSince({ ...base, r: 750, m: { speedKmh: 5.5, incline: 4 } }, sent)).toBe(true);
    const old = setRequest("pe", 0, base).sent;
    expect(setChangedSince(base, old)).toBe(false);
    expect(setChangedSince(undefined, old)).toBe(false);
  });
});

describe("cola: lo que guardó el servidor", () => {
  const base: LocalSet = { id: "l1", w: 0, r: 600, rir: null, feel: null, note: null, done: true, revision: 1, at: "2026-11-07T14:12:00.000Z" };
  it("deshecho el reemplazo, la serie hecha en la bici muestra lo que quedó guardado (nivel 8), no «6 km/h» que el servidor descartó", () => {
    // La serie se registró en la bici (nivel 8); deshecho el reemplazo el teléfono la edita como cinta y suma 6 km/h. El servidor
    // valida con el perfil del ejercicio con que se registró (la bici) y guarda sólo el nivel.
    const local: LocalSet = { ...base, m: { level: 8, speedKmh: 6 } };
    const out = acceptedSet(local, { status: "ok", id: "srv-1", revision: 2, reps: 600, metrics: { level: 8 } }, false);
    expect(out).toMatchObject({ id: "srv-1", revision: 2, m: { level: 8 }, r: 600 });
    expect(out.conflict).toBeUndefined();
    // Si la persona cambió la serie mientras viajaba el pedido, manda lo suyo (se vuelve a enviar).
    expect(acceptedSet(local, { status: "ok", id: "srv-1", revision: 2, metrics: { level: 8 } }, true).m).toEqual({ level: 8, speedKmh: 6 });
    // Fuerza o una sesión de una versión anterior (sin `m`): nada cambia, ni aparece el campo.
    const strength = acceptedSet(base, { status: "ok", id: "srv-2", revision: 3, metrics: null }, false);
    expect("m" in strength).toBe(false);
    expect(strength).toMatchObject({ id: "srv-2", revision: 3 });
    // Una respuesta sin métricas (servidor anterior) no borra las del teléfono.
    expect(acceptedSet(local, { status: "ok", id: "srv-1", revision: 2 }, false).m).toEqual({ level: 8, speedKmh: 6 });
  });
});
