// REPI Sales Intelligence 1.0 (D218) · motor de mensajes. Español argentino, breve, sin promesas: sólo menciona funciones con
// estado «disponible» del catálogo (verificado contra docs/comercial/ESTADO_Y_LIMITES.md y el código). La IA, si está
// configurada, reescribe sobre esta base y pasa por `copyGuard`; sin IA, esto es el mensaje.
import type { LeadCategory, Objection } from "./leads";

// ── Catálogo de afirmaciones ────────────────────────────────────────────────
export type ClaimStatus = "available" | "beta" | "roadmap";
export type Claim = { key: string; text: string; short?: string; status: ClaimStatus; evidence: string };
export const CLAIMS: Claim[] = [
  { key: "routines", short: "rutinas digitales", text: "rutinas digitales que arma el profe y le llegan al socio", status: "available", evidence: "Programas del coach y de sala (D65, D206)" },
  { key: "logging", short: "registro de cargas por serie", text: "registro de series, pesos y repeticiones", status: "available", evidence: "Entrenamiento: series, carga, RIR, RPE (ESTADO_Y_LIMITES)" },
  { key: "history", short: "el progreso de cada socio", text: "historial y progreso de cada socio", status: "available", evidence: "Historial y Progreso (D217)" },
  { key: "chat", short: "chat con los profes", text: "chat entre socios y entrenadores", status: "available", evidence: "Coach: chat y pedidos (ESTADO_Y_LIMITES)" },
  { key: "metrics", short: "indicadores para el dueño", text: "indicadores para el dueño y los profes", status: "available", evidence: "Gym: indicadores; Coach: rendimiento" },
  { key: "staff", short: "gestión del equipo de profes", text: "gestión de profes y alumnos con permisos por rol", status: "available", evidence: "Gym: turnos, tareas, permisos por rol/sede" },
  { key: "community", short: "desafíos con ranking", text: "comunidad y desafíos con ranking", status: "available", evidence: "Comunidad y desafíos (Gym.tsx «Ver ranking»)" },
  { key: "qr", short: "altas por QR", text: "alta de socios por QR con aprobación del gimnasio", status: "available", evidence: "Alta gym por QR (ESTADO_Y_LIMITES)" },
  { key: "ai", short: "un asistente con IA", text: "un asistente con IA que sugiere ajustes según el historial", status: "available", evidence: "Asistente REPI y Training Intelligence (D210, D217)" },
  { key: "adaptive", text: "ajustes progresivos automáticos según objetivos", status: "beta", evidence: "Adaptive Coaching 3.0 sin publicar" },
  { key: "medical", text: "gestión de aptos médicos", status: "roadmap", evidence: "Sin tabla ni pantalla en el código" },
  { key: "billing", text: "cobro de cuotas a los socios", status: "roadmap", evidence: "ESTADO_Y_LIMITES: no comprometer" },
  { key: "body", text: "Repi Body Intelligence (análisis corporal)", status: "roadmap", evidence: "Flag `body` apagado (BI-1)" },
];
const claim = (k: string) => { const c = CLAIMS.find((x) => x.key === k && x.status === "available"); return c ? c.short ?? c.text : null; };
/** «a», «a y b», «a, b y c». */
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`;

// ── Segmentos y argumentos ──────────────────────────────────────────────────
export type Segment = "large" | "small" | "premium" | "chain" | "personal" | "functional" | "general";
export const SEGMENT_LABEL: Record<Segment, string> = { large: "Gimnasio grande", small: "Gimnasio chico", premium: "Premium", chain: "Cadena", personal: "Entrenamiento personalizado", functional: "Funcional / CrossFit", general: "General" };
export function segmentOf(l: { category: LeadCategory; estMembers: number | null; branches: number | null }): Segment {
  if ((l.branches ?? 0) > 1 || l.category === "chain") return "chain";
  if (l.category === "premium") return "premium";
  if (l.category === "personal_training") return "personal";
  if (l.category === "functional" || l.category === "crossfit") return "functional";
  if (l.estMembers != null) return l.estMembers >= 300 ? "large" : l.estMembers < 150 ? "small" : "general";
  if (l.category === "neighborhood") return "small";
  return "general";
}
/** Uno o dos argumentos por segmento: beneficio para el dueño + función disponible que lo respalda. */
const ARGS: Record<Segment, { benefit: string; claims: string[] }[]> = {
  large: [{ benefit: "seguir a cada socio aunque sean muchos", claims: ["history", "metrics"] }, { benefit: "que los profes no pierdan tiempo armando planillas", claims: ["routines", "staff"] }],
  small: [{ benefit: "dar un servicio más profesional sin sumar trabajo", claims: ["routines", "logging"] }, { benefit: "un costo bajo por socio que se puede sumar a la cuota", claims: ["routines"] }],
  premium: [{ benefit: "una experiencia más cuidada para cada socio", claims: ["history", "chat"] }, { benefit: "diferenciarse con tecnología propia del gimnasio", claims: ["ai", "community"] }],
  chain: [{ benefit: "trabajar igual en todas las sedes y comparar resultados", claims: ["staff", "metrics"] }, { benefit: "ver lo que pasa en cada sede desde un solo lugar", claims: ["metrics", "history"] }],
  personal: [{ benefit: "seguir de cerca a cada alumno entre sesión y sesión", claims: ["history", "chat"] }, { benefit: "personalizar sin pasar horas en planillas", claims: ["routines", "ai"] }],
  functional: [{ benefit: "que cada alumno vea su progreso y se enganche", claims: ["logging", "community"] }, { benefit: "ordenar las rutinas y las cargas de cada uno", claims: ["routines", "history"] }],
  general: [{ benefit: "profesionalizar el seguimiento de los socios", claims: ["routines", "history"] }, { benefit: "darle a los profes mejores herramientas", claims: ["routines", "chat"] }],
};

// ── Variantes ───────────────────────────────────────────────────────────────
export const VARIANTS = ["first_contact", "owner_known", "email", "instagram", "reply_interest", "presentation", "pricing", "demo", "followup_1", "followup_2", "objection", "decline", "reactivation"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_LABEL: Record<Variant, string> = {
  first_contact: "Primer contacto", owner_known: "Dueño identificado", email: "Email", instagram: "Instagram", reply_interest: "Respuesta a interés",
  presentation: "Envío de presentación", pricing: "Consulta de precios", demo: "Pedido de demo", followup_1: "Seguimiento 1", followup_2: "Seguimiento 2",
  objection: "Objeción", decline: "Rechazo amable", reactivation: "Reactivación",
};
export type CopyContext = {
  leadId: string; name: string; city: string | null; category: LeadCategory; estMembers: number | null; branches: number | null;
  contactName: string | null; positioning: string | null;
  sender: { name: string; company: string; product: string; site: string };
  /** Prueba social autorizada por el titular (texto exacto). Vacío = no se menciona a ningún cliente. */
  socialProof: string | null;
  presentationUrl: string | null; demoUrl: string | null;
  objection?: Objection | null;
};
export type Draft = { variant: Variant; segment: Segment; subject: string | null; body: string; arguments: string[]; claims: string[] };

// Pequeño PRNG determinístico: el mismo lead recibe siempre la misma redacción; leads distintos, redacciones distintas.
function seeded(seed: string) { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10_000) / 10_000; }; }
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];
const first = (s: string | null) => (s ?? "").trim().split(/\s+/)[0] || null;

const HELLO = ["Hola, ¿cómo va?", "Hola, ¿qué tal?", "Hola, buenas.", "Hola, ¿cómo andan?"];
const HELLO_NAMED = (n: string) => [`Hola ${n}, ¿cómo va?`, `Hola ${n}, ¿qué tal?`, `${n}, ¿cómo andás?`];
const CTA = ["¿Te puedo compartir una presentación cortita para que veas de qué se trata?", "¿Te mando una presentación breve y lo ves cuando puedas?", "¿Te interesa que te pase un resumen corto?", "Si te sirve, te paso una presentación de 2 minutos. ¿Te la mando?"];
const CTA_DEMO = ["¿Te parece si lo vemos en una llamada de 15 minutos esta semana?", "¿Coordinamos 15 minutos para mostrártelo con tu caso?", "¿Te queda bien una demo corta? Te paso un par de horarios."];

export function compose(variant: Variant, c: CopyContext): Draft {
  const r = seeded(`${c.leadId}:${variant}`);
  const seg = segmentOf(c);
  const args = ARGS[seg];
  const a1 = pick(r, args);
  const fnText = a1.claims.map(claim).filter(Boolean) as string[];
  const who = `Soy ${first(c.sender.name) ?? c.sender.name}, de ${c.sender.company}`;
  const hello = c.contactName ? pick(r, HELLO_NAMED(first(c.contactName) as string)) : pick(r, HELLO);
  const product = `${c.sender.product}, una plataforma para gimnasios`;
  const what = fnText.length ? `que integra ${list(fnText)}` : "para digitalizar el entrenamiento";
  const why = `Creo que les puede servir para ${a1.benefit}`;
  const proof = c.socialProof?.trim() ? ` ${c.socialProof.trim()}` : "";
  const out = (body: string, subject: string | null = null): Draft => ({ variant, segment: seg, subject, body: body.replace(/[ \t]+\n/g, "\n").trim(), arguments: [a1.benefit], claims: a1.claims });
  switch (variant) {
    case "first_contact":
    case "instagram":
      return out(`${hello} ${who}. Estamos implementando ${product} ${what}.${proof}\n\n${why}. ${pick(r, CTA)}`);
    case "owner_known":
      return out(`${hello} ${who}. Te escribo a vos porque ${c.sender.product} está pensada para dueños de gimnasios: ${fnText.length ? list(fnText) : "rutinas y seguimiento"} en un mismo lugar.${proof}\n\n${why}. ${pick(r, CTA)}`);
    case "email": {
      const subject = pick(r, [`${c.sender.product} para ${c.name}`, `Una idea para ${c.name}`, `Rutinas y seguimiento para ${c.name}`]);
      return out(`${hello}\n\n${who}. Estamos implementando ${product} ${what}.${proof}\n\n${why}. El costo es mensual y se calcula por socio, así que se puede sumar a la cuota sin un aumento grande.\n\n${pick(r, CTA)}\n\nSaludos,\n${c.sender.name}\n${c.sender.company} · ${c.sender.site}`, subject);
    }
    case "reply_interest":
      return out(`¡Buenísimo! Gracias por responder. ${c.presentationUrl ? `Te dejo la presentación: ${c.presentationUrl}\n\n` : ""}${pick(r, CTA_DEMO)}`);
    case "presentation":
      return out(`${c.presentationUrl ? `Te paso la presentación: ${c.presentationUrl}` : "Te preparo la presentación y te la mando por acá."}\n\nEn corto: ${fnText.length ? list(fnText) : "rutinas, registro y seguimiento"}. ${pick(r, CTA_DEMO)}`);
    case "pricing":
      return out(`Claro. El precio es mensual y se calcula por socio: cuantos más socios, menor el valor por socio. ${c.estMembers ? `Para unos ${c.estMembers} socios te armo la cotización exacta y te la confirmo.` : "¿Cuántos socios activos tienen más o menos? Con eso te paso la cotización exacta."}`);
    case "demo":
      return out(`Genial. ${pick(r, CTA_DEMO)}${c.demoUrl ? ` Si preferís verlo antes por tu cuenta: ${c.demoUrl}` : ""}`);
    case "followup_1":
      return out(`${pick(r, ["Hola de nuevo.", "Hola, ¿cómo va?", "Hola, ¿qué tal?"])} Te escribí hace unos días por ${c.sender.product}. ${pick(r, ["¿Pudiste verlo?", "¿Te quedó alguna duda?", "¿Te sirve que te mande la presentación?"])}`);
    case "followup_2":
      return out(`Hola, último mensaje para no molestar: si en algún momento quieren ${a1.benefit}, ${c.sender.product} puede ayudar. ${pick(r, ["Quedo a disposición.", "Cualquier cosa me escribís.", "Si te interesa, respondé este mensaje y lo vemos."])}`);
    case "objection": {
      const o = c.objection ? OBJECTION_PLAYBOOK[c.objection] : null;
      return out(o ? `${o.response} ${o.next}` : "Entiendo. ¿Qué es lo que más te frena? Así veo si tiene sentido o no.");
    }
    case "decline":
      return out(`Perfecto, gracias por responder. No te escribo más. Si más adelante te interesa, quedo a disposición.`);
    case "reactivation":
      return out(`${hello} ${who}. Hablamos hace un tiempo sobre ${c.sender.product}. Sumamos mejoras y quería saber si ahora tiene sentido retomarlo. ${pick(r, CTA)}`);
  }
}

// ── Objeciones ──────────────────────────────────────────────────────────────
export const OBJECTION_PLAYBOOK: Record<Objection, { label: string; concern: string; response: string; next: string }> = {
  budget: { label: "No tenemos presupuesto", concern: "Costo fijo en un momento ajustado", response: "Entiendo. El costo es por socio y bajo: muchos gimnasios lo suman a la cuota sin que se note.", next: "¿Querés que te pase un número estimado según tus socios?" },
  other_software: { label: "Ya usamos otro software", concern: "Cambio y superposición de herramientas", response: "Bien, ya tienen algo armado. REPI se enfoca en el entrenamiento y el seguimiento del socio, no en la administración.", next: "¿Te muestro en 15 minutos en qué se diferencia para que lo compares?" },
  coaches_own: { label: "Los profes manejan sus rutinas", concern: "Autonomía de los entrenadores", response: "Justamente: cada profe arma sus rutinas como quiere, sólo que quedan digitales y el socio las tiene en el teléfono.", next: "¿Le mostramos a algún profe cómo queda?" },
  members_wont_use: { label: "Los socios no la usarían", concern: "Adopción", response: "Es una duda común. La app se usa durante el entrenamiento y se instala desde el navegador, sin tienda de apps.", next: "¿Lo probamos con un grupo chico de socios primero?" },
  expensive: { label: "Es mucha plata", concern: "Precio", response: "Te entiendo. Si lo llevamos a costo por socio, es un monto chico frente a la cuota.", next: "¿Lo calculamos con tus números?" },
  few_members: { label: "No tenemos tantos socios", concern: "Escala", response: "El precio se calcula por socio, así que se adapta al tamaño del gimnasio.", next: "¿Cuántos socios tienen hoy, más o menos?" },
  no_change: { label: "No queremos cambiar cómo trabajamos", concern: "Disrupción", response: "No hace falta cambiar la forma de trabajar: se digitaliza lo que ya hacen, a su ritmo.", next: "¿Te muestro cómo arrancaría sin tocar lo que ya funciona?" },
};

// ── Guardas de contenido ────────────────────────────────────────────────────
/**
 * Revisa un texto (propio o de la IA) antes de mostrarlo como borrador: funciones no disponibles presentadas como hechas,
 * clientes nombrados sin autorización, cifras de resultados o precios concretos sin validar, y largo excesivo.
 */
export function copyGuard(text: string, opts: { allowedNames: string[]; maxChars: number }): string[] {
  const issues: string[] = [];
  const t = text.toLowerCase();
  if (/body intelligence|an[aá]lisis corporal|escaneo corporal/.test(t)) issues.push("Menciona Body Intelligence (en desarrollo) como si estuviera disponible.");
  if (/apto(s)? m[eé]dico/.test(t)) issues.push("Menciona aptos médicos (no disponible).");
  if (/cobr(o|ar) (de )?(las )?cuotas|pasarela de pago|factura(ci[oó]n)? (electr|fiscal)/.test(t)) issues.push("Menciona cobros o facturación (no disponibles).");
  if (/\b\d{1,3}\s?%\s*(m[aá]s|menos)?\s*(de )?(retenci|adherencia|socios|ventas|ingresos)/.test(t)) issues.push("Incluye un resultado en % que no está medido.");
  if (/\$\s?\d|\bars\s?\d|\d+\s?(pesos|por socio)/.test(t)) issues.push("Incluye un precio concreto: la cotización requiere validación.");
  if (/\bsmart\b/.test(t) && !opts.allowedNames.some((n) => /smart/i.test(n))) issues.push("Nombra a un cliente sin autorización registrada.");
  if (/(garantiz|asegur)(amos|a|o) (que|resultados)|100\s?%/.test(t)) issues.push("Promete resultados.");
  if (text.length > opts.maxChars) issues.push(`Es largo (${text.length} caracteres; máximo ${opts.maxChars}).`);
  if ((text.match(/\p{Extended_Pictographic}/gu) ?? []).length > 2) issues.push("Demasiados emojis.");
  return issues;
}
/** Pie obligatorio de un email comercial: identificación del remitente y baja en un clic. */
export const emailFooter = (company: string, site: string, unsubscribeUrl: string) =>
  `\n\n—\n${company} · ${site}\nSi no querés recibir más mensajes, respondé «baja» o entrá a ${unsubscribeUrl}`;
