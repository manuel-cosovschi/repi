// AC3 · Clasificador determinístico de intenciones. Resuelve sin modelo lo frecuente («¿qué me toca hoy?», «la máquina está
// ocupada», «me quedan 20 minutos») con una tabla de patrones sobre texto normalizado (sin tildes, voseo o tuteo, abreviaturas
// de chat). Lo que no alcanza el umbral queda `unknown` para que el servidor decida si consulta a la IA. La seguridad va
// primero; los intentos de inyección («ignorá tus reglas») nunca se convierten en una intención privilegiada.
import type { ExerciseRef, Intent, IntentName } from "./types";
import { detectSafety } from "./safety";
import { parsePreference } from "./memory";
import { editDistance, norm, NUM_WORDS } from "./util";
import { SHORT_MINUTES } from "./session";

export const INTENT_THRESHOLD = 0.5;
export type IntentCtx = {
  /** Ejercicios que la persona puede nombrar (programa, sesión, historial), para resolver nombres y alias. */
  exercises?: ExerciseRef[];
  /** Ejercicio en curso («este ejercicio», «esta máquina»). */
  current?: ExerciseRef | null;
  /** REPI hizo una pregunta de sí o no en el turno anterior. */
  awaitingYesNo?: boolean;
};

// ── Normalización de chat ──────────────────────────────────────────────────────────────────────────────────────────────
const SLANG: Record<string, string> = {
  q: "que", k: "que", xq: "por que", pq: "por que", porq: "por que", porque: "por que", porqe: "por que", porke: "por que", xque: "por que", xk: "por que", tmb: "tambien", tb: "tambien",
  x: "por", d: "de", maq: "maquina", ejer: "ejercicio", ej: "ejercicio", entrenadora: "entrenador", coach: "entrenador",
  hs: "horas", hr: "hora", hrs: "horas", mins: "minutos", min: "minutos", pf: "por favor", porfa: "por favor", porfi: "por favor",
};
/** Texto del clasificador: normalizado y con abreviaturas de chat expandidas. */
export function intentText(text: string): string {
  return norm(text).split(" ").map((w) => SLANG[w] ?? w).join(" ");
}

// ── Métodos ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const METHOD_KEYS = ["drop_set", "rest_pause", "myo_reps", "cluster", "emom", "amrap", "superset", "circuit", "top_set", "backoff", "pyramid", "reverse_pyramid", "warmup", "failure", "rir", "rpe", "tempo"] as const;
export type MethodKey = (typeof METHOD_KEYS)[number];
const METHOD_PATTERNS: [MethodKey, RegExp][] = [
  ["reverse_pyramid", /\bpiramide (invertida|inversa|descendente)\b/],
  ["pyramid", /\bpiramides?\b/],
  ["drop_set", /\bdrop ?sets?\b|\bdrops?\b|\bseries? descendentes?\b|\bdescendentes?\b/],
  ["rest_pause", /\brest ?pause\b|\brest ?pausa\b|\bdescanso pausa\b/],
  ["myo_reps", /\bmyo ?reps?\b|\bmio ?reps?\b|\bmyo\b/],
  ["cluster", /\bclusters?\b|\bclaster\b/],
  ["emom", /\bemom\b|\bcada minuto\b/],
  ["amrap", /\bamrap\b|\btodas las (repeticiones|reps) (que puedas|posibles)\b/],
  ["superset", /\bsuper ?series?\b|\bbi ?series?\b|\btri ?series?\b|\bsuper ?sets?\b/],
  ["circuit", /\bcircuitos?\b/],
  ["top_set", /\btop ?sets?\b|\bserie tope\b/],
  ["backoff", /\bback ?offs?\b/],
  ["warmup", /\b(series? de )?aproximacion(es)?\b|\bentrada en calor\b|\bwarm ?ups?\b|\bcalentamiento\b/],
  ["failure", /\bal fallo\b|\bfallo (muscular|tecnico)\b/],
  ["rir", /\brir\b|\brepeticiones en reserva\b|\breps en reserva\b/],
  ["rpe", /\brpe\b|\besfuerzo percibido\b/],
  ["tempo", /\btempo\b|\bcadencia\b/],
];
export function methodOf(text: string): MethodKey | null {
  const t = intentText(text);
  for (const [k, re] of METHOD_PATTERNS) if (re.test(t)) return k;
  return null;
}

// ── Inyección y pedidos fuera de alcance ───────────────────────────────────────────────────────────────────────────────
const INJECTION = new RegExp([
  "\\b(ignora\\w*|olvida\\w*|saltea\\w*|desobedec\\w*|anula\\w*|omiti\\w*|deja de lado)\\b.{0,40}\\b(instrucciones|reglas|indicaciones|restricciones|politicas|prompt|sistema|limites|todo lo anterior)\\b",
  "\\b(system prompt|prompt del sistema|prompt de sistema|modo (desarrollador|developer|dios|admin|administrador|sin limites)|jailbreak|dan mode)\\b",
  "\\b(actua|actuar|comportate|hace de cuenta|haz de cuenta|fingi|finge) (que sos |como si fueras |como )?(un |una |el |la )?(otro|otra|administrador|admin|desarrollador|sistema|mi entrenador|el entrenador|gerente|dueno)\\b",
  "\\bsos (ahora )?(un|una) (nuevo|nueva|otro|otra) (asistente|modelo|bot|ia)\\b",
  "\\b(revela|revelame|mostrame|decime|pasame|dame) (tus|las) (instrucciones|reglas internas|claves|credenciales)\\b",
  "\\b(dame|otorgame|activame) (acceso|permisos?|rol) (de |como )?(admin|administrador|entrenador|gerente|dueno)\\b",
].join("|"));
const OTHER_PERSON = /\b(mostra\w*|dame|pasame|deci\w*|ver|leer|quiero ver)\b.{0,30}\b(datos|informacion|memoria|historial|conversaciones?|mensajes|marcas|peso|rutina)\b.{0,12}\bde (otro|otra|otros|otras|mi companer[oa]|mi amig[oa]|un companer[oa]|una companer[oa]|otro alumno|otra alumna|otro socio|otra socia)\b/;
/** ¿El texto intenta cambiar las reglas del asistente? (Se usa también para marcar texto importado como dato sospechoso.) */
export const looksLikeInjection = (text: string) => INJECTION.test(intentText(text));

// ── Ejercicios y alias ─────────────────────────────────────────────────────────────────────────────────────────────────
const STOP = new Set(["de", "del", "con", "en", "la", "el", "los", "las", "al", "a", "y", "o", "un", "una", "para", "por", "sobre"]);
/** Grupos de nombres que en una sala argentina quieren decir lo mismo. Sólo amplían nombres reales de la lista: no crean ejercicios. */
const ALIAS_GROUPS: string[][] = [
  ["press banca", "press de banca", "press plano", "banca plana", "press banca plano", "pecho plano", "bench press", "bench", "banca"],
  ["press inclinado", "banco inclinado", "press de banca inclinado", "inclinado"],
  ["sentadilla", "sentadillas", "squat", "sentadilla libre", "sentadilla con barra"],
  ["peso muerto", "deadlift"],
  ["dominadas", "dominada", "pull up", "pull ups", "pullups", "barra fija"],
  ["jalon al pecho", "jalon", "dorsalera", "polea al pecho", "lat pulldown", "jalon dorsal", "tiron al pecho"],
  ["prensa", "leg press", "prensa 45", "prensa de piernas"],
  ["curl femoral", "camilla", "camilla femoral", "femorales", "leg curl"],
  ["extension de cuadriceps", "sillon de cuadriceps", "sillon", "silla de cuadriceps", "leg extension"],
  ["elevaciones laterales", "vuelos laterales", "laterales", "vuelos"],
  ["fondos", "dips", "fondos en paralelas"],
  ["hip thrust", "empuje de cadera", "puente de gluteo", "puente de gluteos"],
  ["estocadas", "zancadas", "bulgaras", "sentadilla bulgara", "lunges"],
  ["press militar", "press de hombros", "press hombro", "militar", "overhead press"],
  ["curl de biceps", "curl biceps", "biceps"],
  ["triceps en polea", "extension de triceps", "triceps", "pushdown"],
  ["gemelos", "pantorrillas", "elevacion de talones"],
];
const has = (hay: string, phrase: string) => phrase.length > 0 && ` ${hay} `.includes(` ${phrase} `);
const sig = (s: string) => s.split(" ").filter((w) => w && !STOP.has(w));

/**
 * Busca un ejercicio de la lista mencionado en el texto: nombre exacto, alias de sala o palabras con un error de tipeo leve.
 * Si dos ejercicios empatan, no elige (salvo que uno sea el que está en curso). Nunca devuelve algo fuera de la lista.
 */
export function resolveExercise(text: string, list: ExerciseRef[] = [], current?: ExerciseRef | null): ExerciseRef | null {
  const t = intentText(text);
  if (!t) return null;
  const tw = t.split(" ");
  type Hit = { ex: ExerciseRef; score: number };
  const hits: Hit[] = [];
  for (const ex of list) {
    const name = intentText(ex.name);
    const variants = new Set([name]);
    // Un grupo de alias se aplica si el nombre contiene su forma principal o es exactamente uno de sus alias (así «jalón» no
    // le presta los alias de «jalón al pecho» a «jalón unilateral»).
    for (const g of ALIAS_GROUPS) if (has(name, g[0]) || g.includes(name)) g.forEach((a) => variants.add(a));
    let best = 0;
    if (ex.short && has(t, intentText(ex.short))) best = 10;
    for (const v of variants) {
      if (has(t, v)) best = Math.max(best, sig(v).length + (v === name ? 0.5 : 0.25) + 1);
    }
    if (!best) {
      // Palabras del nombre con un error de tipeo leve (sólo palabras largas, para no confundir «remo» con «rema»).
      const words = sig(name);
      const tol = (w: string) => (w.length >= 8 ? 2 : w.length >= 5 ? 1 : 0);
      const ok = words.filter((w) => tw.some((x) => x === w || (tol(w) > 0 && editDistance(w, x, tol(w)) <= tol(w))));
      if (words.length && ok.length === words.length) best = ok.length;
      else if (words.length >= 2 && ok.length >= 1 && ok[0] === words[0] && ok.length / words.length >= 0.5) best = ok.length * 0.5;
    }
    if (best) hits.push({ ex, score: best });
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return null;
  const top = hits.filter((h) => h.score === hits[0].score);
  if (top.length === 1) return top[0].ex;
  return current ? (top.find((h) => h.ex.id === current.id)?.ex ?? null) : null;
}
const THIS_ONE = /\b(este|ese|esta|esa) (ejercicio|maquina|movimiento|aparato)\b|\bla (que|maquina que) (estoy|me toca|toca)\b|\bel (que|ejercicio que) (estoy|me toca|toca)\b/;

// ── Números ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Minutos dichos en el texto («20 min», «veinte minutos», «media hora», «hora y media»). `null` si no hay o están fuera de 5–180
 * (el rango de la versión corta, SHORT_MINUTES); `raw` conserva lo dicho para responder «fuera de rango». */
export function minutesOf(text: string): { minutes: number | null; raw: number | null } {
  const t = intentText(text);
  let raw: number | null = null;
  if (/\bhora y media\b/.test(t)) raw = 90;
  else if (/\btres cuartos( de hora)?\b/.test(t)) raw = 45;
  else if (/\bun cuarto de hora\b/.test(t)) raw = 15;
  else if (/\bmedia hora\b/.test(t)) raw = 30;
  else {
    const m = /\b(\d{1,5}|[a-z]+) (minutos|minuto|m)\b/.exec(t) ?? /\b(\d{1,3}|[a-z]+) (horas|hora)\b/.exec(t);
    if (m) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]] ?? null;
      if (n != null) raw = /^hora/.test(m[2]) ? n * 60 : n;
    }
  }
  return { minutes: raw != null && raw >= SHORT_MINUTES.min && raw <= SHORT_MINUTES.max ? raw : null, raw };
}
function daysOf(t: string): number | null {
  const m = /\b(\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete) (dias|dia|veces|vez)\b/.exec(t);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]];
  return n >= 1 && n <= 7 ? n : null;
}

const REP_WORDS: Record<string, number> = { una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20 };

// ── Tabla de reglas ────────────────────────────────────────────────────────────────────────────────────────────────────
type Rule = [IntentName, number, RegExp];
const RULES: Rule[] = [
  ["ask_coach", 0.95, /\b(pregunta|consulta|deci|avisa|escribi|manda|comenta|conta|cuenta)(le|selo)\b.{0,20}\b(profe|entrenador|profesor)\b|\bpreparar? (una |la )?consulta\b|\bconsulta (para|con|a) (mi |el )?(profe|entrenador)\b|\b(quiero |necesito )?hablar con (mi|el) (profe|entrenador)\b/],
  ["ask_coach", 0.75, /\b(cambia|cambiar|modifica|modificar|reescribi|rehace|rehacer|arma(me)? (una )?nueva) (mi |la |toda la |el )?(rutina|programa|plan)\b|\bsubi(me)? (todas )?las cargas\b|\bcambia(me)? (todo|todos los ejercicios)\b/],
  ["floor_help", 0.9, /\b(necesito|quiero|pedir|pedime|llama\w*) (ayuda|un profe|una profe|alguien|a alguien|al profe|un profesor|un entrenador)\b|\bque venga (un|una|el|alguien)\b|\bayuda en (la )?sala\b|\bme ayuda alguien\b|\bno se usar (esta|la) maquina\b/],
  ["floor_help", 0.55, /^(ayuda|ayudame|auxilio)$/],
  ["forget", 0.92, /\b(olvidate|olvida|olvidar|borra|borrar|elimina|eliminar|saca|sacar)\b.{0,25}\b(eso|lo que (te )?dije|esa preferencia|preferencia|lo del?|que|mi memoria|lo que recordas|lo que sabes|todo)\b|\bno (lo )?recuerdes\b|\bya no (prefiero|me molesta|quiero que recuerdes)\b/],
  ["fewer_messages", 0.85, /\bmenos (avisos|mensajes|notificaciones|recordatorios)\b|\bdeja de (mandarme|escribirme|avisarme|notificarme|molestarme)\b|\bno me (mandes|escribas|avises|notifiques) (tanto|tantos|tantas|mas)\b|\b(basta|para) (de|con) (los |las )?(avisos|mensajes|notificaciones)\b|\bme (saturas|llenas de mensajes)\b|\bsilencia(r|me)?\b/],
  ["busy_machine", 0.92, /\b(esta|estan) ocupad[oa]s?\b|\bocupad[oa]s?\b|\bme (ganaron|sacaron|robaron) (la|el) (maquina|banco|lugar|rack|barra)\b|\bhay (cola|fila|gente esperando)\b|\b(la|lo) (estan|esta) usando\b|\bno (hay|queda) (lugar|banco|maquina|barra|rack|polea) (libre|disponible)\b/],
  ["busy_machine", 0.86, /\bno (tengo|hay|tienen|encuentro) (mancuernas|barra|barras|discos|polea|banco|rack|maquina|equipo|bandas|kettlebell|pesas|pesa rusa|soga|cajon)\b|\bfalta (la|el|una|un) (barra|polea|banco|maquina|mancuerna|rack)\b|\b(esta|anda) (rota|roto|fuera de servicio)\b/],
  ["short_time", 0.92, /\bme (queda|quedan) (solo |solamente |nada mas |apenas )?(\d+|[a-z]+) (minutos|minuto|m|hora|horas)\b|\btengo (solo |solamente |nada mas |apenas )?(\d+|[a-z]+) (minutos|minuto|m)\b|\bpoco tiempo\b|\bno tengo (mucho )?tiempo\b|\b(estoy|ando|vengo) apurad[oa]\b|\bme tengo que ir\b|\bmedia hora\b|\bhora y media\b|\brapidito\b|\bcorta(r|me|la)? (la )?(sesion|rutina|entrenamiento)\b|\bversion (mas )?corta\b/],
  ["short_time", 0.7, /\b\d{1,3} (minutos|minuto)\b/],
  ["low_energy", 0.86, /\b(sin|poca|nada de|cero) (energia|pilas|fuerza)\b|\b(estoy|ando|vengo|me siento) (muy |re |medio |bastante )?(cansad[oa]|fundid[oa]|reventad[oa]|agotad[oa]|muert[oa]|destruid[oa]|floj[oa]|bajon)\b|\bdormi (poco|mal|nada|re mal|muy mal)\b|\bno (tengo|traigo) (ganas|pilas|energia)\b|\bno doy mas\b|\bsin ganas\b|\bpoca energia\b|\bestoy hecho (polvo|bolsa)\b/],
  ["set_feedback", 0.86, /\b(la|esa|esta|ultima|anterior) serie (me )?(costo|salio|fue|estuvo|quedo)\b|\bme costo (muchisimo|mucho|un monton|bastante|horrores)\b|\b(muy|re|super|demasiado) (pesad[oa]|livian[oa]|facil|dificil|exigente)\b|\bquede al limite\b|\bme sobraron\b|\bno llegue (a|al)\b|\bsalieron (todas|las \d+)\b|\bsalio (facil|bien|justo)\b/],
  ["change_exercise", 0.88, /\b(cambiar|cambio|cambia|reemplazar|reemplazo|reemplaza|sustituir|sustituyo|cambiarlo|cambiarla|reemplazarlo|reemplazarla)\b.{0,25}\b(ejercicio|maquina|por otro|por otra|este|ese|esta|esa|lo|la)\b|\b(otro|otra) (ejercicio|maquina|opcion|alternativa)\b|\balternativa\b|\bno puedo hacer (este|ese|esta|esa)\b/],
  ["why_weight", 0.92, /\bpor que (ese|este|esa|esta|tanto|tan poco|el|la|esos|estos) (peso|carga|kilos|kg|numero)\b|\bpor que me (recomendas|recomendaste|recomiendas|recomendo|sugeris|sugeriste|sugieres|pusiste|pones|marcas|marcaste|das|diste|indicas|indicaste)\b|\bde donde (sale|salio) (ese|el|este) (peso|numero|valor)\b|\bpor que (subir|bajar|mantener|bajo|subo|mantengo|no subo|no subimos|bajamos|subimos|mantenemos)\b/],
  ["last_mark", 0.9, /\b(que|cual|cuanto|cuantos kilos) (marca |peso )?(hice|levante|puse|meti|fue mi marca|era mi marca|fue)\b.{0,30}\b(ultima vez|vez pasada|otro dia|anterior|semana pasada)\b|\bultima marca\b|\bmi marca (en|de)\b|\bcuanto (levanto|levante|hago|hice) (en|de)\b|\bque hice (la ultima vez|la vez pasada)\b/],
  // D217 · Progreso: el máximo REAL (y aparte la estimación), la capacidad estimada para N repeticiones, la próxima carga de
  // trabajo (la de Training Intelligence) y cuánto falta para una carga.
  ["max_lift", 0.93, /\b(cual|cuanto) (es|fue|seria) (el |mi )?(maximo|mayor peso|peso maximo|maxima carga|mayor carga|mas pesado|record)\b|\b(el )?maximo que (levante|hice|tire|meti|movi|puse)\b|\b(mejor marca|mi record|mi mejor marca|record personal|mi pr|mi maximo)\b|\bcuanto es lo maximo\b|\blo mas pesado que (levante|hice|tire)\b/],
  ["capacity", 0.94, /\bcuanto (podria|puedo|deberia|tendria que|llegaria a|lograria) (tirar|levantar|meter|poner|hacer|cargar|mover|subir)\b.{0,40}\b(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte) (repeticiones|repeticion|reps|rep|repes)\b|\bpara (\d{1,2}|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte) (repeticiones|reps|repes)\b.{0,30}\bcuanto\b|\bcuanto (es )?(mi )?(1rm|rm|una repeticion maxima)\b/],
  ["next_target", 0.91, /\bque (me )?(recomendas|recomendarias|sugeris|aconsejas|propones) (intentar|hacer|probar|tirar|levantar|meter|poner)\b|\b(la )?proxima (vez|sesion)\b.{0,30}\b(que|cuanto) (intento|pruebo|hago|tiro|levanto|meto|pongo)\b|\bque (intento|pruebo|hago) la proxima\b|\bcuanto (tiro|levanto|meto|pongo|cargo) la proxima\b|\b(cual|que) (es )?(mi )?(proximo objetivo|proxima carga)\b/],
  ["goal_distance", 0.93, /\bcuanto (me )?(falta|faltan|queda) (para|hasta) (llegar a |levantar |tirar |hacer |meter )?(los |el )?\d{1,3}([.,]\d{1,2})? ?(kg|kilos|lb|libras)?\b/],
  ["trend", 0.88, /\bestoy (progresando|mejorando|estancad[oa]|empeorando|avanzando)\b|\bcomo (vengo|voy|ando|estoy)\b|\bprogres(o|e|ando|ar)\b|\btendencia\b|\b(en que|que) (ejercicio )?mejore\b|\bque paso con mi fuerza\b|\brespecto (de|a) hace\b|\bque (tendria|deberia|puedo) que mejorar\b|\bestancamiento\b|\bme estanque\b/],
  ["count", 0.9, /\bcuantas (veces|sesiones)\b|\bcuantos (entrenamientos|dias|entrenos)\b.{0,20}\b(entrene|fui|hice|llevo|van)\b|\bcuantos entrenamientos\b|\bcuantas veces (entrene|hice|fui)\b/],
  ["weekly_plan", 0.86, /\b(quiero|voy a|pienso|me gustaria|puedo) (entrenar|ir|venir) (\d|uno|una|dos|tres|cuatro|cinco|seis|siete) (dias|veces)\b|\b(dias|veces) (por|a la|en la) semana\b|\bplan (de la semana|semanal)\b|\besta semana\b.{0,25}\b(entrenar|entreno|dias)\b|\bcuantos dias (me toca|tengo que|deberia)\b/],
  ["body_goal", 0.88, /\b(objetivo|meta) de peso\b|\bpeso corporal\b|\b(bajar|subir|perder|ganar) (de )?peso\b|\b(adelgazar|engordar)\b|\bcuanto (baje|subi|adelgace|engorde|cambie|pese|peso yo)\b|\bmi peso( actual)?\b|\bcomo viene mi peso\b|\bbalanza\b|\bkilos de mas\b/],
  ["import_explain", 0.88, /\b(rutina|programa|plan) importad[oa]\b|\b(lo|la) que importe\b|\bimporte (una|la|mi) rutina\b|\b(explicame|entender|entiendo|explica|que significa|como funciona) (la |mi |esta |esa )?(rutina|programa)\b|\bque (falta|le falta|quedo sin completar) (en |a )?(la |mi |esta )?rutina\b|\bque se sugirio\b|\bque decia (el|la) (documento|planilla|foto|rutina)\b/],
  // D220: «cómo se hace la sentadilla», «técnica del remo», «qué músculos trabaja el hip thrust». Un método («cómo se hace un
  // drop set») gana por peso (explain_method 0,9).
  ["how_to", 0.86, /\bcomo (se hace|hago|se ejecuta|ejecuto|tengo que hacer|se realiza|realizo|es la tecnica)\b|\b(la )?tecnica (de|del|para)\b|\bque musculos? (trabaja|trabajan|usa|uso|se trabaja|se trabajan)\b|\bmostrame (como|la tecnica)\b|\bver (la )?(demostracion|ejecucion)\b/],
  ["explain_method", 0.9, /\b(que es|que son|que significa|como (funciona|se hace|hago|es)|explicame|explica|no entiendo|para que sirve|en que consiste)\b.{0,25}\b(drop ?sets?|drops?|rest ?pause|rest ?pausa|myo ?reps?|mio ?reps?|clusters?|emom|amrap|super ?series?|bi ?series?|tri ?series?|top ?sets?|back ?offs?|piramides?|circuitos?|aproximacion(es)?|al fallo|rir|rpe|tempo|cadencia|entrada en calor|calentamiento)\b/],
  ["today", 0.9, /\bque (me )?(toca|toco|tengo|hago|entreno|hay) (hoy|para hoy|ahora)\b|\bque me toca\b|\brutina de hoy\b|\b(entrenamiento|sesion) de hoy\b|\bque dia (me )?toca\b|\bque sigue\b|\bproximo ejercicio\b|\bno (vino|esta|viene) (mi |el )?(profe|entrenador)\b|\bque entreno\b|\bque hago hoy\b/],
  ["greeting", 0.6, /^(hola|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|como andas|como estas|hey|ey|hello|hi)( repi)?( que tal| como andas| como estas| como va)?$/],
  ["thanks", 0.6, /^(gracias|muchas gracias|mil gracias|gracias repi|genial gracias|joya|joya gracias|buenisimo|barbaro|de diez|perfecto gracias|ok gracias|dale gracias|genial|excelente)( repi)?$/],
];
const YES = /^(si|sip|dale|ok|okey|okay|de una|bueno|listo|obvio|claro|va|vamos|perfecto|hacelo|confirmo|confirmar|correcto|exacto|eso|por favor)(( |, ?)(si|dale|gracias|por favor|esa|ese|eso|la primera|la segunda|el primero|el segundo|hacelo|claro))*$/;
const NO = /^(no|nop|nope|para nada|mejor no|dejalo|deja|cancelar|cancela|ni ahi|negativo|todavia no|ahora no)(( |, ?)(no|gracias|por ahora|todavia|dejalo|mejor))*$/;
const CHOICE: [RegExp, number][] = [[/\b(la|el) (primera|primero|1)\b|\bopcion (1|uno)\b/, 1], [/\b(la|el) (segunda|segundo|2)\b|\bopcion (2|dos)\b/, 2]];
const EXERCISE_INTENTS: ReadonlySet<IntentName> = new Set<IntentName>(["last_mark", "why_weight", "trend", "count", "busy_machine", "change_exercise", "progress_general", "pain", "max_lift", "capacity", "next_target", "goal_distance", "how_to"]);

const WHEN = /\s+(la ultima vez|la vez pasada|el otro dia|hoy|ahora|este mes|esta semana|este ano|el mes pasado|la semana pasada)$/;
/** Lo que viene después del último «en», «de» o «del» (o artículo) de la frase («última marca en press banca» → «press banca»). */
function tailQuery(t: string): string | null {
  const s = t.replace(WHEN, "").replace(WHEN, "");
  const m = /^.*\b(?:en|de|del)\s+([a-z0-9][a-z0-9 ]{2,40})$/.exec(s) ?? /^.*\b(?:el|la|los|las)\s+([a-z0-9][a-z0-9 ]{2,40})$/.exec(s);
  if (!m) return null;
  const q = m[1].replace(/^(la|el|los|las|mi|mis)\s+/, "").trim();
  return q.length >= 3 && !/^(hoy|ahora|semana|mes|ano|vez|ultima vez|vez pasada)$/.test(q) ? q : null;
}
function periodOf(t: string): string | null {
  if (/\besta semana\b|\bla semana\b/.test(t)) return "week";
  if (/\beste mes\b|\bel mes\b|\ben el mes\b/.test(t)) return "month";
  if (/\beste ano\b|\bel ano\b/.test(t)) return "year";
  if (/\bultimos? (30|treinta) dias\b/.test(t)) return "30d";
  if (/\bhace tres meses\b|\bultimos (3|tres) meses\b/.test(t)) return "90d";
  return null;
}
function feelOf(t: string): string | null {
  if (/\b(limite|no llegue|al fallo)\b/.test(t)) return "limite";
  if (/\b(costo|pesad[oa]|dificil|exigente|horrores)\b/.test(t)) return "dificil";
  if (/\b(facil|livian[oa]|sobraron)\b/.test(t)) return "facil";
  if (/\b(bien|justo|salieron)\b/.test(t)) return "bien";
  return null;
}

/**
 * Clasifica un mensaje. Orden: seguridad (alarma o molestia), inyección o datos de otra persona (quedan `unknown` con una
 * marca), respuestas cortas de sí o no, y la tabla de reglas. Con ejercicios en `ctx`, resuelve el nombre o alias contra esa
 * lista (nunca inventa uno). `confidence` va de 0 a 1; por debajo del umbral el resultado es `unknown`.
 */
export function classify(text: string, ctx: IntentCtx = {}): Intent {
  const t = intentText(text);
  if (!t) return { name: "unknown", slots: {}, confidence: 0 };
  const safety = detectSafety(text, { exercise: ctx.current?.name ?? null });
  if (safety.level === "alarm") return { name: "alarm", slots: { matched: safety.matched ?? null }, confidence: 1 };
  if (safety.level === "pain") {
    const ex = resolveExercise(text, ctx.exercises, ctx.current) ?? (THIS_ONE.test(t) || /\bcuando hago\b/.test(t) ? ctx.current ?? null : null);
    return { name: "pain", slots: { area: safety.area ?? null, exerciseId: ex?.id ?? null, exercise: ex?.name ?? null }, confidence: 0.95 };
  }
  if (INJECTION.test(t)) return { name: "unknown", slots: { flag: "injection" }, confidence: 0 };
  if (OTHER_PERSON.test(t)) return { name: "unknown", slots: { flag: "other_person" }, confidence: 0 };

  const words = t.split(" ").length;
  if (words <= 6) {
    if (YES.test(t)) return { name: "yes", slots: { choice: CHOICE.find(([re]) => re.test(t))?.[1] ?? null }, confidence: ctx.awaitingYesNo ? 0.98 : 0.8 };
    if (NO.test(t)) return { name: "no", slots: {}, confidence: ctx.awaitingYesNo ? 0.98 : 0.8 };
  }

  let best: { name: IntentName; w: number } | null = null;
  for (const [name, w, re] of RULES) if ((!best || w > best.w) && re.test(t)) best = { name, w };
  const pref = parsePreference(text);
  if (pref && (!best || 0.87 > best.w || (best.name === "fewer_messages" && pref.key.startsWith("category_off")))) best = { name: "set_preference", w: 0.87 };
  const method = methodOf(text);
  if (!best && method && words <= 4) best = { name: "explain_method", w: 0.65 };
  if (!best) return { name: "unknown", slots: {}, confidence: 0 };

  let name = best.name;
  const slots: Intent["slots"] = {};
  let conf = best.w;
  const ex = resolveExercise(text, ctx.exercises, ctx.current) ?? (THIS_ONE.test(t) ? ctx.current ?? null : null);
  if (name === "trend" && !ex) name = "progress_general";
  if (EXERCISE_INTENTS.has(name)) {
    slots.exerciseId = ex?.id ?? null;
    slots.exercise = ex?.name ?? null;
    if (!ex) {
      const q = tailQuery(t);
      if (q && (name === "last_mark" || name === "why_weight" || name === "count" || name === "trend" || name === "max_lift" || name === "next_target" || name === "how_to")) slots.exerciseQuery = q;
    } else conf = Math.min(1, conf + 0.05);
    if ((name === "busy_machine" || name === "change_exercise" || name === "how_to") && !ex && ctx.current && !slots.exerciseQuery) { slots.exerciseId = ctx.current.id; slots.exercise = ctx.current.name; slots.assumed = 1; }
  }
  switch (name) {
    case "short_time": { const m = minutesOf(text); slots.minutes = m.minutes; if (m.raw != null && m.minutes == null) slots.outOfRange = m.raw; break; }
    case "explain_method": slots.method = method; if (!method) conf = 0.4; break;
    case "set_preference": slots.key = pref?.key ?? null; slots.value = pref ? (typeof pref.value === "object" ? JSON.stringify(pref.value) : String(pref.value)) : null; slots.text = pref?.text ?? null; break;
    // D210 (UI): «olvidate de lo del remo» → «remo» (sin «lo de»/«lo del», que no ayudan a encontrar el recuerdo).
    case "forget": { const m = /\b(?:olvidate|olvida|olvidar|borra|borrar|elimina|eliminar|saca|sacar)\s+(?:de\s+)?(?:que\s+)?(?:lo\s+del?\s+)?(.{3,80})$/.exec(t); slots.target = m ? m[1] : null; break; }
    case "busy_machine": slots.reason = /\bno (tengo|hay|tienen|encuentro)\b|\bfalta\b|\brot[oa]\b|\bfuera de servicio\b/.test(t) && !/\bocupad|\blibre\b|\bdisponible\b|\bcola\b|\bfila\b|\busando\b|\bganaron\b/.test(t) ? "no_equipment" : "busy"; break;
    case "change_exercise": slots.reason = /\bno me gusta|\bodio\b|\bno me copa/.test(t) ? "dislike" : /\bocupad/.test(t) ? "busy" : null; break;
    case "count": slots.period = periodOf(t); break;
    case "capacity": {
      if (/\b(1rm|rm|una repeticion maxima)\b/.test(t)) { slots.reps = 1; break; }
      const m = /\b(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte) (repeticiones|repeticion|reps|rep|repes)\b/.exec(t);
      slots.reps = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : REP_WORDS[m[1]] ?? null) : null;
      break;
    }
    case "goal_distance": {
      const m = /\b(\d{1,3}(?:[.,]\d{1,2})?) ?(kg|kilos|lb|libras)?\b/.exec(t.replace(/^.*?\b(?:para|hasta)\b/, ""));
      const v = m ? Number(m[1].replace(",", ".")) : null;
      slots.kg = v == null ? null : m![2] === "lb" || m![2] === "libras" ? Math.round((v / 2.20462262) * 100) / 100 : v;
      break;
    }
    case "weekly_plan": slots.days = daysOf(t); break;
    case "set_feedback": slots.feel = feelOf(t); break;
    case "today": slots.mode = /\bno (vino|esta|viene) (mi |el )?(profe|entrenador)\b/.test(t) ? "solo" : null; break;
    case "ask_coach":
      // «subime las cargas» pide un cambio de programa igual que «subí» (lo decide el entrenador, nunca REPI).
      slots.request = /\b(cambia|cambiar|modifica|modificar|reescribi|rehace|rehacer|nueva|subi(me)?|todas las cargas)\b/.test(t) && !/\b(pregunta|consulta|deci|avisa|escribi|manda)le\b/.test(t) ? "program_change" : "message";
      // Si nombra un ejercicio («preguntale a mi profe por el press banca»), la consulta o la propuesta van sobre ese.
      if (ex) { slots.exerciseId = ex.id; slots.exercise = ex.name; }
      break;
  }
  if (conf < INTENT_THRESHOLD) return { name: "unknown", slots: { guess: name }, confidence: conf };
  return { name, slots, confidence: Math.round(conf * 100) / 100 };
}
