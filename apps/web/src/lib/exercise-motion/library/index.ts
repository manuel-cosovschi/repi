// Biblioteca oficial de REPI Exercise Motion 1.0 (D220). Se carga bajo demanda (import dinámico) en las pantallas que la usan.
import type { MotionEntry } from "./types";
import { PECHO } from "./pecho";
import { ESPALDA } from "./espalda";
import { HOMBROS } from "./hombros";
import { BRAZOS } from "./brazos";
import { PIERNAS } from "./piernas";
import { CORE } from "./core";

export const LIBRARY: MotionEntry[] = [...PECHO, ...ESPALDA, ...HOMBROS, ...BRAZOS, ...PIERNAS, ...CORE];
export const LIBRARY_VERSION = 1;
export const byId = new Map(LIBRARY.map((e) => [e.id, e]));
