// Biblioteca REPI Exercise Motion — Core.
import { onTrunk } from "../kit";
import { add, dirFromVertical, lerp, mul } from "../rig";
import type { Key, Pose, Vec } from "../types";
import type { MotionEntry } from "./types";

const REVIEWED = { status: "internal", date: "2026-11-14" } as const;

// ── Ayudas ──────────────────────────────────────────────────────────────────
const rad = (d: number) => (d * Math.PI) / 180;
const polar = (c: Vec, deg: number, r: number): Vec => [c[0] + Math.cos(rad(deg)) * r, c[1] + Math.sin(rad(deg)) * r];
/** El mismo valor para los dos lados (en la vista lateral el lado lejano copia al cercano). */
const both = <T,>(v: T) => ({ near: v, far: v });
const inOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
/** Tramo curvo: poses intermedias espaciadas con la curva inOut y tramos lineales (las piernas o el tronco giran sobre un eje). */
function arc(t0: number, t1: number, pose: (s: number) => Pose, n = 6): Key[] {
  return Array.from({ length: n }, (_, i) => ({ t: t0 + ((t1 - t0) * i) / n, pose: pose(inOut(i / n)), ease: "linear" as const }));
}
/** Repetición: pausa en s = 0, ida (s 0→1), pausa en s = 1 y vuelta. */
function rep(pose: (s: number) => Pose, sayGo: string, sayBack: string, go: [number, number] = [0.08, 0.45], back: [number, number] = [0.53, 1]): Key[] {
  return [{ t: 0, pose: pose(0), say: sayGo }, ...arc(go[0], go[1], pose), { t: go[1], pose: pose(1), say: sayBack }, ...arc(back[0], back[1], (s) => pose(1 - s))];
}

// ── Crunch ───────────────────────────────────────────────────────────────────
// Boca arriba (cabeza a −x) en la colchoneta, rodillas flexionadas y pies apoyados, brazos cruzados sobre el pecho. La
// columna se enrolla (`curl`): la zona lumbar queda apoyada y se despegan sólo los omóplatos; la cadera no se mueve.
const crunch = (s: number): Pose => {
  const pelvis: Vec = [0, 17.5], trunk = -90, curl = lerp(0, 34, s);
  return {
    pelvis, trunk, curl, head: lerp(8, 20, s), hand: { near: onTrunk(pelvis, trunk, 40, 13, curl), far: onTrunk(pelvis, trunk, 42, 12, curl) },
    foot: { near: [54, 10.5] }, knee: both([0, 1]), elbow: both(mul(dirFromVertical(trunk + curl), -1)),
  };
};

// ── Elevación de piernas acostado ────────────────────────────────────────────
// Boca arriba, brazos al costado con las palmas en el piso; las piernas casi estiradas giran sobre la cadera desde apenas
// arriba del piso hasta la vertical.
const legRaise = (s: number): Pose => {
  const pelvis: Vec = [0, 17.5], phi = lerp(9, 86, s);
  return {
    pelvis, trunk: -90, head: 6, hand: { near: [8, 5] }, foot: { near: polar(pelvis, phi, 86.5) },
    footTilt: both(-60 - phi), knee: both([-Math.sin(rad(phi)), Math.cos(rad(phi))]), elbow: both([0, 1]),
  };
};

// ── Plancha ──────────────────────────────────────────────────────────────────
// Isométrico sobre antebrazos: codos bajo los hombros, cuerpo en línea de la cabeza a los talones, apoyo en las puntas de los
// pies. Lo único que se mueve es una respiración sutil (el tronco sube y baja unos milímetros).
const PL_S: Vec = [0, 36], PL_ANKLE: Vec = [-136.6, 20.6];
const plank = (breath: number): Pose => {
  const trunk = 84 - 0.5 * breath, up = dirFromVertical(trunk), front: Vec = [up[1], -up[0]];
  const pelvis = add(add(PL_S, mul(up, -50)), add(front, [0, 0.4 * breath]));
  return { pelvis, trunk, head: 4, hand: { near: [31, 5] }, foot: { near: PL_ANKLE }, footTilt: both(60), knee: both([0, -1]), elbow: both([-0.3, -1]) };
};

// ── Crunch en polea ──────────────────────────────────────────────────────────
// De rodillas mirando a la polea alta, la soga tomada a los costados de la cabeza. La cadera queda fija arriba de las
// rodillas; la columna se enrolla hacia abajo (`curl`) y la pila sube.
const CC_P: Vec = [-3, 51.4];
const cableCrunch = (s: number): Pose => {
  // La mitad inferior del tronco casi no se mueve (la cadera queda fija arriba de las rodillas): el gesto es la columna que se
  // enrolla, con los codos hacia los muslos.
  const trunk = lerp(14, 22, s), curl = lerp(0, 52, s), up2 = dirFromVertical(trunk + curl), front2: Vec = [up2[1], -up2[0]];
  return {
    pelvis: CC_P, trunk, curl, head: lerp(6, 24, s), hand: { near: onTrunk(CC_P, trunk, 61, 7, curl) }, foot: { near: [-43, 7] }, footTilt: both(172),
    knee: both([1, -0.3]), elbow: both(add(mul(up2, -1), mul(front2, 0.7))), props: { lift: 18 * s },
  };
};

export const CORE: MotionEntry[] = [
  {
    id: "crunch-abdominal", version: 1, title: "Abdominales (crunch)", group: "Core",
    catalog: ["Abdominales (crunch)"],
    equipment: ["colchoneta"],
    motion: { view: "side", seconds: 2.8, keys: rep(crunch, "Despegá los omóplatos", "Bajá controlando", [0.08, 0.42], [0.52, 0.94]), props: [{ kind: "mat", x1: -80, x2: 75 }] },
    technique: {
      setup: ["Acostate boca arriba con las rodillas flexionadas y los pies apoyados.", "Cruzá los brazos sobre el pecho (o apoyá apenas los dedos detrás de las orejas, sin entrelazarlos)."],
      execution: ["Despegá los omóplatos del piso acercando las costillas a la pelvis.", "Subí sólo hasta donde la zona lumbar siga apoyada y sostené un instante.", "Bajá controlando hasta apoyar los hombros."],
      cues: ["Costillas hacia la pelvis", "Lumbar apoyada", "Cuello relajado"],
      mistakes: ["Tirar de la cabeza con las manos: las manos sólo acompañan.", "Subir con impulso: hacé el movimiento lento y corto.", "Despegar toda la espalda: quedate en el enrollamiento, con la lumbar en el piso."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["recto_abdominal"], secondary: ["oblicuos"] },
    review: REVIEWED,
  },
  {
    id: "elevacion-piernas-acostado", version: 1, title: "Elevación de piernas acostado", group: "Core",
    catalog: ["Elevación de piernas acostado"],
    equipment: ["colchoneta"],
    motion: { view: "side", seconds: 3.4, keys: rep(legRaise, "Subí las piernas", "Bajá lento", [0.08, 0.4], [0.5, 0.95]), props: [{ kind: "mat", x1: -80, x2: 100 }] },
    technique: {
      setup: ["Acostate boca arriba con las piernas estiradas y los brazos al costado, palmas al piso.", "Pegá la zona lumbar al piso apretando el abdomen."],
      execution: ["Subí las piernas juntas, casi estiradas, hasta que queden verticales.", "Bajá lento hasta dejar los talones apenas arriba del piso.", "Antes de la próxima, fijate que la zona lumbar siga apoyada."],
      cues: ["Lumbar pegada al piso", "Piernas juntas", "Bajá lento"],
      mistakes: ["Arquear la espalda al bajar: bajá menos o doblá un poco las rodillas.", "Dejar caer las piernas: controlá toda la bajada.", "Empujar con los brazos para subir: apoyalos sin hacer fuerza."],
      breathing: "Soltá el aire al subir y tomalo al bajar.",
    },
    anatomy: { primary: ["recto_abdominal", "flexores_cadera"], secondary: ["oblicuos"] },
    review: REVIEWED,
  },
  {
    id: "plancha", version: 1, title: "Plancha", group: "Core",
    catalog: ["Plancha"],
    equipment: ["colchoneta"],
    motion: {
      view: "side", seconds: 4,
      keys: [{ t: 0, pose: plank(0), say: "Sostené: cuerpo en línea" }, { t: 0.5, pose: plank(1), say: "Respirá sin aflojar el abdomen" }],
      props: [{ kind: "mat", x1: -165, x2: 48 }],
    },
    technique: {
      setup: ["Apoyá los antebrazos con los codos debajo de los hombros.", "Estirá las piernas atrás y apoyá las puntas de los pies, al ancho de cadera."],
      execution: ["Despegá el cuerpo del piso formando una línea recta de la cabeza a los talones.", "Apretá abdomen y glúteos y sostené la posición el tiempo indicado.", "Respirá corto y parejo sin perder la línea."],
      cues: ["Cuerpo en línea", "Abdomen firme", "Mirada al piso"],
      mistakes: ["Cadera caída: apretá glúteos y abdomen, o apoyá las rodillas para facilitar.", "Cadera muy alta: bajala hasta alinear hombros, cadera y talones.", "Contener el aire: respirá parejo durante toda la serie."],
      breathing: "Respirá corto y continuo, sin soltar el abdomen.",
    },
    anatomy: { primary: ["recto_abdominal"], secondary: ["oblicuos", "gluteo_mayor", "deltoide_anterior"] },
    review: REVIEWED,
  },
  {
    id: "crunch-polea", version: 1, title: "Crunch en polea", group: "Core",
    catalog: ["Crunch en polea"],
    equipment: ["polea alta", "soga"],
    motion: {
      view: "side", seconds: 3,
      keys: rep(cableCrunch, "Enrollá hacia abajo", "Volvé controlando", [0.08, 0.42], [0.52, 0.95]),
      props: [
        { kind: "post", x: 92, h: 215, w: 7, layer: "back" },
        { kind: "stack", x: 106, y: 6, w: 18, h: 64, lift: "props.lift", layer: "back" },
        { kind: "pulley", at: [84, 206], layer: "back" },
        { kind: "cable", a: [84, 206], b: "hand.near+4,7", layer: "back" },
        { kind: "rope", at: "hand.near+4,7", to: "hand.near", layer: "front" },
        { kind: "mat", x1: -70, x2: 25 },
      ],
    },
    technique: {
      setup: ["Arrodillate frente a la polea alta con la soga tomada a los costados de la cabeza.", "Cadera arriba de las rodillas y tronco apenas inclinado hacia adelante."],
      execution: ["Enrollá el tronco llevando las costillas hacia la pelvis y los codos hacia los muslos.", "Mantené la cadera quieta: el movimiento sale del abdomen, no de sentarte atrás.", "Volvé controlando hasta estirar el tronco, sin que el peso te lleve."],
      cues: ["Cadera quieta", "Costillas a la pelvis", "Manos junto a la cabeza"],
      mistakes: ["Sentarte sobre los talones para bajar: dejá la cadera fija arriba de las rodillas.", "Tirar con los brazos: las manos quedan quietas al lado de la cabeza.", "Volver de golpe: subí controlando."],
      breathing: "Soltá el aire al enrollar y tomalo al volver.",
    },
    anatomy: { primary: ["recto_abdominal"], secondary: ["oblicuos"] },
    review: REVIEWED,
  },
];
