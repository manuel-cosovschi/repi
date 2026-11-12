// D217 · Personalización explícita de Adaptive Coaching y Training Intelligence con el perfil de entrenamiento.
//
// No es un motor nuevo ni un porcentaje por objetivo: las cargas siguen saliendo de la doble progresión y de las protecciones
// de D182/D191 (historia comparable, rango, RIR/RPE, molestias, inactividad, saltos del equipo). El perfil sólo puede:
//   · agregar una guía de esfuerzo donde la programación no la trae (nunca reescribir la del profe),
//   · ajustar el texto y el énfasis de la propuesta al objetivo declarado,
//   · decir con qué datos se decidió y cuáles faltan (perfil completo, parcial o sin información),
//   · nunca subir una carga, inventar una con poca historia ni proponer entrenar al fallo a quien empieza.
// La matriz `PERSONALIZATION_MATRIX` documenta cada regla: dato → decisión → regla → lo que ve la persona. La usan los tests
// y la documentación (docs/producto/PERSONALIZACION.md); cambiar una regla es cambiar esta tabla.
import type { Proposal, RowTarget, Trend } from "./intelligence";
import { EXPERIENCE_LEVELS, TRAINING_WISH_GOALS, type PersonalProfile, type TrainingWishGoal } from "./wishes";

export type PersonalRule = { id: string; data: string; decision: string; rule: string; shows: string };
export const PERSONALIZATION_MATRIX: readonly PersonalRule[] = [
  { id: "P1", data: "Historial comparable (misma clase de serie, rango y etapa)", decision: "Carga y repeticiones del objetivo", rule: "Doble progresión D182 con la última sesión comparable; sin historia, ninguna carga (no se inventa)", shows: "«La última vez: …» o «Sin referencia suficiente»" },
  { id: "P2", data: "Prescripción del profe (carga, rango, RIR/RPE, método)", decision: "Manda el plan", rule: "Con carga del profe la fila es «coach»: REPI no la cambia; una diferencia material queda como revisión", shows: "«Carga indicada por tu profe» y, si corresponde, «Podría convenir revisar…»" },
  { id: "P3", data: "RIR/RPE registrado", decision: "Frenar la suba o sugerir sumar", rule: "RIR 0 o «al límite» en todas → no sube (max_effort); RIR alto sostenido → la propuesta lo menciona", shows: "Guarda de esfuerzo o «te sobraron repeticiones»" },
  { id: "P4", data: "Molestias, lesión, check-in, inactividad (con consentimiento)", decision: "Bajar o mantener", rule: "Señales de seguridad D182; nunca se envían a la IA sin autorización", shows: "Guarda de seguridad con su texto" },
  { id: "P5", data: "Experiencia declarada: principiante", decision: "Guía de esfuerzo cuando la rutina no la trae", rule: "Series principales sin RIR/RPE en rutinas propias o sugeridas: RIR 2 (no al fallo). Nunca toca filas del profe", shows: "«Como estás empezando, dejá unas 2 repeticiones en reserva»" },
  { id: "P6", data: "Experiencia declarada: principiante + rutina «al fallo» propia", decision: "Advertencia", rule: "No se recomienda el fallo a quien empieza; la rutina no se cambia", shows: "«Al fallo no hace falta para progresar: probá dejar 1–2 en reserva»" },
  { id: "P7", data: "Experiencia declarada: avanzada", decision: "Respeto de métodos", rule: "Top set, back-off, drop y rest-pause se comparan sólo con su misma clase (sin agregar guías)", shows: "Referencia propia de cada serie" },
  { id: "P8", data: "Objetivo declarado", decision: "Énfasis y texto de la propuesta (no la cifra)", rule: "Fuerza: carga con técnica; músculo: repeticiones en el rango; resistencia: repeticiones o tiempo; salud y hábito: constancia", shows: "Una frase sobre el objetivo y «Tuvimos en cuenta: …»" },
  { id: "P9", data: "Días por semana declarados", decision: "Meta semanal y adherencia en Progreso", rule: "Sesiones completadas vs días declarados; sin días declarados no hay porcentaje", shows: "«3 de 4 entrenamientos esta semana»" },
  { id: "P10", data: "Minutos disponibles", decision: "Tamaño de la rutina sin programa y versión corta", rule: "Cantidad de ejercicios según minutos; nunca recorta series del profe sin pedirlo", shows: "«Armada para 45 min»" },
  { id: "P11", data: "Equipamiento, preferidos y no le gustan", decision: "Alternativas y rutina sin programa", rule: "No se proponen ejercicios que no le gustan; se priorizan preferidos y equipamiento disponible", shows: "Alternativas filtradas" },
  { id: "P12", data: "Perfil incompleto o sin información", decision: "Alcance de la recomendación", rule: "Se recomienda sólo con historial y prescripción y se dice que no es personalizada; se piden los datos faltantes", shows: "«No personalizada: faltan tu objetivo y tu experiencia»" },
];

/** Qué datos de la persona influyeron (para «¿Por qué?»), en palabras. */
export type PersonalUse = { key: "goal" | "experience" | "days" | "minutes" | "equipment" | "history" | "prescription" | "effort" | "missing"; text: string };

const GOAL_EMPHASIS: Record<TrainingWishGoal, string> = {
  strength: "Para tu objetivo de ganar fuerza, lo importante es sostener la carga con buena técnica antes de sumar.",
  muscle: "Para tu objetivo de ganar músculo, primero sumá repeticiones dentro del rango y después carga.",
  endurance: "Para tu objetivo de resistencia, sumar repeticiones o tiempo con buena técnica es progreso.",
  sport: "Para tu deporte, priorizá la calidad del movimiento sobre la carga.",
  health: "Para tu objetivo de salud, la constancia vale más que una marca.",
  habit: "Para sostener el hábito, completar la sesión ya es el objetivo.",
  fat_loss: "Para tu objetivo, la constancia en el entrenamiento es lo que más suma.",
};
const BEGINNER_EFFORT = "Como estás empezando, dejá unas 2 repeticiones en reserva: no hace falta llegar al fallo para progresar.";
const BEGINNER_FAILURE = "Al fallo no hace falta para progresar: probá dejar 1 o 2 repeticiones en reserva.";

/**
 * Aplica el perfil a los objetivos ya calculados por Training Intelligence. Nunca cambia `weightKg` ni `repsTarget`, ni toca
 * filas del profe (`status: "coach"`) o sin referencia (`no_data`): sólo agrega guía de esfuerzo (P5) y advertencia (P6) en
 * rutinas propias (`coachOwned` falso), énfasis del objetivo (P8) y el motivo «perfil incompleto» (P12).
 */
export function personalizeTargets(targets: RowTarget[], p: PersonalProfile | null, o: { failure?: boolean; coachOwned?: boolean } = {}): RowTarget[] {
  if (!p) return targets;
  let emphasized = false;
  return targets.map((t) => {
    if (t.status === "coach" || t.status === "not_applicable") return t;
    const main = t.kind === "work" || t.kind === "top" || t.kind == null;
    const reasons = [...t.reasons];
    let why = t.why, rirTarget = t.rirTarget;
    if (p.status !== "complete") reasons.push("profile_incomplete");
    // P5/P6 sólo en rutinas propias o sugeridas: en un programa del profe o de la sede la guía de esfuerzo es suya.
    if (p.experience === "beginner" && main && t.stage === 0 && !o.coachOwned) {
      if (o.failure) { why = `${why} ${BEGINNER_FAILURE}`.trim(); reasons.push("profile_beginner_failure"); }
      else if (t.rirTarget == null && t.rpeTarget == null && t.status !== "no_data") { rirTarget = 2; why = `${why} ${BEGINNER_EFFORT}`.trim(); reasons.push("profile_beginner_effort"); }
    }
    if (p.goal && !emphasized && t.status === "ready" && main && t.stage === 0) {
      emphasized = true; // una sola frase por ejercicio
      why = `${why} ${GOAL_EMPHASIS[p.goal]}`.trim();
      reasons.push(`profile_goal_${p.goal}`);
    }
    return reasons.length === t.reasons.length && why === t.why ? t : { ...t, why, rirTarget, reasons };
  });
}

/**
 * La propuesta para la próxima sesión con el objetivo en cuenta (P8). Nunca cambia la cifra ni quién la aprueba: sólo el
 * texto, y un estancamiento con objetivo de fuerza sugiere revisar la progresión prevista (con el profe, si hay programa).
 */
export function personalizeProposal(pr: Proposal | null, trend: Trend, p: PersonalProfile | null): Proposal | null {
  if (!pr || !p?.goal) return pr;
  if ((trend.kind === "plateau" || trend.kind === "stable") && p.goal === "strength")
    return { ...pr, text: `${pr.text} Si tu objetivo sigue siendo ganar fuerza, podemos revisar la progresión prevista${pr.requiresCoach ? " con tu entrenador" : ""}.` };
  if ((trend.kind === "plateau" || trend.kind === "stable") && (p.goal === "health" || p.goal === "habit"))
    return { ...pr, text: `${pr.text} Para tu objetivo, sostener la constancia ya es avanzar.` };
  return pr;
}

/** Datos que realmente se usaron para una recomendación (P12: lo que falta también se dice). */
export function personalUses(p: PersonalProfile | null, o: { comparableSessions: number; coachPlan: boolean; effort: boolean }): PersonalUse[] {
  const out: PersonalUse[] = [];
  if (o.coachPlan) out.push({ key: "prescription", text: "La programación de tu entrenador" });
  out.push({ key: "history", text: o.comparableSessions ? `${o.comparableSessions} ${o.comparableSessions === 1 ? "sesión comparable" : "sesiones comparables"} de tu historial` : "Todavía sin sesiones comparables" });
  if (o.effort) out.push({ key: "effort", text: "El esfuerzo que registraste (RIR o sensación)" });
  if (p?.goal) out.push({ key: "goal", text: `Tu objetivo: ${TRAINING_WISH_GOALS[p.goal].toLowerCase()}` });
  if (p?.experience) out.push({ key: "experience", text: `Tu experiencia: ${EXPERIENCE_LEVELS[p.experience].toLowerCase()}` });
  if (p?.daysPerWeek) out.push({ key: "days", text: `${p.daysPerWeek} ${p.daysPerWeek === 1 ? "día" : "días"} por semana` });
  const missing = [!p?.goal && "tu objetivo", !p?.experience && "tu experiencia"].filter(Boolean) as string[];
  if (missing.length) out.push({ key: "missing", text: `No personalizada del todo: falta ${missing.join(" y ")}` });
  return out;
}
