// Biblioteca REPI Exercise Motion — Hombros (y face pull, que el catálogo agrupa en Espalda).
import { fromShoulder, HIP_H, onTrunk, shoulderOf } from "../kit";
import type { Pose, Prop, Vec } from "../types";
import type { MotionEntry } from "./types";

const REVIEWED = { status: "internal", date: "2026-11-14" } as const;
const STAND: Vec = [0, HIP_H - 0.5];
const rad = (d: number) => (d * Math.PI) / 180;

// ── Press militar de pie con barra (vista lateral). La barra sale de adelante de los hombros, pasa frente a la cara (la cabeza
// se corre apenas atrás) y termina arriba, sobre la mitad del pie. ───────────────────────────────────────────────────────────
const OHP_SH = shoulderOf(STAND, 0); // [-1, 145.5]
const ohp = (hand: Vec, head: number): Pose => ({ pelvis: STAND, trunk: 0, head, hand: { near: hand }, foot: { near: [-1, 8] }, elbow: { near: [1, -1], far: [1, -1] } });
const OHP_RACK: Vec = [OHP_SH[0] + 12, OHP_SH[1] - 3];
const OHP_FACE: Vec = [OHP_SH[0] + 15, OHP_SH[1] + 28];
const OHP_TOP: Vec = [OHP_SH[0] + 3, OHP_SH[1] + 60];

// ── Press de hombros con mancuernas, sentado en banco con respaldo vertical (vista lateral). Los codos van a los costados:
// de perfil el brazo se ve en escorzo abajo y entero arriba. `e` = elevación del brazo desde la horizontal. ────────────────
const SP_PELVIS: Vec = [0, 58], SP_T = -6;
const SP_SH = shoulderOf(SP_PELVIS, SP_T);
const sp = (e: number): Pose => {
  const s = Math.sin(rad(e));
  return {
    pelvis: SP_PELVIS, trunk: SP_T, head: 2,
    hand: { near: [SP_SH[0] + 4, SP_SH[1] + Math.min(61, 30 * s + 33)] }, foot: { near: [40, 8] },
    elbow: { near: [0.3, -1], far: [0.3, -1] }, scale: { upperArm: Math.max(0.24, Math.abs(s)) },
  };
};
const SEATED_BENCH: Prop[] = [
  { kind: "tube", a: [4, 0], b: [4, 45], w: 6, layer: "back" },
  { kind: "tube", a: [-30, 0], b: [36, 0], w: 5, layer: "back" },
  { kind: "pad", a: [-12, 50], b: [26, 50], t: 9, layer: "back" },
  { kind: "tube", a: [-22, 0], b: onTrunk(SP_PELVIS, SP_T, 10, -22), w: 5, layer: "back" },
  { kind: "pad", a: onTrunk(SP_PELVIS, SP_T, 2, -17.5), b: onTrunk(SP_PELVIS, SP_T, 64, -17.5), t: 9, layer: "back" },
];

// ── Elevaciones laterales (vista frontal). ────────────────────────────────────────────
// Posiciones de los extremos tomadas del ejemplar; en el medio la mano sigue el arco alrededor del hombro con el codo apenas
// flexionado y siempre un poco más alto que la muñeca. `f`: 0 = abajo, 1 = a la altura del hombro.
const LR_SH: Vec = [-19, STAND[1] + 50];
const lr = (f: number): Pose => {
  const th = rad(6.4 + (85.7 - 6.4) * f), r = 53.8 + (60.2 - 53.8) * f;
  const dx = Math.sin(th) * r, dy = -Math.cos(th) * r; // dx > 0 = hacia afuera
  const hint: Vec = [-Math.cos(th), Math.sin(th)];
  return {
    pelvis: STAND, trunk: 0,
    hand: { near: [LR_SH[0] - dx, LR_SH[1] + dy], far: [-LR_SH[0] + dx, LR_SH[1] + dy] },
    foot: { near: [-11, 8], far: [11, 8] },
    elbow: { near: hint, far: [-hint[0], hint[1]] },
  };
};

// ── Elevaciones frontales (vista lateral): brazos casi extendidos, de adelante de los muslos a la altura de los hombros. ──────
const fr = (deg: number): Pose => {
  const d = rad(deg);
  return {
    pelvis: STAND, trunk: 0, head: 0,
    hand: { near: fromShoulder(STAND, 0, deg, 60) }, foot: { near: [-1, 8] },
    elbow: { near: [-Math.cos(d), -Math.sin(d)], far: [-Math.cos(d), -Math.sin(d)] },
  };
};

// ── Pájaros con mancuernas: cámara cenital (vista frontal girada, cabeza a la izquierda). Tronco inclinado casi paralelo al
// piso, así que desde arriba se ve la espalda completa; las piernas bajan al piso (escorzo fuerte). Los brazos cuelgan hacia el
// piso (escorzo, manos bajo los hombros) y abren en arco hacia los costados hasta la línea de la espalda. ─────────────────────
const BO_P: Vec = [0, 0], BO_SY = BO_P[1] + 50;
const bo = (deg: number): Pose => {
  // deg: ángulo del brazo desde la vertical (colgando hacia el piso) hacia el costado.
  const s = Math.sin(rad(deg)), dx = 16 + 65 * s, k = Math.max(0.2, Math.min(1, s * 1.05));
  return {
    pelvis: BO_P, trunk: 0, head: 0,
    hand: { near: [-dx, BO_SY + 1], far: [dx, BO_SY + 1] },
    foot: { near: [-11, BO_P[1] - 14], far: [11, BO_P[1] - 14] },
    elbow: { near: [0, -1], far: [0, -1] },
    scale: { thigh: 0.2, shin: 0.2, upperArm: k, foreArm: k },
  };
};

// ── Face pull (vista lateral): de pie frente a la polea alta, la soga va a la cara con los codos altos y abiertos. ─────────────
const FP_T = -4;
const FP_SH = shoulderOf(STAND, FP_T);
const FP_PULLEY: Vec = [84, 170];
const FP_FAR = fromShoulder(STAND, FP_T, 97, 58), FP_NEAR: Vec = [FP_SH[0] + 5, FP_SH[1] + 21];
// Escorzo por fase: al tirar, el brazo gira hacia el costado (hacia el observador) y se ve cada vez más corto; al final el
// antebrazo queda casi vertical junto a la cabeza y el brazo apunta afuera, a la altura del hombro.
const FP_SCALE: Record<number, [number, number]> = { 0: [1, 1], 0.5: [0.5, 0.63], 1: [0.2, 0.66] };
const fp = (f: 0 | 0.5 | 1): Pose => {
  // f: 0 = brazos extendidos hacia la polea, 0.5 = a mitad de camino con los codos altos, 1 = manos a los costados de la cara.
  const [ua, fa] = FP_SCALE[f];
  const hint: Vec = f === 1 ? [-1, -0.1] : f === 0.5 ? [0, 1] : [0, -1];
  return {
    pelvis: STAND, trunk: FP_T, head: 0,
    hand: { near: [FP_FAR[0] + (FP_NEAR[0] - FP_FAR[0]) * f, FP_FAR[1] + (FP_NEAR[1] - FP_FAR[1]) * f] }, foot: { near: [-1, 8], far: [-14, 8] },
    elbow: { near: hint, far: hint }, scale: { upperArm: ua, foreArm: fa },
    props: { lift: 16 * f },
  };
};

export const HOMBROS: MotionEntry[] = [
  {
    id: "press-militar-barra", version: 1, title: "Press militar", group: "Hombros",
    catalog: ["Press militar"],
    compatible: [{ name: "Press militar sentado con barra", difference: "Se hace sentado en un banco con respaldo: las piernas y la cadera no participan y el tronco queda apoyado." }],
    equipment: ["barra", "rack"],
    motion: {
      view: "side", seconds: 3.2,
      keys: [
        { t: 0, pose: ohp(OHP_RACK, -12), say: "Empujá hacia arriba" }, { t: 0.06, pose: ohp(OHP_RACK, -12) },
        { t: 0.2, pose: ohp(OHP_FACE, -12) },
        { t: 0.38, pose: ohp(OHP_TOP, 0), say: "Bajá a los hombros" }, { t: 0.46, pose: ohp(OHP_TOP, 0) },
        { t: 0.7, pose: ohp(OHP_FACE, -12) },
      ],
      props: [{ kind: "disc", at: "hand.near", layer: "front" }],
    },
    technique: {
      setup: ["Sacá la barra del rack a la altura de la parte alta del pecho.", "Agarrá un poco más ancho que los hombros, con los antebrazos verticales.", "Pies al ancho de la cadera, glúteos y abdomen firmes."],
      execution: ["Empujá la barra en línea recta hacia arriba, corriendo apenas la cabeza hacia atrás para que pase.", "Cuando la barra pase la frente, llevá la cabeza adelante: arriba la barra queda sobre la mitad del pie.", "Bajá controlando hasta la parte alta del pecho."],
      cues: ["Glúteos y abdomen apretados", "Barra cerca de la cara", "Brazos estirados arriba, sin trabar"],
      mistakes: ["Arquear la zona lumbar para empujar: apretá glúteos y abdomen y bajá el peso.", "Empujar la barra hacia adelante: mantenela cerca de la cara, en línea recta.", "Usar impulso de las piernas: eso es otro ejercicio (push press); mantené las rodillas quietas."],
      breathing: "Tomá aire abajo, sostenelo al empujar y soltalo arriba o al bajar.",
    },
    anatomy: { primary: ["deltoide_anterior"], secondary: ["deltoide_lateral", "triceps", "trapecio", "serrato"] },
    review: REVIEWED,
  },
  {
    id: "press-hombros-mancuernas", version: 1, title: "Press de hombros con mancuernas", group: "Hombros",
    catalog: ["Press de hombros con mancuernas"],
    equipment: ["mancuernas", "banco con respaldo"],
    motion: {
      view: "side", seconds: 3,
      keys: [
        { t: 0, pose: sp(-20), say: "Empujá hacia arriba" }, { t: 0.06, pose: sp(-20) },
        { t: 0.2, pose: sp(20) }, { t: 0.38, pose: sp(82), say: "Bajá controlando" }, { t: 0.46, pose: sp(82) },
        { t: 0.68, pose: sp(20) },
      ],
      props: [...SEATED_BENCH, { kind: "dumbbell", at: "hand.near", layer: "front" }],
    },
    technique: {
      setup: ["Regulá el respaldo casi vertical y apoyá bien la espalda.", "Subí las mancuernas a la altura de los hombros, con las palmas hacia adelante.", "Codos debajo de las muñecas y un poco adelante del cuerpo."],
      execution: ["Empujá las mancuernas hacia arriba hasta casi extender los brazos.", "Arriba quedan sobre los hombros, sin chocarlas.", "Bajá controlando hasta que las mancuernas lleguen a la altura de las orejas."],
      cues: ["Antebrazos verticales", "Espalda apoyada", "Hombros lejos de las orejas"],
      mistakes: ["Despegar la espalda y arquear la zona lumbar: bajá el peso y mantené el apoyo.", "Bajar sólo un poco: llegá a la altura de las orejas para hacer el recorrido completo.", "Codos muy atrás: llevalos un poco adelante, en la línea de los hombros."],
      breathing: "Soltá el aire al empujar y tomalo al bajar.",
    },
    anatomy: { primary: ["deltoide_anterior"], secondary: ["deltoide_lateral", "triceps", "trapecio"] },
    review: REVIEWED,
  },
  {
    id: "elevaciones-laterales-mancuernas", version: 1, title: "Elevaciones laterales", group: "Hombros",
    catalog: ["Elevaciones laterales"],
    compatible: [{ name: "Elevaciones laterales en polea", difference: "Se hace con un brazo por vez y el cable de una polea baja que cruza por delante del cuerpo, con tensión en todo el recorrido." }],
    equipment: ["mancuernas"],
    motion: {
      view: "front", seconds: 3,
      keys: [
        { t: 0, pose: lr(0), say: "Subí hasta la altura del hombro" }, { t: 0.08, pose: lr(0) },
        { t: 0.2, pose: lr(0.35) }, { t: 0.32, pose: lr(0.7) },
        { t: 0.45, pose: lr(1), say: "Bajá lento" }, { t: 0.52, pose: lr(1) },
        { t: 0.68, pose: lr(0.7) }, { t: 0.84, pose: lr(0.35) },
      ],
      props: [{ kind: "dumbbell", at: "hand.near", layer: "front" }, { kind: "dumbbell", at: "hand.far", layer: "front" }],
    },
    technique: {
      setup: ["De pie, pies al ancho de la cadera, una mancuerna en cada mano a los costados.", "Codos apenas flexionados y fijos.", "Pecho arriba y hombros abajo."],
      execution: ["Subí los brazos hacia los costados hasta la altura de los hombros.", "Llevá el movimiento con los codos, que quedan apenas por encima de las muñecas.", "Bajá lento, sin dejar caer los brazos."],
      cues: ["Subí con los codos", "Hombros lejos de las orejas", "Bajá lento"],
      mistakes: ["Balancear el cuerpo para subir: bajá el peso y mantené el tronco quieto.", "Subir más arriba de los hombros encogiéndolos: pará a la altura del hombro.", "Muñecas por encima de los codos: llevá la mancuerna con el codo apenas más alto."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["deltoide_lateral"], secondary: ["deltoide_anterior", "trapecio"] },
    review: REVIEWED,
  },
  {
    id: "elevaciones-frontales-mancuernas", version: 1, title: "Elevaciones frontales", group: "Hombros",
    catalog: ["Elevaciones frontales"],
    compatible: [{ name: "Elevaciones frontales con disco", difference: "Se sostiene un disco con las dos manos en lugar de una mancuerna en cada mano; el recorrido es el mismo." }],
    equipment: ["mancuernas"],
    motion: {
      view: "side", seconds: 3,
      keys: [
        { t: 0, pose: fr(6), say: "Subí al frente" }, { t: 0.06, pose: fr(6) },
        { t: 0.24, pose: fr(48) }, { t: 0.42, pose: fr(90), say: "Bajá lento" }, { t: 0.5, pose: fr(90) },
        { t: 0.72, pose: fr(48) },
      ],
      props: [{ kind: "dumbbell", at: "hand.near", layer: "front" }],
    },
    technique: {
      setup: ["De pie, una mancuerna en cada mano delante de los muslos, palmas hacia atrás.", "Codos apenas flexionados y fijos.", "Abdomen firme y pecho arriba."],
      execution: ["Subí los brazos al frente hasta la altura de los hombros.", "Sostené un instante arriba.", "Bajá lento hasta delante de los muslos."],
      cues: ["Tronco quieto", "Hasta la altura del hombro", "Bajá lento"],
      mistakes: ["Balancear el tronco hacia atrás: bajá el peso y apretá el abdomen.", "Subir más arriba de la cabeza: pará a la altura de los hombros.", "Encoger los hombros: mantenelos abajo durante toda la serie."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["deltoide_anterior"], secondary: ["pectoral_superior", "deltoide_lateral"] },
    review: REVIEWED,
  },
  {
    id: "pajaros-mancuernas", version: 1, title: "Pájaros con mancuernas", group: "Hombros",
    catalog: ["Pájaros con mancuernas"],
    equipment: ["mancuernas"],
    motion: {
      view: "front", camera: "top", seconds: 3,
      keys: [
        { t: 0, pose: bo(0), say: "Abrí los brazos a los costados" }, { t: 0.06, pose: bo(0) },
        { t: 0.2, pose: bo(30) }, { t: 0.32, pose: bo(60) },
        { t: 0.42, pose: bo(84), say: "Bajá lento" }, { t: 0.5, pose: bo(84) },
        { t: 0.66, pose: bo(60) }, { t: 0.8, pose: bo(30) },
      ],
      props: [{ kind: "dumbbell", at: "hand.near", layer: "front" }, { kind: "dumbbell", at: "hand.far", layer: "front" }],
    },
    technique: {
      setup: ["Con una mancuerna en cada mano, flexioná apenas las rodillas e inclinate desde la cadera hasta dejar el tronco casi paralelo al piso.", "Espalda recta y brazos colgando bajo los hombros, palmas enfrentadas.", "Codos apenas flexionados y fijos."],
      execution: ["Abrí los brazos hacia los costados hasta la altura de la espalda.", "Juntá un poco los omóplatos arriba.", "Bajá lento hasta que los brazos vuelvan a colgar."],
      cues: ["Espalda recta", "Abrí con los codos", "Cuello largo"],
      mistakes: ["Levantar el tronco para subir los brazos: mantené la inclinación y bajá el peso.", "Redondear la espalda: inclinate desde la cadera con el abdomen firme.", "Flexionar y extender los codos: mantené el ángulo fijo durante todo el arco."],
      breathing: "Soltá el aire al abrir y tomalo al bajar.",
    },
    anatomy: { primary: ["deltoide_posterior"], secondary: ["espalda_media", "infraespinoso", "trapecio"] },
    review: { ...REVIEWED, notes: "Cámara cenital: se ve la espalda desde arriba, con la cabeza a la izquierda." },
  },
  {
    id: "face-pull-soga", version: 1, title: "Face pull", group: "Espalda",
    catalog: ["Face pull"],
    equipment: ["polea alta", "soga"],
    motion: {
      view: "side", seconds: 3,
      keys: [
        { t: 0, pose: fp(0), say: "Tirá hacia la cara" }, { t: 0.06, pose: fp(0) },
        { t: 0.22, pose: fp(0.5) }, { t: 0.4, pose: fp(1), say: "Volvé controlando" }, { t: 0.5, pose: fp(1) },
        { t: 0.72, pose: fp(0.5) },
      ],
      props: [
        { kind: "post", x: FP_PULLEY[0] + 10, h: 214, w: 8, layer: "back" },
        { kind: "stack", x: FP_PULLEY[0] + 24, y: 6, w: 18, h: 74, lift: "props.lift", layer: "back" },
        { kind: "tube", a: [FP_PULLEY[0] + 10, FP_PULLEY[1]], b: FP_PULLEY, w: 5, layer: "back" },
        { kind: "pulley", at: FP_PULLEY, layer: "back" },
        { kind: "cable", a: FP_PULLEY, b: "hand.near+13,2", layer: "front" },
        { kind: "rope", at: "hand.near+13,2", to: "hand.near", layer: "front" },
      ],
    },
    technique: {
      setup: ["Poné la polea a la altura de la cara o un poco más arriba, con la soga.", "Agarrá los extremos de la soga con las palmas hacia abajo y dá un paso atrás.", "Brazos extendidos al frente, pecho arriba y abdomen firme."],
      execution: ["Tirá de la soga hacia la cara separando las manos.", "Llevá los codos altos y hacia atrás, a la altura de los hombros.", "Terminá con las manos a los costados de la cabeza y volvé controlando."],
      cues: ["Codos altos", "Separá la soga", "Juntá los omóplatos"],
      mistakes: ["Tirar con los codos bajos, como un remo: subilos a la altura de los hombros.", "Echar el cuerpo atrás para mover más peso: bajá la carga y mantené el tronco quieto.", "Encoger los hombros: mantenelos abajo y lejos de las orejas."],
      breathing: "Soltá el aire al tirar y tomalo al volver.",
    },
    anatomy: { primary: ["deltoide_posterior", "espalda_media"], secondary: ["infraespinoso", "trapecio"] },
    review: REVIEWED,
  },
];
