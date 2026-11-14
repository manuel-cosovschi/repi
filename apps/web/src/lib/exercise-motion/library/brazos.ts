// Biblioteca REPI Exercise Motion — Brazos.
import { HIP_H, onTrunk, shoulderOf } from "../kit";
import type { Key, Pose, Prop, Vec } from "../types";
import type { MotionEntry } from "./types";

const REVIEWED = { status: "internal", date: "2026-11-14" } as const;

/** Punto a `r` cm de `o` en la dirección `deg` (grados desde la vertical hacia abajo, girando hacia +x: 90 = al frente). */
const at = (o: Vec, deg: number, r: number): Vec => { const a = (deg * Math.PI) / 180; return [o[0] + Math.sin(a) * r, o[1] - Math.cos(a) * r]; };
const FORE = 33, UPPER = 30;

/**
 * Ciclo de un curl o una extensión con el codo fijo: la mano recorre un arco (se agrega la pose intermedia de ida y de
 * vuelta para que la interpolación no mueva el codo).
 */
const arc = (pose: (a: number) => Pose, a0: number, a1: number, say0: string, say1: string): Key[] => {
  const m = (a0 + a1) / 2;
  return [
    { t: 0, pose: pose(a0), say: say0 }, { t: 0.08, pose: pose(a0) }, { t: 0.25, pose: pose(m) },
    { t: 0.42, pose: pose(a1), say: say1 }, { t: 0.5, pose: pose(a1) }, { t: 0.74, pose: pose(m) },
  ];
};

// ── Curl de pie (barra o mancuernas): codo quieto al costado del cuerpo, el antebrazo sube en arco. ──────────────────
const stP: Vec = [0, HIP_H - 0.5], stT = 2;
const stS = shoulderOf(stP, stT), stE = at(stS, 6, UPPER);
const standCurl = (a: number): Pose => ({
  pelvis: stP, trunk: stT, head: -4, foot: { near: [2, 8] }, knee: { near: [1, 0.1] },
  hand: { near: at(stE, a, FORE) }, elbow: { near: [-0.3, -1] }, props: { dir: a },
});

// ── Curl en banco Scott: sentado, la parte de atrás del brazo apoyada en el atril inclinado a 45°. ──────────────────
const scP: Vec = [0, 62], scT = 16;
const scS = shoulderOf(scP, scT), scE = at(scS, 45, UPPER);
const scott = (a: number): Pose => ({
  pelvis: scP, trunk: scT, head: -10, foot: { near: [34, 8] },
  hand: { near: at(scE, a, FORE) }, elbow: { near: [0.6, -1] },
});
// Atril: debajo del brazo (del lado de atrás), paralelo a él.
const SC_U: Vec = [Math.SQRT1_2, -Math.SQRT1_2], SC_OFF: Vec = [-9, -9];
const scPadA: Vec = [scS[0] + SC_U[0] * 2 + SC_OFF[0], scS[1] + SC_U[1] * 2 + SC_OFF[1]];
const scPadB: Vec = [scE[0] + SC_U[0] * 8 + SC_OFF[0], scE[1] + SC_U[1] * 8 + SC_OFF[1]];

// ── Curl inclinado: banco a ~50°, la espalda apoyada y los brazos colgando por detrás de la línea del tronco. ────────
const inP: Vec = [0, 55], inT = -38;
const inS = shoulderOf(inP, inT), inE = at(inS, -3, UPPER);
const incline = (a: number): Pose => ({
  pelvis: inP, trunk: inT, head: 22, foot: { near: [46, 8] },
  hand: { near: at(inE, a, FORE) }, elbow: { near: [-0.3, -1] },
});

// ── Extensiones en polea alta, de pie frente a la columna. ────────────────────────────
const tp = (down: boolean, rope = false): Pose => ({
  pelvis: [0, HIP_H - 0.5], trunk: 10, head: -8, hand: { near: down ? (rope ? [10, 84] : [12, 86]) : [24, 124] },
  foot: { near: [3, 8] }, knee: { near: [1, 0.1] }, props: { lift: down ? 14 : 0 },
});
const pushKeys = (rope: boolean): Key[] => [
  { t: 0, pose: tp(false, rope), say: "Extendé hasta abajo" }, { t: 0.08, pose: tp(false, rope) },
  { t: 0.45, pose: tp(true, rope), say: "Volvé sin mover los codos" }, { t: 0.52, pose: tp(true, rope) },
];
const PUSH_FRAME: Prop[] = [
  { kind: "post", x: 52, h: 215, w: 7, layer: "back" },
  { kind: "stack", x: 64, y: 6, w: 18, h: 60, lift: "props.lift", layer: "back" },
  { kind: "pulley", at: [46, 208], layer: "back" },
];

// ── Extensión sobre la cabeza en polea: de espaldas a la columna, paso adelante, codos junto a la cabeza. ────────────
const ohP: Vec = [0, 90], ohT = 35;
const ohS = shoulderOf(ohP, ohT), ohE = at(ohS, 135, UPPER); // brazo hacia arriba y adelante, a 45° de la vertical
const overhead = (a: number): Pose => ({
  pelvis: ohP, trunk: ohT, head: -6, foot: { near: [30, 8], far: [-38, 16] }, footTilt: { far: 32 },
  hand: { near: at(ohE, a, FORE) }, elbow: { near: [0.6, 1] }, props: { lift: (14 * (-85 - a)) / 145 },
});
const OH_PULLEY: Vec = [-74, 166];

export const BRAZOS: MotionEntry[] = [
  {
    id: "curl-con-barra", version: 1, title: "Curl con barra", group: "Brazos",
    catalog: ["Curl con barra"],
    compatible: [
      { name: "Curl con barra Z", difference: "La barra Z deja las muñecas en un agarre semisupino; la postura y el recorrido son los mismos." },
      { name: "Curl con mancuernas", difference: "Se hace con una mancuerna en cada mano, palmas hacia adelante; cada brazo va libre y el recorrido es el mismo." },
    ],
    equipment: ["barra", "discos"],
    motion: {
      view: "side", seconds: 3,
      keys: arc(standCurl, 10, 148, "Subí sin mover los codos", "Bajá controlando"),
      props: [{ kind: "disc", at: "hand.near", r: 15, layer: "front" }],
    },
    technique: {
      setup: ["Parate con los pies al ancho de caderas y las rodillas apenas flojas.", "Tomá la barra con las palmas hacia adelante, al ancho de hombros.", "Brazos extendidos y codos pegados al costado del cuerpo."],
      execution: ["Flexioná los codos y subí la barra en arco hasta la altura del pecho.", "Apretá el bíceps arriba un instante.", "Bajá controlando hasta extender los brazos, sin soltar de golpe."],
      cues: ["Codos quietos", "Tronco firme", "Muñecas rectas"],
      mistakes: ["Balancear el tronco para subir: bajá el peso y apretá el abdomen.", "Adelantar los codos arriba: dejalos al costado del cuerpo.", "Recorrido corto abajo: extendé los brazos en cada repetición."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["biceps"], secondary: ["antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "curl-banco-scott", version: 1, title: "Curl en banco Scott", group: "Brazos",
    catalog: ["Curl en banco Scott"],
    equipment: ["banco Scott", "barra", "discos"],
    motion: {
      view: "side", seconds: 3,
      keys: arc(scott, 56, 158, "Subí sin despegar los brazos", "Bajá controlando"),
      props: [
        { kind: "pad", a: [-14, 54], b: [20, 54], t: 9, layer: "back" },
        { kind: "tube", a: [2, 0], b: [2, 49], w: 6, layer: "back" },
        { kind: "tube", a: [36, 0], b: [36, scPadB[1] - 2], w: 6, layer: "back" },
        { kind: "pad", a: scPadA, b: scPadB, t: 14, layer: "back" },
        { kind: "disc", at: "hand.near", r: 14, layer: "front" },
      ],
    },
    technique: {
      setup: ["Ajustá el asiento para que las axilas queden apoyadas arriba del atril.", "Apoyá toda la parte de atrás de los brazos sobre el atril.", "Tomá la barra con las palmas hacia arriba, al ancho de hombros."],
      execution: ["Subí la barra flexionando los codos, sin despegar los brazos del atril.", "Pará antes de que los antebrazos queden verticales.", "Bajá controlando hasta casi extender los codos, sin trabarlos."],
      cues: ["Brazos pegados al atril", "Bajada lenta", "Hombros quietos"],
      mistakes: ["Soltar la barra abajo y rebotar: frená un poco antes de la extensión completa.", "Levantar los codos del atril: bajá el peso.", "Echar los hombros atrás para subir: el movimiento es sólo del codo."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["biceps"], secondary: ["antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "curl-inclinado-mancuernas", version: 1, title: "Curl inclinado con mancuernas", group: "Brazos",
    catalog: ["Curl inclinado con mancuernas"],
    equipment: ["banco inclinable", "mancuernas"],
    motion: {
      view: "side", seconds: 3.2,
      keys: arc(incline, 2, 136, "Subí sin adelantar los codos", "Bajá hasta estirar"),
      props: [
        { kind: "pad", a: [-10, 47], b: [26, 47], t: 9, layer: "back" },
        { kind: "pad", a: onTrunk(inP, inT, 0, -16), b: onTrunk(inP, inT, 62, -16), t: 9, layer: "back" },
        { kind: "tube", a: [6, 0], b: [6, 42], w: 6, layer: "back" },
        { kind: "tube", a: [-30, 0], b: onTrunk(inP, inT, 22, -17), w: 5, layer: "back" },
        { kind: "dumbbell", at: "hand.near", r: 8, layer: "front" },
      ],
    },
    technique: {
      setup: ["Incliná el respaldo a unos 45–60° y apoyá bien la espalda y la cabeza.", "Dejá colgar los brazos estirados, con las palmas hacia adelante.", "Pies firmes en el piso."],
      execution: ["Subí las mancuernas flexionando los codos, sin moverlos hacia adelante.", "Llegá hasta donde el bíceps queda bien contraído, sin que los codos se adelanten.", "Bajá controlando hasta estirar los brazos por completo."],
      cues: ["Espalda pegada al respaldo", "Codos apuntando al piso", "Estirá abajo"],
      mistakes: ["Adelantar los codos al subir: mantenelos colgando debajo de los hombros.", "Despegar la espalda o los hombros del respaldo: bajá el peso.", "Rebotar abajo: frená y estirá con control."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["biceps"], secondary: ["antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "curl-martillo", version: 1, title: "Curl martillo", group: "Brazos",
    catalog: ["Curl martillo"],
    equipment: ["mancuernas"],
    motion: {
      view: "side", seconds: 3,
      keys: arc(standCurl, 10, 140, "Subí con el pulgar arriba", "Bajá controlando"),
      props: [{ kind: "dumbbell-side", at: "hand.near", dir: "props.dir", half: 8, layer: "front" }],
    },
    technique: {
      setup: ["Parate con una mancuerna en cada mano y los brazos al costado del cuerpo.", "Agarre neutro: palmas mirando hacia el cuerpo y pulgares hacia adelante.", "Hombros abajo y abdomen firme."],
      execution: ["Subí la mancuerna flexionando el codo, sin girar la muñeca.", "Llegá hasta la altura del hombro con el codo quieto al costado.", "Bajá controlando hasta extender el brazo. Podés alternar brazos o subir los dos juntos."],
      cues: ["Pulgar arriba", "Codo pegado", "Sin balanceo"],
      mistakes: ["Girar la palma hacia arriba: mantené el agarre neutro toda la serie.", "Balancear el cuerpo: bajá el peso y apretá el abdomen.", "Llevar el codo hacia adelante: dejalo al costado del tronco."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["biceps", "antebrazo"], secondary: [] },
    review: REVIEWED,
  },
  {
    id: "extension-triceps-polea", version: 1, title: "Extensión de tríceps en polea", group: "Brazos",
    catalog: ["Extensión de tríceps en polea"],
    equipment: ["polea alta", "barra corta"],
    motion: {
      view: "side", seconds: 2.8,
      keys: pushKeys(false),
      props: [
        ...PUSH_FRAME,
        { kind: "cable", a: [46, 208], b: "hand.near", layer: "back" },
        { kind: "bar", a: "hand.near+-6,1.5", b: "hand.near+6,-1.5", w: 3.4, layer: "front" },
      ],
    },
    technique: {
      setup: ["Parate frente a la polea alta y tomá la barra con las palmas hacia abajo.", "Codos pegados al costado del cuerpo, tronco apenas inclinado adelante.", "Rodillas flojas y abdomen firme."],
      execution: ["Empujá la barra hacia abajo extendiendo los codos hasta estirar los brazos.", "Apretá el tríceps abajo un instante.", "Volvé controlando hasta que los antebrazos queden casi horizontales, sin mover los codos."],
      cues: ["Codos quietos", "Muñecas rectas", "Hombros abajo"],
      mistakes: ["Separar los codos del cuerpo: mantenelos fijos al costado.", "Empujar con el tronco: bajá el peso y quedate firme.", "Dejar subir la barra demasiado: frená cuando el antebrazo queda horizontal."],
      breathing: "Soltá el aire al empujar y tomalo al volver.",
    },
    anatomy: { primary: ["triceps"], secondary: ["antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "extension-triceps-soga", version: 1, title: "Extensión de tríceps con soga", group: "Brazos",
    catalog: ["Extensión de tríceps con soga"],
    equipment: ["polea alta", "soga"],
    motion: {
      view: "side", seconds: 2.8,
      keys: pushKeys(true),
      props: [
        ...PUSH_FRAME,
        { kind: "cable", a: [46, 208], b: "hand.near+3,12", layer: "back" },
        { kind: "rope", at: "hand.near+3,12", to: "hand.near", layer: "front" },
      ],
    },
    technique: {
      setup: ["Parate frente a la polea alta y tomá los extremos de la soga con las palmas enfrentadas.", "Codos pegados al costado del cuerpo, tronco apenas inclinado adelante.", "Rodillas flojas y abdomen firme."],
      execution: ["Empujá la soga hacia abajo extendiendo los codos.", "Al final, separá un poco los extremos de la soga hacia afuera.", "Volvé controlando sin mover los codos."],
      cues: ["Codos quietos", "Abrí la soga abajo", "Hombros abajo"],
      mistakes: ["Mover los codos hacia adelante y atrás: dejalos fijos al costado.", "Inclinarte sobre la soga para empujar: bajá el peso.", "Cortar el recorrido abajo: extendé los codos por completo."],
      breathing: "Soltá el aire al empujar y tomalo al volver.",
    },
    anatomy: { primary: ["triceps"], secondary: ["antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "extension-triceps-polea-sobre-cabeza", version: 1, title: "Extensión de tríceps en polea sobre la cabeza", group: "Brazos",
    catalog: ["Extensión de tríceps en polea sobre la cabeza"],
    equipment: ["polea", "soga"],
    motion: {
      view: "side", seconds: 3.2,
      keys: arc(overhead, -85, -230, "Extendé hacia adelante y arriba", "Volvé despacio detrás de la cabeza"),
      props: [
        { kind: "post", x: -82, h: 200, w: 7, layer: "back" },
        { kind: "stack", x: -94, y: 6, w: 18, h: 60, lift: "props.lift", layer: "back" },
        { kind: "pulley", at: OH_PULLEY, layer: "back" },
        { kind: "cable", a: OH_PULLEY, b: "hand.near+-10,1", layer: "back" },
        { kind: "rope", at: "hand.near+-10,1", to: "hand.near", layer: "front" },
      ],
    },
    technique: {
      setup: ["Tomá la soga, date vuelta de espaldas a la polea y da un paso adelante.", "Inclinate un poco desde la cadera con el abdomen firme.", "Codos junto a la cabeza, apuntando hacia adelante, y las manos detrás de la nuca."],
      execution: ["Extendé los codos llevando las manos hacia adelante y arriba.", "Estirá los brazos por completo sin mover los codos de lugar.", "Volvé despacio hasta que las manos queden detrás de la cabeza."],
      cues: ["Codos fijos", "Abdomen firme", "Costillas abajo"],
      mistakes: ["Abrir los codos hacia los costados: mantenelos cerca de la cabeza.", "Arquear la zona lumbar: apretá el abdomen y adelantá un poco más el pie.", "Mover los hombros para empujar: sólo se mueve el antebrazo."],
      breathing: "Soltá el aire al extender y tomalo al volver.",
    },
    anatomy: { primary: ["triceps"], secondary: [] },
    review: REVIEWED,
  },
];
