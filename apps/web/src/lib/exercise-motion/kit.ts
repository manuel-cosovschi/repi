// Ayudas para escribir poses: puntos sobre el tronco y alturas de referencia del cuerpo de REPI.
import { add, dirFromVertical, mul, RIG, SPINE_K } from "./rig";
import type { Vec } from "./types";

/** Altura de la cadera con las piernas rectas y el pie apoyado. */
export const HIP_H = RIG.thigh + RIG.shin + RIG.ankleH; // 96
/** Punto del tronco: `along` cm desde la cadera hacia los hombros y `fwd` cm hacia el frente (vista lateral). */
export function onTrunk(pelvis: Vec, trunk: number, along: number, fwd = 0, curl = 0): Vec {
  const up = dirFromVertical(trunk), front: Vec = [up[1], -up[0]];
  const k = SPINE_K * RIG.trunk;
  if (!curl || along <= k) return add(add(pelvis, mul(up, along)), mul(front, fwd));
  const up2 = dirFromVertical(trunk + curl), front2: Vec = [up2[1], -up2[0]];
  return add(add(add(pelvis, mul(up, k)), mul(up2, along - k)), mul(front2, fwd));
}
/** Hombro (vista lateral) para una pose. */
export const shoulderOf = (pelvis: Vec, trunk: number, curl = 0) => onTrunk(pelvis, trunk, RIG.trunk, -1, curl);
/** Punto a `r` cm del hombro en la dirección `deg` (grados desde la vertical hacia abajo: 0 = brazo colgando, 90 = al frente). */
export function fromShoulder(pelvis: Vec, trunk: number, deg: number, r: number): Vec {
  const s = shoulderOf(pelvis, trunk), a = (deg * Math.PI) / 180;
  return add(s, [Math.sin(a) * r, -Math.cos(a) * r]);
}
