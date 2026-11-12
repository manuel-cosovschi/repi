// Mundo de prueba compartido por las pruebas del cerebro (C1: chat, acciones, contexto y cierre). Usa los servicios reales:
// alta verificada, organización del coach, invitación aceptada (con el permiso fijo de entrenamientos), programa asignado y
// sesiones registradas con la hora que se le pasa a cada servicio. No es un archivo de prueba (no termina en .test.ts).
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { vi } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as subs from "@/server/training/substitutions";
import { handleMessage, type MessageInput } from "@/server/brain/orchestrator";

const DAY = 86_400_000;
let n = 0;

/** Persona verificada con el alta real (fecha de nacimiento dd/mm/aaaa: adulta por defecto). */
export async function verified(birth = "01/01/1990") {
  const email = `brain${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona REPI", email, password: "prueba1234", terms: true, birth });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}

/** Persona mínima (sin relación ni programa), con la fecha de nacimiento ISO que se pida (null = edad desconocida). */
export async function rawPerson(birthDate: string | null) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Persona sin programa", email: `${id}@test.repi.local`, emailVerified: true, birthDate });
  return id;
}

export type World = Awaited<ReturnType<typeof coachWorld>>;
type ExDef = { name: string; sets: number; reps: string; rir?: number | null; restSec?: number };

/**
 * Coach con un alumno y un programa de dos días. Los ejercicios son de la organización (no del catálogo global), así otras
 * pruebas no los comparten. `approved`: reemplazo aprobado por el coach (Jalón al pecho → Jalón unilateral en polea).
 */
export async function coachWorld(o: { approved?: boolean; birth?: string; days?: { name: string; exercises: ExDef[] }[] } = {}) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach REPI ${n}` });
  const user = await verified(o.birth);
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: user.email });
  const rel = await acc.acceptInvitation(user.id, inv.code, []);
  const EX: Record<string, string> = {};
  for (const [name, group] of [
    ["Jalón al pecho", "Espalda"], ["Jalón unilateral en polea", "Espalda"], ["Remo con barra", "Espalda"], ["Press banca", "Pecho"],
    ["Sentadilla", "Piernas"], ["Prensa", "Piernas"], ["Curl femoral", "Piernas"],
  ] as const) {
    const [e] = await db.insert(schema.exercise).values({ orgId: org.id, name, muscleGroup: group, kind: "load_reps" }).returning();
    EX[name] = e.id;
  }
  const days = o.days ?? [
    { name: "Espalda y pecho", exercises: [
      { name: "Jalón al pecho", sets: 3, reps: "10", rir: 2, restSec: 90 },
      { name: "Press banca", sets: 3, reps: "8-10", rir: 2, restSec: 120 },
      { name: "Remo con barra", sets: 3, reps: "10", rir: 2, restSec: 90 },
    ] },
    { name: "Piernas", exercises: [
      { name: "Sentadilla", sets: 3, reps: "6-8", rir: 2, restSec: 150 },
      { name: "Prensa", sets: 3, reps: "10", rir: 2, restSec: 90 },
    ] },
  ];
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Plan REPI", weeks: 4, note: "", days: days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => ({
    exerciseId: EX[e.name], name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? 2, restSec: e.restSec ?? 90,
  })) })) });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  // Las sesiones de prueba del pasado necesitan una asignación vigente desde antes.
  await db.update(schema.programAssignment).set({ startsOn: localDate(new Date(Date.now() - 120 * DAY)) }).where(eq(schema.programAssignment.coachClientId, rel.relationId));
  if (o.approved) await subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Jalón al pecho"], substituteExerciseId: EX["Jalón unilateral en polea"], note: "si la dorsalera está ocupada" });
  return { coach, org, user: user.id, email: user.email, relId: rel.relationId, EX };
}

async function dayIds(user: string) {
  const t = await tr.myTraining(user);
  if (t.state !== "ready" || !t.program) throw new Error("sin programa");
  return t.program.days.map((d) => d.id);
}

/** Abre el entrenamiento de hoy (día `day`) y devuelve la sesión con sus ejercicios (crea los objetivos de Training Intelligence). */
export async function startToday(user: string, day = 0, now = new Date()) {
  const ids = await dayIds(user);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: ids[day] }, now);
  const s = await tr.getSession(user, sid, now);
  const pe = Object.fromEntries(s.exercises.map((e) => [e.name, e.id])) as Record<string, string>;
  return { sid, pe, session: s };
}

/**
 * Una sesión terminada en `at` con las series dadas por nombre de ejercicio ([kg, reps, rir]). Todo con la hora indicada:
 * el servidor acota la hora del teléfono, así que se le pasa `now` a cada servicio.
 */
export async function pastSession(user: string, at: Date, sets: Record<string, [number | null, number, number | null][]>, day = 0) {
  const ids = await dayIds(user);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: ids[day], startedAt: at.toISOString() }, at);
  const s = await tr.getSession(user, sid, at);
  let k = 0;
  for (const e of s.exercises) {
    for (const [i, [w, r, rir]] of (sets[e.name] ?? []).entries()) {
      const t = new Date(at.getTime() + (++k) * 60_000);
      await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: e.id, setIndex: i, weightKg: w, reps: r, rir, at: t.toISOString() }, t);
    }
  }
  const end = new Date(at.getTime() + 60 * 60_000);
  await tr.sessionAction(user, sid, "finish", end, end.toISOString());
  return sid;
}
// Día calendario de Argentina (UTC−3): entre las 00 y las 03 UTC todavía es «ayer» en Argentina, y contar desde la fecha UTC
// corría un día los «días desde la última» (la prueba fallaba sólo en esa franja).
export const daysAgo = (d: number, hour = 18) => { const x = new Date(Date.now() - 3 * 3_600_000 - d * DAY); x.setUTCHours(hour + 3, 0, 0, 0); return x; };

/** Un mensaje a REPI como lo manda la ruta. */
export const send = (user: string, text: string, o: Omit<MessageInput, "text"> = {}) => handleMessage(user, { text, section: "workout", ...o });

/** Captura el error de una promesa (para comparar código y estado). */
export const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as { code?: string; status?: number; message?: string });

// ── IA: siempre un doble (ninguna prueba llama a OpenAI) ────────────────────
export const aiResponse = (content: unknown, status = 200) => new Response(JSON.stringify(status === 200
  ? { choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 80 } }
  : { error: { code: "x" } }), { status });
export function stubAi(impl: (body: { messages: { role: string; content: unknown }[] }) => Response | Promise<Response>) {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const f = vi.fn(async (_url: string, init: RequestInit) => impl(JSON.parse(init.body as string)));
  vi.stubGlobal("fetch", f);
  return f;
}
