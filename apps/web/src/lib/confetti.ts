// M02 (motion.md): partículas deterministas por semilla. La misma función alimenta el canvas de la app y la composición
// HyperFrames (design/motion), así la preview y el runtime muestran la misma secuencia.
// Tiempos: emisión entre 80 y 260 ms desde el inicio del resumen; extinción total a los 1200 ms.
export const CONFETTI = { count: 32, emitFrom: 80, emitFor: 180, end: 1200, colors: ["#00D1FF", "#5DE6D8", "#F8FAFC"] } as const;

/** mulberry32: PRNG de 32 bits, suficiente y estable para efectos visuales. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const seedOf = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export type Particle = { t0: number; vx: number; vy: number; w: number; h: number; spin: number; rot0: number; color: string };
export function particles(seed: number): Particle[] {
  const r = rng(seed);
  return Array.from({ length: CONFETTI.count }, () => {
    const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * 0.95; // abanico hacia arriba
    const sp = 0.28 + r() * 0.34; // px/ms
    return { t0: CONFETTI.emitFrom + r() * CONFETTI.emitFor, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 5 + r() * 4, h: 3 + r() * 4,
      spin: (r() - 0.5) * 0.02, rot0: r() * Math.PI, color: CONFETTI.colors[Math.floor(r() * CONFETTI.colors.length)] };
  });
}
const G = 0.0011; // px/ms²
/** Estado de una partícula en el tiempo t (ms desde el inicio del resumen); null si todavía no salió o ya se extinguió. */
export function at(p: Particle, t: number) {
  if (t < p.t0 || t >= CONFETTI.end) return null;
  const dt = t - p.t0;
  const life = (CONFETTI.end - p.t0);
  const k = dt / life;
  return { x: p.vx * dt, y: p.vy * dt + 0.5 * G * dt * dt, rot: p.rot0 + p.spin * dt, alpha: k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4) };
}
