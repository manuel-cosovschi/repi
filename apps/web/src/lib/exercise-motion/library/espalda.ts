// Biblioteca REPI Exercise Motion — Espalda.
import { onTrunk, shoulderOf } from "../kit";
import type { Key, Pose, Vec } from "../types";
import type { MotionEntry } from "./types";

const REVIEWED = { status: "internal", date: "2026-11-14" } as const;

/** Cadera que deja el hombro en `sh` con el tronco en `trunk` (para colgar el cuerpo de un punto fijo). */
const pelvisFor = (sh: Vec, trunk: number): Vec => { const o = shoulderOf([0, 0], trunk); return [sh[0] - o[0], sh[1] - o[1]]; };
/** Ciclo típico: pausa breve en el inicio, ida, pausa breve en el final y vuelta. */
const cycle = (a: Pose, b: Pose, sayA: string, sayB: string, mid?: [Pose, Pose]): Key[] =>
  mid
    ? [{ t: 0, pose: a, say: sayA }, { t: 0.08, pose: a }, { t: 0.27, pose: mid[0] }, { t: 0.45, pose: b, say: sayB }, { t: 0.52, pose: b }, { t: 0.76, pose: mid[1] }]
    : [{ t: 0, pose: a, say: sayA }, { t: 0.08, pose: a }, { t: 0.45, pose: b, say: sayB }, { t: 0.52, pose: b }];

// ── Dominadas: colgado de una barra fija (vista de costado, la barra se ve de punta). ──────────────────────────────
const BAR: Vec = [0, 228];
// Con agarre abierto los brazos quedan en el plano frontal: de costado el brazo se ve acortado (escorzo), así el codo
// baja junto al tronco arriba, como en la dominada real.
const pu = (up: boolean): Pose => {
  const trunk = up ? -20 : -8;
  const pelvis = pelvisFor(up ? [-12, 213] : [-4, 170], trunk);
  return {
    pelvis, trunk, head: up ? 2 : 6, hand: { near: BAR }, elbow: { near: up ? [0, -1] : [0.2, -1] },
    foot: { near: [pelvis[0] - 16, pelvis[1] - 76] }, footTilt: { near: 45 }, knee: { near: [1, 0] },
    scale: { upperArm: up ? 0.6 : 0.9 },
  };
};

// ── Jalón al pecho. ────────────────────────────────────────────────────────────────
const lp = (down: boolean): Pose => ({ pelvis: [0, 58], trunk: down ? -14 : -6, head: down ? 8 : 4, hand: { near: down ? [8, 106] : [6, 168] }, foot: { near: [40, 8] }, elbow: { near: [-0.6, -1] } });

// ── Remo con barra: bisagra de cadera, tronco a ~35° del piso, barra de la rodilla al abdomen. ──────────────────────
const brP: Vec = [-16, 84], brT = 58;
const br = (up: boolean): Pose => {
  const s = shoulderOf(brP, brT);
  return {
    pelvis: brP, trunk: brT, head: -40, foot: { near: [16, 8] },
    hand: { near: up ? onTrunk(brP, brT, 26, 17) : [s[0] + 2, s[1] - 61] },
    elbow: { near: up ? [-0.7, 1] : [-0.3, -1] },
  };
};

// ── Remo con mancuerna a una mano: rodilla y mano del lado lejano sobre el banco, rema el brazo cercano. ─────────────
const dbP: Vec = [0, 92], dbT = 76;
const db = (up: boolean): Pose => {
  const s = shoulderOf(dbP, dbT);
  return {
    pelvis: dbP, trunk: dbT, head: -12,
    foot: { near: [-12, 8], far: [-44, 49] }, footTilt: { far: 178 }, knee: { near: [1, 0.2], far: [1, -1] },
    hand: { near: up ? onTrunk(dbP, dbT, 14, 2) : [s[0] + 1, s[1] - 60], far: [s[0] + 4, 47] },
    elbow: { near: up ? [-0.4, 1] : [-0.4, -1], far: [-0.3, -1] },
  };
};

// ── Remo en polea: sentado, pies en la plataforma, polea baja y agarre cerrado (triángulo). ──────────────────────────
const crP: Vec = [0, 50];
const cr = (back: boolean): Pose => {
  const trunk = back ? -4 : 14;
  const s = shoulderOf(crP, trunk);
  return {
    pelvis: crP, trunk, head: back ? 2 : -6, foot: { near: [72, 26] }, footTilt: { near: -55 }, knee: { near: [0, 1] },
    hand: { near: back ? onTrunk(crP, trunk, 20, 16) : [s[0] + 58, s[1] - 22] },
    elbow: { near: back ? [-1, 0.1] : [-0.2, -1] }, props: { lift: back ? 14 : 0 },
  };
};

// ── Remo en T: barra anclada al piso detrás, pasa entre las piernas; agarre en V cerca de los discos. ─────────────────
const T_PIVOT: Vec = [-104, 4], T_K = 1.13; // los discos quedan un 13 % más lejos del anclaje que las manos
const tbP: Vec = [-18, 82], tbT = 52;
const tb = (up: boolean): Pose => {
  const s = shoulderOf(tbP, tbT);
  const hand: Vec = up ? onTrunk(tbP, tbT, 30, 18) : [s[0] + 1, s[1] - 60];
  const plates: Vec = [T_PIVOT[0] + (hand[0] - T_PIVOT[0]) * T_K, T_PIVOT[1] + (hand[1] - T_PIVOT[1]) * T_K];
  return {
    pelvis: tbP, trunk: tbT, head: -36, foot: { near: [14, 8], far: [12, 8] },
    hand: { near: hand }, elbow: { near: up ? [-0.7, 1] : [-0.3, -1] },
    props: { px: plates[0], py: plates[1] },
  };
};

// ── Remo en máquina: sentado con el pecho apoyado, manijas en palancas que cuelgan de arriba. ────────────────────────
const mrP: Vec = [0, 58], mrT = 12;
const mr = (back: boolean): Pose => {
  const s = shoulderOf(mrP, mrT);
  return {
    pelvis: mrP, trunk: mrT, head: -4, foot: { near: [38, 8] },
    hand: { near: back ? [s[0] + 13, s[1] - 9] : [s[0] + 58, s[1] - 6] },
    elbow: { near: back ? [-1, 0] : [-0.3, -1] },
  };
};
const MR_PIVOT: Vec = [48, 176];

// ── Pullover en polea: de pie frente a la polea alta, brazos casi extendidos, de arriba hasta los muslos. ────────────
const poP: Vec = [-8, 93], poT = 24;
const po = (up: boolean): Pose => {
  const down = !up;
  const s = shoulderOf(poP, poT);
  const deg = down ? 22 : 150, r = 61;
  return {
    pelvis: poP, trunk: poT, head: -6, foot: { near: [4, 8] }, knee: { near: [1, 0] },
    hand: { near: [s[0] + Math.sin((deg * Math.PI) / 180) * r, s[1] - Math.cos((deg * Math.PI) / 180) * r] },
    elbow: { near: down ? [-0.5, -1] : [-1, 0.4] }, props: { lift: down ? 14 : 0 },
  };
};
const poMid = (): Pose => {
  const s = shoulderOf(poP, poT), deg = 86, r = 61;
  return { ...po(false), hand: { near: [s[0] + Math.sin((deg * Math.PI) / 180) * r, s[1] - Math.cos((deg * Math.PI) / 180) * r] }, elbow: { near: [0, -1] }, props: { lift: 7 } };
};

export const ESPALDA: MotionEntry[] = [
  {
    id: "dominadas", version: 1, title: "Dominadas", group: "Espalda",
    catalog: ["Dominadas"],
    compatible: [
      { name: "Dominadas supinas", difference: "Se toma la barra con las palmas hacia vos y un agarre más cerrado; el bíceps participa más y el recorrido es el mismo." },
      { name: "Dominadas asistidas", difference: "Se hacen en máquina con apoyo de rodillas o con banda elástica, que descuenta parte del peso; el recorrido es el mismo." },
    ],
    equipment: ["barra de dominadas"],
    motion: {
      view: "side", seconds: 3.4,
      keys: cycle(pu(false), pu(true), "Subí llevando el pecho a la barra", "Bajá controlando"),
      props: [
        { kind: "post", x: -60, h: 256, w: 7, layer: "back" },
        { kind: "tube", a: [-60, 252], b: [2, 252], w: 5, layer: "back" },
        { kind: "tube", a: [2, 252], b: [2, 229], w: 3.5, layer: "back" },
        { kind: "handle", at: BAR, r: 2.8, layer: "back" },
      ],
    },
    technique: {
      setup: ["Tomá la barra con las palmas hacia adelante, un poco más abiertas que los hombros.", "Colgate con los brazos extendidos, el abdomen firme y las piernas quietas (podés cruzar los tobillos)."],
      execution: ["Bajá los hombros y llevá los codos hacia abajo y atrás, hacia los costados del cuerpo.", "Subí hasta que el mentón pase la barra, con el pecho hacia ella.", "Bajá controlando hasta extender los brazos, sin soltarte de golpe."],
      cues: ["Hombros lejos de las orejas", "Codos hacia los bolsillos", "Sin balanceo"],
      mistakes: ["Balancear las piernas para subir: frená el impulso y apretá el abdomen.", "Quedarte a mitad de camino abajo: extendé los brazos en cada repetición.", "Estirar el cuello para pasar la barra: llevá el pecho, no la cabeza."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["dorsal"], secondary: ["biceps", "espalda_media", "deltoide_posterior", "antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "jalon-al-pecho", version: 1, title: "Jalón al pecho", group: "Espalda",
    catalog: ["Jalón al pecho"],
    compatible: [{ name: "Jalón al pecho agarre cerrado", difference: "Se usa el triángulo o un agarre cerrado: los codos bajan más pegados al cuerpo; la posición y el recorrido son los mismos." }],
    equipment: ["polea alta", "barra larga", "asiento con rodillo"],
    motion: {
      view: "side", seconds: 3,
      keys: cycle(lp(false), lp(true), "Llevá la barra al pecho", "Subí controlando"),
      props: [
        { kind: "post", x: -40, h: 200, w: 8, layer: "back" },
        { kind: "tube", a: [-40, 196], b: [12, 196], w: 6, layer: "back" },
        { kind: "pulley", at: [8, 194], layer: "back" },
        { kind: "cable", a: [8, 194], b: "hand.near", layer: "back" },
        { kind: "pad", a: [-12, 50], b: [22, 50], t: 9, layer: "back" },
        { kind: "tube", a: [4, 0], b: [4, 45], w: 6, layer: "back" },
        { kind: "roller", at: [26, 69], r: 6, layer: "front" },
        { kind: "bar", a: "hand.near+-9,0", b: "hand.near+9,0", w: 3.4, layer: "front" },
      ],
    },
    technique: {
      setup: ["Ajustá el rodillo para que trabe los muslos sin apretar.", "Tomá la barra con las palmas hacia adelante, un poco más abiertas que los hombros.", "Sentate con el pecho alto y el tronco apenas inclinado hacia atrás."],
      execution: ["Bajá los hombros y llevá la barra hacia la parte alta del pecho, con los codos hacia abajo.", "Juntá un poco los omóplatos al final, sin echar el cuerpo atrás.", "Subí controlando hasta extender los brazos."],
      cues: ["Pecho a la barra", "Codos hacia abajo", "Tronco quieto"],
      mistakes: ["Tirar hacia atrás con todo el cuerpo: dejá el tronco fijo y bajá el peso si hace falta.", "Llevar la barra detrás de la nuca: bajala siempre adelante, al pecho.", "Soltar la barra de golpe: acompañala en la subida."],
      breathing: "Soltá el aire al bajar la barra y tomalo al subir.",
    },
    anatomy: { primary: ["dorsal"], secondary: ["biceps", "espalda_media", "deltoide_posterior"] },
    review: REVIEWED,
  },
  {
    id: "remo-con-barra", version: 1, title: "Remo con barra", group: "Espalda",
    catalog: ["Remo con barra"],
    equipment: ["barra", "discos"],
    motion: {
      view: "side", seconds: 3,
      keys: cycle(br(false), br(true), "Llevá la barra al abdomen", "Bajá controlando"),
      props: [{ kind: "disc", at: "hand.near", r: 18, layer: "front" }],
    },
    technique: {
      setup: ["Pies al ancho de caderas y la barra sobre el medio del pie.", "Tomá la barra con las palmas hacia vos y un agarre algo más abierto que los hombros.", "Flexioná apenas las rodillas e inclinate desde la cadera con la espalda neutra."],
      execution: ["Con los brazos extendidos, apretá el abdomen y fijá el tronco.", "Llevá la barra hacia la parte baja del abdomen, con los codos hacia atrás.", "Bajá controlando hasta extender los brazos, sin mover el tronco."],
      cues: ["Espalda larga", "Codos atrás", "El tronco no sube"],
      mistakes: ["Erguirte en cada repetición: mantené el mismo ángulo de tronco y bajá el peso si hace falta.", "Redondear la espalda: sacá pecho y acortá el recorrido si no podés sostenerla.", "Tirar con los brazos sin mover los omóplatos: juntalos al final del recorrido."],
      breathing: "Tomá aire y sostenelo al tirar; soltalo al bajar la barra.",
    },
    anatomy: { primary: ["dorsal", "espalda_media"], secondary: ["deltoide_posterior", "biceps", "lumbar", "antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "remo-mancuerna-una-mano", version: 1, title: "Remo con mancuerna a una mano", group: "Espalda",
    catalog: ["Remo con mancuerna a una mano"],
    equipment: ["mancuerna", "banco plano"],
    motion: {
      view: "side", seconds: 2.8,
      keys: cycle(db(false), db(true), "Llevá la mancuerna a la cadera", "Bajá controlando"),
      props: [
        { kind: "tube", a: [-46, 0], b: [-46, 36], w: 5, layer: "back" }, { kind: "tube", a: [50, 0], b: [50, 36], w: 5, layer: "back" },
        { kind: "pad", a: [-66, 38.5], b: [66, 38.5], t: 9, layer: "back" },
        { kind: "dumbbell", at: "hand.near", r: 8.5, layer: "front" },
      ],
    },
    technique: {
      setup: ["Apoyá en el banco la rodilla y la mano del mismo lado; la otra pierna, firme en el piso.", "Espalda neutra y casi paralela al piso, con la mancuerna colgando debajo del hombro.", "Tomá la mancuerna con la palma hacia el cuerpo."],
      execution: ["Llevá la mancuerna hacia la cadera con el codo pegado al cuerpo y hacia atrás.", "Juntá el omóplato hacia la columna al final, sin girar el tronco.", "Bajá controlando hasta extender el brazo."],
      cues: ["Codo hacia el techo", "Pecho y cadera mirando al piso", "Hombro lejos de la oreja"],
      mistakes: ["Girar el tronco para subir: mantené los hombros paralelos al banco y bajá el peso.", "Tirar hacia el hombro: llevá la mancuerna hacia la cadera.", "Redondear la espalda: alargá el cuello y empujá el banco con la mano de apoyo."],
      breathing: "Soltá el aire al subir la mancuerna y tomalo al bajar.",
    },
    anatomy: { primary: ["dorsal", "espalda_media"], secondary: ["deltoide_posterior", "biceps", "antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "remo-en-polea", version: 1, title: "Remo en polea", group: "Espalda",
    catalog: ["Remo en polea"],
    equipment: ["polea baja", "agarre en V (triángulo)", "plataforma para los pies"],
    motion: {
      view: "side", seconds: 3,
      keys: cycle(cr(false), cr(true), "Llevá el agarre al abdomen", "Volvé estirando los brazos"),
      props: [
        { kind: "pad", a: [-34, 41.5], b: [50, 41.5], t: 8, layer: "back" },
        { kind: "tube", a: [-28, 0], b: [-28, 37], w: 5, layer: "back" }, { kind: "tube", a: [44, 0], b: [44, 37], w: 5, layer: "back" },
        { kind: "plate", a: [76, 11], b: [96, 42], t: 4, layer: "back" },
        { kind: "tube", a: [77, 0], b: [77, 12], w: 5, layer: "back" },
        { kind: "post", x: 118, h: 150, w: 7, layer: "back" },
        { kind: "stack", x: 132, y: 6, w: 18, h: 60, lift: "props.lift", layer: "back" },
        { kind: "pulley", at: [112, 56], layer: "back" },
        { kind: "cable", a: [112, 56], b: "hand.near", layer: "back" },
        { kind: "handle", at: "hand.near", r: 3.6, layer: "front" },
      ],
    },
    technique: {
      setup: ["Sentate con los pies en la plataforma y las rodillas apenas flexionadas.", "Tomá el triángulo con las palmas enfrentadas y el tronco erguido.", "Abdomen firme y pecho alto antes de empezar."],
      execution: ["Llevá el agarre hacia el abdomen, con los codos pegados al cuerpo y hacia atrás.", "Juntá los omóplatos al final, sin echarte atrás.", "Volvé controlando hasta estirar los brazos, dejando que los hombros vayan apenas adelante."],
      cues: ["Codos atrás y pegados", "Pecho alto", "Tronco casi quieto"],
      mistakes: ["Balancear el tronco atrás y adelante: limitá el movimiento a unos pocos grados.", "Redondear la espalda al volver: mantené el pecho alto y la espalda neutra.", "Subir los hombros hacia las orejas: bajalos antes de tirar."],
      breathing: "Soltá el aire al tirar y tomalo al volver.",
    },
    anatomy: { primary: ["espalda_media", "dorsal"], secondary: ["deltoide_posterior", "biceps", "antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "remo-en-t", version: 1, title: "Remo en T", group: "Espalda",
    catalog: ["Remo en T"],
    equipment: ["barra anclada al piso", "discos", "agarre en V"],
    motion: {
      view: "side", seconds: 3,
      keys: cycle(tb(false), tb(true), "Llevá el agarre al pecho bajo", "Bajá controlando"),
      props: [
        { kind: "handle", at: T_PIVOT, r: 4, layer: "back" },
        { kind: "bar", a: T_PIVOT, b: ["props.px", "props.py"], w: 3.2, layer: "mid" },
        { kind: "disc", at: ["props.px", "props.py"], r: 16, layer: "front" },
        { kind: "handle", at: "hand.near", r: 3.6, layer: "front" },
      ],
    },
    technique: {
      setup: ["Parate con la barra entre los pies y tomá el agarre en V cerca de los discos.", "Flexioná las rodillas e inclinate desde la cadera con la espalda neutra.", "Brazos extendidos y abdomen firme antes de tirar."],
      execution: ["Llevá el agarre hacia la parte baja del pecho, con los codos hacia atrás.", "Juntá los omóplatos arriba, sin levantar el tronco.", "Bajá controlando hasta extender los brazos."],
      cues: ["Tronco fijo", "Codos atrás", "Cuello largo"],
      mistakes: ["Erguirte para subir el peso: mantené el ángulo del tronco y bajá la carga.", "Redondear la espalda: sacá pecho y acortá el recorrido.", "Tirones con las piernas: las rodillas quedan quietas durante toda la serie."],
      breathing: "Tomá aire antes de tirar y soltalo al bajar.",
    },
    anatomy: { primary: ["dorsal", "espalda_media"], secondary: ["deltoide_posterior", "biceps", "lumbar", "antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "remo-en-maquina", version: 1, title: "Remo en máquina", group: "Espalda",
    catalog: ["Remo en máquina"],
    equipment: ["máquina de remo con apoyo de pecho"],
    motion: {
      view: "side", seconds: 3,
      keys: cycle(mr(false), mr(true), "Llevá los codos atrás", "Volvé controlando"),
      props: [
        { kind: "pad", a: [-14, 50], b: [22, 50], t: 9, layer: "back" },
        { kind: "tube", a: [4, 0], b: [4, 45], w: 6, layer: "back" },
        { kind: "pad", a: [22, 72], b: [28, 108], t: 9, layer: "back" },
        { kind: "tube", a: [27, 92], b: [78, 92], w: 5, layer: "back" },
        { kind: "post", x: 80, h: 180, w: 8, layer: "back" },
        { kind: "tube", a: [80, 176], b: MR_PIVOT, w: 6, layer: "back" },
        { kind: "lever", pivot: MR_PIVOT, at: "hand.near", layer: "front" },
        { kind: "handle", at: "hand.near", r: 3.4, layer: "front" },
      ],
    },
    technique: {
      setup: ["Ajustá el asiento para que las manijas queden a la altura del pecho bajo.", "Apoyá el pecho en el respaldo y los pies firmes.", "Tomá las manijas con los brazos extendidos."],
      execution: ["Llevá los codos hacia atrás, cerca del cuerpo, hasta que las manos lleguen al costado del pecho.", "Juntá los omóplatos al final sin despegar el pecho del apoyo.", "Volvé controlando hasta estirar los brazos."],
      cues: ["Pecho pegado al apoyo", "Codos atrás", "Hombros abajo"],
      mistakes: ["Despegar el pecho para tirar: mantenelo apoyado y bajá el peso.", "Subir los hombros: bajalos y tirá con los codos.", "Recorrido corto: estirá los brazos en cada repetición."],
      breathing: "Soltá el aire al tirar y tomalo al volver.",
    },
    anatomy: { primary: ["espalda_media", "dorsal"], secondary: ["deltoide_posterior", "biceps"] },
    review: REVIEWED,
  },
  {
    id: "pullover-en-polea", version: 1, title: "Pullover en polea", group: "Espalda",
    catalog: ["Pullover en polea"],
    equipment: ["polea alta", "barra recta corta"],
    motion: {
      view: "side", seconds: 3,
      keys: cycle(po(true), po(false), "Bajá la barra hasta los muslos", "Subí controlando", [poMid(), poMid()]),
      props: [
        { kind: "post", x: 86, h: 222, w: 7, layer: "back" },
        { kind: "stack", x: 98, y: 6, w: 18, h: 60, lift: "props.lift", layer: "back" },
        { kind: "pulley", at: [80, 214], layer: "back" },
        { kind: "cable", a: [80, 214], b: "hand.near", layer: "back" },
        { kind: "bar", a: "hand.near+-6,1.5", b: "hand.near+6,-1.5", w: 3.4, layer: "front" },
      ],
    },
    technique: {
      setup: ["Parate frente a la polea alta, a un paso, y tomá la barra con las palmas hacia abajo.", "Inclinate un poco desde la cadera, rodillas apenas flexionadas.", "Brazos casi extendidos, con los codos levemente flojos."],
      execution: ["Bajá la barra en arco hasta los muslos, sin doblar más los codos.", "Apretá la espalda abajo un instante.", "Subí controlando hasta que los brazos queden por encima de la cabeza."],
      cues: ["Brazos largos", "Hombros abajo", "Tronco quieto"],
      mistakes: ["Doblar los codos y empujar como en el tríceps: mantené el mismo ángulo de codo.", "Mover el tronco para bajar: dejá la cadera y el tronco fijos.", "Subir los hombros arriba: mantenelos lejos de las orejas."],
      breathing: "Soltá el aire al bajar la barra y tomalo al subir.",
    },
    anatomy: { primary: ["dorsal"], secondary: ["triceps", "deltoide_posterior"] },
    review: REVIEWED,
  },
];
