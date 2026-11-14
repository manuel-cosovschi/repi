// Biblioteca REPI Exercise Motion — Pecho.
import { fromShoulder, onTrunk, shoulderOf } from "../kit";
import type { Pose, Prop, Vec } from "../types";
import type { MotionEntry } from "./types";

const REVIEWED = { status: "internal", date: "2026-11-14" } as const;

/** Pivote de una palanca que pasa por los dos extremos del recorrido de la mano (sobre la mediatriz, a `h` cm del medio). */
function pivotFor(a: Vec, b: Vec, h: number): Vec {
  const m: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Vec = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]);
  let n: Vec = [-d[1] / l, d[0] / l];
  if (n[1] < 0) n = [-n[0], -n[1]]; // siempre hacia arriba
  return [m[0] + n[0] * h, m[1] + n[1] * h];
}

// ── Banco plano (acostado boca arriba, vista lateral; cabeza a −x). Tapizado arriba en y = 43. ──────────────────────────────
const FLAT_BENCH: Prop[] = [
  { kind: "tube", a: [-62, 0], b: [-62, 36], w: 5, layer: "back" }, { kind: "tube", a: [18, 0], b: [18, 36], w: 5, layer: "back" },
  { kind: "pad", a: [-82, 38.5], b: [30, 38.5], t: 9, layer: "back" },
];

// Press de banca: la barra baja a la línea del pezón y sube sobre los hombros.
const bp = (down: boolean): Pose => ({
  pelvis: [0, 54], trunk: -90, head: 0,
  hand: { near: down ? [-38, 70] : [-47, 114] }, foot: { near: [38, 8] }, elbow: { near: [0.35, -1] },
});

// ── Banco inclinado (~35° desde la horizontal): asiento horizontal y respaldo en la línea del tronco. ───────────────────────
const INC = { pelvis: [0, 56] as Vec, trunk: -55 };
const incPose = (hand: Vec, elbow: Vec = [0.3, -1]): Pose => ({ pelvis: INC.pelvis, trunk: INC.trunk, head: 8, hand: { near: hand }, foot: { near: [42, 8] }, elbow: { near: elbow, far: elbow } });
const INC_BENCH: Prop[] = [
  { kind: "tube", a: [-16, 0], b: [-16, 40], w: 5, layer: "back" }, { kind: "tube", a: [22, 0], b: [22, 40], w: 5, layer: "back" },
  { kind: "tube", a: [-30, 0], b: [30, 0], w: 5, layer: "back" },
  { kind: "tube", a: onTrunk(INC.pelvis, INC.trunk, 30, -22), b: [-16, 30], w: 5, layer: "back" },
  { kind: "pad", a: [-14, 40.5], b: [24, 40.5], t: 9, layer: "back" },
  { kind: "pad", a: onTrunk(INC.pelvis, INC.trunk, -2, -17.5), b: onTrunk(INC.pelvis, INC.trunk, 62, -17.5), t: 9, layer: "back" },
];
const incSh = shoulderOf(INC.pelvis, INC.trunk);
// Barra: toca la parte alta del pecho y sube en vertical hasta quedar sobre los hombros.
const incBarDown = onTrunk(INC.pelvis, INC.trunk, 43, 16);
const incBarUp: Vec = [incSh[0] + 4, incSh[1] + 60];
// Mancuernas: bajan un poco más (a los costados del pecho) y suben sobre los hombros.
const incDbDown = onTrunk(INC.pelvis, INC.trunk, 40, 9);
const incDbUp: Vec = [incSh[0] + 4, incSh[1] + 59];

// ── Máquinas de press sentado (vista lateral): asiento, respaldo y palanca con pivote arriba. ────────────────────────────────
const SEAT = { pelvis: [0, 58] as Vec };
const seatPose = (trunk: number, hand: Vec, elbow: Vec, lift = 0, upperArm = 1): Pose => ({ pelvis: SEAT.pelvis, trunk, head: 4, hand: { near: hand }, foot: { near: [40, 8] }, elbow: { near: elbow, far: elbow }, scale: { upperArm }, props: { lift } });
const seatProps = (trunk: number): Prop[] => [
  { kind: "tube", a: [4, 0], b: [4, 45], w: 6, layer: "back" },
  { kind: "tube", a: [-36, 0], b: [40, 0], w: 5, layer: "back" },
  { kind: "pad", a: [-12, 50], b: [26, 50], t: 9, layer: "back" },
  { kind: "pad", a: onTrunk(SEAT.pelvis, trunk, 0, -17.5), b: onTrunk(SEAT.pelvis, trunk, 60, -17.5), t: 9, layer: "back" },
];
// Press en máquina: empuje horizontal a la altura del medio del pecho.
const MP_T = -12;
const mpSh = shoulderOf(SEAT.pelvis, MP_T);
const mpBack: Vec = [mpSh[0] + 20, mpSh[1] - 8], mpFront: Vec = [mpSh[0] + 60, mpSh[1] - 8];
// Brazos de la máquina: giran sobre un eje vertical detrás del respaldo; de perfil se ven como un caño horizontal que se
// alarga al llevar la manija hacia adelante. Pila de pesas detrás.
const mpProps = (): Prop[] => [
  { kind: "stack", x: -62, y: 6, w: 18, h: 74, lift: "props.lift", layer: "back" },
  { kind: "post", x: -48, h: 150, w: 7, layer: "back" },
  { kind: "tube", a: [-48, mpBack[1]], b: [-28, mpBack[1]], w: 6, layer: "back" },
  { kind: "lever", pivot: [-28, mpBack[1]], at: "hand.near", w: 4.5, layer: "back" },
  { kind: "handle", at: "hand.near", r: 3.4, layer: "front" },
];
// Press inclinado en máquina: respaldo más reclinado y empuje hacia adelante y arriba.
const MI_T = -24;
const miSh = shoulderOf(SEAT.pelvis, MI_T);
const miBack: Vec = add2(onTrunk(SEAT.pelvis, MI_T, 42, 14), [4, 0]), miFront = fromShoulder(SEAT.pelvis, MI_T, 122, 60);
const miPivot = pivotFor(miBack, miFront, 96);
function add2(a: Vec, b: Vec): Vec { return [a[0] + b[0], a[1] + b[1]]; }
const machineFrame = (pivot: Vec, postX: number): Prop[] => [
  { kind: "stack", x: postX - 14, y: 6, w: 18, h: 74, lift: "props.lift", layer: "back" },
  { kind: "post", x: postX, h: pivot[1] + 8, w: 7, layer: "back" },
  { kind: "tube", a: [postX, pivot[1] + 4], b: [pivot[0], pivot[1] + 4], w: 6, layer: "back" },
  { kind: "lever", pivot, at: "hand.near", w: 4.5, layer: "back" },
  { kind: "handle", at: "hand.near", r: 3.4, layer: "front" },
];

// ── Aperturas con mancuernas: cámara cenital (se escribe como vista frontal y se dibuja girada, cabeza a la izquierda). La
// persona está acostada boca arriba en el banco plano; los brazos abren en arco en el plano frontal. Arriba apuntan a la
// cámara (escorzo, manos juntas sobre el pecho); abiertos se ven enteros a la altura de los hombros. Muslos sobre el banco,
// piernas hacia el piso (escorzo). ──────────────────────────────────────────────────────────────────────────────────────────
const FLY_P: Vec = [0, 0], FLY_SY = FLY_P[1] + 50;
const fly = (deg: number): Pose => {
  // deg: ángulo del brazo desde la vertical (hacia la cámara); − = hacia la línea media, 90 = abierto al costado.
  const s = Math.sin((deg * Math.PI) / 180), dx = 19 + 61 * s, k = Math.max(0.2, Math.min(1, Math.abs(s) * 1.05)); // dx: distancia de la mano al centro
  return {
    pelvis: FLY_P, trunk: 0, head: 0,
    hand: { near: [-dx, FLY_SY - 2], far: [dx, FLY_SY - 2] },
    foot: { near: [-17, FLY_P[1] - 60], far: [17, FLY_P[1] - 60] },
    knee: { near: [-1, 0], far: [1, 0] },
    elbow: { near: [0, -1], far: [0, -1] },
    scale: { shin: 0.4, upperArm: k, foreArm: k },
  };
};
const FLY_BENCH: Prop[] = [{ kind: "pad", a: [0, FLY_P[1] - 50], b: [0, FLY_SY + 32], t: 30, layer: "back" }];

// ── Pec deck (vista frontal, sentado): codos a la altura de los hombros, antebrazos en los tapizados. ──────────────────────────
const PD_PELVIS: Vec = [0, 58];
const PD_SY = PD_PELVIS[1] + 50; // altura de los hombros
const pd = (deg: number): Pose => {
  // deg: giro del brazo alrededor del hombro, en el plano horizontal (0 = codo al costado, 90 = codo adelante, 115 = codos
  // juntos frente al pecho). De frente, el brazo se ve en escorzo: largo aparente 30·|cos|; el antebrazo queda vertical.
  const c = Math.cos((deg * Math.PI) / 180), ex = 19 + 30 * c;
  const hint: Vec = c >= 0 ? [-1, -0.4] : [1, -0.4];
  return {
    pelvis: PD_PELVIS, trunk: 0,
    hand: { near: [-ex, PD_SY + 31], far: [ex, PD_SY + 31] }, foot: { near: [-17, 8], far: [17, 8] },
    elbow: { near: hint, far: [-hint[0], hint[1]] },
    scale: { thigh: 0.3, upperArm: Math.max(0.12, Math.abs(c)) },
  };
};
const pdProps = (): Prop[] => [
  { kind: "pad", a: [0, 56], b: [0, 132], t: 40, layer: "back" },
  { kind: "pad", a: [-22, 50], b: [22, 50], t: 9, layer: "back" },
  { kind: "tube", a: [0, 0], b: [0, 46], w: 6, layer: "back" },
  { kind: "post", x: -62, h: 186, w: 6, layer: "back" }, { kind: "post", x: 62, h: 186, w: 6, layer: "back" },
  { kind: "tube", a: [-62, 182], b: [62, 182], w: 6, layer: "back" },
  { kind: "tube", a: [-19, 182], b: [-19, PD_SY + 44], w: 4, layer: "back" }, { kind: "tube", a: [19, 182], b: [19, PD_SY + 44], w: 4, layer: "back" },
  { kind: "lever", pivot: [-19, PD_SY + 44], at: "hand.near+0,6", w: 4, layer: "back" },
  { kind: "lever", pivot: [19, PD_SY + 44], at: "hand.far+0,6", w: 4, layer: "back" },
  { kind: "pad", a: "elbow.near+0,-2", b: "hand.near+0,4", t: 9, layer: "front" },
  { kind: "pad", a: "elbow.far+0,-2", b: "hand.far+0,4", t: 9, layer: "front" },
];

// ── Cruce de poleas (vista frontal, de pie): poleas altas a los costados; las manos bajan en arco hasta juntarse adelante. ──────
const CX = 96;
const cc = (f: number): Pose => {
  // f: 0 = brazos abiertos un poco por encima de los hombros, 1 = manos juntas frente a la parte baja del pecho. La mano
  // recorre un arco alrededor del hombro con el codo fijo; al cerrar, el brazo va hacia el observador y se ve más corto.
  const th = ((103 + (-19 - 103) * f) * Math.PI) / 180, k = 1 - 0.34 * f, r = 58 * k;
  const dx = Math.sin(th) * r, dy = -Math.cos(th) * r; // dx > 0 = hacia afuera
  const sy = 95.5 + 50;
  return {
    pelvis: [0, 95.5], trunk: 0,
    hand: { near: [-19 - dx, sy + dy], far: [19 + dx, sy + dy] },
    foot: { near: [-14, 8], far: [14, 8] },
    elbow: { near: [-0.6, -1], far: [0.6, -1] },
    scale: { upperArm: k, foreArm: k },
  };
};
const ccProps = (): Prop[] => [
  { kind: "post", x: -CX - 8, h: 214, w: 8, layer: "back" }, { kind: "post", x: CX + 8, h: 214, w: 8, layer: "back" },
  { kind: "stack", x: -CX - 8, y: 6, w: 16, h: 60, layer: "back" }, { kind: "stack", x: CX + 8, y: 6, w: 16, h: 60, layer: "back" },
  { kind: "pulley", at: [-CX, 200], layer: "back" }, { kind: "pulley", at: [CX, 200], layer: "back" },
  { kind: "cable", a: [-CX, 200], b: "hand.near", layer: "front" }, { kind: "cable", a: [CX, 200], b: "hand.far", layer: "front" },
  { kind: "handle", at: "hand.near", r: 3.4, layer: "front" }, { kind: "handle", at: "hand.far", r: 3.4, layer: "front" },
];

export const PECHO: MotionEntry[] = [
  {
    id: "press-banca-barra", version: 1, title: "Press de banca", group: "Pecho",
    catalog: ["Press de banca"],
    compatible: [
      { name: "Press de banca con mancuernas", difference: "Se hace con una mancuerna en cada mano: cada brazo trabaja por separado y se puede bajar un poco más." },
      { name: "Press de banca agarre cerrado", difference: "Las manos van al ancho de los hombros y los codos más pegados al cuerpo, con más trabajo del tríceps." },
    ],
    equipment: ["barra", "banco plano"],
    motion: {
      view: "side", seconds: 3.2,
      keys: [{ t: 0, pose: bp(false), say: "Bajá al pecho" }, { t: 0.08, pose: bp(false) }, { t: 0.5, pose: bp(true), say: "Empujá" }, { t: 0.55, pose: bp(true) }],
      props: [...FLAT_BENCH, { kind: "disc", at: "hand.near", layer: "front" }],
    },
    technique: {
      setup: ["Acostate con los ojos debajo de la barra y los pies firmes en el piso.", "Juntá los omóplatos y llevalos hacia abajo; dejá una leve curva en la zona lumbar.", "Agarrá la barra un poco más ancho que los hombros, con las muñecas rectas."],
      execution: ["Sacá la barra y ubicala sobre los hombros con los brazos extendidos.", "Bajá controlando hasta tocar el pecho a la altura de la línea del pezón.", "Empujá hacia arriba y un poco hacia atrás hasta volver a extender los brazos."],
      cues: ["Omóplatos juntos", "Codos a unos 45° del cuerpo", "Pies firmes en el piso"],
      mistakes: ["Rebotar la barra en el pecho: frená un instante abajo y empujá sin impulso.", "Abrir los codos a 90°: acercalos un poco al cuerpo para cuidar el hombro.", "Levantar la cadera del banco: mantené glúteos apoyados y bajá el peso si hace falta."],
      breathing: "Tomá aire arriba antes de bajar y soltalo al pasar la parte más difícil de la subida.",
    },
    anatomy: { primary: ["pectoral"], secondary: ["deltoide_anterior", "triceps"] },
    review: REVIEWED,
  },
  {
    id: "press-inclinado-mancuernas", version: 1, title: "Press inclinado con mancuernas", group: "Pecho",
    catalog: ["Press inclinado mancuernas"],
    equipment: ["mancuernas", "banco inclinado"],
    motion: {
      view: "side", seconds: 3.2,
      keys: [
        { t: 0, pose: incPose(incDbUp), say: "Bajá a los costados del pecho" }, { t: 0.08, pose: incPose(incDbUp) },
        { t: 0.5, pose: incPose(incDbDown, [-0.1, -1]), say: "Empujá arriba" }, { t: 0.55, pose: incPose(incDbDown, [-0.1, -1]) },
      ],
      props: [...INC_BENCH, { kind: "dumbbell", at: "hand.near", layer: "front" }],
    },
    technique: {
      setup: ["Regulá el respaldo entre 30° y 45°.", "Sentate con la espalda apoyada y los pies firmes en el piso.", "Subí las mancuernas a la altura de los hombros apoyándolas primero en los muslos."],
      execution: ["Empujá las mancuernas hasta que queden sobre los hombros, sin chocarlas.", "Bajá controlando hasta los costados de la parte alta del pecho.", "Volvé a empujar manteniendo los antebrazos casi verticales."],
      cues: ["Omóplatos apoyados", "Codos un poco por debajo de los hombros", "Bajá lento"],
      mistakes: ["Respaldo demasiado vertical: con más de 45° trabaja más el hombro que el pecho.", "Bajar sin control: marcá dos segundos en la bajada.", "Arquear mucho la espalda: mantené glúteos y espalda apoyados en el banco."],
      breathing: "Tomá aire al bajar y soltalo al empujar.",
    },
    anatomy: { primary: ["pectoral_superior", "pectoral"], secondary: ["deltoide_anterior", "triceps"] },
    review: REVIEWED,
  },
  {
    id: "press-inclinado-barra", version: 1, title: "Press inclinado con barra", group: "Pecho",
    catalog: ["Press inclinado con barra"],
    equipment: ["barra", "banco inclinado"],
    motion: {
      view: "side", seconds: 3.2,
      keys: [
        { t: 0, pose: incPose(incBarUp), say: "Bajá a la parte alta del pecho" }, { t: 0.08, pose: incPose(incBarUp) },
        { t: 0.5, pose: incPose(incBarDown), say: "Empujá" }, { t: 0.55, pose: incPose(incBarDown) },
      ],
      props: [
        { kind: "post", x: incSh[0] - 18, h: 150, w: 6, layer: "back" },
        { kind: "tube", a: [incSh[0] - 18, 142], b: [incSh[0] - 6, 142], w: 4, layer: "back" },
        ...INC_BENCH, { kind: "disc", at: "hand.near", layer: "front" },
      ],
    },
    technique: {
      setup: ["Regulá el banco entre 30° y 45° y apoyá bien la espalda y la cabeza.", "Juntá los omóplatos y plantá los pies en el piso.", "Agarrá la barra un poco más ancho que los hombros, con las muñecas rectas."],
      execution: ["Sacá la barra y ubicala sobre los hombros con los brazos extendidos.", "Bajá controlando hasta rozar la parte alta del pecho, debajo de las clavículas.", "Empujá en línea recta hacia arriba hasta extender los brazos."],
      cues: ["Barra a la parte alta del pecho", "Omóplatos juntos", "Muñecas sobre los codos"],
      mistakes: ["Bajar la barra al medio del pecho: en el inclinado va más arriba, cerca de las clavículas.", "Despegar la espalda del respaldo: mantené el apoyo y bajá el peso si hace falta.", "Rebotar abajo: frená un instante y empujá sin impulso."],
      breathing: "Tomá aire antes de bajar y soltalo al empujar.",
    },
    anatomy: { primary: ["pectoral_superior", "pectoral"], secondary: ["deltoide_anterior", "triceps"] },
    review: REVIEWED,
  },
  {
    id: "press-pecho-maquina", version: 1, title: "Press en máquina", group: "Pecho",
    catalog: ["Press en máquina"],
    equipment: ["máquina de press de pecho"],
    motion: {
      view: "side", seconds: 3,
      keys: [
        { t: 0, pose: seatPose(MP_T, mpBack, [-1, -0.7], 0, 0.8), say: "Empujá hacia adelante" }, { t: 0.08, pose: seatPose(MP_T, mpBack, [-1, -0.7], 0, 0.8) },
        { t: 0.45, pose: seatPose(MP_T, mpFront, [0, -1], 14), say: "Volvé controlando" }, { t: 0.53, pose: seatPose(MP_T, mpFront, [0, -1], 14) },
      ],
      props: [...seatProps(MP_T), ...mpProps()],
    },
    technique: {
      setup: ["Regulá el asiento para que las manijas queden a la altura del medio del pecho.", "Apoyá toda la espalda en el respaldo y los pies en el piso.", "Agarrá las manijas con las muñecas rectas y los codos un poco por debajo de los hombros."],
      execution: ["Empujá hacia adelante hasta extender los brazos sin trabar los codos.", "Volvé controlando hasta que las manos queden a la altura del pecho.", "Mantené la espalda apoyada durante toda la serie."],
      cues: ["Espalda pegada al respaldo", "Hombros abajo", "Volvé lento"],
      mistakes: ["Asiento muy bajo o muy alto: ajustalo para que las manijas queden a la altura del pecho.", "Despegar la espalda para empujar: bajá el peso y mantené el apoyo.", "Soltar el peso de golpe en la vuelta: acompañalo hasta el final."],
      breathing: "Soltá el aire al empujar y tomalo al volver.",
    },
    anatomy: { primary: ["pectoral"], secondary: ["deltoide_anterior", "triceps"] },
    review: REVIEWED,
  },
  {
    id: "press-inclinado-maquina", version: 1, title: "Press inclinado en máquina", group: "Pecho",
    catalog: ["Press inclinado en máquina"],
    equipment: ["máquina de press inclinado"],
    motion: {
      view: "side", seconds: 3,
      keys: [
        { t: 0, pose: seatPose(MI_T, miBack, [-0.5, -1]), say: "Empujá hacia arriba y adelante" }, { t: 0.08, pose: seatPose(MI_T, miBack, [-0.5, -1]) },
        { t: 0.45, pose: seatPose(MI_T, miFront, [0.3, -1], 14), say: "Volvé controlando" }, { t: 0.53, pose: seatPose(MI_T, miFront, [0.3, -1], 14) },
      ],
      props: [...seatProps(MI_T), ...machineFrame(miPivot, -46)],
    },
    technique: {
      setup: ["Regulá el asiento para que las manijas queden a la altura de la parte alta del pecho.", "Apoyá la espalda en el respaldo y los pies firmes en el piso.", "Agarrá las manijas con las muñecas rectas."],
      execution: ["Empujá hacia arriba y adelante hasta extender los brazos sin trabar los codos.", "Volvé controlando hasta que las manos queden cerca de la parte alta del pecho.", "Mantené la espalda y la cabeza apoyadas."],
      cues: ["Espalda pegada al respaldo", "Hombros abajo", "Volvé lento"],
      mistakes: ["Encoger los hombros al empujar: mantenelos abajo y lejos de las orejas.", "Arquear la espalda para mover más peso: bajá la carga y mantené el apoyo.", "Recorrido corto: volvé hasta sentir el estiramiento del pecho, sin dolor."],
      breathing: "Soltá el aire al empujar y tomalo al volver.",
    },
    anatomy: { primary: ["pectoral_superior", "pectoral"], secondary: ["deltoide_anterior", "triceps"] },
    review: REVIEWED,
  },
  {
    id: "aperturas-mancuernas", version: 1, title: "Aperturas con mancuernas", group: "Pecho",
    catalog: ["Aperturas con mancuernas"],
    compatible: [{ name: "Aperturas inclinadas con mancuernas", difference: "Se hacen con el respaldo inclinado entre 30° y 45°, con más trabajo de la parte alta del pecho." }],
    equipment: ["mancuernas", "banco plano"],
    motion: {
      view: "front", camera: "top", seconds: 3.4,
      keys: [
        { t: 0, pose: fly(-17), say: "Abrí los brazos en arco" }, { t: 0.08, pose: fly(-17) },
        { t: 0.2, pose: fly(20) }, { t: 0.34, pose: fly(58) },
        { t: 0.5, pose: fly(88), say: "Cerrá abrazando" }, { t: 0.55, pose: fly(88) },
        { t: 0.7, pose: fly(58) }, { t: 0.84, pose: fly(20) },
      ],
      props: [...FLY_BENCH, { kind: "dumbbell", at: "hand.near", layer: "front" }, { kind: "dumbbell", at: "hand.far", layer: "front" }],
    },
    technique: {
      setup: ["Acostate en el banco plano con los pies firmes en el piso.", "Subí las mancuernas sobre el pecho con las palmas enfrentadas.", "Dejá los codos apenas flexionados y mantené ese ángulo toda la serie."],
      execution: ["Abrí los brazos en arco hacia los costados, bajando controlando.", "Pará cuando los brazos lleguen a la altura del pecho o sientas el estiramiento, sin dolor.", "Cerrá en el mismo arco, como si abrazaras un barril, hasta juntar las mancuernas arriba."],
      cues: ["Codos fijos, apenas flexionados", "Arco amplio", "Omóplatos juntos"],
      mistakes: ["Flexionar y extender los codos: eso lo convierte en un press; mantené el ángulo fijo.", "Bajar demasiado: quedate a la altura del pecho para cuidar el hombro.", "Usar mucho peso: elegí uno que puedas controlar en todo el arco."],
      breathing: "Tomá aire al abrir y soltalo al cerrar.",
    },
    anatomy: { primary: ["pectoral"], secondary: ["deltoide_anterior", "biceps"] },
    review: { ...REVIEWED, notes: "Cámara cenital: se ve desde arriba, con la cabeza a la izquierda." },
  },
  {
    id: "aperturas-maquina-pec-deck", version: 1, title: "Aperturas en máquina (pec deck)", group: "Pecho",
    catalog: ["Aperturas en máquina (pec deck)"],
    equipment: ["máquina pec deck"],
    motion: {
      view: "front", seconds: 3,
      keys: [
        { t: 0, pose: pd(0), say: "Cerrá los codos adelante" }, { t: 0.08, pose: pd(0) },
        { t: 0.22, pose: pd(45) }, { t: 0.34, pose: pd(88) },
        { t: 0.45, pose: pd(112), say: "Abrí controlando" }, { t: 0.53, pose: pd(112) },
        { t: 0.66, pose: pd(88) }, { t: 0.8, pose: pd(45) },
      ],
      props: pdProps(),
    },
    technique: {
      setup: ["Regulá el asiento para que los codos queden a la altura de los hombros.", "Apoyá la espalda en el respaldo y los antebrazos en los tapizados.", "Pies firmes en el piso y hombros abajo."],
      execution: ["Juntá los brazos adelante del pecho llevando los codos hacia el centro.", "Sostené un instante apretando el pecho.", "Abrí controlando hasta sentir el estiramiento del pecho, sin pasar la línea de los hombros."],
      cues: ["Empujá con los codos", "Espalda pegada al respaldo", "Abrí lento"],
      mistakes: ["Abrir de más hacia atrás: pará cuando los codos lleguen a la línea del cuerpo.", "Despegar la espalda del respaldo: bajá el peso.", "Asiento mal regulado: los codos tienen que quedar a la altura de los hombros."],
      breathing: "Soltá el aire al cerrar y tomalo al abrir.",
    },
    anatomy: { primary: ["pectoral"], secondary: ["deltoide_anterior"] },
    review: { ...REVIEWED, notes: "Vista frontal: al cerrar, los brazos van hacia el observador y se ven en escorzo." },
  },
  {
    id: "cruce-poleas-altas", version: 1, title: "Cruce de poleas", group: "Pecho",
    catalog: ["Cruce de poleas"],
    equipment: ["poleas altas", "manijas"],
    motion: {
      view: "front", seconds: 3.2,
      keys: [
        { t: 0, pose: cc(0), say: "Bajá las manos en arco" }, { t: 0.08, pose: cc(0) },
        { t: 0.2, pose: cc(0.33) }, { t: 0.32, pose: cc(0.66) },
        { t: 0.45, pose: cc(1), say: "Volvé controlando" }, { t: 0.53, pose: cc(1) },
        { t: 0.68, pose: cc(0.66) }, { t: 0.83, pose: cc(0.33) },
      ],
      props: ccProps(),
    },
    technique: {
      setup: ["Poné las dos poleas arriba y agarrá una manija con cada mano.", "Dá un paso al frente, con un pie adelante, y apenas inclinate desde la cadera.", "Codos apenas flexionados y fijos; pecho arriba."],
      execution: ["Llevá las manos en arco hacia abajo y adelante hasta juntarlas frente a la parte baja del pecho.", "Sostené un instante apretando el pecho.", "Volvé controlando hasta que las manos queden a la altura de los hombros."],
      cues: ["Codos fijos", "Arco amplio", "Pecho arriba"],
      mistakes: ["Empujar flexionando los codos: mantené el ángulo y mové sólo los hombros.", "Dejar que el peso te tire hacia atrás: frená la vuelta y no pases la línea de los hombros.", "Encoger los hombros: mantenelos abajo durante todo el arco."],
      breathing: "Soltá el aire al cerrar y tomalo al volver.",
    },
    anatomy: { primary: ["pectoral"], secondary: ["deltoide_anterior", "serrato"] },
    review: REVIEWED,
  },
];
