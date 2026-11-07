// AC3 · Seguridad en texto libre y política por edad. Va antes que cualquier otra regla o modelo: si alguien escribe que le
// duele el pecho o que se mareó, REPI no conversa ni calcula, responde con un texto fijo. Nunca diagnostica ni asegura que
// algo es seguro. Ante la duda entre «nada» y «molestia», elige molestia (es la respuesta más prudente).
import type { AgeBand, IntentName } from "./types";
import { fold } from "./util";

export type SafetyLevel = "alarm" | "pain" | "none";
export type SafetyResult = {
  level: SafetyLevel;
  /** Respuesta fija para mostrar tal cual (sólo con alarm o pain). */
  reply?: string;
  /** Qué disparó la regla (para métricas; nunca se muestra como diagnóstico). */
  matched?: string;
  /** Zona del cuerpo mencionada, si se reconoce («hombro»). */
  area?: string | null;
};

/** Zonas reconocidas (texto normalizado → nombre para mostrar). */
export const BODY_AREAS: Record<string, string> = {
  hombro: "hombro", hombros: "hombro", rodilla: "rodilla", rodillas: "rodilla", espalda: "espalda", lumbar: "zona lumbar", lumbares: "zona lumbar",
  cintura: "cintura", cuello: "cuello", cervical: "cuello", cervicales: "cuello", codo: "codo", codos: "codo", muneca: "muñeca", munecas: "muñeca",
  tobillo: "tobillo", tobillos: "tobillo", cadera: "cadera", caderas: "cadera", pierna: "pierna", piernas: "pierna", brazo: "brazo", brazos: "brazo",
  mano: "mano", manos: "mano", pie: "pie", pies: "pie", gemelo: "gemelo", gemelos: "gemelo", pantorrilla: "gemelo", isquio: "isquiotibiales",
  isquios: "isquiotibiales", isquiotibiales: "isquiotibiales", cuadriceps: "cuádriceps", femoral: "isquiotibiales", ingle: "ingle", gluteo: "glúteo",
  gluteos: "glúteo", abdomen: "abdomen", panza: "abdomen", dedo: "dedo", dedos: "dedo", talon: "talón", antebrazo: "antebrazo", trapecio: "trapecio",
  cabeza: "cabeza", pecho: "pecho", costilla: "costillas", costillas: "costillas",
};
const AREA_RE = Object.keys(BODY_AREAS).sort((a, b) => b.length - a.length).join("|");
const ART = "(?:el |la |los |las |un |una |mi |mis |en el |en la |del |de la |de )?";
/** «mucho», «re fuerte», «un poco»… entre el verbo y la zona («me duele mucho el pecho»). */
const INT = "(?:(?:mucho|muchisimo|bastante|re|muy|super|un poco|algo|fuerte|tanto|demasiado) )*";
/** Formas de doler y parecidas, también en pasado, infinitivo y subjuntivo («me dolió», «empezó a doler», «que me duela»). */
const DOLER = "(?:duele|duelen|dolio|dolieron|dolia|dolian|duela|duelan|esta doliendo|estan doliendo|empezo a doler|empieza a doler|empezaron a doler|sigue doliendo)";

/** Señales de alarma: detener y buscar atención médica. */
const ALARM: [string, RegExp][] = [
  ["pecho", new RegExp(`\\b(?:dolor|dolores|presion|opresion|puntada|puntadas|pinchazo|ardor|molestia)\\s+(?:(?:muy|re|bastante|super)\\s+)?(?:fuerte\\s+|intens[oa]\\s+)?(?:en|de)\\s+(?:el\\s+|la\\s+|mi\\s+)?pecho\\b|\\bme\\s+(?:${DOLER}|aprieta|apreto|oprime|oprimio|quema|quemo|arde|ardio|pincha|pincho)\\s+${INT}${ART}pecho\\b|\\bdolor\\s+toracico\\b|\\bpecho\\s+(?:apretado|oprimido)\\b`)],
  ["corazon", /\b(?:me duele|dolor (?:en|de)) (?:el |mi )?corazon\b/],
  ["mareo", /\bme (?:mareo|maree|estoy mareando|siento mareado|siento mareada)\b|\bmaread[oa]s?\b|\bmareos?\b|\bse me (?:nublo|nubla) la vista\b|\bvision borrosa\b|\bveo borroso\b|\bveo (?:todo )?negro\b|\bse me va la cabeza\b/],
  ["desmayo", /\bme (?:desmaye|desmayo|voy a desmayar|estoy por desmayar|desvaneci)\b|\bcasi me desmayo\b|\bdesmayo\b|\bdesmayos\b|\bperdi el conocimiento\b|\bme baje de presion\b|\bme (?:baja|bajo) la presion\b|\bdesmayarme\b|\bme (?:estoy|voy a) desmayando\b/],
  ["palpitaciones", /\bpalpitaciones?\b|\btaquicardia\b|\barritmia\b|\bel corazon (?:me )?(?:late|va|anda|esta) (?:muy |re |super )?(?:rapido|fuerte|a mil|acelerado|raro)\b|\bcorazon (?:muy |re |super )?(?:acelerado|a mil)\b|\b(?:me )?late (?:muy |re |super )?(?:fuerte|rapido|a mil)\b/],
  ["aire", /\bme falta (?:el )?aire\b|\bfalta de aire\b|\bno puedo respirar\b|\bme ahogo\b|\bme estoy ahogando\b|\bme cuesta (?:mucho )?respirar\b|\bno me entra (?:el )?aire\b/],
  ["nauseas", /\bnauseas?\b|\bganas de vomitar\b|\bvomite\b|\bestoy por vomitar\b|\bme descompuse\b|\bme estoy descomponiendo\b|\bdescompuest[oa]\b/],
  ["golpe_cabeza", /\bme (?:golpee|pegue) (?:fuerte )?(?:en )?la cabeza\b|\bgolpe (?:fuerte )?en la cabeza\b/],
];

/** Molestia o lesión: detener el ejercicio, ofrecer registrarlo y consultar al entrenador o a un profesional. */
const PAIN: [string, RegExp][] = [
  ["lesion", /\bme (?:lesione|lastime|desgarre|torci|esguince|fisure|quebre|fracture)\b|\bme (?:trabe|doble) (?:la |el )?(?:espalda|cintura|cuello|tobillo|rodilla|muneca|dedo)\b|\bse me (?:acalambro|acalambraron) \w+|\bcalambres?\b|\blesion(?:ado|ada|es)?\b|\bdesgarro\b|\besguince\b|\bcontractura\b|\bme (?:tire|pinche) (?:un |el |la )?(?:musculo|gemelo|isquio|isquios|femoral|aductor|espalda|cuello)\b|\bse me (?:trabo|bloqueo|salio) (?:la |el )?(?:espalda|cintura|hombro|rodilla|cuello)\b|\btorcedura\b/],
  ["duele_zona", new RegExp(`\\bme (?:${DOLER}|molesta|molestan|molesto|molestaba|tira|tiran|tiro|pincha|pincho|cruje|truena|arde|ardio|quema) ${INT}${ART}(${AREA_RE})\\b`)],
  ["dolor_zona", new RegExp(`\\b(?:dolor|dolores|molestia|molestias|puntada|pinchazo|tiron) (?:fuerte |leve |raro |rara )?(?:en|de|del) ${ART}(${AREA_RE})\\b`)],
  ["duele", /\bme (?:duele|duelen|dolio|dolieron|dolia|duela|duelan)\b|\b(?:empezo|empieza|sigue) a doler\b|\bduele\b|\bdolor\b|\b(?:tengo|tenia|tuve|siento|con muchos|muchos|unos) dolores\b|\bdolorid[oa]s?\b|\bpinchazo\b|\bpuntada\b|\bme hice mal\b|\bme hace mal\b/],
  ["molestia", /\bmolestia\b|\bmolestias\b|\bme molesta (?:cuando|al|si)\b|\bsiento algo raro en\b/],
];

/** Expresiones figuradas que no son dolor físico (se descartan antes de buscar). */
const IDIOMS: RegExp[] = [
  /\bme duele (?:no |el alma\b|el bolsillo\b|la billetera\b|perder\b|tener que\b|que\b|ver\b|admitir\b|decir\b|pagar\b)[^.,;!?]*/g,
  /\b(?:es|son|fue|era|sera|un) (?:un |una )?dolor de cabeza\b/g,
  /\b(?:perdon|perdona|disculpa|disculpe|disculpas|disculpame|perdoname) (?:por )?(?:la |las )?molestias?\b/g,
  /\b(?:si )?no es (?:ninguna )?molestia\b/g,
  /\bsin dolor no hay (?:ganancia|progreso)\b/g,
  /\bno pain no gain\b/g,
];

const NEG = new Set(["no", "sin", "ni", "nunca", "jamas", "ningun", "ninguna", "nada", "tampoco", "cero", "0"]);
/** Palabras que pueden ir entre la negación y el síntoma sin cortar su alcance: «no tengo molestias», «no me siento muy mareado». */
const NEG_BRIDGE = new Set(["me", "tengo", "tenia", "tuve", "siento", "senti", "sentia", "hay", "hubo", "noto", "estoy", "ando", "quede", "de", "mas", "es", "fue", "era", "muy", "re", "tan", "super", "mucho", "algo"]);
/**
 * ¿La negación gobierna el síntoma? Inmediatamente antes («sin dolor», «no me duele») o separada por hasta tres palabras puente
 * («no tengo molestias», «no me siento muy mareado»), sin cruzar un signo. «No sé me duele el pecho» o «no aguanto me duele» no
 * niegan nada. «Nada» niega sólo como «nada de» («nada de dolor»). También «molestia cero», «dolor 0».
 */
function negated(src: string, index: number, len: number): boolean {
  const before = src.slice(Math.max(0, index - 40), index);
  const words = (before.split(/[.,;:!?]/).pop() ?? "").trim().split(/\s+/).filter(Boolean);
  for (let k = words.length - 1, bridges = 0; k >= 0; k--) {
    const w = words[k];
    if (NEG.has(w)) return w !== "nada" || words[k + 1] === "de";
    if (!NEG_BRIDGE.has(w) || ++bridges > 3) break;
  }
  return /^\s+(?:cero|0)\b/.test(src.slice(index + len, index + len + 6));
}
/** Normaliza conservando el punto como corte, para que la negación no cruce frases. */
const prep = (s: string) =>
  fold(s ?? "").replace(/[,;!?¡¿\n]/g, " . ").replace(/[^a-z0-9.:\s]/g, " ").replace(/([a-z])\1{2,}/g, "$1").replace(/\s+/g, " ").trim();

function firstHit(rules: [string, RegExp][], text: string): { tag: string; area: string | null } | null {
  for (const [tag, re] of rules) {
    const g = new RegExp(re.source, "g");
    for (let m = g.exec(text); m; m = g.exec(text)) {
      if (negated(text, m.index, m[0].length)) continue;
      const area = m.slice(1).find((x) => x && BODY_AREAS[x]) ?? text.split(" ").find((w) => BODY_AREAS[w] && w !== "pecho" && w !== "cabeza");
      return { tag, area: area ? BODY_AREAS[area] : null };
    }
  }
  return null;
}

export const SAFETY_REPLY = {
  alarm:
    "Pará ahora y no sigas entrenando. Si el síntoma es fuerte, no se va o vuelve, buscá atención médica de inmediato; si es una emergencia, llamá al 107 o al 911. Si estás en el gimnasio, avisale a alguien de la sala.",
  pain:
    "Si te duele, pará y no lo fuerces. No puedo decirte qué es ni si es seguro seguir. Si querés, lo registro como molestia (te pido confirmación) y lo consultás con tu entrenador o con un profesional de la salud.",
} as const;
const AREA_ART: Record<string, string> = { rodilla: "la", espalda: "la", "zona lumbar": "la", cintura: "la", muñeca: "la", cadera: "la", pierna: "la", mano: "la", ingle: "la", cabeza: "la", costillas: "las", isquiotibiales: "los" };
/** «el hombro», «la rodilla». */
export const areaWithArticle = (area: string) => `${AREA_ART[area] ?? "el"} ${area}`;
const painReply = (exercise?: string | null, area?: string | null) =>
  exercise
    ? `Pará con ${exercise} por hoy y no lo fuerces${area ? ` si te molesta ${areaWithArticle(area)}` : ""}. No puedo decirte qué es ni si es seguro seguir. Si querés, lo registro como molestia (te pido confirmación) y lo consultás con tu entrenador o con un profesional de la salud.`
    : SAFETY_REPLY.pain;

/**
 * Detecta señales de seguridad en texto libre (español rioplatense, con o sin tildes). `alarm`: síntomas que piden detener
 * todo y buscar atención médica; `pain`: dolor, molestia o lesión. Las expresiones figuradas («me duele no entrenar») y las
 * negaciones («ya no me duele») no cuentan. `ctx.exercise` personaliza la respuesta de molestia con el ejercicio en curso.
 */
export function detectSafety(text: string, ctx?: { exercise?: string | null }): SafetyResult {
  let t = prep(text);
  if (!t) return { level: "none" };
  const alarm = firstHit(ALARM, t);
  if (alarm) return { level: "alarm", reply: SAFETY_REPLY.alarm, matched: alarm.tag, area: alarm.area };
  for (const re of IDIOMS) t = t.replace(new RegExp(re.source, "g"), " ");
  const pain = firstHit(PAIN, t);
  if (pain) return { level: "pain", reply: painReply(ctx?.exercise ?? null, pain.area), matched: pain.tag, area: pain.area };
  return { level: "none" };
}

// ── Política por edad ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Cuerpo, peso corporal y alimentación por chat: sólo adultos (edad desconocida = no). */
export const canTalkBody = (age: AgeBand) => age === "adult";
/** Push de coaching y estimaciones pensadas para adultos: sólo adultos. */
export const canPushCoaching = (age: AgeBand) => age === "adult";
/** Intenciones que requieren ser adulto. */
const ADULT_INTENTS: ReadonlySet<IntentName> = new Set<IntentName>(["body_goal"]);
/** ¿Se puede responder esta intención a esta persona? La seguridad siempre se responde. */
export const topicAllowed = (intent: IntentName, age: AgeBand) => !ADULT_INTENTS.has(intent) || age === "adult";
/** Respuesta cuando el tema no corresponde por edad (sin explicar datos de la persona). */
export const AGE_REPLY: Record<Exclude<AgeBand, "adult">, string> = {
  minor: "De peso corporal y alimentación no hablo por acá. Si tenés dudas, consultalo con tu entrenador o con un adulto responsable.",
  unknown: "Para hablar de peso corporal necesito saber tu edad. Podés completar tu fecha de nacimiento en Perfil.",
};
