// Validaciones automáticas de una demostración: cinemática alcanzable, pies sobre el piso, músculos y equipamiento conocidos,
// textos completos y nombres del catálogo exactos. Las usan las pruebas y la hoja de revisión.
import { EXERCISE_CATALOG } from "@repi/domain";
import { MUSCLES } from "./muscles";
import { renderFrame } from "./render";
import { poseAt, solve } from "./rig";
import type { MotionEntry } from "./library/types";

const CATALOG = new Set(EXERCISE_CATALOG.map((r) => r[0]));
export const PROP_KINDS = new Set(["tube", "pad", "plate", "disc", "dumbbell", "dumbbell-side", "bar", "handle", "roller", "pulley", "cable", "rope", "lever", "stack", "mat", "post"]);

export function validateEntry(e: MotionEntry): string[] {
  const bad: string[] = [];
  const say = (m: string) => bad.push(`${e.id}: ${m}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) say("id inválido");
  if (!e.catalog.length) say("sin ejercicios del catálogo");
  for (const n of [...e.catalog, ...(e.compatible ?? []).map((c) => c.name)]) if (!CATALOG.has(n)) say(`«${n}» no está en el catálogo global`);
  for (const c of e.compatible ?? []) { if (e.catalog.includes(c.name)) say(`«${c.name}» es exacto y compatible a la vez`); if (c.difference.trim().length < 12) say(`falta explicar la diferencia con «${c.name}»`); }
  for (const m of [...e.anatomy.primary, ...e.anatomy.secondary]) if (!(m in MUSCLES)) say(`músculo desconocido ${m}`);
  if (!e.anatomy.primary.length) say("sin músculo principal");
  for (const m of e.anatomy.primary) if (e.anatomy.secondary.includes(m)) say(`${m} es principal y secundario`);
  const t = e.technique;
  for (const [k, n] of [["setup", 2], ["execution", 2], ["cues", 2], ["mistakes", 2]] as const) if ((t[k] ?? []).filter((x) => x.trim()).length < n) say(`técnica: faltan textos en ${k}`);
  for (const p of e.motion.props) if (!PROP_KINDS.has(p.kind)) say(`equipamiento desconocido ${p.kind}`);
  const keys = e.motion.keys;
  if (keys.length < 2 || keys[0].t !== 0 || keys.some((k, i) => i > 0 && k.t <= keys[i - 1].t) || keys.at(-1)!.t >= 1) say("poses clave mal ordenadas");
  if (!keys.some((k) => k.say)) say("sin rótulos de fase");
  let miss = 0, floor = 0;
  for (let i = 0; i < 60; i++) {
    const u = i / 60;
    const b = solve(poseAt(keys, u).pose, e.motion.view);
    miss = Math.max(miss, b.miss);
    for (const s of ["near", "far"] as const) floor = Math.min(floor, b.toe[s][1], b.heel[s][1]);
    renderFrame(e.motion, u, e.anatomy); // no tiene que tirar errores
  }
  if (miss > 1.5) say(`cinemática inalcanzable (faltan ${miss.toFixed(1)} cm)`);
  if (e.motion.camera !== "top" && floor < -1.5) say(`un pie atraviesa el piso (${floor.toFixed(1)} cm)`);
  if (e.motion.seconds < 1.5 || e.motion.seconds > 8) say("duración fuera de rango");
  return bad;
}
