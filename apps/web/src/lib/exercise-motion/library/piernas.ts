// Biblioteca REPI Exercise Motion — Piernas y glúteos.
import { HIP_H, onTrunk } from "../kit";
import { add, dirFromVertical, lerp, lerpV, mul } from "../rig";
import type { Key, Pose, Prop, Vec } from "../types";
import type { MotionEntry } from "./types";

const REVIEWED = { status: "internal", date: "2026-11-14" } as const;

// Sentadilla con barra alta, vista lateral. La barra va sobre los trapecios; las manos la sostienen (de costado se ven
// encima del hombro). Abajo: muslo paralelo, tronco ~44°, rodillas hacia adelante en la línea de los pies.
const sqTop = (): Pose => { const pelvis: Vec = [0, HIP_H - 0.5], trunk = 6; return { pelvis, trunk, head: -6, hand: { near: onTrunk(pelvis, trunk, 52, -7) }, foot: { near: [2, 8] } }; };
const sqBot = (): Pose => { const pelvis: Vec = [-25, 49], trunk = 44; return { pelvis, trunk, head: -30, hand: { near: onTrunk(pelvis, trunk, 52, -7) }, foot: { near: [2, 8] } }; };

// ── Ayudas de geometría ─────────────────────────────────────────────────────
const rad = (d: number) => (d * Math.PI) / 180;
/** Punto a `r` cm de `c` en la dirección `deg` (grados desde +x, antihorario). */
const polar = (c: Vec, deg: number, r: number): Vec => [c[0] + Math.cos(rad(deg)) * r, c[1] + Math.sin(rad(deg)) * r];
/** Desplazamiento fijo en el mundo desde un punto del cuerpo («pelvis+dx,dy»). */
const at = (part: string, v: Vec) => `${part}+${v[0].toFixed(1)},${v[1].toFixed(1)}`;
/** Pie (igual que rig.ts): dirección talón→punta y vector tobillo→planta para una inclinación. */
const footFrame = (tilt: number) => { const t = rad(tilt); return { fwd: [Math.cos(t), -Math.sin(t)] as Vec, sole: [-Math.sin(t) * 8, -Math.cos(t) * 8] as Vec }; };
/** El mismo valor para los dos lados (en la vista lateral el lado lejano copia al cercano). */
const both = <T,>(v: T) => ({ near: v, far: v });
const inOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
/** Desplazamiento de un punto del tronco respecto de la cadera (para ligar equipamiento cuando el tronco no gira). */
const trunkOff = (trunk: number, along: number, fwd: number) => onTrunk([0, 0], trunk, along, fwd);
/**
 * Tramo curvo: poses intermedias espaciadas con la curva inOut y tramos lineales, para que una articulación que gira sobre
 * un eje fijo (la rodilla en el eje de la máquina, el pie sobre el escalón) recorra el arco y no la cuerda.
 */
function arc(t0: number, t1: number, pose: (s: number) => Pose, n = 6): Key[] {
  return Array.from({ length: n }, (_, i) => ({ t: t0 + ((t1 - t0) * i) / n, pose: pose(inOut(i / n)), ease: "linear" as const }));
}
/** Repetición: pausa en s = 0, ida (s 0→1), pausa en s = 1 y vuelta. */
function rep(pose: (s: number) => Pose, sayGo: string, sayBack: string, go: [number, number] = [0.08, 0.45], back: [number, number] = [0.53, 1]): Key[] {
  return [{ t: 0, pose: pose(0), say: sayGo }, ...arc(go[0], go[1], pose), { t: go[1], pose: pose(1), say: sayBack }, ...arc(back[0], back[1], (s) => pose(1 - s))];
}

// ── Sentadilla hack ──────────────────────────────────────────────────────────
// Espalda apoyada en el respaldo del carro, que corre por rieles a ~32° de la vertical; hombros debajo de las almohadillas;
// pies en la plataforma inclinada. La cadera baja por la línea del riel y el tronco no cambia de ángulo.
const HK_T = -32, HK_F: Vec = [12, 17], HK_TILT = -14;
const HK_P0: Vec = add(HK_F, mul([-Math.sin(rad(25)), Math.cos(rad(25))], 85.5));
const HK_DOWN = mul(dirFromVertical(HK_T), -1);
const hack = (s: number): Pose => {
  const pelvis = add(HK_P0, mul(HK_DOWN, 33 * s));
  return { pelvis, trunk: HK_T, head: 4, hand: { near: onTrunk(pelvis, HK_T, 47, 9) }, foot: { near: HK_F }, footTilt: both(HK_TILT), elbow: both([0.2, -1]) };
};
const hackProps = (): Prop[] => {
  const ff = footFrame(HK_TILT), base = add(HK_F, mul(ff.sole, 1.25));
  const lo = onTrunk(add(HK_P0, mul(HK_DOWN, 33)), HK_T, -34, -25), hi = onTrunk(HK_P0, HK_T, 78, -25);
  return [
    { kind: "tube", a: lo, b: hi, w: 5, layer: "back" },
    { kind: "tube", a: hi, b: [hi[0], 0], w: 5, layer: "back" },
    { kind: "tube", a: lo, b: [lo[0], 0], w: 5, layer: "back" },
    { kind: "disc", at: at("pelvis", trunkOff(HK_T, 44, -31)), r: 17, layer: "back" },
    { kind: "pad", a: at("pelvis", trunkOff(HK_T, -6, -17)), b: at("pelvis", trunkOff(HK_T, 56, -17)), t: 9, layer: "back" },
    { kind: "plate", a: add(base, mul(ff.fwd, -12)), b: add(base, mul(ff.fwd, 30)), t: 4, layer: "back" },
    { kind: "tube", a: add(base, mul(ff.fwd, 20)), b: [HK_F[0] + 20, 0], w: 5, layer: "back" },
    { kind: "roller", at: at("shoulder", trunkOff(HK_T, 7, 3)), r: 5.5, layer: "front" },
  ];
};

// ── Prensa 45° ───────────────────────────────────────────────────────────────
// Sentado y reclinado; los pies empujan la plataforma del carro, que corre por rieles a 45°. El carro sigue a los pies con
// valores animados (props): plataforma (a→b) y el soporte de los discos (c).
const LP_P: Vec = [0, 46], LP_T = -58, LP_TILT = -135, LP_R: Vec = [Math.SQRT1_2, Math.SQRT1_2], LP_DN: Vec = [Math.SQRT1_2, -Math.SQRT1_2];
const LP_F1: Vec = [62, 102];
const lpFoot = (s: number) => add(LP_F1, mul(LP_R, -30 * s));
const press = (s: number): Pose => {
  const foot = lpFoot(s), ff = footFrame(LP_TILT), base = add(foot, mul(ff.sole, 1.3));
  const a = add(base, mul(ff.fwd, -14)), b = add(base, mul(ff.fwd, 30)), c = add(add(base, mul(LP_R, 14)), mul(ff.fwd, 4)), d = add(c, mul(LP_DN, 28));
  return {
    pelvis: LP_P, trunk: LP_T, head: 2, hand: { near: [4, 40] }, foot: { near: foot }, footTilt: both(LP_TILT), knee: both([-0.6, 1]), elbow: both([0, -1]),
    props: { ax: a[0], ay: a[1], bx: b[0], by: b[1], cx: c[0], cy: c[1], dx: d[0], dy: d[1] },
  };
};
const pressProps = (): Prop[] => {
  const r0 = add(add(lpFoot(1), mul(LP_DN, 24)), mul(LP_R, -20)), r1 = add(add(LP_F1, mul(LP_DN, 24)), mul(LP_R, 40));
  const seatLo = onTrunk(LP_P, LP_T, -4, -17);
  return [
    { kind: "tube", a: r0, b: r1, w: 6, layer: "back" },
    { kind: "tube", a: r0, b: [r0[0], 0], w: 6, layer: "back" },
    { kind: "tube", a: r1, b: [r1[0], 0], w: 6, layer: "back" },
    { kind: "tube", a: ["props.cx", "props.cy"], b: ["props.dx", "props.dy"], w: 6, layer: "back" },
    { kind: "disc", at: ["props.cx", "props.cy"], r: 19, layer: "back" },
    { kind: "plate", a: ["props.ax", "props.ay"], b: ["props.bx", "props.by"], t: 5, layer: "back" },
    { kind: "pad", a: seatLo, b: onTrunk(LP_P, LP_T, 60, -17), t: 9, layer: "back" },
    { kind: "pad", a: seatLo, b: add(seatLo, [30, 10]), t: 9, layer: "back" },
    { kind: "tube", a: add(seatLo, [8, -2]), b: [seatLo[0] + 8, 0], w: 6, layer: "back" },
    { kind: "tube", a: [seatLo[0] + 8, 2], b: [r1[0], 2], w: 5, layer: "back" },
    { kind: "handle", at: "hand.near", r: 3, layer: "front" },
  ];
};

// ── Extensión de cuádriceps ─────────────────────────────────────────
// La rodilla queda en el eje de la máquina: el tobillo recorre un arco alrededor de ese eje y el rodillo va delante de la
// parte baja de la canilla.
const LE_K: Vec = [43, 61];
const legExt = (s: number): Pose => {
  const th = lerp(-100, 4, s), d: Vec = [Math.cos(rad(th)), Math.sin(rad(th))], ankle = polar(LE_K, th, 44);
  const roller = add(add(ankle, mul(d, -8)), mul([-d[1], d[0]], 10));
  return {
    pelvis: [0, 62], trunk: -12, head: 6, hand: { near: [6, 50] }, foot: { near: ankle }, footTilt: both(-th - 85), elbow: both([0, -1]),
    props: { rx: roller[0], ry: roller[1] },
  };
};
/** Asiento y respaldo de las máquinas sentadas de piernas (extensión y curl sentado), del ejemplar calibrado. */
const seatedFrame = (): Prop[] => [
  { kind: "tube", a: [10, 0], b: [10, 44], w: 6, layer: "back" },
  { kind: "pad", a: [-14, 50], b: [36, 50], t: 9, layer: "back" },
  { kind: "pad", a: [-18, 56], b: [-30, 112], t: 9, layer: "back" },
  { kind: "handle", at: "hand.near", r: 3, layer: "front" },
];

// ── Curl femoral sentado ──────────────────────────────────────────────────────
// Muslo fijo bajo el apoyo, rodilla en el eje; el rodillo va detrás de la pantorrilla, arriba del talón, y la pierna se
// dobla desde casi estirada hasta pasar la vertical.
const SC_K: Vec = [44, 62];
const seatedCurl = (s: number): Pose => {
  const th = lerp(-8, -112, s), d: Vec = [Math.cos(rad(th)), Math.sin(rad(th))], ankle = polar(SC_K, th, 44);
  const roller = add(add(ankle, mul(d, -7)), mul([d[1], -d[0]], 10));
  return {
    pelvis: [0, 62], trunk: -12, head: 6, hand: { near: [22, 78] }, foot: { near: ankle }, footTilt: both(-th - 85), elbow: both([-0.2, -1]),
    props: { rx: roller[0], ry: roller[1] },
  };
};

// ── Curl femoral acostado ─────────────────────────────────────────────────────
// Boca abajo (cabeza a +x), rodillas justo fuera del banco y en el eje; el rodillo va arriba de los talones.
const LC_P: Vec = [0, 86], LC_K: Vec = [-44, 86];
const lyingCurl = (s: number): Pose => {
  const th = lerp(177, 68, s), d: Vec = [Math.cos(rad(th)), Math.sin(rad(th))], ankle = polar(LC_K, th, 44);
  const roller = add(add(ankle, mul(d, -8)), mul([d[1], -d[0]], 10));
  return {
    pelvis: LC_P, trunk: 90, head: -6, hand: { near: [58, 63] }, foot: { near: ankle }, footTilt: both(270 - th), knee: both([0, -1]), elbow: both([1, 0.2]),
    props: { rx: roller[0], ry: roller[1] },
  };
};

// ── Peso muerto rumano ────────────────────────────────────────────────────────
// Bisagra de cadera con las rodillas apenas flexionadas: la cadera va atrás, la barra baja pegada a las piernas por encima
// del medio del pie hasta media canilla.
const rdl = (s: number): Pose => {
  const pelvis = lerpV([0, 94.5], [-31, 86], s), trunk = lerp(4, 64, s), sh = onTrunk(pelvis, trunk, 50, -1);
  // Brazos colgando: la barra baja vertical (x = 10, sobre el medio del pie) a 61,5 cm del hombro.
  const hand: Vec = [10, sh[1] - Math.sqrt(61.5 ** 2 - (sh[0] - 10) ** 2)];
  return { pelvis, trunk, head: lerp(0, -14, s), hand: { near: hand }, foot: { near: [2, 8] }, elbow: both([-0.3, 1]) };
};

// ── Gemelos de pie ────────────────────────────────────────────────────────────
// Base de los dedos sobre el borde del escalón (punto fijo B); el pie gira alrededor de B y el cuerpo sube recto, con las
// almohadillas de la máquina sobre los hombros.
const CF_B: Vec = [14, 8];
const calf = (s: number): Pose => {
  const t = lerp(-22, 38, s), ff = footFrame(t);
  const ankle = add(add(CF_B, mul(ff.fwd, -14)), mul(ff.sole, -1));
  const px = 5, pelvis: Vec = [px, ankle[1] + Math.sqrt(87.4 ** 2 - (ankle[0] - px) ** 2)];
  return { pelvis, trunk: 0, head: 0, hand: { near: [pelvis[0] + 12, pelvis[1] + 47] }, foot: { near: ankle }, footTilt: both(t), elbow: both([0.4, -1]), props: { lift: 12 * s } };
};

// ── Aductores y abductores en máquina (vista frontal, sentado) ────────────────
// Los muslos apuntan al observador (escorzo: se ven cortos) y se abren en el plano horizontal; de frente se ve a las
// rodillas separarse y las canillas, verticales, acompañarlas. `open` = separación de cada rodilla hacia afuera de la cadera.
const hipMachine = (open: number): Pose => {
  const kx = 9 + open, drop = 4;
  return {
    pelvis: [0, 60], trunk: 0, hand: { near: [-30, 56], far: [30, 56] },
    foot: { near: [-kx, 60 - drop - 44], far: [kx, 60 - drop - 44] },
    knee: { near: [-1, 0], far: [1, 0] }, elbow: { near: [-1, -0.4], far: [1, -0.4] },
    scale: { thigh: Math.hypot(open, drop) / 44 },
  };
};
const hipMachineFrame = (): Prop[] => [
  { kind: "pad", a: [0, 64], b: [0, 124], t: 46, layer: "back" },
  { kind: "pad", a: [-25, 49], b: [25, 49], t: 9, layer: "back" },
  { kind: "tube", a: [0, 44], b: [0, 0], w: 7, layer: "back" },
  { kind: "tube", a: [-34, 0], b: [34, 0], w: 5, layer: "back" },
  { kind: "handle", at: "hand.near", r: 3.4, layer: "front" }, { kind: "handle", at: "hand.far", r: 3.4, layer: "front" },
  { kind: "plate", a: "foot.near+-9,-9.5", b: "foot.near+9,-9.5", t: 3, layer: "front" }, { kind: "plate", a: "foot.far+-9,-9.5", b: "foot.far+9,-9.5", t: 3, layer: "front" },
];
/** Almohadillas en las rodillas: `side` = 1 del lado de adentro (aductores), −1 del lado de afuera (abductores). */
const kneePads = (side: 1 | -1): Prop[] => {
  const o = 8.5 * side;
  return [
    { kind: "tube", a: `knee.near+${o},-14`, b: [0, 38], w: 4, layer: "back" }, { kind: "tube", a: `knee.far+${-o},-14`, b: [0, 38], w: 4, layer: "back" },
    { kind: "pad", a: `knee.near+${o},4`, b: `knee.near+${o},-16`, t: 6, layer: "front" }, { kind: "pad", a: `knee.far+${-o},4`, b: `knee.far+${-o},-16`, t: 6, layer: "front" },
  ];
};

// ── Hip thrust ────────────────────────────────────────────────────────────────
// Boca arriba (cabeza a −x) con la parte baja de los omóplatos en el borde del banco (C, fijo: el tronco gira sobre ese
// apoyo). Pies apoyados; arriba tronco y muslos en línea y canillas verticales. La barra va sobre el pliegue de la cadera.
const HT_C: Vec = [-39, 45.5], HT_F: Vec = [46, 8];
const hipThrust = (s: number): Pose => {
  const trunk = lerp(-52, -90, s), up = dirFromVertical(trunk), front: Vec = [up[1], -up[0]];
  const pelvis = add(add(HT_C, mul(up, -40)), mul(front, 12)), bar = add(pelvis, mul(front, 15.5));
  return {
    pelvis, trunk, head: 22, hand: { near: lerpV(bar, add(bar, [-3, 2]), 0.5) }, foot: { near: HT_F }, knee: both([0.2, 1]), elbow: both([0, 1]),
    props: { bx: bar[0], by: bar[1] },
  };
};

export const PIERNAS: MotionEntry[] = [
  {
    id: "sentadilla-barra", version: 1, title: "Sentadilla con barra", group: "Piernas",
    catalog: ["Sentadilla"],
    compatible: [{ name: "Sentadilla en multipower", difference: "En el multipower la barra va guiada: los pies quedan un poco más adelante y no hay que equilibrarla." }],
    equipment: ["barra", "rack"],
    motion: {
      view: "side", seconds: 3.4,
      keys: [{ t: 0, pose: sqTop(), say: "Bajá controlando" }, { t: 0.1, pose: sqTop() }, { t: 0.5, pose: sqBot(), say: "Empujá el piso" }, { t: 0.56, pose: sqBot() }],
      props: [{ kind: "disc", at: "hand.near", layer: "front" }],
    },
    technique: {
      setup: ["Apoyá la barra sobre la parte alta de la espalda, no sobre el cuello.", "Pies al ancho de hombros, puntas apenas hacia afuera.", "Sacá la barra del rack con dos pasos cortos hacia atrás."],
      execution: ["Tomá aire, apretá el abdomen y bajá llevando la cadera atrás y abajo a la vez.", "Bajá hasta que el muslo quede paralelo al piso o hasta donde mantengas la espalda neutra.", "Subí empujando el piso con todo el pie, con la barra en la línea del medio del pie."],
      cues: ["Rodillas en la dirección de las puntas", "Pecho arriba", "Todo el pie apoyado"],
      mistakes: ["Rodillas que se van hacia adentro: empujalas hacia afuera, siguiendo las puntas.", "Talones que se levantan: repartí el peso en todo el pie y bajá menos si hace falta.", "Espalda que se redondea abajo: acortá el recorrido y mantené el abdomen firme."],
      breathing: "Tomá aire arriba, sostenelo al bajar y soltalo al pasar la parte más difícil de la subida.",
    },
    anatomy: { primary: ["cuadriceps", "gluteo_mayor"], secondary: ["aductores", "lumbar", "isquiotibiales"] },
    review: REVIEWED,
  },
  {
    id: "sentadilla-hack", version: 1, title: "Sentadilla hack", group: "Piernas",
    catalog: ["Sentadilla hack"],
    equipment: ["máquina hack (carro con respaldo y almohadillas)"],
    motion: { view: "side", seconds: 3.4, keys: rep(hack, "Bajá controlando", "Empujá la plataforma", [0.08, 0.5], [0.56, 1]), props: hackProps() },
    technique: {
      setup: ["Apoyá toda la espalda en el respaldo y los hombros debajo de las almohadillas.", "Pies en el medio de la plataforma, al ancho de hombros, con las puntas apenas hacia afuera.", "Con las piernas casi extendidas, sacá los seguros y tomá las manijas."],
      execution: ["Bajá doblando las rodillas en la línea de los pies, con la espalda pegada al respaldo.", "Bajá hasta donde la cadera y la zona lumbar sigan apoyadas (cerca del paralelo).", "Subí empujando con todo el pie hasta casi extender, sin trabar las rodillas."],
      cues: ["Espalda pegada al respaldo", "Rodillas siguiendo las puntas", "Talones apoyados"],
      mistakes: ["Talones que se despegan: subí un poco los pies en la plataforma o bajá menos.", "Cadera que se despega del respaldo abajo: acortá el recorrido.", "Rodillas trabadas arriba: dejá una leve flexión antes de la próxima repetición."],
      breathing: "Tomá aire arriba, sostenelo al bajar y soltalo al empujar.",
    },
    anatomy: { primary: ["cuadriceps"], secondary: ["gluteo_mayor", "aductores"] },
    review: REVIEWED,
  },
  {
    id: "prensa-45", version: 1, title: "Prensa inclinada 45°", group: "Piernas",
    catalog: ["Prensa"],
    equipment: ["prensa inclinada 45°"],
    motion: { view: "side", seconds: 3.4, keys: rep(press, "Bajá controlando", "Empujá la plataforma", [0.08, 0.5], [0.56, 1]), props: pressProps() },
    technique: {
      setup: ["Sentate con la espalda y la cadera bien apoyadas en el respaldo.", "Pies en el centro de la plataforma, al ancho de cadera u hombros.", "Extendé las piernas, sacá los seguros y tomá las manijas."],
      execution: ["Bajá la plataforma doblando las rodillas en la línea de los pies.", "Frená antes de que la cadera o la zona lumbar se despeguen del asiento.", "Empujá con todo el pie hasta casi extender, sin trabar las rodillas."],
      cues: ["Cadera pegada al asiento", "Rodillas siguiendo las puntas", "Empujá con todo el pie"],
      mistakes: ["Cadera que se levanta abajo: bajá menos.", "Rodillas trabadas al final: dejá una leve flexión.", "Rodillas que se cierran al empujar: llevalas en la dirección de las puntas."],
      breathing: "Tomá aire al bajar y soltalo al empujar.",
    },
    anatomy: { primary: ["cuadriceps", "gluteo_mayor"], secondary: ["aductores", "isquiotibiales"] },
    review: REVIEWED,
  },
  {
    id: "extension-cuadriceps", version: 1, title: "Extensión de cuádriceps", group: "Piernas",
    catalog: ["Extensión de cuádriceps"],
    equipment: ["máquina de extensión de cuádriceps"],
    motion: {
      view: "side", seconds: 3,
      keys: rep(legExt, "Extendé las rodillas", "Bajá controlando", [0.08, 0.42], [0.52, 1]),
      props: [...seatedFrame(), { kind: "lever", pivot: LE_K, at: ["props.rx", "props.ry"], roller: true, layer: "back" }],
    },
    technique: {
      setup: ["Ajustá el respaldo para que la rodilla quede alineada con el eje de la máquina.", "Apoyá el rodillo en la parte baja de la canilla, arriba del tobillo.", "Apoyá bien la espalda y agarrá las manijas del asiento."],
      execution: ["Extendé las rodillas hasta casi estirar las piernas.", "Sostené un instante arriba apretando los cuádriceps.", "Bajá controlando hasta la posición inicial, sin dejar caer el peso."],
      cues: ["Muslos apoyados en el asiento", "Subí sin impulso", "Bajá lento"],
      mistakes: ["Usar impulso o levantar la cadera: bajá el peso y sostené las manijas.", "Rodilla desalineada con el eje: ajustá el respaldo antes de empezar.", "Bajar de golpe: tomate al menos dos segundos para volver."],
      breathing: "Soltá el aire al extender y tomalo al bajar.",
    },
    anatomy: { primary: ["cuadriceps"], secondary: [] },
    review: REVIEWED,
  },
  {
    id: "curl-femoral-sentado", version: 1, title: "Curl femoral sentado", group: "Piernas",
    catalog: ["Curl femoral sentado"],
    compatible: [{ name: "Curl femoral", difference: "«Curl femoral» no dice la máquina: esta demostración es la versión sentada; en la acostada el gesto de la rodilla es el mismo pero el cuerpo va boca abajo." }],
    equipment: ["máquina de curl femoral sentado"],
    motion: {
      view: "side", seconds: 3,
      keys: rep(seatedCurl, "Doblá las rodillas", "Volvé controlando", [0.08, 0.42], [0.52, 1]),
      props: [
        ...seatedFrame(),
        { kind: "lever", pivot: SC_K, at: ["props.rx", "props.ry"], roller: true, layer: "back" },
        { kind: "tube", a: [52, 78], b: [52, 40], w: 5, layer: "back" },
        { kind: "pad", a: [24, 76], b: [50, 76], t: 9, layer: "front" },
      ],
    },
    technique: {
      setup: ["Ajustá el respaldo para que la rodilla quede alineada con el eje de la máquina.", "Rodillo detrás de las pantorrillas, arriba de los talones; bajá el apoyo de muslos hasta que los sujete.", "Apoyá bien la espalda y agarrá las manijas."],
      execution: ["Doblá las rodillas llevando los talones hacia abajo y atrás.", "Llegá hasta donde puedas sin despegar los muslos del asiento.", "Volvé controlando hasta casi estirar las piernas."],
      cues: ["Talones hacia el asiento", "Muslos quietos", "Volvé lento"],
      mistakes: ["Despegar la cadera para ayudarte: ajustá el apoyo de muslos y bajá el peso.", "Recorrido corto: doblá bien las rodillas antes de volver.", "Soltar el peso en la vuelta: controlá toda la extensión."],
      breathing: "Soltá el aire al doblar y tomalo al volver.",
    },
    anatomy: { primary: ["isquiotibiales"], secondary: ["gemelos"] },
    review: REVIEWED,
  },
  {
    id: "curl-femoral-acostado", version: 1, title: "Curl femoral acostado", group: "Piernas",
    catalog: ["Curl femoral acostado"],
    equipment: ["máquina de curl femoral acostado"],
    motion: {
      view: "side", seconds: 3,
      keys: rep(lyingCurl, "Talones a los glúteos", "Bajá controlando", [0.08, 0.42], [0.52, 1]),
      props: [
        { kind: "tube", a: [-28, 0], b: [-28, 66], w: 6, layer: "back" }, { kind: "tube", a: [62, 0], b: [62, 66], w: 6, layer: "back" },
        { kind: "pad", a: [-34, 70], b: [76, 70], t: 9, layer: "back" },
        { kind: "lever", pivot: LC_K, at: ["props.rx", "props.ry"], roller: true, layer: "back" },
        { kind: "handle", at: "hand.near", r: 3, layer: "front" },
      ],
    },
    technique: {
      setup: ["Acostate boca abajo con las rodillas justo después del borde del banco, alineadas con el eje.", "Apoyá el rodillo arriba de los talones, en la parte baja de la pantorrilla.", "Agarrá las manijas y apoyá la cadera en el banco."],
      execution: ["Doblá las rodillas llevando los talones hacia los glúteos.", "Sostené un instante arriba sin levantar la cadera.", "Bajá controlando hasta casi estirar las piernas."],
      cues: ["Cadera pegada al banco", "Talones a los glúteos", "Bajá lento"],
      mistakes: ["Levantar la cadera al subir: bajá el peso y apretá la pelvis contra el banco.", "Rodillas lejos del eje: acomodate antes de empezar.", "Rebotar abajo: frená antes de estirar del todo."],
      breathing: "Soltá el aire al subir los talones y tomalo al bajar.",
    },
    anatomy: { primary: ["isquiotibiales"], secondary: ["gemelos"] },
    review: REVIEWED,
  },
  {
    id: "peso-muerto-rumano", version: 1, title: "Peso muerto rumano", group: "Piernas",
    catalog: ["Peso muerto rumano"],
    compatible: [{ name: "Peso muerto rumano con mancuernas", difference: "Con mancuernas el gesto es el mismo, pero cada mano lleva una mancuerna delante de los muslos en lugar de la barra." }],
    equipment: ["barra"],
    motion: {
      view: "side", seconds: 3.6,
      keys: rep(rdl, "Cadera atrás", "Subí empujando la cadera", [0.08, 0.5], [0.56, 1]),
      props: [{ kind: "disc", at: "hand.near", r: 21, layer: "front" }],
    },
    technique: {
      setup: ["Parate con los pies al ancho de cadera y la barra contra los muslos.", "Agarrala apenas por fuera de las piernas, con los brazos estirados.", "Flexioná un poco las rodillas: esa flexión se mantiene toda la serie."],
      execution: ["Llevá la cadera hacia atrás y dejá que el tronco se incline con la espalda neutra.", "Bajá la barra pegada a las piernas hasta sentir tensión atrás de los muslos (debajo de la rodilla o a media canilla).", "Subí empujando la cadera hacia adelante hasta quedar derecho, sin echarte atrás."],
      cues: ["Cadera atrás", "Barra pegada a las piernas", "Espalda larga"],
      mistakes: ["Espalda redondeada: bajá menos y mantené el pecho abierto.", "Doblar mucho las rodillas y convertirlo en sentadilla: la flexión es leve y fija.", "Barra que se aleja de las piernas: llevala rozando muslos y rodillas."],
      breathing: "Tomá aire arriba, sostenelo al bajar y soltalo al terminar de subir.",
    },
    anatomy: { primary: ["isquiotibiales", "gluteo_mayor"], secondary: ["lumbar", "aductores", "antebrazo"] },
    review: REVIEWED,
  },
  {
    id: "gemelos-de-pie", version: 1, title: "Gemelos de pie", group: "Piernas",
    catalog: ["Gemelos de pie"],
    equipment: ["máquina de gemelos de pie", "escalón"],
    motion: {
      view: "side", seconds: 2.8,
      keys: rep(calf, "Subí en puntas de pie", "Bajá lento", [0.1, 0.4], [0.52, 0.94]),
      props: [
        { kind: "post", x: -44, h: 200, w: 7, layer: "back" },
        { kind: "stack", x: -60, y: 6, w: 18, h: 64, lift: "props.lift", layer: "back" },
        { kind: "lever", pivot: [-44, 150], at: "shoulder+-2,8", layer: "back" },
        { kind: "roller", at: "shoulder+1,8", r: 5.5, layer: "front" },
        { kind: "plate", a: [14, 4], b: [44, 4], t: 8, layer: "back" },
      ],
    },
    technique: {
      setup: ["Ubicá los hombros debajo de las almohadillas y apoyá sólo la parte delantera de los pies en el borde del escalón.", "Piernas estiradas sin trabar las rodillas, pies al ancho de cadera."],
      execution: ["Bajá los talones por debajo del escalón hasta sentir estiramiento en las pantorrillas.", "Subí en puntas de pie lo más alto que puedas y sostené un instante.", "Bajá controlando, sin rebotar."],
      cues: ["Subí bien alto", "Pausa arriba", "Sin rebote abajo"],
      mistakes: ["Doblar las rodillas para ayudarte: mantenelas firmes y casi estiradas.", "Rebotar abajo: frená un instante en el estiramiento.", "Cargar el borde externo del pie: empujá con la base del dedo gordo."],
    },
    anatomy: { primary: ["gemelos"], secondary: ["soleo"] },
    review: REVIEWED,
  },
  {
    id: "aductores-maquina", version: 1, title: "Aductores en máquina", group: "Piernas",
    catalog: ["Aductores en máquina"],
    equipment: ["máquina de aductores"],
    motion: {
      view: "front", seconds: 3,
      keys: [{ t: 0, pose: hipMachine(26), say: "Cerrá las piernas" }, { t: 0.08, pose: hipMachine(26) }, { t: 0.42, pose: hipMachine(0.5), say: "Abrí controlando" }, { t: 0.52, pose: hipMachine(0.5) }],
      props: [...hipMachineFrame(), ...kneePads(1)],
    },
    technique: {
      setup: ["Sentate con la espalda apoyada y las almohadillas del lado de adentro de las rodillas.", "Elegí una apertura inicial cómoda, sin tirón en la ingle.", "Apoyá los pies y agarrá las manijas."],
      execution: ["Cerrá las piernas apretando la cara interna de los muslos hasta juntar las almohadillas.", "Sostené un instante.", "Abrí controlando hasta la apertura inicial."],
      cues: ["Espalda apoyada", "Apretá y sostené", "Abrí lento"],
      mistakes: ["Empezar demasiado abierto: elegí una apertura que puedas controlar.", "Cerrar de golpe: llevá el peso con control en las dos direcciones.", "Despegar la espalda del respaldo: bajá el peso."],
      breathing: "Soltá el aire al cerrar y tomalo al abrir.",
    },
    anatomy: { primary: ["aductores"], secondary: [] },
    review: REVIEWED,
  },
  {
    id: "abductores-maquina", version: 1, title: "Abductores en máquina", group: "Piernas",
    catalog: ["Abductores en máquina"],
    equipment: ["máquina de abductores"],
    motion: {
      view: "front", seconds: 3,
      keys: [{ t: 0, pose: hipMachine(0.5), say: "Abrí las piernas" }, { t: 0.08, pose: hipMachine(0.5) }, { t: 0.42, pose: hipMachine(26), say: "Volvé controlando" }, { t: 0.52, pose: hipMachine(26) }],
      props: [...hipMachineFrame(), ...kneePads(-1)],
    },
    technique: {
      setup: ["Sentate con la espalda apoyada y las almohadillas del lado de afuera de las rodillas.", "Empezá con las piernas juntas y los pies en los apoyos.", "Agarrá las manijas para mantener la cadera quieta en el asiento."],
      execution: ["Abrí las piernas empujando con la parte externa de los muslos hasta tu máximo cómodo.", "Sostené un instante afuera.", "Volvé controlando, sin que el peso choque."],
      cues: ["Cadera quieta en el asiento", "Abrí y sostené", "Volvé lento"],
      mistakes: ["Inclinar el tronco para mover más peso: quedate apoyado en el respaldo.", "Rebotar al abrir: sostené la apertura un instante.", "Dejar que el peso golpee al volver: frená antes de juntar."],
      breathing: "Soltá el aire al abrir y tomalo al volver.",
    },
    anatomy: { primary: ["gluteo_medio"], secondary: ["gluteo_mayor"] },
    review: REVIEWED,
  },
  {
    id: "hip-thrust-barra", version: 1, title: "Hip thrust con barra", group: "Glúteos",
    catalog: ["Hip thrust"],
    compatible: [{ name: "Hip thrust en máquina", difference: "En la máquina la carga va en un cinturón o almohadilla guiada en lugar de la barra; la posición y el recorrido son los mismos." }],
    equipment: ["barra", "banco plano", "almohadilla para la barra"],
    motion: {
      view: "side", seconds: 3.2,
      keys: rep(hipThrust, "Empujá con los talones", "Bajá controlando", [0.08, 0.42], [0.54, 1]),
      props: [
        { kind: "tube", a: [-53, 0], b: [-53, 36], w: 7, layer: "back" },
        { kind: "pad", a: [-64, 38.5], b: [-43, 38.5], t: 9, layer: "back" },
        { kind: "disc", at: ["props.bx", "props.by"], r: 21, layer: "front" },
      ],
    },
    technique: {
      setup: ["Apoyá la parte baja de los omóplatos en el borde de un banco firme.", "Barra sobre el pliegue de la cadera, con almohadilla, y pies apoyados al ancho de cadera.", "Ubicá los pies para que arriba las canillas queden verticales."],
      execution: ["Empujá con los talones y subí la cadera hasta que tronco y muslos queden en línea.", "Apretá los glúteos un instante arriba, sin arquear la zona lumbar.", "Bajá controlando hasta que la cadera quede cerca del piso."],
      cues: ["Mentón adentro", "Empujá con los talones", "Costillas abajo"],
      mistakes: ["Arquear la espalda arriba: subí hasta la línea recta, no más.", "Pies muy lejos o muy cerca: arriba las canillas tienen que quedar verticales.", "Barra que rueda: sostenela con las dos manos y usá almohadilla."],
      breathing: "Tomá aire abajo y soltalo al terminar de subir.",
    },
    anatomy: { primary: ["gluteo_mayor"], secondary: ["isquiotibiales", "cuadriceps", "aductores"] },
    review: REVIEWED,
  },
];
