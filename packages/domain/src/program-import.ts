// SI2 · Smart Program Import 2.0. Motor determinístico que transcribe una rutina escrita (texto pegado, notas, WhatsApp, planillas
// convertidas a CSV) a días y ejercicios, sin inventar nada. Regla: importar es transcribir, no diseñar.
//  · Cada dato queda en uno de tres estados: leído (con el fragmento del texto como evidencia), dudoso (se marca para revisar)
//    o ausente (queda vacío y se pide completarlo). Nunca se completa con «3 × 10» por defecto.
//  · Cargas y repeticiones distintas por serie («12/10/8 con 40/45/50 kg») se conservan serie por serie.
//  · Libras a kg con la conversión exacta; lo escrito queda en la evidencia.
//  · Métodos (drop set, rest-pause, EMOM, AMRAP, superseries, circuitos) se detectan con `detectMethod`/`detectGroupWord` y se
//    aplican con las mismas reglas del constructor (method-detect.ts). Lo ambiguo se pregunta.
// Fotos, capturas y PDF los transcribe el servidor con el mismo contrato (`fromAiExercise`), y pasan por las mismas reglas.
// Ejercicios por tiempo (07/11/2026): en cardio se leen velocidad («vel 5», «5 km/h»: es velocidad, nunca una distancia),
// inclinación («incl 3», sin %), nivel, cadencia, ritmo cada 500 m y distancia del remo («Remo 500 m»), y quedan en `activity`.
import { ACTIVITY_FIELDS, PROFILE_FIELDS, activityFieldText, activityValuesText, cleanActivityValues, isActivityProfile, validateActivity,
  type ActivityDetail, type ActivityProfile, type ActivityValues } from "./activity";
import { parseCsv } from "./csv";
import { guessProfile } from "./exercise-guess";
import { detectGroupLabel, detectGroupWord, detectMethod, methodDetail, detectedLabel, type DetectedMethod } from "./method-detect";
import { emptyDetail, GROUP_LETTERS, type ExerciseDetail, type GroupKind, type SetSpec } from "./prescription";
import { LB_PER_KG } from "./units";

export type ImportField = "name" | "sets" | "reps" | "weight" | "rest" | "method" | "line";
export type ImportIssue = { field: ImportField; kind: "missing" | "unclear" | "info"; text: string };
export type ImportSetValue = { reps: string | null; weightKg: number | null };
export type ImportExercise = {
  written: string; // nombre tal como está escrito (sin la marca A1/B2)
  source: string | null; // el renglón o la fila original: evidencia para revisar
  section: string | null; // «Entrada en calor», «Bloque A»… si el día lo separa
  sets: number | null; // null = no figura
  reps: string | null; // null = no figura; con valores por serie, el resumen «12-10-8»
  weightKg: number | null;
  perSet: ImportSetValue[] | null; // sólo si el documento da valores distintos por serie
  restSec: number | null; rir: number | null; rpe: number | null; tempo: string | null;
  note: string | null; technique: string | null;
  group: string | null; // marca de combinado tal como está («A1») o asignada por un encabezado «Circuito»/«Superserie»
  groupKind: GroupKind | null; rounds: number | null;
  unit: "kg" | "lb" | null; // unidad escrita (lb se convierte a kg)
  issues: ImportIssue[];
  /** Ejercicios por tiempo: actividad leída (cinta, bici, remo…) con sus valores; la duración o la distancia quedan en `reps`. */
  activity?: ActivityDetail | null;
};
export type ImportDay = { name: string; exercises: ImportExercise[] };
export type ImportVariant = { name: string; days: ImportDay[] };
export type ImportParse = { variants: ImportVariant[]; notes: string[]; unread: string[]; stats: { lines: number; exercises: number; prescribed: number } };

export const IMPORT_LIMITS = { textChars: 400_000, days: 60, exercisesPerDay: 60, variants: 12, lines: 4000 } as const;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const clip = (s: string | null | undefined, n: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, n) || null : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
export const lbToKg = (lb: number) => round2(lb / LB_PER_KG);

// ── Números, cargas y repeticiones ──────────────────────────────────────────────────────────────────────────────────────
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const toNum = (s: string) => Number(s.replace(",", "."));
/** «20,22,24» es una lista; «22,5» es un decimal. */
function splitList(s: string): string[] {
  const t = s.trim();
  if (/^\d+(,\d+){2,}$/.test(t)) return t.split(",");
  return t.split(/\s*[/;\-–]\s*|\s+(?=\d)/).filter(Boolean);
}
const UNIT_KG = /^(kg|kgs|kilos?|kilogramos?)$/i, UNIT_LB = /^(lb|lbs|libras?)$/i;

/** «40/45/50 kg», «135 lb», «22,5kg» → valores en kg y la unidad escrita. */
function weightList(numbers: string, unit: string): { kg: number[]; unit: "kg" | "lb" } | null {
  const vals = splitList(numbers).map(toNum);
  if (!vals.length || vals.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const lb = UNIT_LB.test(unit);
  const kg = vals.map((v) => (lb ? lbToKg(v) : round2(v)));
  if (kg.some((v) => v > 500)) return null;
  return { kg, unit: lb ? "lb" : "kg" };
}

const FAIL = String.raw`al\s+fallo|fallo|failure|amrap|max(?:imo)?|máx(?:imo)?|maximas?|máximas?`;
const TIME = String.raw`\d+\s*(?:s|seg(?:undos)?|"|''|sec|min(?:utos)?|')`;
// «5 km/h» es una velocidad, no una distancia de 5 km.
const DIST = String.raw`\d+(?:[.,]\d+)?\s*(?:m|mts|metros|km)\b(?!\s*\/\s*h)`;
const REPS = String.raw`(?:${TIME}|${DIST}|${FAIL}|\d{1,3}(?:\s*[/;\-–]\s*\d{1,3})*(?:\s*\+\s*\d{1,3})?)`;

/** Repeticiones escritas → lista por serie («12/10/8») o valor común («8-12», «al fallo», «30 s»). */
function repsExpr(raw: string): { list: string[] | null; common: string | null } {
  const t = raw.trim().replace(/\s+/g, " ");
  if (new RegExp(`^(?:${FAIL})$`, "i").test(t)) return { list: null, common: /amrap/i.test(t) ? "AMRAP" : "al fallo" };
  if (new RegExp(`^(?:${TIME}|${DIST})$`, "i").test(t)) return { list: null, common: t.replace(/seg(undos)?|sec/i, "s").replace(/minutos?/i, "min").replace(/''|"/, " s").replace(/'/, " min").replace(/(\d)\s*(s|min|m|mts|km)\b/i, "$1 $2").replace(/\s+/g, " ") };
  const parts = t.split(/\s*[/;]\s*|\s*[-–]\s*/).filter(Boolean);
  if (parts.length === 1) return { list: null, common: parts[0] };
  // Dos números ascendentes con guion son un rango («8-12»); con barra o punto y coma, o tres o más, son series.
  if (parts.length === 2 && /[-–]/.test(t) && !/[/;]/.test(t) && Number(parts[0]) < Number(parts[1])) return { list: null, common: `${parts[0]}-${parts[1]}` };
  return { list: parts, common: null };
}

/** Descanso escrito → segundos («90 s», «1'30», «2 min», «1:30»). */
function restSeconds(m: RegExpExecArray): number | null {
  const a = toNum(m[1]), unit = (m[2] ?? "").toLowerCase(), extra = m[3] ? Number(m[3]) : 0;
  if (m[0].includes(":") && m[3] == null && /\d+:\d{2}/.test(m[0])) { const [mm, ss] = /(\d+):(\d{2})/.exec(m[0])!.slice(1).map(Number); return mm * 60 + ss; }
  const sec = /^(min|minutos?|m|')$/.test(unit) ? a * 60 + extra : unit ? a : a <= 5 ? a * 60 : a; // «descanso 2» = 2 min; «descanso 90» = 90 s
  return Number.isFinite(sec) && sec >= 0 && sec <= 900 ? Math.round(sec) : null;
}

// ── Limpieza de renglones (WhatsApp, viñetas, numeración, formato) ──────────────────────────────────────────────────────
const WA_PREFIX = /^\s*(?:\[\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?\]\s*[^:]{1,40}:\s*|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?\s+-\s+[^:]{1,40}:\s*)/i;
export function cleanLine(line: string): string {
  return line.replace(/^﻿/, "").replace(WA_PREFIX, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/(^|\s)[*_~]+|[*_~]+(?=\s|$|[:.,])/g, "$1") // *negrita* _cursiva_ ~tachado~ de WhatsApp o markdown
    .replace(/^\s*(?:#{1,4}\s+|[•●▪◦·→>\-–—]+\s*|\(?\d{1,2}[.)]\s+(?=\p{L}))/u, "")
    .replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

// ── Cardio: velocidad, inclinación, nivel, cadencia y ritmo ─────────────────────────────────────────────────────────────
/** Actividad que dice el nombre («Cinta», «Bici fija», «Remo ergómetro», «Elíptico», «Escaladora», «Soga»); null si no es cardio. */
export function activityGuess(name: string | null | undefined): ActivityProfile | null {
  const g = name ? guessProfile(name) : null;
  return isActivityProfile(g) ? g : null;
}
const SPEED_UNIT = /(?:\ba\s+)?(\d{1,2}(?:[.,]\d+)?)\s*(?:km\s*\/\s*h|kmh|kph|km\s+por\s+hora)(?![\p{L}])/iu;
const SPEED_WORD = /\b(?:vel(?:ocidad)?|speed)\.?\s*[:=]?\s*(\d{1,2}(?:[.,]\d+)?)(?:\s*(?:km\s*\/\s*h|kmh|kph))?/i;
const FIELD_RE: [Exclude<keyof ActivityValues, "speedKmh" | "distanceM">, RegExp][] = [
  ["incline", /\b(?:incl(?:inaci[oó]n)?|inclinada|pendiente|incline)\.?\s*[:=]?\s*(-?\d{1,2}(?:[.,]\d+)?)\s*%?/i],
  ["level", /\b(?:nivel|niv\.?|level|lvl|resistencia)\s*[:=]?\s*(\d{1,2})\b/i],
  ["cadenceRpm", /(?:\bcadencia\s*[:=]?\s*)?(\d{2,3})\s*rpm\b|\bcadencia\s*[:=]?\s*(\d{2,3})\b/i],
  ["pace500Sec", /\b(?:ritmo|pace|split)\s*[:=]?\s*(\d{1,2}):([0-5]\d)(?:\s*(?:\/|por|cada)?\s*500\s*m?\b)?|(\d{1,2}):([0-5]\d)\s*(?:\/|por|cada)\s*500\s*m?\b/i],
];
/**
 * Lee lo propio de una actividad en un texto y lo saca del texto (sus números no son series, cargas ni tempo). «km/h» siempre es
 * velocidad; con velocidad o inclinación escritas, una caminata o un trote sin máquina en el nombre se toma como cinta. Cada campo
 * se lee sólo si la actividad lo tiene (una inclinación en la bici queda en la nota).
 */
export function readActivityText(text: string, named: ActivityProfile | null): { profile: ActivityProfile | null; values: ActivityValues; rest: string } {
  let rest = ` ${text} `;
  const take = (re: RegExp) => { const m = re.exec(rest); if (m) rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length); return m; };
  let profile = named;
  const values: ActivityValues = {};
  const sp = take(SPEED_UNIT) ?? (profile ? take(SPEED_WORD) : null);
  if (sp) values.speedKmh = toNum(sp[1]);
  if (sp && (!profile || profile === "duration")) profile = "treadmill";
  if (profile === "duration" && FIELD_RE[0][1].test(rest)) profile = "treadmill"; // «Trote 20 min incl 2»: en cinta
  if (profile) {
    for (const [f, re] of FIELD_RE) {
      if (!PROFILE_FIELDS[profile].includes(f)) continue;
      const m = take(re);
      if (!m) continue;
      values[f] = f === "pace500Sec" ? Number(m[1] ?? m[3]) * 60 + Number(m[2] ?? m[4]) : f === "cadenceRpm" ? Number(m[1] ?? m[2]) : toNum(m[1]);
    }
  }
  return { profile, values, rest };
}
/**
 * Arma la actividad del ejercicio importado con lo leído: los valores fuera de rango o que la actividad no tiene quedan en la nota
 * (marcados para revisar); si lo indicado no es una duración (ni una distancia en el remo), queda como antes, sin actividad.
 */
function importActivity(e: Draft, profile: ActivityProfile, values: ActivityValues) {
  const clean: ActivityValues = {};
  const toNote: string[] = [];
  for (const f of ACTIVITY_FIELDS) {
    const v = values[f];
    if (v == null) continue;
    if (!PROFILE_FIELDS[profile].includes(f)) { toNote.push(activityFieldText(f, v)); continue; }
    const r = cleanActivityValues(profile, { [f]: v });
    if (r.ok) Object.assign(clean, r.values);
    else { toNote.push(activityFieldText(f, v)); e.issues.push({ field: "line", kind: "unclear", text: r.error }); }
  }
  const a = validateActivity({ profile, ...clean }, e.reps ? { reps: e.reps } : {});
  if (a.ok) {
    e.activity = a.activity; e.rir = null; e.weightKg = null; e.perSet = null; e.tempo = null;
  } else {
    e.activity = null;
    const txt = activityValuesText(clean);
    if (txt) toNote.unshift(txt);
    e.issues.push({ field: "reps", kind: "unclear", text: a.error });
  }
  if (toNote.length) e.note = clip([e.note, ...toNote].filter(Boolean).join(" · "), 120);
}

// ── Un ejercicio en una línea ───────────────────────────────────────────────────────────────────────────────────────────
type Draft = Omit<ImportExercise, "issues" | "section" | "groupKind" | "rounds"> & { issues: ImportIssue[] };
const emptyEx = (written: string, source: string | null): Draft => ({ written, source, sets: null, reps: null, weightKg: null, perSet: null, restSec: null, rir: null, rpe: null, tempo: null, note: null, technique: null, group: null, unit: null, issues: [] });

const ILLEGIBLE = /\?{1,3}|\bilegible\b|\bno se (?:lee|entiende)\b|\[\s*\?\s*\]|…/i;
const OTHER_LOAD = /\b(?:placa|placas|ladrillos?|bloques?|pin|nivel|banda\s+\w+|disco\s+de\s+\d+)\b[^,;·]*/i;

/**
 * Lee la prescripción de un texto (el renglón sin el nombre, o una celda): series × repeticiones, cargas, descanso, RIR/RPE,
 * tempo y método. Lo que no entiende queda en la nota; nunca se descarta.
 */
export function readPrescription(text: string, e: Draft, hint: { lb?: boolean } = {}): Draft {
  // Cardio primero: velocidad, inclinación, nivel, cadencia y ritmo (sus números no son series, cargas ni tempo).
  const act = readActivityText(text, activityGuess(e.written));
  let prof = act.profile;
  let rest = act.rest;
  const take = (re: RegExp) => { const m = re.exec(rest); if (m) rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length); return m; };
  // Descanso, tempo, RIR y RPE primero: sus números no son series ni cargas.
  const r = take(new RegExp(String.raw`(?:desc(?:anso)?|rest|pausa|recup(?:eraci[oó]n)?|recuperar)\.?\s*(?:de|entre series)?\s*[:=]?\s*(${NUM})\s*(min(?:utos)?|m\b|'|s\b|seg(?:undos)?|sec|"|'')?(?:(?<=')(\d{2})(?:"|''|s\b)?)?(?::\d{2})?`, "i"));
  if (r) e.restSec = restSeconds(r);
  const tp = prof ? null : take(/\b(?:tempo|cadencia|ritmo)\s*[:=]?\s*([0-9xX])\s*[-–.:/]?\s*([0-9xX])\s*[-–.:/]?\s*([0-9xX])\s*[-–.:/]?\s*([0-9xX])?/i);
  if (tp) e.tempo = [tp[1], tp[2], tp[3], tp[4]].filter((x) => x != null).join("-").toUpperCase();
  const rir = take(/@?\s*\brir\s*[:=]?\s*(\d(?:[.,]5)?)(?:\s*[-–/]\s*(\d))?/i);
  if (rir) { if (rir[2]) e.note = [e.note, `RIR ${rir[1]}-${rir[2]}`].filter(Boolean).join(" · "); else e.rir = Math.min(5, toNum(rir[1])); }
  const rpe = take(/@?\s*\brpe\s*[:=]?\s*(\d{1,2}(?:[.,]5)?)(?:\s*[-–/]\s*(\d{1,2}))?/i);
  if (rpe) { if (rpe[2]) e.note = [e.note, `RPE ${rpe[1]}-${rpe[2]}`].filter(Boolean).join(" · "); else if (toNum(rpe[1]) <= 10) e.rpe = toNum(rpe[1]); }

  // Cargas con unidad (antes que series × reps: «60kg x 10» es carga × repeticiones).
  let weights: number[] | null = null;
  const loadRe = new RegExp(String.raw`(${NUM}(?:\s*[/;\-–,]\s*${NUM})*)\s*(kg|kgs|kilos?|kilogramos?|lbs?|libras?)\b(\s*(?:c\/?\s*lado|por\s+lado|x\s+lado|cada\s+lado|de\s+cada\s+lado))?(\s*(?:c\/?u|cada\s+una?|por\s+mano|por\s+mancuerna))?`, "i");
  const wl = prof ? null : take(loadRe); // en una actividad, un «5 kg» (chaleco) queda en la nota
  if (wl) {
    const w = weightList(wl[1], wl[2]);
    if (w && wl[3]) {
      e.note = [e.note, wl[0].trim()].filter(Boolean).join(" · ");
      e.issues.push({ field: "weight", kind: "unclear", text: `Dice «${wl[0].trim()}»: escribí la carga total si la sabés.` });
    } else if (w) {
      weights = w.kg; e.unit = w.unit;
      if (w.unit === "lb") e.issues.push({ field: "weight", kind: "info", text: `Leído en libras (${wl[1].trim()} lb).` });
      if (wl[4]) e.note = [e.note, "por mancuerna"].filter(Boolean).join(" · ");
    } else e.note = [e.note, wl[0].trim()].filter(Boolean).join(" · ");
  }

  // Series × repeticiones.
  let setsN: number | null = null, repsRaw: string | null = null;
  const sx = take(new RegExp(String.raw`(?:^|\s|\()(\d{1,2})\s*(?:x|×|\*|por)\s*(${REPS}|\?+)`, "i"))
    ?? take(new RegExp(String.raw`(\d{1,2})\s*(?:series|serie|sets?|vueltas|rondas|rounds|s\b)\.?\s*(?:de|x|×|of|por)?\s*(${REPS}|\?+)?\s*(?:repeticiones|repes|reps?|rep\b)?`, "i"));
  if (sx) {
    setsN = Number(sx[1]);
    repsRaw = sx[2] ?? null;
  } else {
    const rl = take(new RegExp(String.raw`(?:^|\s)(\d{1,3}(?:\s*[/;]\s*\d{1,3}){1,9}|\d{1,3}(?:\s*[-–]\s*\d{1,3}){2,9})(?=\s|$|\()`, "i"));
    if (rl) repsRaw = rl[1];
    else {
      const ro = take(new RegExp(String.raw`(?:^|\s)(${REPS})\s*(?:repeticiones|repes|reps?)\b`, "i")) ?? take(new RegExp(String.raw`(?:^|\s)(${FAIL}|${TIME}|${DIST})(?=\s|$)`, "i"));
      if (ro) repsRaw = ro[1];
    }
  }
  if (setsN != null && (setsN < 1 || setsN > 20)) { e.issues.push({ field: "sets", kind: "unclear", text: `«${setsN} series» parece un error: revisalo.` }); setsN = null; }
  if (repsRaw && /^\?+$/.test(repsRaw.trim())) { e.issues.push({ field: "reps", kind: "unclear", text: "Las repeticiones no se leen." }); repsRaw = null; }

  const other = take(OTHER_LOAD);
  if (other) e.note = [e.note, other[0].trim()].filter(Boolean).join(" · ");
  // Carga sin unidad: «@ 60» o un número suelto que queda después de «4x10» («Press banca 4x10 60»). Nunca en una actividad.
  if (!weights && !prof) {
    const at = take(new RegExp(String.raw`@\s*(${NUM}(?:\s*[/;\-–]\s*${NUM})*)(?!\s*%)`, "i"));
    const bare = at ?? (setsN != null || repsRaw ? take(new RegExp(String.raw`(?:^|\s|\()(${NUM}(?:\s*[/;\-–]\s*${NUM})*)(?=\s*\)|\s*$|\s+[^\d%])(?!\s*%)`, "i")) : null);
    if (bare) {
      const w = weightList(bare[1], hint.lb ? "lb" : "kg");
      if (w && w.kg.every((v) => v >= 1)) {
        weights = w.kg; e.unit = w.unit;
        if (hint.lb) e.issues.push({ field: "weight", kind: "unclear", text: `«${bare[1].trim()}» sin unidad: se tomó en libras como el resto del archivo. Revisalo.` });
      } else e.note = [e.note, bare[0].trim()].filter(Boolean).join(" · ");
    }
  }

  // Duración o distancia sola («Cinta 10 min», «Remo 500 m»): un bloque.
  if (setsN == null && repsRaw && new RegExp(`^(?:${TIME}|${DIST})$`, "i").test(repsRaw.trim()) && !sx) {
    setsN = 1; e.issues.push({ field: "sets", kind: "info", text: "Un bloque (dice sólo la duración o la distancia)." });
  }

  // «Remo 500 m»: un remo con distancia es el remo ergómetro (el «Remo con barra 4x10» sigue siendo de espalda).
  if (!prof && repsRaw && /^remo\b/i.test(e.written.trim()) && new RegExp(`^(?:${DIST})$`, "i").test(repsRaw.trim())) prof = "rower";

  // Repeticiones por serie y su coherencia con las series y las cargas.
  const rx = repsRaw ? repsExpr(repsRaw) : null;
  let repsList = rx?.list ?? null;
  if (rx?.common) e.reps = rx.common.slice(0, 20);
  if (repsList) {
    if (setsN == null) setsN = repsList.length;
    if (repsList.length !== setsN) {
      e.issues.push({ field: "reps", kind: "unclear", text: `Dice ${setsN} series pero ${repsList.length} valores de repeticiones (${repsList.join("-")}).` });
      e.reps = repsList.join("-").slice(0, 20); repsList = null;
    }
  }
  if (weights && weights.length > 1) {
    const n = setsN ?? repsList?.length ?? null;
    if (n == null) setsN = weights.length;
    else if (weights.length !== n) {
      e.issues.push({ field: "weight", kind: "unclear", text: `Hay ${weights.length} cargas para ${n} series: revisalas.` });
      e.note = [e.note, `cargas ${weights.join("-")} kg`].filter(Boolean).join(" · "); weights = null;
    }
  }
  e.sets = setsN;
  const n = e.sets ?? 0;
  const perReps = repsList ?? (e.reps && n ? Array.from({ length: n }, () => e.reps!) : null);
  const perW = weights && weights.length > 1 ? weights : weights && n ? Array.from({ length: n }, () => weights![0]) : null;
  if ((repsList || (weights && weights.length > 1)) && n) {
    const rows = Array.from({ length: n }, (_, i) => ({ reps: perReps?.[i] ?? null, weightKg: perW?.[i] ?? null }));
    const sameR = rows.every((x) => x.reps === rows[0].reps), sameW = rows.every((x) => x.weightKg === rows[0].weightKg);
    if (sameR && sameW) { e.reps = rows[0].reps; e.weightKg = rows[0].weightKg; }
    else { e.perSet = rows; e.reps = sameR ? rows[0].reps : rows.map((x) => x.reps ?? "?").join("-").slice(0, 20); e.weightKg = sameW ? rows[0].weightKg : null; }
  } else if (weights?.length === 1) e.weightKg = weights[0];

  // Método y combinados: se detectan sobre el texto completo; el texto queda en la nota.
  const left = rest.replace(/\s+/g, " ").replace(/^[\s\-–—:|,.;()]+|[\s\-–—:|,;(]+$/g, "").replace(/\(\s*\)/g, "").trim();
  const method = detectMethod(text);
  const gw = detectGroupWord(text);
  if (method || gw) e.technique = clip(method?.matched ?? gw?.matched, 80);
  if (left && !/^[\s\p{P}]*$/u.test(left)) e.note = clip([e.note, left].filter(Boolean).join(" · "), 120);
  if (ILLEGIBLE.test(text)) e.issues.push({ field: "line", kind: "unclear", text: "Una parte no se lee: revisá lo marcado." });
  if (prof) importActivity(e, prof, act.values);
  else if (act.values.speedKmh != null) e.note = clip([e.note, activityFieldText("speedKmh", act.values.speedKmh)].filter(Boolean).join(" · "), 120);
  return e;
}

const METHOD_IN_NAME = /\s(?=(?:emom|amrap|drop ?sets?|dropsets?|rest[- ]?pause|myo[- ]?reps?|cluster|top ?set|back[- ]?offs?|superserie|biserie|triserie|pir[aá]mide|al fallo|hasta el fallo)\b)/i;
const NAME_STOP = new RegExp(String.raw`(\s|^)(?=\d|@|\(\s*\d|[-–—:|]\s*\d|(?:desc(?:anso)?|rest|rir|rpe|tempo)\b)`, "i");
// «Cinta incl 3 vel 5 10 min»: en cardio, «vel», «incl», «nivel», «ritmo» o «cadencia» con un número cortan el nombre.
const ACT_STOP = /\s(?=(?:vel(?:ocidad)?|incl(?:inaci[oó]n)?|nivel|niv|ritmo|cadencia|resistencia)\.?\s*[:=]?\s*-?\d)/i;
/** «A1. Press banca — 4 × 10 — 60 kg» → ejercicio con nombre, combinado y prescripción. */
export function parseExerciseLine(line: string, hint: { lb?: boolean } = {}): Draft | null {
  const src = cleanLine(line);
  if (!src || !/\p{L}{2}/u.test(src)) return null;
  const label = detectGroupLabel(src);
  let body = label ? src.slice(label.matched.length).trim() : src;
  // «4x10 Sentadilla 60 kg»: la prescripción adelante.
  let pre = "";
  const lead = /^(\d{1,2}\s*(?:x|×)\s*\d{1,3}(?:\s*[-/]\s*\d{1,3})*)\s+(?=\p{L})/u.exec(body);
  if (lead) { pre = lead[1]; body = body.slice(lead[0].length); }
  const cut = NAME_STOP.exec(body);
  let at = cut ? cut.index : body.length;
  const ac = ACT_STOP.exec(body);
  if (ac && ac.index > 0 && ac.index < at && activityGuess(body.slice(0, ac.index))) at = ac.index;
  let name = body.slice(0, at).replace(/[\s\-–—:|,.;(]+$/g, "").trim();
  let tail = body.slice(at);
  // Un método escrito pegado al nombre («Burpees AMRAP 8 min», «Remo drop set») va a la prescripción.
  const mm = METHOD_IN_NAME.exec(name);
  if (mm && mm.index > 1) { tail = `${name.slice(mm.index)} ${tail}`; name = name.slice(0, mm.index); }
  // Un nombre que termina en «x»/«por» («Press banca x») o con paréntesis abierto: el resto es prescripción.
  name = name.replace(/\s+(?:x|×|por)$/i, "").trim();
  // Un nombre empieza con una letra y es mayormente letras: «%%%% ### ilegible ###» no es un ejercicio (queda como no leído).
  const compact = name.replace(/\s+/g, "");
  if (!name || !/^\p{L}/u.test(name) || !/\p{L}{2}/u.test(name) || (compact.match(/\p{L}/gu)?.length ?? 0) < compact.length * 0.6) return null;
  // Paréntesis dentro del nombre con carga («Press plano (105kg)») van a la prescripción.
  const par = /\(([^)]*\d[^)]*)\)/.exec(name);
  if (par) { tail = `${par[1]} ${tail}`; name = name.replace(par[0], "").trim(); }
  const e = emptyEx(name.slice(0, 80), src.slice(0, 160));
  if (label) e.group = `${label.letter}${label.order}`;
  return readPrescription(`${pre} ${tail}`.trim(), e, hint);
}

// ── Encabezados ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const WEEKDAY = String.raw`lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lun|mar|mi[eé]|jue|vie|s[aá]b|dom`;
const DAY_HEAD = new RegExp(String.raw`^(?:(?:d[ií]a|day|sesi[oó]n|session|entrenamiento|entreno|workout|rutina|training)\s*(?:n[°º.]?\s*)?(?:[a-h]|\d{1,2}|uno|dos|tres|cuatro|cinco|seis)\b|(?:${WEEKDAY})\b(?:\s*(?:y|/|-)\s*(?:${WEEKDAY})\b)*)\s*[:\-–—.|)]?\s*([^\d]{0,60})$`, "i");
const GROUPS = String.raw`pecho|espalda|piernas?|hombros?|brazos?|b[ií]ceps|tr[ií]ceps|gl[uú]teos?|cu[aá]driceps|isquios?|isquiotibiales|femorales?|gemelos|pantorrillas|abdominales|abdomen|core|tren\s+superior|tren\s+inferior|full\s*body|cuerpo\s+completo|empuje|tir[oó]n|push|pull|legs|upper|lower|torso|dorsales?|trapecios?|antebrazos?|cardio`;
const GROUP_HEAD = new RegExp(String.raw`^(?:(?:${GROUPS})(?:\s*(?:,|y|e|\+|/|&|-|–)\s*|\s+))*(?:${GROUPS})\s*:?$`, "i");
const WEEK_HEAD = /^(?:semana|week|sem\.?|microciclo)\s*(\d{1,2})\b\s*[:\-–—.]?\s*(.{0,40})$/i;
const PROGRAM_HEAD = /^(?:programa|plan|mesociclo|rutina\s+de\s+\p{L}+|rutina\s+n[°º]?\s*\d)\b[^\d]{0,60}$/iu;
const SECTION_HEAD = /^(calentamiento|entrada\s+en\s+calor|warm[\s-]?up|activaci[oó]n|movilidad|core|cardio|vuelta\s+a\s+la\s+calma|enfriamiento|estiramientos?|parte\s+principal|bloque\s+\w+|finisher|accesorios|fuerza|potencia|(?:circuito|superserie|super\s+serie|biserie|triserie|serie\s+gigante|giant\s+set)\b.*)\s*:?$/i;
const CHAT = /^(?:hola|buen[oa]s?|buen d[ií]a|te paso|te mando|ac[aá] (?:te|va|est[aá])|gracias|ok\b|dale|genial|saludos|abrazo|cualquier (?:duda|cosa)|acordate|record[aá]|mañana|hoy|esta semana|la semana|che\b|perfecto|listo\b|ah[ií] va|para vos|vamos)/i;
const NOTE_LINE = /^(?:nota|notas|obs(?:ervaciones?)?|importante|aclaraci[oó]n|recordá|recorda|ojo|tip)\b|^[*>]/i;

function groupBlock(text: string): { kind: GroupKind; rounds: number | null } | null {
  const t = fold(text);
  if (!/(circuito|superserie|super serie|biserie|triserie|serie gigante|giant set)/.test(t)) return null;
  const r = /(\d{1,2})\s*(?:x\b|vueltas|rondas|rounds|veces)|x\s*(\d{1,2})\b/.exec(t);
  return { kind: /circuito|gigante|giant/.test(t) ? "circuit" : "superset", rounds: r ? Number(r[1] ?? r[2]) : null };
}

/**
 * Texto libre (notas, WhatsApp, correo, una planilla sin columnas reconocibles) → días y ejercicios. Cada renglón queda
 * clasificado: encabezado, ejercicio, continuación de la prescripción anterior, indicación general o no leído. Nunca devuelve
 * menos de lo que encontró: lo que no entiende va a `unread` para que la persona lo vea.
 */
export function parseRoutineText(text: string): ImportParse {
  const raw = text.replace(/\r\n?/g, "\n").split("\n").slice(0, IMPORT_LIMITS.lines);
  const lb = /\d\s*(lbs?|libras?)\b/i.test(text) && !/\d\s*(kg|kgs|kilos?)\b/i.test(text);
  const notes: string[] = [], unread: string[] = [];
  type V = { name: string; days: { name: string; exercises: ImportExercise[]; implicit: boolean }[] };
  const programs: { name: string; weeks: V[] }[] = [];
  let program: (typeof programs)[number] | null = null, week: V | null = null;
  let day: V["days"][number] | null = null, section: string | null = null;
  let block: { kind: GroupKind; rounds: number | null; letter: string; n: number } | null = null;
  let lines = 0, blankRun = 0;
  const newProgram = (name: string) => { program = { name, weeks: [] }; programs.push(program); week = null; day = null; };
  const newWeek = (name: string) => { if (!program) newProgram(""); week = { name, days: [] }; program!.weeks.push(week); day = null; };
  const newDay = (name: string, implicit = false) => { if (!week) newWeek(""); day = { name, exercises: [], implicit }; week!.days.push(day); section = null; block = null; };
  const usedLetters = () => new Set((day?.exercises ?? []).map((x) => x.group?.[0]).filter(Boolean));
  for (const original of raw) {
    const line = cleanLine(original);
    if (!line) { blankRun++; if (block && blankRun >= 1) block = null; continue; }
    lines++;
    const wasBlank = blankRun > 0; blankRun = 0;
    let m: RegExpExecArray | null;
    if ((m = WEEK_HEAD.exec(line))) { newWeek(line.replace(/[:\s]+$/, "")); continue; }
    if (PROGRAM_HEAD.test(line) && !/\d\s*(x|×)\s*\d/.test(line)) { newProgram(line.replace(/[:\s]+$/, "").slice(0, 60)); continue; }
    if (DAY_HEAD.test(line) || GROUP_HEAD.test(line) || (/:$/.test(line) && !/\d/.test(line) && line.split(" ").length <= 6 && !SECTION_HEAD.test(line))) {
      newDay(line.replace(/[:\s.]+$/, "").slice(0, 60)); continue;
    }
    if (SECTION_HEAD.test(line) && !/\d\s*(x|×)\s*\d|\d\s*(kg|lb|reps?)/i.test(line)) {
      if (!day) newDay("", true);
      const g = groupBlock(line);
      if (g) { const letter = GROUP_LETTERS.find((l) => !usedLetters().has(l)) ?? "H"; block = { ...g, letter, n: 0 }; }
      else { section = line.replace(/[:\s]+$/, "").slice(0, 40); block = null; }
      continue;
    }
    if (NOTE_LINE.test(line) || (line.split(" ").length > 9 && !/\d\s*(x|×)\s*\d/.test(line))) { notes.push(line.slice(0, 300)); continue; }
    // «Descanso 90 s» solo: es del ejercicio anterior (o una indicación general si no hay).
    const prev: ImportExercise | undefined = (day as V["days"][number] | null)?.exercises.at(-1);
    if (/^(?:desc(?:anso)?|rest|pausa|recuperaci[oó]n)\b/i.test(line)) {
      const tmp = readPrescription(line, emptyEx("", null));
      if (prev && prev.restSec == null && tmp.restSec != null) { prev.restSec = tmp.restSec; prev.source = clip(`${prev.source ?? ""} / ${line}`, 160); }
      else notes.push(line.slice(0, 300));
      continue;
    }
    const ex = parseExerciseLine(line, { lb });
    if (!ex) {
      // Continuación: «5;5;5;4», «4x10 60kg», «(105 kg)» debajo del nombre.
      if (prev && /^[\d(@x×]/i.test(line)) {
        const add = readPrescription(line, emptyEx(prev.written, null), { lb });
        let used = false;
        for (const k of ["sets", "reps", "weightKg", "perSet", "restSec", "rir", "rpe", "tempo", "unit"] as const) {
          if (prev[k] == null && add[k] != null) { (prev as Record<string, unknown>)[k] = add[k]; used = true; }
        }
        if (add.note) { prev.note = clip([prev.note, add.note].filter(Boolean).join(" · "), 120); used = true; }
        prev.issues.push(...add.issues);
        if (add.activity) { prev.activity = { ...(prev.activity ?? {}), ...add.activity }; prev.rir = null; prev.weightKg = null; prev.perSet = null; used = true; }
        if (add.technique && !prev.technique) prev.technique = add.technique;
        prev.source = clip(`${prev.source ?? ""} / ${line}`, 160);
        if (!used) unread.push(line.slice(0, 160));
      } else unread.push(line.slice(0, 160));
      continue;
    }
    // Un renglón sin ninguna prescripción tiene que parecer un nombre de ejercicio; un saludo o una frase de chat es texto general.
    const bare = ex.sets == null && ex.reps == null && ex.weightKg == null && ex.restSec == null && ex.rir == null && ex.rpe == null && !ex.technique && !ex.note && !ex.group;
    if (bare && (CHAT.test(line) || /[!?¡¿]/.test(line) || line.split(" ").length > 6 || /\.\s+\p{L}/u.test(line))) { notes.push(line.slice(0, 300)); continue; }
    const cd = day as V["days"][number] | null;
    if (!cd || (wasBlank && cd.implicit && cd.exercises.length >= 3 && !block)) newDay("", true);
    const d = day as unknown as V["days"][number];
    const full: ImportExercise = { ...ex, section, groupKind: null, rounds: null };
    if (block) {
      block.n++;
      full.group = `${block.letter}${block.n}`; full.groupKind = block.kind; full.rounds = block.rounds;
    } else if (full.group) full.groupKind = "superset";
    d.exercises.push(full);
  }
  // Sin encabezados, los grupos separados por renglones en blanco son días («Día 1», «Día 2»…). Un único grupo: «Mi rutina».
  const variants: ImportVariant[] = [];
  const multiProgram = programs.filter((p) => p.weeks.some((w) => w.days.some((d) => d.exercises.length))).length;
  for (const p of programs) {
    const weeks = p.weeks.filter((w) => w.days.some((d) => d.exercises.length));
    const multiWeek = weeks.length > 1;
    for (const w of weeks) {
      const days = w.days.filter((d) => d.exercises.length);
      const name = [multiProgram > 1 ? p.name : "", multiWeek ? w.name : ""].filter(Boolean).join(" · ") || p.name || w.name || "Rutina";
      variants.push({ name: name.slice(0, 60), days: days.map((d, i) => ({ name: d.name || (days.length === 1 ? "Mi rutina" : `Día ${i + 1}`), exercises: d.exercises.map(finishExercise) })) });
    }
  }
  const all = variants.flatMap((v) => v.days.flatMap((d) => d.exercises));
  return { variants, notes: notes.slice(0, 20), unread: unread.slice(0, 40), stats: { lines, exercises: all.length, prescribed: all.filter((x) => x.sets != null || x.reps != null).length } };
}

/** Faltantes y dudas finales. No completa nada: sólo dice qué falta. */
export function finishExercise(e: ImportExercise): ImportExercise {
  const issues = e.issues.filter((x, i, a) => a.findIndex((y) => y.field === x.field && y.text === x.text) === i);
  if (e.sets == null && !issues.some((x) => x.field === "sets")) issues.push({ field: "sets", kind: "missing", text: "No dice cuántas series." });
  if (e.reps == null && !issues.some((x) => x.field === "reps")) issues.push({ field: "reps", kind: "missing", text: "No dice cuántas repeticiones." });
  return { ...e, issues };
}

/** ¿Alcanza lo leído sin IA? Todo renglón clasificado y la mayoría de los ejercicios con su prescripción. */
export function deterministicEnough(p: ImportParse): boolean {
  const { exercises, prescribed, lines } = p.stats;
  return exercises > 0 && p.unread.length <= Math.max(0, Math.floor(lines * 0.05)) && prescribed / exercises >= 0.6;
}

// ── Planillas (Excel, CSV, OpenDocument convertidos a CSV en el teléfono) ───────────────────────────────────────────────
const H = {
  name: /^(ejercicios?|exercises?|movimientos?|nombre)$/, sets: /^(series?|sets?|s|vueltas|rondas)$/, reps: /^(reps?|repeticiones|repes|rep\.?|r)$/,
  weight: /^(peso|pesos|carga|cargas|kg|kgs|kilos|weight|load|lbs?|libras|peso \((kg|lb|lbs)\)|carga \((kg|lb|lbs)\))$/,
  rest: /^(descanso|descansos|rest|pausa|recuperacion|desc\.?)( \(s(eg)?\))?$/, rir: /^rir$/, rpe: /^rpe$/, tempo: /^(tempo|cadencia)$/,
  note: /^(notas?|observaciones?|obs\.?|comentarios?|indicaciones|detalle)$/, tech: /^(tecnica|metodo|method|technique)$/,
  group: /^(grupo|superserie|combinado|group|bloque)$/, day: /^(dia|day|rutina|sesion|session|entrenamiento)$/, week: /^(semana|week)$/,
};
const setCol = /^(?:serie|set|s)\s*(\d{1,2})$/;
function headerMap(row: string[]) {
  const h = row.map((x) => fold(x).replace(/\s+/g, " ").trim());
  const col = (re: RegExp) => { const i = h.findIndex((x) => re.test(x)); return i < 0 ? null : i; };
  const sets = h.map((x, i) => (setCol.test(x) ? i : -1)).filter((i) => i >= 0);
  const m = { name: col(H.name), sets: col(H.sets), reps: col(H.reps), weight: col(H.weight), rest: col(H.rest), rir: col(H.rir), rpe: col(H.rpe), tempo: col(H.tempo),
    note: col(H.note), tech: col(H.tech), group: col(H.group), day: col(H.day), week: col(H.week), setCols: sets,
    lb: h.some((x) => /\b(lb|lbs|libras)\b/.test(x)) };
  return m.name != null && (m.sets != null || m.reps != null || sets.length) ? m : null;
}

/** «10 x 40 kg», «40kg x 10», «10 @ 40», «10» o «40 kg» en una celda de «Serie 1». */
function setCell(cell: string, lb: boolean): ImportSetValue & { unclear?: boolean } | null {
  const t = cell.trim();
  if (!t) return null;
  const u = /(kg|kgs|lbs?|libras?)/i.exec(t)?.[1] ?? (lb ? "lb" : "kg");
  let m: RegExpExecArray | null;
  if ((m = new RegExp(String.raw`^(\d{1,3})\s*(?:x|×|@)\s*(${NUM})\s*(?:kg|kgs|lbs?|libras?)$`, "i").exec(t)) || (m = new RegExp(String.raw`^(\d{1,3})\s*@\s*(${NUM})$`).exec(t))) return { reps: m[1], weightKg: weightList(m[2], u)?.kg[0] ?? null };
  if ((m = new RegExp(String.raw`^(${NUM})\s*(?:kg|kgs|lbs?|libras?)\s*(?:x|×)\s*(\d{1,3})$`, "i").exec(t))) return { reps: m[2], weightKg: weightList(m[1], u)?.kg[0] ?? null };
  if (/^\d{1,3}$/.test(t)) return { reps: t, weightKg: null };
  if ((m = new RegExp(String.raw`^(${NUM})\s*(kg|kgs|lbs?|libras?)$`, "i").exec(t))) return { reps: null, weightKg: weightList(m[1], m[2])?.kg[0] ?? null };
  return { reps: null, weightKg: null, unclear: true };
}

function sheetRows(name: string, csv: string, multi: boolean): { days: ImportDay[]; weekName: string | null; fallback: ImportParse | null } {
  const { headers, rows } = parseCsv(csv);
  const all = [headers, ...rows];
  let hi = -1, map: ReturnType<typeof headerMap> = null;
  for (let i = 0; i < Math.min(12, all.length); i++) { map = headerMap(all[i]); if (map) { hi = i; break; } }
  if (!map) {
    // Sin columnas reconocibles: cada fila es un renglón de texto («DÍA 1» / «Press banca | 4 | 10 | 60»).
    const text = all.map((r) => r.filter((c) => c.trim()).join(" ")).join("\n");
    const p = parseRoutineText(text.replace(/(\p{L})\s+(\d{1,2})\s+(\d{1,3}(?:-\d{1,3})?)\s+(\d+(?:[.,]\d+)?)$/gmu, "$1 $2x$3 $4"));
    if (multi && p.variants.length === 1 && p.variants[0].days.length === 1 && p.variants[0].days[0].name === "Mi rutina") p.variants[0].days[0].name = name;
    return { days: [], weekName: null, fallback: p };
  }
  const c = map;
  const days: ImportDay[] = [];
  let cur: ImportDay | null = null, weekName: string | null = null;
  for (const r of all.slice(hi + 1)) {
    const cell = (i: number | null) => (i == null ? "" : (r[i] ?? "").trim());
    const nm = cell(c.name).replace(/\s+/g, " ");
    const filled = r.filter((x) => x.trim());
    // Fila de encabezado de día dentro de la hoja («DÍA 2» sola).
    if (!nm && filled.length === 1 && (DAY_HEAD.test(cleanLine(filled[0])) || GROUP_HEAD.test(cleanLine(filled[0])))) { cur = { name: cleanLine(filled[0]).slice(0, 60), exercises: [] }; days.push(cur); continue; }
    if (!nm) continue;
    if (c.week != null && cell(c.week)) { const w = cell(c.week); if (weekName == null) weekName = w; else if (w !== weekName) continue; }
    const dayName = cell(c.day) || cur?.name || (multi ? name : "Mi rutina");
    if (!cur || cur.name !== dayName) { cur = days.find((d) => d.name === dayName) ?? null; if (!cur) { cur = { name: dayName.slice(0, 60), exercises: [] }; days.push(cur); } }
    const label = detectGroupLabel(cell(c.group), nm);
    const written = (label && !cell(c.group) ? nm.slice(label.matched.length) : nm).trim().slice(0, 80);
    const e = emptyEx(written, filled.join(" | ").slice(0, 160));
    if (label) e.group = `${label.letter}${label.order}`;
    const wCell = cell(c.weight);
    const unitWord = c.lb && !/(kg|kgs|kilos?)/i.test(wCell) ? " lb" : /\d\s*$/.test(wCell) ? " kg" : "";
    const parts = [cell(c.sets) ? `${cell(c.sets)} series` : "", cell(c.reps) ? `${cell(c.reps)} reps` : "", wCell ? `${wCell}${unitWord}` : "",
      cell(c.rest) ? `descanso ${cell(c.rest)}${/^\d+$/.test(cell(c.rest)) ? " s" : ""}` : "", cell(c.rir) ? `RIR ${cell(c.rir)}` : "", cell(c.rpe) ? `RPE ${cell(c.rpe)}` : "",
      cell(c.tempo) ? `tempo ${cell(c.tempo)}` : ""].filter(Boolean).join(" ");
    // «4 series 12/10/8 reps»: la regla de series × reps del renglón no aplica a columnas separadas; se arma igual.
    readPrescription(parts.replace(/(\d{1,2}) series (\S+) reps/, "$1x$2").replace(/(\d{1,2}) series$/, "$1 series"), e, { lb: c.lb });
    if (c.setCols.length) {
      const vals = c.setCols.map((i) => setCell(cell(i), c.lb)).filter((x): x is NonNullable<typeof x> => !!x);
      if (vals.length) {
        if (vals.some((v) => v.unclear)) e.issues.push({ field: "reps", kind: "unclear", text: "Una celda de serie no se entiende: revisá las series." });
        const rows = vals.map((v) => ({ reps: v.reps, weightKg: v.weightKg }));
        e.sets = e.sets ?? rows.length;
        if (rows.length === e.sets) {
          const sameR = rows.every((x) => x.reps === rows[0].reps), sameW = rows.every((x) => x.weightKg === rows[0].weightKg);
          if (sameR && sameW) { e.reps = e.reps ?? rows[0].reps; e.weightKg = e.weightKg ?? rows[0].weightKg; }
          else { e.perSet = rows; e.reps = sameR ? rows[0].reps : rows.map((x) => x.reps ?? "?").join("-").slice(0, 20); e.weightKg = sameW ? rows[0].weightKg : null; }
        }
      }
    }
    let note = [cell(c.note), cell(c.tech)].filter(Boolean).join(" · ");
    // Cardio: «vel 5 incl 3» o «nivel 8» en la columna de notas también son de la actividad.
    const prof = e.activity?.profile ?? activityGuess(written);
    if (note && prof) {
      const a = readActivityText(note, prof);
      if (Object.keys(a.values).length && a.profile) { importActivity(e, a.profile, { ...(e.activity ?? {}), ...a.values }); note = a.rest.replace(/\s+/g, " ").replace(/^[\s·,;-]+|[\s·,;-]+$/g, "").trim(); }
    }
    if (note) { e.note = clip([e.note, note].filter(Boolean).join(" · "), 120); const m = detectMethod(note) ?? null; const g = detectGroupWord(note); if (m || g) e.technique = clip(m?.matched ?? g?.matched, 80); }
    cur.exercises.push(finishExercise({ ...e, section: null, groupKind: e.group ? "superset" : null, rounds: null }));
  }
  return { days: days.filter((d) => d.exercises.length), weekName, fallback: null };
}

/**
 * Planilla convertida a CSV, con una o varias hojas («Hoja: Nombre» delante de cada una, como la arma `spreadsheetToCsv`).
 * Una hoja por día, por semana o con columna Día: se respeta lo que la planilla dice. null si no hay nada reconocible (con
 * `requireHeader`, también si ninguna hoja tiene columnas reconocibles: el texto pegado con comas no es una planilla).
 */
export function parseRoutineSheet(text: string, o: { requireHeader?: boolean } = {}): ImportParse | null {
  const parts = /^Hoja: /m.test(text) ? text.split(/^Hoja: (.*)$/m).slice(1) : ["", text];
  const sheets: { name: string; csv: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) sheets.push({ name: (parts[i] ?? "").trim().slice(0, 60), csv: parts[i + 1] ?? "" });
  const multi = sheets.length > 1;
  const weekSheets = multi && sheets.filter((s) => WEEK_HEAD.test(s.name) || PROGRAM_HEAD.test(s.name)).length >= 2;
  const variants: ImportVariant[] = [];
  const notes: string[] = [], unread: string[] = [];
  let lines = 0, headed = 0;
  const base: ImportVariant = { name: "Rutina", days: [] };
  for (const s of sheets) {
    const r = sheetRows(s.name, s.csv, multi && !weekSheets);
    if (!r.fallback) headed++;
    const days = r.fallback ? r.fallback.variants.flatMap((v) => v.days) : r.days;
    if (r.fallback) { notes.push(...r.fallback.notes); unread.push(...r.fallback.unread); lines += r.fallback.stats.lines; }
    else lines += days.reduce((n, d) => n + d.exercises.length, 0);
    if (!days.length) continue;
    if (weekSheets) variants.push({ name: s.name, days });
    else base.days.push(...days);
  }
  if (base.days.length) variants.unshift(base);
  const all = variants.flatMap((v) => v.days.flatMap((d) => d.exercises));
  if (!all.length || (o.requireHeader && !headed)) return null;
  return { variants, notes: notes.slice(0, 20), unread: unread.slice(0, 40), stats: { lines: Math.max(lines, all.length), exercises: all.length, prescribed: all.filter((x) => x.sets != null || x.reps != null).length } };
}

// ── Lo que transcribe la IA (fotos, capturas, PDF, texto difícil) pasa por las mismas reglas ────────────────────────────
export type AiExercise = {
  name: string; group: string; section: string; sets: number | null; reps: string | null; set_reps: string[]; set_weights: (number | null)[];
  weight: number | null; unit: "kg" | "lb" | null; rest_sec: number | null; rir: number | null; rpe: number | null; tempo: string | null;
  technique: string; note: string; unclear: string[]; source: string;
};
/** Normaliza un ejercicio transcripto por la IA: rangos, libras, valores por serie y evidencia. Lo dudoso queda marcado. */
export function fromAiExercise(a: AiExercise): ImportExercise {
  const nameRaw = clip(a.name, 120) ?? "";
  const label = detectGroupLabel(a.group, nameRaw);
  const written = ((label && !a.group ? nameRaw.slice(label.matched.length) : nameRaw).trim() || nameRaw).slice(0, 80);
  const e = emptyEx(written, clip(a.source, 160));
  if (label) e.group = `${label.letter}${label.order}`;
  const lb = a.unit === "lb";
  const conv = (w: number | null) => (w == null || !Number.isFinite(w) || w < 0 ? null : lb ? lbToKg(w) : round2(w));
  const sets = a.sets != null && Number.isInteger(a.sets) && a.sets >= 1 && a.sets <= 20 ? a.sets : null;
  if (a.sets != null && sets == null) e.issues.push({ field: "sets", kind: "unclear", text: `«${a.sets} series» parece un error: revisalo.` });
  const setReps = (a.set_reps ?? []).map((x) => clip(String(x), 20)).filter((x): x is string => !!x);
  const setW = (a.set_weights ?? []).map(conv);
  const n = sets ?? (setReps.length > 1 ? setReps.length : setW.length > 1 ? setW.length : null);
  e.sets = n;
  const reps = clip(a.reps, 20);
  if (setReps.length > 1 || setW.filter((x) => x != null).length > 1) {
    if (n && (setReps.length <= 1 || setReps.length === n) && (setW.length <= 1 || setW.length === n)) {
      const rows = Array.from({ length: n }, (_, i) => ({ reps: setReps.length > 1 ? setReps[i] : setReps[0] ?? reps, weightKg: setW.length > 1 ? setW[i] : setW[0] ?? conv(a.weight) }));
      const sameR = rows.every((x) => x.reps === rows[0].reps), sameW = rows.every((x) => x.weightKg === rows[0].weightKg);
      if (sameR && sameW) { e.reps = rows[0].reps; e.weightKg = rows[0].weightKg; }
      else { e.perSet = rows; e.reps = sameR ? rows[0].reps : rows.map((x) => x.reps ?? "?").join("-").slice(0, 20); e.weightKg = sameW ? rows[0].weightKg : null; }
    } else {
      e.reps = reps ?? (setReps.join("-").slice(0, 20) || null);
      e.issues.push({ field: "reps", kind: "unclear", text: "Las series y los valores por serie no coinciden: revisalos." });
    }
  } else { e.reps = reps; e.weightKg = conv(a.weight); }
  if (e.weightKg != null && e.weightKg > 500) { e.weightKg = null; e.issues.push({ field: "weight", kind: "unclear", text: "La carga leída no parece real: revisala." }); }
  if (lb && (a.weight != null || setW.length)) e.issues.push({ field: "weight", kind: "info", text: "Leído en libras y pasado a kg." });
  e.unit = a.unit;
  e.restSec = a.rest_sec != null && a.rest_sec >= 0 && a.rest_sec <= 900 ? Math.round(a.rest_sec) : null;
  e.rir = a.rir != null && a.rir >= 0 && a.rir <= 5 ? a.rir : null;
  e.rpe = a.rpe != null && a.rpe >= 1 && a.rpe <= 10 ? a.rpe : null;
  e.tempo = clip(a.tempo, 12);
  e.technique = clip(a.technique, 80);
  const note = clip(a.note, 120);
  e.note = e.technique && !(note ?? "").toLowerCase().includes(e.technique.toLowerCase()) ? clip([note, e.technique].filter(Boolean).join(" · "), 120) : note;
  const fieldOf: Record<string, ImportField> = { name: "name", nombre: "name", sets: "sets", series: "sets", reps: "reps", repeticiones: "reps", weight: "weight", peso: "weight", carga: "weight", rest: "rest", descanso: "rest" };
  for (const u of a.unclear ?? []) {
    const f = fieldOf[fold(String(u)).trim()];
    if (f) e.issues.push({ field: f, kind: "unclear", text: f === "name" ? "El nombre no se lee bien: confirmalo." : "No se lee bien: confirmalo." });
  }
  // Cardio: la velocidad, la inclinación o el nivel suelen venir en la nota («vel 5 incl 3»); nunca son una carga.
  const named = activityGuess(written);
  if (named) {
    const a = readActivityText(e.note ?? "", named);
    const kg = e.weightKg;
    if (a.profile) {
      if (Object.keys(a.values).length) e.note = clip(a.rest.replace(/^[\s·,;-]+|[\s·,;-]+$/g, ""), 120);
      importActivity(e, a.profile, a.values);
      if (e.activity && kg != null) e.note = clip([e.note, `${String(kg).replace(".", ",")} kg`].filter(Boolean).join(" · "), 120);
    }
  }
  // Evidencia: si el renglón leído no tiene ningún número, las series y repeticiones no pueden venir de ahí.
  if (e.source && !/\d/.test(e.source) && (e.sets != null || (e.reps && /\d/.test(e.reps)))) {
    e.issues.push({ field: "sets", kind: "unclear", text: "No encontramos las series escritas en ese renglón: confirmalas." });
  }
  return finishExercise({ ...e, section: clip(a.section, 40), groupKind: e.group ? "superset" : null, rounds: null });
}

// ── De lo importado a lo que se guarda (rutina propia o día de programa) ────────────────────────────────────────────────
/**
 * Valores ya revisados → series y detalle con las mismas formas del constructor. Valores por serie, RIR/RPE o tempo se
 * guardan en el plan (`setPlan`), igual que en un programa del coach. Nunca agrega datos: lo que no hay queda vacío.
 */
export function importedDetail(e: { sets: number; reps: string; weightKg: number | null; perSet: ImportSetValue[] | null; rir: number | null; rpe: number | null; tempo: string | null; activity?: ActivityDetail | null }): ExerciseDetail | null {
  const base = emptyDetail();
  // Ejercicios por tiempo: una actividad se guarda configurada por duración (sin plan por serie). Si lo revisado ya no es una
  // duración (o una distancia en el remo), se guarda como antes, sin la actividad.
  if (e.activity) {
    const a = validateActivity(e.activity, { reps: e.reps });
    if (a.ok) return { ...base, activity: a.activity };
  }
  const rows = e.perSet && e.perSet.length === e.sets ? e.perSet : null;
  const needsPlan = !!rows || e.rir != null || e.rpe != null;
  const out: ExerciseDetail = { ...base, tempo: e.tempo };
  if (needsPlan) {
    out.technique = rows ? "custom" : "straight";
    out.setPlan = Array.from({ length: e.sets }, (_, i): SetSpec => ({ kind: "work", reps: (rows?.[i]?.reps ?? e.reps) || e.reps, weightKg: rows ? rows[i].weightKg : e.weightKg, pct1rm: null, rir: e.rir, rpe: e.rpe, restSec: null, note: null }));
  }
  return out.setPlan || out.tempo ? out : null;
}

/** Método detectado → plan del constructor sobre lo que ya hay (por serie incluido). */
export function applyImportedMethod(det: DetectedMethod, sets: number, reps: string, current: ExerciseDetail | null) {
  return methodDetail(det, { sets, reps, weightKg: null }, current);
}

export type ImportedMethod = DetectedMethod & { label: string };
/** Método escrito en la técnica o la nota, con su etiqueta para la vista previa. */
export function importedMethod(e: Pick<ImportExercise, "technique" | "note">): ImportedMethod | null {
  const m = detectMethod(e.technique, e.note);
  return m ? { ...m, label: detectedLabel(m) } : null;
}

/** Cuántos datos faltan o hay que revisar (para el resumen y para habilitar «Guardar»). */
export function importIssueCount(days: { exercises: { issues: ImportIssue[] }[] }[]) {
  let missing = 0, unclear = 0;
  for (const d of days) for (const e of d.exercises) for (const i of e.issues) { if (i.kind === "missing") missing++; else if (i.kind === "unclear") unclear++; }
  return { missing, unclear };
}

// ── Procedencia (preparación de Adaptive Coaching 3.0) ──────────────────────────────────────────────────────────────────
/**
 * Lo que decía el documento, guardado una vez junto a la rutina importada (no se edita después). La versión vigente sigue
 * siendo la rutina; lo ejecutado, las sesiones. Así se distingue lo indicado originalmente, lo que cambió la persona, lo que
 * quedó desconocido en el documento (`unknown`) y cómo se completó (`completed`: a mano; `suggested`: con el valor sugerido).
 */
export type ImportOriginExercise = {
  written: string; exerciseId: string; sets: number | null; reps: string | null; weightKg: number | null; perSet: ImportSetValue[] | null;
  restSec: number | null; rir: number | null; rpe: number | null; tempo: string | null; technique: string | null;
  unknown: ImportField[]; completed: ImportField[]; suggested: ImportField[];
  /** Ejercicios por tiempo: la actividad leída del documento (cinta, bici, remo…). */
  activity?: ActivityDetail | null;
};
export type ImportOrigin = { kind: "import"; opId: string; day: number; at: string; source: "sheet" | "text" | "ai"; file: "text" | "sheet" | "image" | "pdf"; dayName: string; exercises: ImportOriginExercise[] };
export const IMPORT_SOURCES = ["sheet", "text", "ai"] as const;
export const IMPORT_FILES = ["text", "sheet", "image", "pdf"] as const;
