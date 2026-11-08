// Ejercicios por tiempo (07/11/2026) · las rutas no descartan lo nuevo. Antes, zod borraba en silencio cualquier campo que no
// conocía: la actividad (cinta 10 min · 5 km/h · incl. 3) al guardar un programa, y las métricas de la serie al registrarla o
// corregirla (las rutas del historial usan `.strict()` y la rechazaban). Acá se reemplaza la lectura de la sesión y el servicio de
// cada ruta por un doble, y se comprueba lo que le llega al servicio. Base real de prueba (repi_test) sólo para el resto.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/server/training/services", async (orig) => ({ ...(await orig<typeof import("@/server/training/services")>()),
  logSet: vi.fn(async () => ({ status: "ok" })), createTemplate: vi.fn(async () => "pid"), saveProgram: vi.fn(async () => ({ ok: true })),
  startSoloRoutine: vi.fn(async () => ({ id: "s1" })), coachCreateExercise: vi.fn(async () => ({ id: "e1" })) }));
vi.mock("@/server/training/history", async (orig) => ({ ...(await orig<typeof import("@/server/training/history")>()),
  correctSet: vi.fn(async () => ({ status: "ok" })), addMissingSet: vi.fn(async () => ({ status: "ok" })) }));
vi.mock("@/server/training/own-routines", async (orig) => ({ ...(await orig<typeof import("@/server/training/own-routines")>()),
  saveOwnRoutine: vi.fn(async () => ({ id: "r1" })), saveImportedRoutines: vi.fn(async () => ({ ids: ["r1"], replay: false })), createMyExercise: vi.fn(async () => ({ id: "e2" })) }));
vi.mock("@/server/gym/services", async (orig) => ({ ...(await orig<typeof import("@/server/gym/services")>()),
  saveMemberProgram: vi.fn(async () => ({ ok: true })), gymCreateExercise: vi.fn(async () => ({ id: "e3" })) }));

import { auth } from "@/server/auth";
import { resetRateLimits } from "@/server/access/util";
import * as tr from "@/server/training/services";
import * as h from "@/server/training/history";
import * as own from "@/server/training/own-routines";
import * as gym from "@/server/gym/services";
import { POST as logSetPOST } from "@/app/api/me/sessions/[id]/sets/route";
import { POST as correctPOST } from "@/app/api/me/history/[id]/sets/[setId]/route";
import { POST as addPOST } from "@/app/api/me/history/[id]/sets/route";
import { POST as coachProgramsPOST } from "@/app/api/coach/[orgId]/programs/route";
import { PUT as coachProgramPUT } from "@/app/api/coach/[orgId]/programs/[pid]/route";
import { POST as coachLibraryPOST } from "@/app/api/coach/[orgId]/library/route";
import { POST as gymPOST } from "@/app/api/gym/[orgId]/[...path]/route";
import { POST as routinesPOST } from "@/app/api/me/routines/route";
import { POST as importSavePOST } from "@/app/api/me/routines/import/save/route";
import { POST as soloStartPOST } from "@/app/api/me/solo/routine/start/route";
import { POST as myExercisePOST } from "@/app/api/me/exercises/route";

const req = (url: string, payload: unknown, method = "POST") => new Request(`https://repiclub.com${url}`, {
  method, headers: { "content-type": "application/json", origin: "https://repiclub.com" }, body: JSON.stringify(payload),
});
const p = <T>(x: T) => ({ params: Promise.resolve(x) });
const as = (id: string) => vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id } } as never);
beforeEach(() => { vi.clearAllMocks(); resetRateLimits(); as("u1"); });

const ACT = { profile: "treadmill", speedKmh: 5, incline: 3 };
const row = { exerciseId: "ex-cinta", name: "Cinta (caminata)", sets: 1, reps: "10 min", rir: null, restSec: 0, note: null, detail: { activity: ACT } };
const DOC = { name: "Cardio", weeks: 4, note: "", days: [{ name: "Día A", exercises: [row] }] };
const firstDetail = (d: { days: { exercises: { detail?: unknown }[] }[] }) => d.days[0].exercises[0].detail as { activity?: unknown };

describe("registro y corrección de una serie con métricas", () => {
  it("registrar: las métricas llegan al servicio; sin el campo (app anterior), no llega nada; un campo desconocido no frena la sincronización", async () => {
    const set = { id: "11111111-1111-1111-1111-111111111111", programExerciseId: "pe1", setIndex: 0, weightKg: null, reps: 720, rir: null };
    expect((await logSetPOST(req("/api/me/sessions/s1/sets", { ...set, metrics: { speedKmh: 5.5, incline: 4, nuevo: 1 } }), p({ id: "s1" }))).status).toBe(200);
    expect(vi.mocked(tr.logSet).mock.calls[0][2]).toMatchObject({ reps: 720, metrics: { speedKmh: 5.5, incline: 4 } });
    expect(vi.mocked(tr.logSet).mock.calls[0][2].metrics).not.toHaveProperty("nuevo");
    await logSetPOST(req("/api/me/sessions/s1/sets", set), p({ id: "s1" }));
    expect("metrics" in vi.mocked(tr.logSet).mock.calls[1][2]).toBe(false);
    await logSetPOST(req("/api/me/sessions/s1/sets", { ...set, metrics: null }), p({ id: "s1" }));
    expect(vi.mocked(tr.logSet).mock.calls[2][2].metrics).toBeNull();
    expect((await logSetPOST(req("/api/me/sessions/s1/sets", { ...set, metrics: { speedKmh: "rápido" } }), p({ id: "s1" }))).status).toBe(400);
  });

  it("historial (rutas estrictas): corregir y agregar aceptan métricas; un campo desconocido dentro se rechaza", async () => {
    const r = await correctPOST(req("/api/me/history/s1/sets/l1", { requestId: "req-00000001", baseRevision: 1, values: { reps: 750, metrics: { speedKmh: 6, incline: 4 } } }), p({ id: "s1", setId: "l1" }));
    expect(r.status).toBe(200);
    expect(vi.mocked(h.correctSet).mock.calls[0][3]).toMatchObject({ values: { reps: 750, metrics: { speedKmh: 6, incline: 4 } } });
    expect((await correctPOST(req("/api/me/history/s1/sets/l1", { requestId: "req-00000002", baseRevision: 1, values: { metrics: { velocidad: 6 } } }), p({ id: "s1", setId: "l1" }))).status).toBe(400);
    const a = await addPOST(req("/api/me/history/s1/sets", { requestId: "req-00000003", programExerciseId: "pe1", setIndex: 1, values: { reps: 300, metrics: { level: 9 } } }), p({ id: "s1" }));
    expect(a.status).toBe(200);
    expect(vi.mocked(h.addMissingSet).mock.calls[0][2]).toMatchObject({ values: { reps: 300, metrics: { level: 9 } } });
  });
});

describe("guardar con la actividad (todas las rutas que usan DetailZ)", () => {
  it("coach: crear y editar un programa", async () => {
    as("coach");
    expect((await coachProgramsPOST(req("/api/coach/o1/programs", { doc: DOC }), p({ orgId: "o1" }))).status).toBe(200);
    expect(firstDetail(vi.mocked(tr.createTemplate).mock.calls[0][2]!).activity).toEqual(ACT);
    expect((await coachProgramPUT(req("/api/coach/o1/programs/p1", DOC, "PUT"), p({ orgId: "o1", pid: "p1" }))).status).toBe(200);
    expect(firstDetail(vi.mocked(tr.saveProgram).mock.calls[0][3]).activity).toEqual(ACT);
  });

  it("gimnasio: programa del socio", async () => {
    as("sala");
    const r = await gymPOST(req("/api/gym/o1/members/m1/program", { doc: { ...DOC, days: [{ name: "Día A", exercises: [{ ...row, note: undefined }] }] }, reason: "Inicial" }), p({ orgId: "o1", path: ["members", "m1", "program"] }));
    expect(r.status).toBe(200);
    expect(firstDetail(vi.mocked(gym.saveMemberProgram).mock.calls[0][3].doc).activity).toEqual(ACT);
  });

  it("alumno: Mis rutinas, importación revisada (con su procedencia) e inicio de la rutina sin programa", async () => {
    const ex = { exerciseId: "ex-cinta", sets: 1, reps: "10 min", weightKg: null, restSec: 0, note: null, detail: { activity: ACT } };
    expect((await routinesPOST(req("/api/me/routines", { name: "Cardio", exercises: [ex] }), {} as never)).status).toBe(200);
    expect((vi.mocked(own.saveOwnRoutine).mock.calls[0][1].exercises[0].detail as { activity?: unknown }).activity).toEqual(ACT);
    const origin = { written: "Cinta 10 min vel 5 incl 3", sets: 1, reps: "10 min", weightKg: null, perSet: null, restSec: null, rir: null, rpe: null, tempo: null, technique: null, unknown: [], completed: [], suggested: [], activity: ACT };
    const r = await importSavePOST(req("/api/me/routines/import/save", { opId: "op-12345678", source: "text", file: "text", routines: [{ name: "Importada", exercises: [ex], origin: [origin] }] }), {} as never);
    expect(r.status).toBe(200);
    const saved = vi.mocked(own.saveImportedRoutines).mock.calls[0][1].routines[0];
    expect((saved.exercises[0].detail as { activity?: unknown }).activity).toEqual(ACT);
    expect(saved.origin[0].activity).toEqual(ACT);
    const s = await soloStartPOST(req("/api/me/solo/routine/start", { id: "22222222-2222-2222-2222-222222222222", dayName: "Hoy", exercises: [{ exerciseId: "ex-cinta", sets: 1, reps: "10 min", detail: { activity: ACT } }] }), {} as never);
    expect(s.status).toBe(200);
    expect((vi.mocked(tr.startSoloRoutine).mock.calls[0][1].exercises[0].detail as { activity?: unknown }).activity).toEqual(ACT);
  });
});

describe("biblioteca: el perfil al crear un ejercicio propio", () => {
  it("coach, gimnasio y alumno mandan el perfil; sin él (app anterior), el tipo de registro como siempre", async () => {
    as("coach");
    await coachLibraryPOST(req("/api/coach/o1/library", { name: "Cinta curva", group: "Cardio", profile: "treadmill" }), p({ orgId: "o1" }));
    expect(vi.mocked(tr.coachCreateExercise).mock.calls[0][2]).toEqual({ name: "Cinta curva", group: "Cardio", profile: "treadmill" });
    await coachLibraryPOST(req("/api/coach/o1/library", { name: "Remo gorila", group: "Espalda", kind: "load_reps" }), p({ orgId: "o1" }));
    expect(vi.mocked(tr.coachCreateExercise).mock.calls[1][2]).toEqual({ name: "Remo gorila", group: "Espalda", kind: "load_reps" });
    as("sala");
    await gymPOST(req("/api/gym/o1/library", { name: "Bici de spinning", group: "Cardio", profile: "bike" }), p({ orgId: "o1", path: ["library"] }));
    expect(vi.mocked(gym.gymCreateExercise).mock.calls[0][2]).toEqual({ name: "Bici de spinning", group: "Cardio", profile: "bike" });
    as("alumna");
    await myExercisePOST(req("/api/me/exercises", { name: "Escalador", group: "Cardio", profile: "stair" }), {} as never);
    expect(vi.mocked(own.createMyExercise).mock.calls[0][1]).toEqual({ name: "Escalador", group: "Cardio", profile: "stair" });
  });
});
