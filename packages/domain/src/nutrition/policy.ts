// Políticas de Nutrition Intelligence 1.0 (D221): edad, objetivos, casos sensibles y lenguaje. REPI es una herramienta de
// registro y educación, no un servicio clínico: no diagnostica, no prescribe dietas ni suplementos y reconoce sus límites.
import type { NutritionTarget, NutritionTargets } from "./progress";

// ── Edad (D203: sin fecha de nacimiento, nunca se supone adulto) ──
export type NutritionEligibility = { ok: true } | { ok: false; reason: "minor" | "age_required" };
/**
 * Versión 1: Nutrición es sólo para adultos con fecha de nacimiento registrada. Para menores no existe todavía una política
 * validada (con el adulto responsable), así que el módulo no se ofrece; con edad desconocida se pide la fecha antes de empezar.
 */
export function nutritionEligibility(age: "adult" | "minor" | "unknown"): NutritionEligibility {
  if (age === "adult") return { ok: true };
  return { ok: false, reason: age === "minor" ? "minor" : "age_required" };
}
export const ELIGIBILITY_TEXT = {
  minor: "Nutrición todavía no está disponible para menores de 18 años. Si querés ordenar tu alimentación, consultalo con tu familia y un profesional de la salud.",
  age_required: "Para usar Nutrición necesitamos tu fecha de nacimiento: esta sección es sólo para mayores de 18 años. La cargás una vez en Perfil.",
} as const;

// ── Objetivos ──
/** Rangos aceptados para un objetivo diario. Fuera de rango se rechaza (error de tipeo o pedido que no corresponde a REPI). */
export const TARGET_LIMITS = { energyKcal: [1000, 6000], proteinG: [20, 400], carbsG: [20, 1000], fatG: [15, 400] } as const;
/** Por debajo de esta energía diaria, REPI sólo registra el objetivo si lo indicó un profesional. */
export const LOW_ENERGY_NEEDS_PRO = 1200;

export type TargetSource = "self" | "professional";
export type TargetIssue = { key: keyof NutritionTargets; code: "range" | "low_energy_needs_pro" | "mode"; message: string };

/**
 * Valida objetivos cargados por la persona (o indicados por su profesional). REPI nunca genera objetivos automáticamente:
 * no infiere requerimientos, sexo, actividad total ni déficits. Devuelve los objetivos limpios o los problemas.
 */
export function validateTargets(t: NutritionTargets, source: TargetSource): { ok: true; targets: NutritionTargets } | { ok: false; issues: TargetIssue[] } {
  const issues: TargetIssue[] = [], out: NutritionTargets = {};
  for (const k of Object.keys(TARGET_LIMITS) as (keyof NutritionTargets)[]) {
    const g = t[k] as NutritionTarget | undefined;
    if (!g) continue;
    const [lo, hi] = TARGET_LIMITS[k];
    if (!Number.isFinite(g.value) || g.value < lo || g.value > hi) { issues.push({ key: k, code: "range", message: `El objetivo tiene que estar entre ${lo} y ${hi}.` }); continue; }
    if (!["min", "approx", "max"].includes(g.mode)) { issues.push({ key: k, code: "mode", message: "Elegí si es un mínimo, un aproximado o un máximo." }); continue; }
    if (k === "energyKcal" && g.value < LOW_ENERGY_NEEDS_PRO && source !== "professional") {
      issues.push({ key: k, code: "low_energy_needs_pro", message: `Un objetivo de energía por debajo de ${LOW_ENERGY_NEEDS_PRO} kcal sólo se registra si te lo indicó un profesional de la nutrición.` });
      continue;
    }
    out[k] = { value: Math.round(g.value), mode: g.mode };
  }
  return issues.length ? { ok: false, issues } : { ok: true, targets: out };
}

// ── Casos sensibles ──
export type SensitiveKind = "eating_disorder" | "pregnancy" | "condition" | "medication" | "allergy" | "supplement" | "symptom" | "extreme_restriction";
const SENSITIVE: [SensitiveKind, RegExp][] = [
  ["eating_disorder", /\b(anorexi|bulimi|atrac[oó]n|atracones|purg|vomit|v[oó]mito|laxante|trastorno (de la )?(conducta )?alimentari|tca\b)/],
  ["extreme_restriction", /\b(dejar de comer|no comer (nada|en todo)|ayun(o|ar) (de )?\d+ d[ií]as|comer (menos de )?\d{2,3} (kcal|calor[ií]as)|bajar \d+ ?kg en (una|1|dos|2) semanas?)/],
  ["pregnancy", /\b(embaraz|lactancia|amamant|estoy dando la teta)/],
  ["condition", /\b(diabet|insulin|cel[ií]ac|hipertens|renal|ri[ñn][oó]n|h[ií]gado|colesterol|tiroid|gastritis|c[aá]ncer|anemia)/],
  ["medication", /\b(medicaci[oó]n|medicamento|pastillas?|remedio|tratamiento m[eé]dico|ozempic|semaglutid)/],
  ["allergy", /\b(alergi|al[eé]rgic|intoleran)/],
  ["supplement", /\b(suplement|creatina|quemador|anab[oó]lic|esteroid|prohormon|clembuterol|termog[eé]nic)/],
  ["symptom", /\b(deshidrat|mareo|desmay|me desmayo|palpitacion|dolor de pecho)/],
];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function sensitiveKind(text: string): SensitiveKind | null {
  const t = text.toLowerCase(), n = norm(text);
  for (const [k, re] of SENSITIVE) if (re.test(t) || re.test(n)) return k;
  return null;
}
/** Respuesta proporcionada: reconoce el límite, no diagnostica ni da números, y orienta a un profesional. */
export const SENSITIVE_REPLY: Record<SensitiveKind, string> = {
  eating_disorder: "Gracias por contarlo. Esto merece el acompañamiento de un profesional de la salud: REPI no puede orientarte sobre esto. Si lo necesitás, buscá ayuda con tu médico o un equipo de salud mental; en una urgencia, llamá al 107. Podés seguir usando REPI para entrenar y, si te sirve, dejar Nutrición de lado.",
  extreme_restriction: "REPI no acompaña restricciones de ese tipo: pueden ser riesgosas. Si querés cambiar tu alimentación, lo más seguro es hacerlo con un profesional de la nutrición.",
  pregnancy: "En el embarazo y la lactancia las necesidades cambian y conviene que las defina un profesional. REPI puede ayudarte a registrar lo que comés, pero no a fijar objetivos.",
  condition: "Con una condición de salud, la alimentación la tiene que indicar tu médico o nutricionista. REPI puede ayudarte a registrar y seguir los objetivos que te den, sin cambiarlos.",
  medication: "REPI no puede orientarte sobre medicación ni su relación con la comida. Consultalo con el profesional que te la indicó.",
  allergy: "Las alergias e intolerancias las tiene que evaluar un profesional. REPI no guarda ese dato ni puede asegurarte qué alimentos son seguros: revisá siempre la etiqueta.",
  supplement: "REPI no recomienda suplementos. Si estás pensando en tomar alguno, consultalo con un médico o nutricionista.",
  symptom: "Si tenés síntomas como mareos, desmayos o malestar, consultá a un profesional de la salud. Si es una urgencia, llamá al 107.",
};

// ── Lenguaje: sin culpa ni moral ──
/** Palabras que REPI no usa para hablar de comida (pruebas de redacción). */
export const BANNED_FOOD_WORDS = /\b(prohibid|pecado|culpa|trampa|cheat|basura|malo|mala|engorda|t[oó]xic)/i;

/** Mensaje cuando hay poco registro. Nunca afirma que la persona come poco o mal. */
export const INSUFFICIENT_DAY = "Con este registro todavía no podemos evaluar tu alimentación del día completo.";
export const PARTIAL_DAY_NOTE = "Es un día parcial: los totales muestran sólo lo que registraste, no todo lo que comiste.";
export const NOT_MEDICAL = "REPI te ayuda a registrar y entender lo que comés. No reemplaza a un nutricionista ni a un médico.";
